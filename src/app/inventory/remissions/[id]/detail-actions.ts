"use server";

import { redirect } from "next/navigation";

import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

import {
  enforceOperationalGateOrRedirect,
  loadAccessContext,
} from "./detail-access";
import {
  asText,
  buildRemissionDetailHref,
  type RemissionOperationalSummary,
  loadRemissionOperationalSummary,
  normalizeReturnOrigin,
  parseNumber,
  syncReceiveRequestStatus,
  toFriendlyRemissionActionError,
} from "./detail-utils";

export async function updateItems(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const currentStatus = String(request?.status ?? "");
  const allowPrepared =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const allowReceived =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const allowArea = access.canCancel || allowPrepared;

  if (allowPrepared) {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.from_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes preparar esta remisión en este momento.",
    });
  }
  if (allowReceived) {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.to_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes recibir esta remisión en este momento.",
    });
  }

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const prepared = formData.getAll("prepared_quantity").map((v) => String(v).trim());
  const shipped = formData.getAll("shipped_quantity").map((v) => String(v).trim());
  const received = formData.getAll("received_quantity").map((v) => String(v).trim());
  const shortage = formData.getAll("shortage_quantity").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());
  const sourceLocationIds = formData
    .getAll("source_location_id")
    .map((v) => String(v).trim());
  const { data: itemStateRows } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
    .eq("request_id", requestId);
  const itemStateById = new Map(
    (
      (itemStateRows ?? []) as Array<{
        id: string;
        product_id: string;
        quantity: number | null;
        prepared_quantity: number | null;
        shipped_quantity: number | null;
        received_quantity: number | null;
        shortage_quantity: number | null;
      }>
    ).map((row) => [row.id, row])
  );

  const fromSiteId = request?.from_site_id ?? "";
  const allowSourceLocation = allowPrepared && access.fromSiteType === "production_center";
  if (allowPrepared && fromSiteId) {
    const { data: stockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", fromSiteId);
    const stockMap = new Map(
      (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
        r.product_id,
        Number(r.current_qty ?? 0),
      ])
    );
    const productById = new Map(
      Array.from(itemStateById.values()).map((row) => [row.id, row.product_id])
    );

    const selectedLocIds = Array.from(new Set(sourceLocationIds.filter(Boolean)));
    const selectedProductIds = Array.from(new Set(productById.values()));
    const { data: locStockRows } =
      allowSourceLocation && selectedLocIds.length > 0 && selectedProductIds.length > 0
        ? await supabase
            .from("inventory_stock_by_location")
            .select("location_id,product_id,current_qty")
            .in("location_id", selectedLocIds)
            .in("product_id", selectedProductIds)
        : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
    const locStockMap = new Map(
      (locStockRows ?? []).map((row) => [
        `${row.location_id}|${row.product_id}`,
        Number(row.current_qty ?? 0),
      ])
    );

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      const productId = productById.get(itemId);
      if (!productId) continue;
      const available = stockMap.get(productId) ?? 0;
      const prepQty = parseNumber(prepared[i] ?? "0");
      const shipQty = parseNumber(shipped[i] ?? "0");
      const requestedQty = roundQuantity(Number(itemState?.quantity ?? 0));
      if (prepQty < 0 || shipQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Preparado y enviado no pueden ser negativos.",
          })
        );
      }
      if (requestedQty > 0 && prepQty > requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada (${prepQty}) mayor que solicitada (${requestedQty}).`,
          })
        );
      }
      if (requestedQty > 0 && shipQty > requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) mayor que solicitada (${requestedQty}).`,
          })
        );
      }
      if (shipQty > prepQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) no puede superar la preparada (${prepQty}).`,
          })
        );
      }
      const maxQty = Math.max(prepQty, shipQty);
      if (maxQty > available) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada/enviada (${maxQty}) mayor que stock disponible en origen (${available}). Ajusta las cantidades.`,
          })
        );
      }
      if (allowSourceLocation && maxQty > 0) {
        const sourceLocId = sourceLocationIds[i] || "";
        if (!sourceLocId) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Selecciona LOC origen para todos los items preparados/enviados.",
            })
          );
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${productId}`) ?? 0;
        if (maxQty > availableAtLoc) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada/enviada (${maxQty}) mayor que disponible en LOC origen (${availableAtLoc}).`,
            })
          );
        }
      }
    }
  }

  if (allowReceived) {
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      if (!itemState) continue;
      const receivedQty = parseNumber(received[i] ?? "0");
      const shortageQty = parseNumber(shortage[i] ?? "0");
      const shippedQty = roundQuantity(Number(itemState.shipped_quantity ?? 0));

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (shippedQty <= 0 && (receivedQty > 0 || shortageQty > 0)) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "No puedes registrar recibido o faltante en items que no fueron enviados.",
          })
        );
      }
      if (receivedQty + shortageQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${receivedQty + shortageQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
    }
  }

  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;

    const updates: Record<string, number | string | null> = {};
    const itemState = itemStateById.get(itemId);

    if (allowPrepared) {
      updates.prepared_quantity = parseNumber(prepared[i] ?? "0");
      updates.shipped_quantity = parseNumber(shipped[i] ?? "0");
      updates.source_location_id = sourceLocationIds[i] || null;
    }

    if (allowReceived) {
      updates.received_quantity = parseNumber(received[i] ?? "0");
      updates.shortage_quantity = parseNumber(shortage[i] ?? "0");
    }

    if (allowArea) {
      updates.production_area_kind = areaKinds[i] || null;
    }

    if (itemState) {
      const requestedQty = roundQuantity(Number(itemState.quantity ?? 0));
      const preparedQty = roundQuantity(
        Number(
          allowPrepared ? updates.prepared_quantity ?? 0 : itemState.prepared_quantity ?? 0
        )
      );
      const shippedQty = roundQuantity(
        Number(
          allowPrepared ? updates.shipped_quantity ?? 0 : itemState.shipped_quantity ?? 0
        )
      );
      const receivedQty = roundQuantity(
        Number(
          allowReceived ? updates.received_quantity ?? 0 : itemState.received_quantity ?? 0
        )
      );
      const shortageQty = roundQuantity(
        Number(
          allowReceived ? updates.shortage_quantity ?? 0 : itemState.shortage_quantity ?? 0
        )
      );
    }

    if (!Object.keys(updates).length) continue;

    const { error } = await supabase
      .from("restock_request_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
    }
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "items_updated" }));
}

