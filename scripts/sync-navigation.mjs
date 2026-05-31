#!/usr/bin/env node

// VENTO OS / Navigation Sync
//
// Detecta paginas de Next.js App Router dentro de src/app y las sincroniza
// contra public.app_screen_registry usando el RPC:
//
//   public.upsert_app_screen_registry(...)
//
// No agrega pantallas directamente al sidebar. VISO promueve pantallas desde
// app_screen_registry hacia app_navigation_items despues de elegir grupo,
// orden y visibilidad.
//
// Variables requeridas para sincronizar realmente:
//   NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY
//
// Si faltan variables de Supabase, el script termina sin romper el build.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) continue;

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "src", "app");

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, ".env"));

const APP_CODE = process.env.VENTO_APP_CODE || "nexo";
const APP_LABEL = process.env.VENTO_APP_LABEL || "NEXO";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const LABEL_OVERRIDES = {
  "app-navigation": "Navegación de apps",
  "app-updates": "Actualizaciones",
  "cost-center": "Centros de costo",
  "cost-centers": "Centros de costo",
  "internal-prices": "Precios internos",
  "internal-invoices": "Comprobantes internos",
  "internal-variances": "Diferencias internas",
  "internal-reports": "Reportes internos",
  "roles-permissions": "Permisos por rol",
};

const DESCRIPTION_OVERRIDES = {
  "cost-center": "Administra centros de costo internos.",
  "cost-centers": "Administra centros de costo internos.",
  "internal-prices": "Administra precios internos por producto y satélite.",
  "internal-invoices": "Consulta y gestiona comprobantes POS internos.",
  "internal-variances": "Revisa y resuelve diferencias internas de remisiones.",
  "internal-reports": "Consulta reportes internos por centro de costo.",
};

const ICON_OVERRIDES = {
  "cost-center": "building-2",
  "cost-centers": "building-2",
  "internal-prices": "badge-dollar-sign",
  "internal-invoices": "receipt-text",
  "internal-variances": "triangle-alert",
  "internal-reports": "chart-column",
};

const PERMISSION_OVERRIDES = {
  "cost-center": "cost_centers.view",
  "cost-centers": "cost_centers.view",
  "internal-prices": "internal_prices.view",
  "internal-invoices": "internal_invoices.view",
  "internal-variances": "internal_variances.view",
  "internal-reports": "internal_reports.view",
  "roles-permissions": "staff.permissions.manage",
  "app-navigation": "app_navigation.manage",
  "app-updates": "app_updates.read",
};

const EXPLICIT_NEW_MENU_CANDIDATES = new Set([
  "/inventory/cost-center",
  "/inventory/cost-centers",
  "/inventory/settings/cost-centers",
  "/inventory/settings/internal-invoices",
  "/inventory/settings/internal-variances",
  "/inventory/settings/internal-reports",
]);

