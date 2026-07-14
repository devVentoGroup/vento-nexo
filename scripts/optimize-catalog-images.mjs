import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "nexo-catalog-images";
const CACHE_SECONDS = 60 * 60 * 24 * 365;
const MAX_EDGE = 1024;
const PAGE_SIZE = 1000;

const SOURCES = [
  { table: "products", columns: ["image_url"] },
  { table: "product_uom_profiles", columns: ["image_url"] },
  { table: "product_images", columns: ["image_url"] },
  { table: "catalog_items", columns: ["image_url"] },
];

function readNumberFlag(name, fallback) {
  const prefix = "--" + name + "=";
  const raw = process.argv.find((value) => value.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const applyChanges = process.argv.includes("--apply");
const concurrency = Math.min(readNumberFlag("concurrency", 3), 8);
const limit = readNumberFlag("limit", Number.MAX_SAFE_INTEGER);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function storageObjectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(raw);
    const decoded = decodeURIComponent(parsed.pathname);
    const objectMarker = "/storage/v1/object/public/" + BUCKET + "/";
    const renderMarker = "/storage/v1/render/image/public/" + BUCKET + "/";
    const marker = decoded.includes(objectMarker) ? objectMarker : renderMarker;
    const index = decoded.indexOf(marker);
    if (index < 0) return null;
    return decoded.slice(index + marker.length);
  } catch {
    return null;
  }
}

function optimizedObjectPath(sourcePath, input) {
  const digest = createHash("sha256").update(input).digest("hex").slice(0, 12);
  const stem = sourcePath.replace(/\.[^/.]+$/, "");
  return "optimized/v1/" + stem + "-" + digest + ".webp";
}

function isDuplicateUploadError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.statusCode === "409" || message.includes("duplicate") || message.includes("already exists");
}

async function fetchRows(table, columns) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(["id", ...columns].join(","))
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(table + ": " + error.message);

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function collectReferences() {
  const byUrl = new Map();

  for (const source of SOURCES) {
    const rows = await fetchRows(source.table, source.columns);

    for (const row of rows) {
      for (const column of source.columns) {
        const url = String(row[column] || "").trim();
        const objectPath = storageObjectPath(url);
        if (!objectPath || objectPath.startsWith("optimized/v1/")) continue;

        let entry = byUrl.get(url);
        if (!entry) {
          entry = { sourceUrl: url, sourcePath: objectPath, targets: new Set() };
          byUrl.set(url, entry);
        }
        entry.targets.add(source.table + ":" + column);
      }
    }
  }

  return [...byUrl.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

async function updateReferences(entry, targetUrl) {
  let updated = 0;

  for (const target of entry.targets) {
    const [table, column] = target.split(":");
    const { data, error } = await supabase
      .from(table)
      .update({ [column]: targetUrl })
      .eq(column, entry.sourceUrl)
      .select("id");

    if (error) {
      throw new Error(table + "." + column + ": " + error.message);
    }

    updated += data?.length || 0;
  }

  return updated;
}

async function processEntry(entry, index, total, stats) {
  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(entry.sourcePath);

  if (downloadError || !sourceBlob) {
    throw new Error("download " + entry.sourcePath + ": " + (downloadError?.message || "empty response"));
  }

  const input = Buffer.from(await sourceBlob.arrayBuffer());
  const metadata = await sharp(input, {
    animated: true,
    failOn: "none",
    limitInputPixels: 50_000_000,
  }).metadata();

  const optimized = await sharp(input, {
    animated: true,
    failOn: "none",
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 88,
      alphaQuality: 100,
      effort: 5,
      smartSubsample: true,
    })
    .toBuffer();

  const oversized =
    Number(metadata.width || 0) > MAX_EDGE ||
    Number(metadata.height || 0) > MAX_EDGE;
  const shouldOptimize = oversized || optimized.byteLength < input.byteLength;

  stats.sourceBytes += input.byteLength;
  stats.candidateBytes += shouldOptimize ? optimized.byteLength : input.byteLength;

  if (!shouldOptimize) {
    stats.skipped += 1;
    console.log(
      "[" + (index + 1) + "/" + total + "] keep " + entry.sourcePath +
      " (" + input.byteLength + " bytes)"
    );
    return;
  }

  const targetPath = optimizedObjectPath(entry.sourcePath, input);
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(targetPath);

  if (applyChanges) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(targetPath, optimized, {
        contentType: "image/webp",
        cacheControl: String(CACHE_SECONDS),
        upsert: false,
      });

    if (uploadError && !isDuplicateUploadError(uploadError)) {
      throw new Error("upload " + targetPath + ": " + uploadError.message);
    }

    stats.referencesUpdated += await updateReferences(entry, urlData.publicUrl);
  }

  stats.optimized += 1;
  console.log(
    "[" + (index + 1) + "/" + total + "] " +
    (applyChanges ? "applied " : "would optimize ") +
    entry.sourcePath + " " + input.byteLength + " -> " + optimized.byteLength
  );
}

async function main() {
  const entries = (await collectReferences()).slice(0, limit);
  const stats = {
    mode: applyChanges ? "apply" : "dry-run",
    candidates: entries.length,
    optimized: 0,
    skipped: 0,
    failed: 0,
    referencesUpdated: 0,
    sourceBytes: 0,
    candidateBytes: 0,
  };
  const failures = [];
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;

      try {
        await processEntry(entries[index], index, entries.length, stats);
      } catch (error) {
        stats.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ path: entries[index].sourcePath, error: message });
        console.error("[" + (index + 1) + "/" + entries.length + "] failed: " + message);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const savedBytes = stats.sourceBytes - stats.candidateBytes;
  console.log(JSON.stringify({ ...stats, savedBytes, failures }, null, 2));

  if (stats.failed > 0) process.exitCode = 1;
}

await main();