type CommitLinePayload = {
  id: string;
  baseItemId: string;
  selectedLocId: string;
  dispatchQty: number;
  requestedQty: number;
  shortageReason: string;
  isVirtualSplit: boolean;
};

type CommitSplitPayload = {
  tempLineId: string;
  sourceItemId: string;
  splitQuantity: number;
};

export async function commitPreparationDraft(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  const payloadRaw = asText(formData.get("payload"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  let parsed: { lines?: CommitLinePayload[]; splitDrafts?: CommitSplitPayload[] } = {};
  try {
    parsed = JSON.parse(payloadRaw || "{}");
  } catch {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No se pudo leer el borrador de preparación.",
      })
    );
  }

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const splitDrafts = Array.isArray(parsed.splitDrafts) ? parsed.splitDrafts : [];
  if (!lines.length) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No hay líneas para despachar.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  if (!access.canPrepare) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No tienes permiso para preparar/despachar esta remisión.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes despachar esta remisión en este momento.",
  });

  const virtualToRealId = new Map<string, string>();
  for (const splitDraft of splitDrafts) {
    const splitQty = Number(splitDraft.splitQuantity ?? 0);
    if (!splitDraft.sourceItemId || !splitDraft.tempLineId || splitQty <= 0) continue;
    const { data: newItemId, error } = await supabase.rpc("split_restock_request_item", {
      p_item_id: splitDraft.sourceItemId,
      p_split_quantity: splitQty,
    });
    if (error || !newItemId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: error?.message || "No se pudo partir una línea.",
        })
      );
    }
    virtualToRealId.set(splitDraft.tempLineId, String(newItemId));
  }

  for (const line of lines) {
    const lineId = line.isVirtualSplit
      ? virtualToRealId.get(line.id) ?? ""
      : String(line.id ?? "").trim();
    const selectedLocId = String(line.selectedLocId ?? "").trim();
    const requestedQty = roundQuantity(Number(line.requestedQty ?? 0));
    const dispatchQty = roundQuantity(Number(line.dispatchQty ?? 0));
    const shortageReason = String(line.shortageReason ?? "").trim();

    if (!lineId || !selectedLocId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Todas las líneas deben tener LOC seleccionado.",
        })
      );
    }
    if (dispatchQty < 0 || dispatchQty > requestedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Hay líneas con cantidad a despachar inválida.",
        })
      );
    }
    if (dispatchQty < requestedQty && !shortageReason) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Debes registrar motivo de faltante en todas las líneas incompletas.",
        })
      );
    }

    const noteSuffix =
      dispatchQty < requestedQty
        ? `FALTANTE ORIGEN: ${shortageReason}`
        : null;

    const { error: lineErr } = await supabase
      .from("restock_request_items")
      .update({
        source_location_id: selectedLocId,
        prepared_quantity: dispatchQty,
        shipped_quantity: dispatchQty,
        notes: noteSuffix,
      })
      .eq("id", lineId)
      .eq("request_id", requestId);
    if (lineErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: lineErr.message,
        })
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update({
      status: "preparing",
      prepared_at: nowIso,
      prepared_by: user.id,
      status_updated_at: nowIso,
    })
    .eq("id", requestId);
  if (reqErr) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: reqErr.message,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ok: "ready_dispatch",
    })
  );
}

