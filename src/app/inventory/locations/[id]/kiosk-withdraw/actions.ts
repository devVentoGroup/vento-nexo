"use server";

import { redirect } from "next/navigation";

import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import {
  asText,
  errorUrl,
  isWholeCompatibleMultiple,
  locLabel,
  normalizeProduct,
  parseNumber,
  PRESENTATION_EPSILON,
  productMeasurementMode,
  profileBaseFactor,
  selectPresentationLedgerRowsForOperation,
  type LocationRow,
  type ParsedKioskWithdrawItem,
  type PresentationStockLedgerRow,
  type ProductRow,
  type StockRow,
} from "./helpers";
export async function submitKioskWithdraw(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const sourceLocationId = asText(formData.get("source_location_id"));
  const returnTo = asText(formData.get("return_to"));
  const fallbackRoute = sourceLocationId
    ? `/inventory/locations/${encodeURIComponent(sourceLocationId)}/kiosk-withdraw?kiosk=1`
    : "/inventory/stock";

  if (!user) {
    redirect(await buildShellLoginUrl(fallbackRoute));
  }

  if (!sourceLocationId) {
    redirect("/inventory/stock?error=" + encodeURIComponent("Falta el LOC de origen."));
  }

  const employeeId = asText(formData.get("employee_id"));
  const notes = asText(formData.get("notes"));

  const itemProductIds = formData.getAll("item_product_id").map((value) => String(value).trim());
  const itemQuantities = formData.getAll("item_quantity").map((value) => String(value).trim());
  const itemInputUnits = formData
    .getAll("item_input_unit_code")
    .map((value) => normalizeUnitCode(String(value).trim()));
  const itemInputUomProfileIds = formData
    .getAll("item_input_uom_profile_id")
    .map((value) => String(value).trim());
  const itemNotes = formData.getAll("item_notes").map((value) => String(value).trim());

  const hasCartItems = itemProductIds.some((productId) => Boolean(productId));

  const rawItems = hasCartItems
    ? itemProductIds.map((productId, index) => ({
      product_id: productId,
      input_qty: roundQuantity(parseNumber(itemQuantities[index] ?? "0")),
      input_unit_code: normalizeUnitCode(itemInputUnits[index] ?? ""),
      input_uom_profile_id: itemInputUomProfileIds[index] ?? "",
      note: itemNotes[index] || null,
    }))
    : [
      {
        product_id: asText(formData.get("product_id")),
        input_qty: roundQuantity(parseNumber(asText(formData.get("quantity")))),
        input_unit_code: normalizeUnitCode(asText(formData.get("input_unit_code"))),
        input_uom_profile_id: asText(formData.get("input_uom_profile_id")),
        note: notes || null,
      },
    ];

  const normalizedRawItems = rawItems.filter((item) => item.product_id || item.input_qty > 0);
  const firstProductId = normalizedRawItems[0]?.product_id || itemProductIds.find(Boolean) || "";
  const preserveValues = {
    employeeId,
    inputUnitCode: itemInputUnits[0] ?? "",
    inputUomProfileId: itemInputUomProfileIds[0] ?? "",
    notes,
    quantity: itemQuantities[0] ?? "",
  };
  const redirectWithError = (
    message: string,
    productId: string | null | undefined = firstProductId,
    field: "worker" | "product" = "product"
  ) =>
    redirect(errorUrl(sourceLocationId, message, productId, { ...preserveValues, field }));

  if (!employeeId) {
    redirectWithError("Selecciona trabajador.", firstProductId, "worker");
  }

  if (normalizedRawItems.length === 0) {
    redirectWithError("Agrega al menos un producto.", firstProductId, "product");
  }

  for (const item of normalizedRawItems) {
    if (!item.product_id || item.input_qty <= 0) {
      redirectWithError("Cada producto debe tener cantidad mayor a cero.", item.product_id, "product");
    }
  }

  const { data: sourceLoc } = await supabase
    .from("inventory_locations")
    .select("id,code,description,zone,site_id")
    .eq("id", sourceLocationId)
    .eq("is_active", true)
    .maybeSingle();
  const source = (sourceLoc ?? null) as LocationRow | null;

  if (!source?.site_id) {
    redirect(errorUrl(sourceLocationId, "El LOC de origen no esta activo o no tiene sede.", firstProductId));
  }

  const { data: assignmentData } = await supabase
    .from("employee_inventory_location_assignments")
    .select("employee_id,site_id,location_id,location:inventory_locations(id,code,description,zone,site_id)")
    .eq("employee_id", employeeId)
    .eq("site_id", source.site_id)
    .eq("purpose", "kiosk_withdraw")
    .eq("is_active", true)
    .maybeSingle();
  const assignment = (assignmentData ?? null) as {
    employee_id: string;
    site_id: string;
    location_id: string;
    location?: LocationRow | LocationRow[] | null;
  } | null;

  if (assignment?.location_id === sourceLocationId) {
    redirect(errorUrl(sourceLocationId, "El LOC destino del trabajador no puede ser el mismo origen.", firstProductId));
  }

  const { data: employeeData } = await supabase
    .from("employees")
    .select("id,full_name,alias")
    .eq("id", employeeId)
    .maybeSingle();
  const employeeLabel = String(employeeData?.alias ?? employeeData?.full_name ?? employeeId).trim();

  const productIdsForLookup = Array.from(new Set(normalizedRawItems.map((item) => item.product_id).filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code")
      .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };

  const productMap = new Map(((productsData ?? []) as ProductRow[]).map((product) => [product.id, product]));

  const { data: uomProfilesData } = productIdsForLookup.length
    ? await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
      .in("product_id", productIdsForLookup)
      .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };

  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as ProductUomProfile[]).map((profile) => [profile.id, profile])
  );

  const items: ParsedKioskWithdrawItem[] = [];

  for (const rawItem of normalizedRawItems) {
    const product = productMap.get(rawItem.product_id) ?? null;
    if (!product) {
      redirect(errorUrl(sourceLocationId, "Producto no encontrado.", rawItem.product_id));
    }

    const stockUnitCode = normalizeUnitCode(product.stock_unit_code || product.unit || "un");
    const selectedProfile = rawItem.input_uom_profile_id
      ? uomProfileById.get(rawItem.input_uom_profile_id) ?? null
      : null;

    if (rawItem.input_uom_profile_id && (!selectedProfile || selectedProfile.product_id !== rawItem.product_id)) {
      redirect(errorUrl(sourceLocationId, "Perfil de unidad inválido para el producto.", rawItem.product_id));
    }

    try {
      const conversion = convertByProductProfile({
        quantityInInput: rawItem.input_qty,
        inputUnitCode: rawItem.input_unit_code || stockUnitCode,
        stockUnitCode,
        profile: selectedProfile,
      });

      items.push({
        product_id: rawItem.product_id,
        quantity: conversion.quantityInStock,
        input_qty: rawItem.input_qty,
        input_unit_code: rawItem.input_unit_code || stockUnitCode,
        input_uom_profile_id: rawItem.input_uom_profile_id,
        conversion_factor_to_stock: conversion.factorToStock,
        stock_unit_code: stockUnitCode,
        note: rawItem.note,
      });
    } catch (error) {
      redirect(
        errorUrl(
          sourceLocationId,
          error instanceof Error ? error.message : "Error en conversion de unidades.",
          rawItem.product_id
        )
      );
    }
  }

  if (items.length === 0) {
    redirect(errorUrl(sourceLocationId, "Agrega al menos un producto valido.", firstProductId));
  }

  const requestedByProduct = new Map<
    string,
    {
      product_id: string;
      quantity: number;
      stock_unit_code: string;
      input_summary: string;
    }
  >();
  const requestedByPresentation = new Map<
    string,
    {
      product_id: string;
      uom_profile_id: string;
      presentation_qty: number;
      base_qty: number;
      label: string;
    }
  >();

  for (const item of items) {
    const current = requestedByProduct.get(item.product_id) ?? {
      product_id: item.product_id,
      quantity: 0,
      stock_unit_code: item.stock_unit_code,
      input_summary: "",
    };

    current.quantity += item.quantity;
    current.input_summary = current.input_summary
      ? `${current.input_summary}, ${item.input_qty} ${item.input_unit_code}`
      : `${item.input_qty} ${item.input_unit_code}`;

    requestedByProduct.set(item.product_id, current);

    if (item.input_uom_profile_id) {
      const key = `${item.product_id}:${item.input_uom_profile_id}`;
      const currentPresentation = requestedByPresentation.get(key) ?? {
        product_id: item.product_id,
        uom_profile_id: item.input_uom_profile_id,
        presentation_qty: 0,
        base_qty: 0,
        label: item.input_unit_code,
      };
      currentPresentation.presentation_qty = roundQuantity(currentPresentation.presentation_qty + item.input_qty);
      currentPresentation.base_qty = roundQuantity(currentPresentation.base_qty + item.quantity);
      requestedByPresentation.set(key, currentPresentation);
    }
  }

  const availableBaseQtyByProduct = new Map<string, number>();

  for (const requested of requestedByProduct.values()) {
    const { data: stockLoc } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", sourceLocationId)
      .eq("product_id", requested.product_id)
      .maybeSingle();

    const availableAtLoc = Number((stockLoc as { current_qty?: number } | null)?.current_qty ?? 0);
    availableBaseQtyByProduct.set(requested.product_id, availableAtLoc);

    if (availableAtLoc + PRESENTATION_EPSILON < requested.quantity) {
      redirect(
        errorUrl(
          sourceLocationId,
          `No alcanza stock: solicitaste ${requested.input_summary}, disponibles ${availableAtLoc} ${requested.stock_unit_code}.`,
          requested.product_id
        )
      );
    }
  }

  const presentationProductIds = Array.from(
    new Set(Array.from(requestedByPresentation.values()).map((requested) => requested.product_id))
  );

  const { data: presentationRowsData } = presentationProductIds.length
    ? await supabase
      .from("inventory_stock_by_uom_profile")
      .select("product_id,uom_profile_id,location_position_id,presentation_qty,base_qty")
      .eq("location_id", sourceLocationId)
      .in("product_id", presentationProductIds)
      .gt("presentation_qty", 0)
    : { data: [] as PresentationStockLedgerRow[] };

  const presentationRows = (presentationRowsData ?? []) as PresentationStockLedgerRow[];

  for (const requested of requestedByPresentation.values()) {
    const requestedProfile = uomProfileById.get(requested.uom_profile_id) ?? null;
    const requestedFactor = profileBaseFactor(requestedProfile);

    if (!requestedProfile || requestedFactor <= 0) {
      redirect(errorUrl(sourceLocationId, "Perfil de unidad inválido para retiro fisico.", requested.product_id));
    }

    let availableAsRequestedUnits = 0;

    const rowsForRequestedProduct = selectPresentationLedgerRowsForOperation(
      presentationRows.filter((row) => row.product_id === requested.product_id),
      availableBaseQtyByProduct.get(requested.product_id) ?? 0
    );

    for (const row of rowsForRequestedProduct) {
      const rowQty = Number(row.presentation_qty ?? 0);
      if (rowQty <= 0) continue;

      const rowProfile = uomProfileById.get(row.uom_profile_id) ?? null;
      const rowFactor = profileBaseFactor(rowProfile);
      if (rowFactor <= 0) continue;

      if (row.uom_profile_id === requested.uom_profile_id) {
        availableAsRequestedUnits += rowQty;
        continue;
      }

      if (isWholeCompatibleMultiple(rowFactor, requestedFactor)) {
        availableAsRequestedUnits += rowQty * Math.round(rowFactor / requestedFactor);
      }
    }

    if (availableAsRequestedUnits + PRESENTATION_EPSILON < requested.presentation_qty) {
      redirect(
        errorUrl(
          sourceLocationId,
          `No alcanza stock fisico: solicitaste ${requested.presentation_qty} ${requested.label}, disponibles ${roundQuantity(
            availableAsRequestedUnits
          )} equivalentes.`,
          requested.product_id
        )
      );
    }
  }

  const destination = Array.isArray(assignment?.location)
    ? assignment.location[0] ?? null
    : assignment?.location ?? null;
  const fromLabel = locLabel(source);
  const hasDestination = Boolean(assignment?.location_id);
  const toLabel = hasDestination ? locLabel(destination) : "sin destino";

  let transferId = "";

  if (hasDestination) {
    const itemCountLabel = items.length === 1 ? "1 producto" : `${items.length} productos`;

    const { data: transfer, error: transferErr } = await supabase
      .from("inventory_transfers")
      .insert({
        site_id: source.site_id,
        from_loc_id: sourceLocationId,
        to_loc_id: assignment!.location_id,
        status: "completed",
        notes: notes
          ? `Quiosco: ${employeeLabel}. ${itemCountLabel}. ${notes}`
          : `Quiosco: traslado confirmado por ${employeeLabel}. ${itemCountLabel}.`,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (transferErr || !transfer) {
      redirect(errorUrl(sourceLocationId, transferErr?.message ?? "No se pudo crear el traslado.", firstProductId));
    }

    transferId = String(transfer.id);

    const { error: itemErr } = await supabase.from("inventory_transfer_items").insert(
      items.map((item) => ({
        transfer_id: transfer.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.stock_unit_code,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        input_uom_profile_id: item.input_uom_profile_id || null,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        notes: item.note,
      }))
    );

    if (itemErr) {
      redirect(errorUrl(sourceLocationId, itemErr.message, firstProductId));
    }
  }

  const consumePhysicalPresentationForItem = async (item: ParsedKioskWithdrawItem) => {
    if (!item.input_uom_profile_id) return;

    const requestedProfile = uomProfileById.get(item.input_uom_profile_id) ?? null;
    const requestedFactor = profileBaseFactor(requestedProfile);

    if (!requestedProfile || requestedFactor <= 0) {
      redirect(errorUrl(sourceLocationId, "Perfil de unidad inválido para retiro fisico.", item.product_id));
    }

    const availableBaseQty = availableBaseQtyByProduct.get(item.product_id) ?? 0;
    let remainingPresentationQty = item.input_qty;

    const fetchPhysicalRowsForProduct = async () => {
      const { data, error } = await supabase
        .from("inventory_stock_by_uom_profile")
        .select("product_id,uom_profile_id,location_position_id,presentation_qty,base_qty")
        .eq("location_id", sourceLocationId)
        .eq("product_id", item.product_id)
        .gt("presentation_qty", 0);

      if (error) {
        redirect(errorUrl(sourceLocationId, error.message, item.product_id));
      }

      return selectPresentationLedgerRowsForOperation(
        (data ?? []) as PresentationStockLedgerRow[],
        availableBaseQty
      );
    };

    const deletePhysicalRow = async (row: PresentationStockLedgerRow) => {
      let deleteQuery = supabase
        .from("inventory_stock_by_uom_profile")
        .delete()
        .eq("location_id", sourceLocationId)
        .eq("product_id", row.product_id)
        .eq("uom_profile_id", row.uom_profile_id);

      deleteQuery = row.location_position_id
        ? deleteQuery.eq("location_position_id", row.location_position_id)
        : deleteQuery.is("location_position_id", null);

      const { error } = await deleteQuery;

      if (error) {
        redirect(errorUrl(sourceLocationId, error.message, item.product_id));
      }
    };

    const decrementPhysicalRow = async (
      row: PresentationStockLedgerRow,
      presentationQty: number,
      baseQty: number
    ) => {
      const availablePresentationQty = Number(row.presentation_qty ?? 0);
      const availableBaseQtyForRow = Number(row.base_qty ?? 0);

      if (availablePresentationQty <= 0 || availableBaseQtyForRow <= 0) return;

      const consumesEntireRow =
        presentationQty + PRESENTATION_EPSILON >= availablePresentationQty ||
        baseQty + PRESENTATION_EPSILON >= availableBaseQtyForRow;

      if (consumesEntireRow) {
        await deletePhysicalRow(row);
        return;
      }

      const { error } = await supabase.rpc("upsert_inventory_stock_by_uom_profile", {
        p_location_id: sourceLocationId,
        p_product_id: item.product_id,
        p_uom_profile_id: row.uom_profile_id,
        p_presentation_delta: -presentationQty,
        p_base_delta: -baseQty,
        p_location_position_id: row.location_position_id ?? null,
      });

      if (error) {
        redirect(errorUrl(sourceLocationId, error.message, item.product_id));
      }
    };

    const exactRows = (await fetchPhysicalRowsForProduct())
      .filter((row) => row.uom_profile_id === item.input_uom_profile_id)
      .sort((a, b) => {
        const aPositionRank = a.location_position_id ? 0 : 1;
        const bPositionRank = b.location_position_id ? 0 : 1;
        if (aPositionRank !== bPositionRank) return aPositionRank - bPositionRank;
        return Number(a.presentation_qty ?? 0) - Number(b.presentation_qty ?? 0);
      });

    for (const row of exactRows) {
      if (remainingPresentationQty <= PRESENTATION_EPSILON) break;

      const availableQty = Number(row.presentation_qty ?? 0);
      if (availableQty <= 0) continue;

      const consumedQty = Math.min(availableQty, remainingPresentationQty);
      const consumedBaseQty = roundQuantity(consumedQty * requestedFactor);

      await decrementPhysicalRow(row, consumedQty, consumedBaseQty);

      remainingPresentationQty = roundQuantity(remainingPresentationQty - consumedQty);
    }

    if (remainingPresentationQty <= PRESENTATION_EPSILON) return;

    const candidates = (await fetchPhysicalRowsForProduct())
      .map((row) => {
        const profile = uomProfileById.get(row.uom_profile_id) ?? null;
        const factor = profileBaseFactor(profile);
        const presentationQty = Number(row.presentation_qty ?? 0);

        if (!profile || factor <= 0 || presentationQty <= 0) return null;
        if (!isWholeCompatibleMultiple(factor, requestedFactor)) return null;

        return {
          row,
          factor,
          presentationQty,
          requestedUnitsPerPresentation: Math.round(factor / requestedFactor),
        };
      })
      .filter(
        (
          candidate
        ): candidate is {
          row: PresentationStockLedgerRow;
          factor: number;
          presentationQty: number;
          requestedUnitsPerPresentation: number;
        } => Boolean(candidate)
      )
      .sort((a, b) => {
        if (a.requestedUnitsPerPresentation !== b.requestedUnitsPerPresentation) {
          return a.requestedUnitsPerPresentation - b.requestedUnitsPerPresentation;
        }

        const aPositionRank = a.row.location_position_id ? 0 : 1;
        const bPositionRank = b.row.location_position_id ? 0 : 1;
        if (aPositionRank !== bPositionRank) return aPositionRank - bPositionRank;

        return a.presentationQty - b.presentationQty;
      });

    for (const candidate of candidates) {
      if (remainingPresentationQty <= PRESENTATION_EPSILON) break;

      const presentationsToOpen = Math.min(
        candidate.presentationQty,
        Math.ceil(remainingPresentationQty / candidate.requestedUnitsPerPresentation)
      );

      if (presentationsToOpen <= 0) continue;

      const openedBaseQty = roundQuantity(presentationsToOpen * candidate.factor);
      const createdRequestedQty = roundQuantity(presentationsToOpen * candidate.requestedUnitsPerPresentation);
      const consumedFromOpenedQty = Math.min(createdRequestedQty, remainingPresentationQty);
      const leftoverRequestedQty = roundQuantity(createdRequestedQty - consumedFromOpenedQty);

      await decrementPhysicalRow(candidate.row, presentationsToOpen, openedBaseQty);

      if (leftoverRequestedQty > PRESENTATION_EPSILON) {
        const { error: leftoverErr } = await supabase.rpc("upsert_inventory_stock_by_uom_profile", {
          p_location_id: sourceLocationId,
          p_product_id: item.product_id,
          p_uom_profile_id: item.input_uom_profile_id,
          p_presentation_delta: leftoverRequestedQty,
          p_base_delta: roundQuantity(leftoverRequestedQty * requestedFactor),
          p_location_position_id: candidate.row.location_position_id ?? null,
        });

        if (leftoverErr) {
          redirect(errorUrl(sourceLocationId, leftoverErr.message, item.product_id));
        }
      }

      remainingPresentationQty = roundQuantity(remainingPresentationQty - consumedFromOpenedQty);
    }

    if (remainingPresentationQty > PRESENTATION_EPSILON) {
      redirect(
        errorUrl(
          sourceLocationId,
          `No alcanza stock fisico para retirar ${item.input_qty} ${item.input_unit_code}.`,
          item.product_id
        )
      );
    }
  };

  for (const item of items) {
    await consumePhysicalPresentationForItem(item);

    const { error: positionErr } = await supabase.rpc("consume_inventory_stock_from_positions", {
      p_location_id: sourceLocationId,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_created_by: user.id,
      p_note: hasDestination
        ? `Quiosco ${fromLabel} -> ${toLabel}: menor stock primero`
        : `Quiosco retiro ${fromLabel}: menor stock primero`,
    });

    if (positionErr) {
      redirect(errorUrl(sourceLocationId, positionErr.message, item.product_id));
    }

    const { error: fromErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: sourceLocationId,
      p_product_id: item.product_id,
      p_delta: -item.quantity,
    });

    if (fromErr) {
      redirect(errorUrl(sourceLocationId, fromErr.message, item.product_id));
    }

    if (hasDestination) {
      const { error: movementErr } = await supabase.from("inventory_movements").insert({
        site_id: source.site_id,
        product_id: item.product_id,
        movement_type: "transfer_internal",
        quantity: item.quantity,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        input_uom_profile_id: item.input_uom_profile_id || null,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        note: item.note
          ? `Quiosco ${transferId}: ${employeeLabel} traslado ${fromLabel} -> ${toLabel}. ${item.note}`
          : `Quiosco ${transferId}: ${employeeLabel} traslado ${fromLabel} -> ${toLabel}`,
        created_by: user.id,
      });

      if (movementErr) {
        redirect(errorUrl(sourceLocationId, movementErr.message, item.product_id));
      }

      const { error: toErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: assignment!.location_id,
        p_product_id: item.product_id,
        p_delta: item.quantity,
      });

      if (toErr) {
        redirect(errorUrl(sourceLocationId, toErr.message, item.product_id));
      }
      if (item.input_uom_profile_id) {
        const { error: toPresentationErr } = await supabase.rpc("upsert_inventory_stock_by_uom_profile", {
          p_location_id: assignment!.location_id,
          p_product_id: item.product_id,
          p_uom_profile_id: item.input_uom_profile_id,
          p_presentation_delta: item.input_qty,
          p_base_delta: item.quantity,
          p_location_position_id: null,
        });

        if (toPresentationErr) {
          redirect(errorUrl(sourceLocationId, toPresentationErr.message, item.product_id));
        }
      }
    } else {
      const { error: movementErr } = await supabase.from("inventory_movements").insert({
        site_id: source.site_id,
        product_id: item.product_id,
        movement_type: "consumption",
        quantity: -item.quantity,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        input_uom_profile_id: item.input_uom_profile_id || null,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        note: item.note
          ? `Quiosco retiro ${fromLabel}: ${employeeLabel}. ${item.note}`
          : `Quiosco retiro ${fromLabel}: ${employeeLabel} sin LOC destino`,
        created_by: user.id,
      });

      if (movementErr) {
        redirect(errorUrl(sourceLocationId, movementErr.message, item.product_id));
      }

      const { data: siteStock } = await supabase
        .from("inventory_stock_by_site")
        .select("current_qty")
        .eq("site_id", source.site_id)
        .eq("product_id", item.product_id)
        .maybeSingle();

      const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
      const newQty = Math.max(0, currentQty - item.quantity);

      const { error: siteErr } = await supabase
        .from("inventory_stock_by_site")
        .upsert(
          {
            site_id: source.site_id,
            product_id: item.product_id,
            current_qty: newQty,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "site_id,product_id" }
        );

      if (siteErr) {
        redirect(errorUrl(sourceLocationId, siteErr.message, item.product_id));
      }
    }
  }

  const redirectTarget = returnTo || `/inventory/locations/${encodeURIComponent(sourceLocationId)}/board?kiosk=1`;
  const joiner = redirectTarget.includes("?") ? "&" : "?";

  const successProductLabel =
    items.length === 1
      ? `${items[0].input_qty} ${items[0].input_unit_code} de ${productMap.get(items[0].product_id)?.name ?? "producto"
      }`
      : `${items.length} productos`;

  const successMessage = hasDestination
    ? `Se retiró ${successProductLabel} desde ${fromLabel} hacia ${toLabel}.`
    : `Se retiró ${successProductLabel} desde ${fromLabel}.`;

  redirect(
    `${redirectTarget}${joiner}ok=kiosk_withdraw&success_message=${encodeURIComponent(successMessage)}`
  );
}
