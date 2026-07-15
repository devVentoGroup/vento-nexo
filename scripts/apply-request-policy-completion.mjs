import fs from "node:fs";

const filePath = "src/app/inventory/remissions/actions.ts";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, search, replacement) {
  const firstIndex = source.indexOf(search);
  if (firstIndex === -1) {
    throw new Error(`No se encontró el bloque requerido: ${label}`);
  }
  if (source.indexOf(search, firstIndex + search.length) !== -1) {
    throw new Error(`El bloque no es único: ${label}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  "bloqueo de productos sin política",
  `      .map((policy) => [policy.id