export async function submitTransitChecklist(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();
  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  if (!access.canTransit || currentStatus !== "preparing") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "Solo conductor autorizado puede poner en tránsito desde estado preparando.",
      })
    );
  }

  const { data: operationalSummary, error: operationalSummaryError } =
    await loadRemissionOperationalSummary({
      supabase,
      requestId,
    });
  if (operationalSummaryError) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: operationalSummaryError,
      })
    );
  }
  const summary = operationalSummary as RemissionOperationalSummary;
  if (!summary.can_transit) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "La remisión aún no está lista para pasar a tránsito.",
      })
    );
  }

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const notes = formData.getAll("transit_note").map((v) => String(v).trim());
  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;
    const note = notes[i] ?? "";
    if (!note) continue;
    const { data: existingRow } = await supabase
      .from("restock_request_items")
      .select("notes")
      .eq("id", itemId)
      .eq("request_id", requestId)
      .maybeSingle();
    const existing = String(existingRow?.notes ?? "").trim();
    const composed = existing
      ? `${existing}\nCONDUCTOR: ${note}`
      : `CONDUCTOR: ${note}`;
    const { error: noteErr } = await supabase
      .from("restock_request_items")
      .update({ notes: composed })
      .eq("id", itemId)
      .eq("request_id", requestId);
    if (noteErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: noteErr.message,
        })
      );
    }
  }

  const { error: moveErr } = await supabase.rpc("apply_restock_shipment", {
    p_request_id: requestId,
  });
  if (moveErr) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: moveErr.message,
      })
    );
  }

  const nowIso = new Date().toISOString();
  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update({
      status: "in_transit",
      in_transit_at: nowIso,
      in_transit_by: user.id,
      status_updated_at: nowIso,
    })
    .eq("id", requestId);
  if (reqErr) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: reqErr.message,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ok: "transit_started",
    })
  );
}