const NEVER_MENU_EXACT = new Set([
  "/login",
  "/no-access",
  "/page.tsx",
  "/scanner",
  "/inventory/lpns",
  "/inventory/warehouse",
  "/printing/setup",
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function normalizeSegment(segment) {
  return segment
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function toSnake(value) {
  return normalizeSegment(value).replace(/-/g, "_") || "item";
}

function humanizeSegment(segment) {
  const normalized = normalizeSegment(segment);
  if (LABEL_OVERRIDES[normalized]) return LABEL_OVERRIDES[normalized];

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase();
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function routeFromPageFile(filePath) {
  const relative = toPosix(path.relative(appDir, filePath));
  const withoutPage = relative.replace(/\/page\.(tsx|ts|jsx|js)$/u, "");
  const segments = withoutPage.split("/").filter(Boolean);

  const routeSegments = segments.filter((segment) => {
    if (segment.startsWith("(") && segment.endsWith(")")) return false;
    if (segment.startsWith("@")) return false;
    if (segment.startsWith("_")) return false;
    return true;
  });

  if (routeSegments.some((segment) => segment === "api")) return null;

  const href = `/${routeSegments.join("/")}`.replace(/\/+/g, "/");
  return href === "/" ? null : href;
}

function collectPageFiles(dir, output = []) {
  if (!existsSync(dir)) return output;

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      collectPageFiles(fullPath, output);
      continue;
    }

    if (/\/page\.(tsx|ts|jsx|js)$/u.test(toPosix(fullPath))) {
      output.push(fullPath);
    }
  }

  return output;
}

function suggestGroup(href) {
  const segments = href.split("/").filter(Boolean);

  if (segments.includes("settings") || segments.includes("configuration")) {
    return {
      key: "configuration",
      label: "Configuracion",
      order: 60,
    };
  }

  if (segments.includes("inventory")) {
    return {
      key: "inventory_control",
      label: "Control de inventario",
      order: 30,
    };
  }

  if (segments.includes("catalog")) {
    return {
      key: "catalog",
      label: "Catalogo",
      order: 40,
    };
  }

  if (segments.includes("locations")) {
    return {
      key: "locations",
      label: "Ubicaciones",
      order: 50,
    };
  }

  if (segments.includes("printing")) {
    return {
      key: "printing",
      label: "Impresion",
      order: 70,
    };
  }

  if (segments.includes("reports") || segments.includes("analytics")) {
    return {
      key: "reports",
      label: "Reportes",
      order: 80,
    };
  }

  if (segments.includes("admin") || segments.includes("staff")) {
    return {
      key: "administration",
      label: "Administracion",
      order: 90,
    };
  }

  return {
    key: "daily_ops",
    label: "Operacion diaria",
    order: 20,
  };
}

function permissionForHref(href, duplicateLastSegmentCount) {
  const segments = href.split("/").filter(Boolean);
  const last = normalizeSegment(segments.at(-1) || "screen");
  const itemKey = segments.map(toSnake).join("_");

  const localPermission =
    PERMISSION_OVERRIDES[last] ||
    (duplicateLastSegmentCount > 1 ? `${itemKey}.view` : `${toSnake(last)}.view`);

  return `${APP_CODE}.${localPermission}`;
}

function sourceHash(filePath) {
  const content = readFileSync(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

function parentFromHref(href) {
  if (href.includes("[") && href.includes("]")) {
    return href.replace(/\/\[[^/]+\].*$/u, "") || null;
  }

  const segments = href.split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  return `/${segments.slice(0, -1).join("/")}`;
}

function classifyRoute(href, existingMenuHrefs) {
  if (existingMenuHrefs.has(href)) {
    return {
      navigationKind: "menu",
      isMenuCandidate: true,
      parentHref: null,
    };
  }

  if (
    href.startsWith("/_hidden_") ||
    href.startsWith("/api/") ||
    href === "/page.tsx"
  ) {
    return {
      navigationKind: "hidden",
      isMenuCandidate: false,
      parentHref: null,
    };
  }

  if (href === "/login" || href === "/no-access") {
    return {
      navigationKind: "auth",
      isMenuCandidate: false,
      parentHref: null,
    };
  }

  if (href.startsWith("/kiosk/") || href.startsWith("/l/")) {
    return {
      navigationKind: "detail",
      isMenuCandidate: false,
      parentHref: parentFromHref(href),
    };
  }

  if (href.includes("[") && href.includes("]")) {
    return {
      navigationKind: "detail",
      isMenuCandidate: false,
      parentHref: parentFromHref(href),
    };
  }

  if (NEVER_MENU_EXACT.has(href)) {
    return {
      navigationKind: "internal",
      isMenuCandidate: false,
      parentHref: null,
    };
  }

  if (EXPLICIT_NEW_MENU_CANDIDATES.has(href)) {
    return {
      navigationKind: "menu",
      isMenuCandidate: true,
      parentHref: null,
    };
  }

  const actionPattern =
    /\/(new|create|edit|assign-location|open|print|preview|import|export)$/u;

  if (actionPattern.test(href)) {
    return {
      navigationKind: "action",
      isMenuCandidate: false,
      parentHref: parentFromHref(href),
    };
  }

  const nestedUnderModule =
    href.startsWith("/inventory/catalog/") ||
    href.startsWith("/inventory/count-initial/") ||
    href.startsWith("/inventory/locations/") ||
    href.startsWith("/inventory/remissions/") ||
    href.startsWith("/inventory/stock/");

  if (nestedUnderModule && !href.startsWith("/inventory/settings/")) {
    return {
      navigationKind: "submenu",
      isMenuCandidate: false,
      parentHref: parentFromHref(href),
    };
  }

  return {
    navigationKind: "internal",
    isMenuCandidate: false,
    parentHref: null,
  };
}

async function fetchExistingMenuHrefs(supabase) {
  const { data, error } = await supabase
    .from("app_navigation_items")
    .select("href")
    .eq("app_code", APP_CODE);

  if (error) {
    throw new Error(`[navigation-sync] Failed to read app_navigation_items: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.href).filter(Boolean));
}

async function main() {
  if (!existsSync(appDir)) {
    console.log(`[navigation-sync] No src/app directory found for ${APP_LABEL}. Skipping.`);
    return;
  }

  if (!supabaseUrl || !serviceKey) {
    console.warn(
      `[navigation-sync] Supabase env vars missing. Skipping registry sync for ${APP_LABEL}.`
    );
    console.warn(
      "[navigation-sync] Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const existingMenuHrefs = await fetchExistingMenuHrefs(supabase);

  const pageFiles = collectPageFiles(appDir);
  const routeEntries = pageFiles
    .map((filePath) => ({
      filePath,
      href: routeFromPageFile(filePath),
    }))
    .filter((entry) => Boolean(entry.href));

  const lastSegmentCounts = new Map();
  for (const entry of routeEntries) {
    const last = normalizeSegment(entry.href.split("/").filter(Boolean).at(-1) || "screen");
    lastSegmentCounts.set(last, (lastSegmentCounts.get(last) || 0) + 1);
  }

  let synced = 0;

  for (const entry of routeEntries) {
    const segments = entry.href.split("/").filter(Boolean);
    const lastSegment = normalizeSegment(segments.at(-1) || "screen");
    const group = suggestGroup(entry.href);
    const classification = classifyRoute(entry.href, existingMenuHrefs);
    const relativeSourcePath = toPosix(path.relative(rootDir, entry.filePath));
    const label = humanizeSegment(lastSegment);
    const description =
      DESCRIPTION_OVERRIDES[lastSegment] ||
      `Pantalla de ${APP_LABEL}: ${label}.`;
    const permissionCode = permissionForHref(entry.href, lastSegmentCounts.get(lastSegment) || 1);

    const payload = {
      p_app_code: APP_CODE,
      p_href: entry.href,
      p_label: label,
      p_description: description,
      p_icon: ICON_OVERRIDES[lastSegment] || "layout-panel-left",
      p_suggested_group_key: group.key,
      p_suggested_group_label: group.label,
      p_suggested_group_order: group.order,
      p_suggested_sort_order: 100,
      p_required_permission_code: permissionCode,
      p_permission_name: label,
      p_permission_description: `Permite acceder a ${label}.`,
      p_source_path: relativeSourcePath,
      p_sync_source: "next-app-router-scanner",
      p_sync_hash: sourceHash(entry.filePath),
      p_navigation_kind: classification.navigationKind,
      p_is_menu_candidate: classification.isMenuCandidate,
      p_parent_href: classification.parentHref,
    };

    const { error } = await supabase.rpc("upsert_app_screen_registry", payload);

    if (error) {
      throw new Error(
        `[navigation-sync] Failed to sync ${entry.href}: ${error.message}`
      );
    }

    synced += 1;
    console.log(
      `[navigation-sync] ${APP_CODE} ${entry.href} -> ${permissionCode} (${classification.navigationKind}, menu=${classification.isMenuCandidate})`
    );
  }

  console.log(`[navigation-sync] Synced ${synced} screens for ${APP_LABEL}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
