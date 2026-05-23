import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app", "src/components", "src/features", "src/lib"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".md"]);
const MOJIBAKE = /Ã|Â|�|â(?:€|€™|€œ|€�|€“|€”|†)/;

const ACCENT_WORDS = [
  ["catalogo", "catálogo"],
  ["categoria", "categoría"],
  ["categorias", "categorías"],
  ["creacion", "creación"],
  ["edicion", "edición"],
  ["remision", "remisión"],
  ["presentacion", "presentación"],
  ["produccion", "producción"],
  ["ubicacion", "ubicación"],
  ["accion", "acción"],
  ["configuracion", "configuración"],
  ["descripcion", "descripción"],
  ["tecnica", "técnica"],
  ["rapido", "rápido"],
  ["automatico", "automático"],
  ["automaticamente", "automáticamente"],
  ["minimo", "mínimo"],
  ["invalido", "inválido"],
  ["todavia", "todavía"],
  ["despues", "después"],
  ["busqueda", "búsqueda"],
  ["fisica", "física"],
  ["fisicas", "físicas"],
  ["logica", "lógica"],
  ["logistica", "logística"],
];

const CODE_TOKEN_CONTEXT = /(?:const|let|var|function|type|interface|import|from|return|if|else|await|async|new|class)\b/;

function walk(dir) {
  const entries = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) entries.push(...walk(path));
    else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) entries.push(path);
  }
  return entries;
}

function looksLikeVisibleText(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
  if (trimmed.includes("className=") && !trimmed.includes(">")) return false;
  if (CODE_TOKEN_CONTEXT.test(trimmed) && !trimmed.includes('"') && !trimmed.includes("'") && !trimmed.includes(">")) {
    return false;
  }
  return /["'`>][^"'`<>{}]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(trimmed);
}

const findings = [];
for (const root of ROOTS) {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (MOJIBAKE.test(line)) {
        findings.push({ file, line: index + 1, type: "mojibake", text: line.trim() });
        return;
      }
      if (!looksLikeVisibleText(line)) return;
      const lower = line.toLocaleLowerCase("es-CO");
      for (const [plain, expected] of ACCENT_WORDS) {
        const pattern = new RegExp(`\\b${plain}\\b`, "i");
        if (pattern.test(lower)) {
          findings.push({
            file,
            line: index + 1,
            type: "accent-review",
            text: `${line.trim()}  [revisar: ${plain} -> ${expected}]`,
          });
          break;
        }
      }
    });
  }
}

const mojibakeFindings = findings.filter((item) => item.type === "mojibake");
const accentFindings = findings.filter((item) => item.type === "accent-review");

if (findings.length) {
  for (const item of findings.slice(0, 200)) {
    console.log(`${relative(process.cwd(), item.file)}:${item.line}: ${item.type}: ${item.text}`);
  }
  if (findings.length > 200) {
    console.log(`... ${findings.length - 200} hallazgo(s) adicional(es).`);
  }
  console.log(
    `\nResumen: ${mojibakeFindings.length} mojibake, ${accentFindings.length} revisión(es) de tildes.`
  );
  process.exitCode = mojibakeFindings.length > 0 ? 1 : 0;
} else {
  console.log("Sin mojibake ni palabras frecuentes sin tilde en textos visibles.");
}