export async function splitItem(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  const detailHref = (extra: {
    error?: string | null;
    ok?: string | null;
    warning?: string | null;
    line?: string | null;
    event?: string | null;
  } = {}) =>
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ...extra,
    });
  if (!user) {
    redirect(await buildShellLoginUrl(detailHref()));
  }

  const itemId = asText(formData.get("split_item_id"));
  if (!itemId) {
    redirect(detailHref({ error: "Falta la linea a partir." }));
  }

  const splitQuantity = parseNumber(
    asText(formData.get(`split_quantity_${itemId}`)) || asText(formData.get("split_quantity"))
  );
  if (splitQuantity <= 0) {
    redirect(detailHref({ error: "Define una cantidad valida para partir la linea." }));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");

  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(detailHref({ error: "Solo puedes partir lineas mientras la remision esta pendiente o preparando." }));
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes preparar esta remisión en este momento.",
  });

  const { error } = await supabase.rpc("split_restock_request_item", {
    p_item_id: itemId,
    p_split_quantity: splitQuantity,
  });

  if (error) {
    redirect(detailHref({ error: error.message }));
  }

  redirect(detailHref({ ok: "split_item" }));
}

export async function chooseSourceLoc(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("choose_loc_target"));
  const chooseLocMode = asText(formData.get("choose_loc_mode"));
  let itemId = "";
  let locationId = "";

  if (target.includes("|")) {
    const [parsedItemId, parsedLocationId] = target.split("|");
    itemId = parsedItemId.trim();
    locationId = parsedLocationId.trim();
  }

  if (!itemId) itemId = asText(formData.get("choose_loc_item_id"));
  if (!locationId) locationId = asText(formData.get("choose_loc_location_id"));
  if (!locationId && itemId) locationId = asText(formData.get(`manual_loc_id_${itemId}`));

  if (!itemId || !locationId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Selecciona un LOC para continuar.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes elegir LOC mientras la remision esta pendiente o preparando.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes preparar esta remisión en este momento.",
  });

  const fromSiteId = String(request?.from_site_id ?? "").trim();
  if (!fromSiteId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se encontro sede origen para la remision.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();
  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La linea seleccionada no pertenece a esta remision.",
      })
    );
  }

  const { data: locRow } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("id", locationId)
    .eq("site_id", fromSiteId)
    .single();
  if (!locRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Ese LOC no pertenece a la sede origen.",
      })
    );
  }

  const updates: Record<string, string | number | null> = { source_location_id: locationId };
  if (chooseLocMode === "complete_line" || chooseLocMode === "prepare_auto") {
    // Mantener compatibilidad si todavía existe algún form antiguo enviando este modo.
    updates.source_location_id = locationId;
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update(updates)
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "loc_selected",
      line: itemId,
      event: "loc",
    })
  );
}

