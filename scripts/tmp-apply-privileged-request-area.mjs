import fs from "node:fs";

function patchFile(path, transforms) {
  let source = fs.readFileSync(path, "utf8");
  for (const [label, before, after] of transforms) {
    if (!source.includes(before)) {
      throw new Error(`${path}: no se encontró el bloque ${label}`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

const pagePath = "src/app/inventory/remissions/page.tsx";
patchFile(pagePath, [
  [
    "search param area_kind",
    `  from_site_id?: string;\n  new?: string;\n};`,
    `  from_site_id?: string;\n  area_kind?: string;\n  new?: string;\n};`,
  ],
  [
    "privileged roles constant",
    `const PERMISSIONS = {\n  remissionsRequest: "inventory.remissions.request",\n  remissionsAllSites: "inventory.remissions.all_sites",\n  remissionsCancel: "inventory.remissions.cancel