export async function updateStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const action = asText(formData.get("action"));
  const allowedActions = new Set([
    "prepare",
    "transit",
    "receive",
    "receive_partial",
    "close",
    "cancel",
    "delete",
  ]);
  if (!allowedActions.has(action)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Accion invalida. Vuelve a intentar desde el botón correspondiente.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  const { data: operationalSummary, error: operationalSummaryError } =
    await loadRemissionOperationalSummary({
      supabase,
      requestId,
    });

  if (operationalSummaryError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: operationalSummaryError }));
  }

  const summary = operationalSummary as RemissionOperationalSummary;

  if (action === "prepare" && !access.canPrepare) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes preparar." }));
  }

  if (action === "transit" && !access.canTransit) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes enviar." }));
  }

  if (action === "receive" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "receive_partial" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "close") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "En v1 la remision termina en recibida. El cierre administrativo ya no se usa.",
      })
    );
  }

  if (action === "cancel" && !access.canCancel) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No tienes permiso para cancelar." }));
  }
  if (action === "delete" && !access.canCancel) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No tienes permiso para eliminar." }));
  }
  if (action === "cancel" || action === "delete") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Esta acción se ejecuta desde la bandeja de remisiones.",
      })
    );
  }

  if (action === "prepare" || action === "transit") {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.from_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes preparar/despachar esta remisión en este momento.",
    });
  }

  if (action === "receive" || action === "receive_partial") {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.to_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes recibir esta remisión en este momento.",
    });
  }

  if (action === "prepare" && currentStatus !== "pending") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes preparar una remision pendiente." }));
  }
  if (action === "prepare" && access.fromSiteType === "production_center" && !summary.can_start_prepare) {
    if (summary.pending_loc_selection_lines > 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: `Selecciona un LOC en las ${summary.pending_loc_selection_lines} línea(s) faltantes antes de empezar preparación.`,
        })
      );
    }
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La remisión aún no está lista para iniciar preparación.",
      })
    );
  }
  if (action === "transit" && currentStatus !== "preparing") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes enviar una remision en estado preparando." }));
  }
  if (action === "transit" && !summary.can_transit) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Completa la preparación de todas las líneas antes de despachar.",
      })
    );
  }
  if (
    (action === "receive" || action === "receive_partial") &&
    !["in_transit", "partial"].includes(currentStatus)
  ) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "La remision debe estar en transito/parcial para recibir." }));
  }
  if (action === "receive_partial" && currentStatus !== "in_transit") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes registrar recepcion parcial desde en transito." }));
  }
  if (action === "receive" && !summary.can_complete_receive) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Para confirmar recepción, todas las líneas enviadas deben quedar cubiertas entre recibido y faltante.",
      })
    );
  }
  if (action === "receive_partial" && !summary.can_receive_partial) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Primero registra una recepción parcial real antes de guardar ese estado.",
      })
    );
  }
  if (action === "delete") {
    const deleteRequest = async () =>
      supabase.from("restock_requests").delete().eq("id", requestId).select("id");

    let { data: deletedRows, error } = await deleteRequest();

    if (error) {
      const hasMovementTrace =
        /inventory_movements/i.test(error.message) ||
        /related_restock_request_id/i.test(error.message);

      if (!hasMovementTrace) {
        const { error: deleteItemsError } = await supabase
          .from("restock_request_items")
          .delete()
          .eq("request_id", requestId);

        if (!deleteItemsError) {
          const retry = await deleteRequest();
          deletedRows = retry.data;
          error = retry.error;
        } else {
          error = deleteItemsError;
        }
      }

      if (error && hasMovementTrace) {
        const fallbackNow = new Date().toISOString();
        const { error: cancelFallbackError } = await supabase
          .from("restock_requests")
          .update({
            status: "cancelled",
            cancelled_at: fallbackNow,
            status_updated_at: fallbackNow,
          })
          .eq("id", requestId);
        if (!cancelFallbackError) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              ok: "No se pudo eliminar por trazabilidad. Se canceló la remisión.",
            })
          );
        }
      }

      if (error) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: toFriendlyRemissionActionError(error.message),
          })
        );
      }
    }

    if (!deletedRows || deletedRows.length === 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "No se pudo eliminar la remisión. Puede estar bloqueada por permisos o no existir.",
        })
      );
    }

    if (returnOrigin === "prepare") {
      redirect("/inventory/remissions/prepare?ok=deleted");
    }
    redirect("/inventory/remissions?ok=deleted");
  }
  const sourceLocDeductions: Array<{
    locationId: string;
    productId: string;
    qty: number;
    unitCode: string;
  }> = [];
  if (action === "transit") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity,prepared_quantity,shipped_quantity,source_location_id,stock_unit_code,unit")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
      prepared_quantity: number | null;
      shipped_quantity: number | null;
      source_location_id: string | null;
      stock_unit_code: string | null;
      unit: string | null;
    }>;

    if (access.fromSiteType === "production_center") {
      const locIds = Array.from(
        new Set(itemRows.map((row) => row.source_location_id).filter(Boolean) as string[])
      );
      const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));
      const { data: locStockRows } =
        locIds.length > 0 && productIds.length > 0
          ? await supabase
              .from("inventory_stock_by_location")
              .select("location_id,product_id,current_qty")
              .in("location_id", locIds)
              .in("product_id", productIds)
          : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
      const locStockMap = new Map(
        (locStockRows ?? []).map((row) => [
          `${row.location_id}|${row.product_id}`,
          Number(row.current_qty ?? 0),
        ])
      );

      let anyTransitQty = false;
      for (const row of itemRows) {
        const requestedQty = roundQuantity(Number(row.quantity ?? 0));
        const preparedQty = roundQuantity(Number(row.prepared_quantity ?? 0));
        const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
        const effectiveShippedQty = shippedQty > 0 ? shippedQty : preparedQty;
        const effectivePreparedQty = Math.max(preparedQty, effectiveShippedQty);
        const qty = effectiveShippedQty;

        if (preparedQty < 0 || shippedQty < 0) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Preparado y enviado no pueden ser negativos.",
            })
          );
        }
        if (requestedQty > 0 && preparedQty > requestedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada (${preparedQty}) mayor que solicitada (${requestedQty}).`,
            })
          );
        }
        if (requestedQty > 0 && effectiveShippedQty > requestedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${effectiveShippedQty}) mayor que solicitada (${requestedQty}).`,
            })
          );
        }
        if (shippedQty > 0 && preparedQty > 0 && shippedQty > preparedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${shippedQty}) no puede superar la preparada (${preparedQty}).`,
            })
          );
        }
        if (qty <= 0) continue;
        anyTransitQty = true;
        const sourceLocId = row.source_location_id ?? "";
        if (!sourceLocId) {
          redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Falta LOC origen en uno o mas items para enviar." }));
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${row.product_id}`) ?? 0;
        if (qty > availableAtLoc) {
          redirect(buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${qty}) supera stock disponible en LOC origen (${availableAtLoc}).`,
          }));
        }
        if (effectivePreparedQty !== preparedQty || effectiveShippedQty !== shippedQty) {
          const { error: syncErr } = await supabase
            .from("restock_request_items")
            .update({
              prepared_quantity: effectivePreparedQty,
              shipped_quantity: effectiveShippedQty,
            })
            .eq("id", row.id);
          if (syncErr) {
            redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncErr.message }));
          }
        }
        sourceLocDeductions.push({
          locationId: sourceLocId,
          productId: row.product_id,
          qty,
          unitCode: normalizeUnitCode(row.stock_unit_code || row.unit || "un"),
        });
      }
      if (!anyTransitQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Define al menos una cantidad preparada o enviada mayor a 0 antes de despachar.",
          })
        );
      }
    }
  }

  if (action === "receive" || action === "receive_partial") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
      prepared_quantity: number | null;
      shipped_quantity: number | null;
      received_quantity: number | null;
      shortage_quantity: number | null;
    }>;

    let anyAccountedQty = false;
    let allFullyAccounted = true;
    for (const row of itemRows) {
      const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
      const receivedQty = roundQuantity(Number(row.received_quantity ?? 0));
      const shortageQty = roundQuantity(Number(row.shortage_quantity ?? 0));
      const accountedQty = roundQuantity(receivedQty + shortageQty);

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (accountedQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${accountedQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
      if (accountedQty > 0) anyAccountedQty = true;
      if (shippedQty > 0 && accountedQty !== shippedQty) allFullyAccounted = false;

    }

    if (!anyAccountedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Registra al menos una cantidad recibida o faltante antes de continuar.",
        })
      );
    }

    if (action === "receive" && !allFullyAccounted) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Para cerrar la recepcion completa, cada item enviado debe quedar cubierto entre recibido y faltante.",
        })
      );
    }

    if (action === "receive_partial" && allFullyAccounted) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Todas las cantidades ya quedaron cubiertas. Usa 'Recibir' para cerrar la recepcion.",
        })
      );
    }
  }

  const updates: Record<string, string | null> = {
    status_updated_at: new Date().toISOString(),
  };

  if (action === "prepare") {
    updates.status = "preparing";
    updates.prepared_at = new Date().toISOString();
    updates.prepared_by = user.id;
  }

  if (action === "transit") {
    updates.status = "in_transit";
    updates.in_transit_at = new Date().toISOString();
    updates.in_transit_by = user.id;
  }

  if (action === "receive") {
    updates.status = "received";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "receive_partial") {
    updates.status = "partial";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "cancel") {
    updates.status = "cancelled";
    updates.cancelled_at = new Date().toISOString();
  }

  if (action === "transit") {
    const { error: moveErr } = await supabase.rpc("apply_restock_shipment", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: moveErr.message }));
    }
    const fromSiteIdForMovement = request?.from_site_id ?? "";
    if (!fromSiteIdForMovement) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No se encontro sede origen para la remision." }));
    }

    for (const deduction of sourceLocDeductions) {
      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: deduction.locationId,
        p_product_id: deduction.productId,
        p_delta: -deduction.qty,
      });
      if (locErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: `No se pudo actualizar stock del LOC origen: ${locErr.message}` }));
      }
    }
  }

  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update(updates)
    .eq("id", requestId);
  if (reqErr) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: reqErr.message }));
  }

  if (action === "receive" || action === "receive_partial") {
    const syncError = await syncReceiveRequestStatus({
      supabase,
      requestId,
    });
    if (syncError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncError }));
    }
  }

  const okCodeByAction: Record<string, string> = {
    prepare: "preparing_started",
    transit: "transit_started",
    receive: "received_complete",
    receive_partial: "received_partial",
    cancel: "cancelled",
  };

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: okCodeByAction[action] ?? "status_updated",
    })
  );
}

export async function applyPrepareShortcut(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_shortcut_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes preparar mientras la remision esta pendiente o preparando.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,source_location_id,prepared_quantity,shipped_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remision.",
      })
    );
  }

  let nextPrepared = roundQuantity(Number(itemRow.prepared_quantity ?? 0));
  let nextShipped = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  const requestedQty = roundQuantity(Number(itemRow.quantity ?? 0));
  const sourceLocId = String(itemRow.source_location_id ?? "").trim();
  const manualPrepareRaw = asText(formData.get("prepare_qty"));

  let availableAtLoc = 0;
  if (shortcut !== "clear_prepare" && shortcut !== "clear_ship") {
    if (!sourceLocId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Selecciona primero el LOC de origen.",
        })
      );
    }

    const { data: locStockRow } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", sourceLocId)
      .eq("product_id", itemRow.product_id)
      .maybeSingle();

    availableAtLoc = roundQuantity(Number(locStockRow?.current_qty ?? 0));
  }

  switch (shortcut) {
    case "complete_line": {
      if (requestedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene cantidad solicitada válida.",
          })
        );
      }
      if (availableAtLoc < requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Ese LOC no cubre completa la línea. Cambia LOC o divide la remisión.",
          })
        );
      }
      nextPrepared = requestedQty;
      nextShipped = 0;
      break;
    }
    case "prepare_auto": {
      const suggestedQty = roundQuantity(Math.min(requestedQty, availableAtLoc));
      if (suggestedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Ese LOC no tiene stock disponible para preparar esta línea.",
          })
        );
      }
      nextPrepared = suggestedQty;
      nextShipped = 0;
      break;
    }
    case "ship_prepared": {
      if (nextPrepared <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Primero marca cuánto preparas.",
          })
        );
      }
      nextShipped = nextPrepared;
      break;
    }
    case "set_prepare_partial": {
      const partialQty = roundQuantity(parseNumber(manualPrepareRaw || "0"));
      if (partialQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Define una cantidad parcial mayor a 0.",
          })
        );
      }
      if (requestedQty > 0 && partialQty > requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `La cantidad parcial (${partialQty}) no puede superar la solicitada (${requestedQty}).`,
          })
        );
      }
      if (availableAtLoc > 0 && partialQty > availableAtLoc) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `La cantidad parcial (${partialQty}) supera el stock del LOC (${availableAtLoc}).`,
          })
        );
      }
      nextPrepared = partialQty;
      nextShipped = 0;
      break;
    }
    case "clear_prepare":
      nextPrepared = 0;
      nextShipped = 0;
      break;
    case "clear_ship":
      nextShipped = 0;
      break;
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida no soportada.",
        })
      );
  }

  if (nextPrepared < 0 || nextShipped < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Las cantidades no pueden ser negativas.",
      })
    );
  }
  if (requestedQty > 0 && nextPrepared > requestedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad preparada (${nextPrepared}) mayor que solicitada (${requestedQty}).`,
      })
    );
  }
  if (requestedQty > 0 && nextShipped > requestedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) mayor que solicitada (${requestedQty}).`,
      })
    );
  }
  if (nextShipped > nextPrepared) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) no puede superar la preparada (${nextPrepared}).`,
      })
    );
  }
  if (sourceLocId && Math.max(nextPrepared, nextShipped) > availableAtLoc) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `La cantidad elegida supera el stock disponible en el LOC (${availableAtLoc}).`,
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({
      prepared_quantity: nextPrepared,
      shipped_quantity: nextShipped,
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  if (currentStatus === "pending" && nextPrepared > 0) {
    const { error: requestError } = await supabase
      .from("restock_requests")
      .update({
        status: "preparing",
        prepared_at: new Date().toISOString(),
        prepared_by: user.id,
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (requestError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: requestError.message }));
    }
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "line_shortcut",
      line: itemId,
      event: shortcut,
    })
  );
}

export async function applyReceiveShortcut(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_receive_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida de recepción.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  if (!access.canReceive || !["in_transit", "partial"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes registrar recepción mientras la remision está en tránsito o parcial.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.to_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes recibir esta remisión en este momento.",
  });

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remisión.",
      })
    );
  }

  const shippedQty = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  let nextReceived = roundQuantity(Number(itemRow.received_quantity ?? 0));
  let nextShortage = roundQuantity(Number(itemRow.shortage_quantity ?? 0));
  const manualReceiveRaw = asText(formData.get("receive_qty"));
  const manualShortageRaw = asText(formData.get("shortage_qty"));

  switch (shortcut) {
    case "receive_all":
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextReceived = shippedQty;
      nextShortage = 0;
      break;
    case "mark_shortage":
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextShortage = roundQuantity(Math.max(shippedQty - nextReceived, 0));
      break;
    case "clear_receive":
      nextReceived = 0;
      nextShortage = 0;
      break;
    case "set_partial": {
      const receivedQtyManual = roundQuantity(parseNumber(manualReceiveRaw || "0"));
      const shortageQtyManual =
        manualShortageRaw === ""
          ? roundQuantity(Math.max(shippedQty - receivedQtyManual, 0))
          : roundQuantity(parseNumber(manualShortageRaw));
      nextReceived = receivedQtyManual;
      nextShortage = shortageQtyManual;
      break;
    }
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida de recepción no soportada.",
        })
      );
  }

  if (nextReceived < 0 || nextShortage < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Recibido y faltante no pueden ser negativos.",
      })
    );
  }
  if (nextReceived + nextShortage > shippedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Recibido + faltante (${nextReceived + nextShortage}) no puede superar enviado (${shippedQty}).`,
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({
      received_quantity: nextReceived,
      shortage_quantity: nextShortage,
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  const syncError = await syncReceiveRequestStatus({
    supabase,
    requestId,
  });
  if (syncError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncError }));
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "line_shortcut",
      line: itemId,
      event: shortcut,
    })
  );
}
