// Uji kesetaraan Worker (TS) vs Python service + round-trip parser Excel.
// Jalankan dari worker/:  node scripts/test.mjs
import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import * as XLSX from "xlsx";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(here, "..");
const projRoot = path.resolve(workerDir, "..");
const tmpDir = path.join(workerDir, ".tmp-test");
import fs from "fs";
fs.mkdirSync(tmpDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(workerDir, "src", "analysis.ts")],
  bundle: true,
  format: "cjs",
  outfile: path.join(tmpDir, "analysis.cjs"),
  platform: "node",
  target: "node20",
});
await esbuild.build({
  entryPoints: [path.join(workerDir, "src", "parser.ts")],
  bundle: true,
  format: "cjs",
  outfile: path.join(tmpDir, "parser.cjs"),
  platform: "node",
  target: "node20",
});

const { analyze, detailBatch } = require(path.join(tmpDir, "analysis.cjs"));
const { parseExcel } = require(path.join(tmpDir, "parser.cjs"));

const local = new PGlite(path.join(projRoot, "pgdata"));
await local.waitReady;

const settingsRes = await local.query(`SELECT key, value FROM settings`);
const settings = {};
for (const r of settingsRes.rows) {
  const n = Number(r.value);
  settings[r.key] = Number.isNaN(n) ? r.value : n;
}

const { rows } = await local.query(
  `SELECT t.tanggal, t.batch_no, t.kode, t.bahan_biaya, t.keterangan,
          t.pengeluaran_biaya, t.pengeluaran_qty,
          t.penyelesaian_biaya, t.penyelesaian_qty,
          t.total_biaya, t.total_qty,
          pm.product_type, pm.is_rtl, pm.is_main_output, pm.is_by_product, pm.is_packaging
   FROM production_transactions t
   LEFT JOIN product_master pm ON pm.kode = t.kode
   ORDER BY t.tanggal, t.batch_no`,
);
console.log(`Data lokal: ${rows.length} baris.`);

// ---------- 1) Bandingkan analyze() vs Python ----------
const pyRes = await fetch("http://127.0.0.1:8000/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rows, params: {}, settings }),
});
if (!pyRes.ok) {
  console.error("Python /analyze gagal:", pyRes.status);
  process.exit(1);
}
const pyOut = await pyRes.json();
const tsOut = analyze(rows, {}, settings);

const diffs = collectDiffs(pyOut, tsOut);
console.log(`\n[analyze] diff count vs Python: ${diffs.length}`);
if (diffs.length > 30) {
  console.log(`  (menampilkan 30 dari ${diffs.length})`);
  for (const d of diffs.slice(0, 30)) console.log("  ", d);
} else {
  for (const d of diffs) console.log("  ", d);
}
if (diffs.length === 0) console.log("[analyze] KESETARAAN SEMPURNA");

// ---------- 2) Bandingkan detail_batch() vs Python ----------
const sampleBatch = String(pyOut.batches?.[0]?.batch_no ?? rows.find((r) => r.batch_no)?.batch_no ?? "");
if (sampleBatch) {
  const pyDet = await (
    await fetch("http://127.0.0.1:8000/batch-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, batch_no: sampleBatch, settings }),
    })
  ).json();
  const tsDet = detailBatch(rows, sampleBatch, settings);
  const d2 = collectDiffs(pyDet, tsDet);
  console.log(`\n[detail_batch ${sampleBatch}] diff count: ${d2.length}`);
  for (const d of d2.slice(0, 20)) console.log("  ", d);
  if (d2.length === 0) console.log("[detail_batch] KESETARAAN SEMPURNA");
}

// ---------- 3) Round-trip parser Excel ----------
const sample = rows.slice(0, 120);
const buf = buildXlsx(sample);
const parsed = parseExcel(buf, "test.xlsx");

let roundTripOk = true;
const expected = sample.map((r) => ({
  tanggal: String(r.tanggal),
  batch_no: String(r.batch_no).toUpperCase().trim(),
  kode: String(r.kode).trim(),
  bahan_biaya: String(r.bahan_biaya ?? "").replace(/\s+/g, " ").trim(),
  pengeluaran_biaya: Number(r.pengeluaran_biaya) || 0,
  pengeluaran_qty: Number(r.pengeluaran_qty) || 0,
  penyelesaian_biaya: Number(r.penyelesaian_biaya) || 0,
  penyelesaian_qty: Number(r.penyelesaian_qty) || 0,
}));
const got = parsed.rows.map((r) => ({
  tanggal: String(r.tanggal),
  batch_no: String(r.batch_no),
  kode: String(r.kode),
  bahan_biaya: String(r.bahan_biaya ?? ""),
  pengeluaran_biaya: Number(r.pengeluaran_biaya),
  pengeluaran_qty: Number(r.pengeluaran_qty),
  penyelesaian_biaya: Number(r.penyelesaian_biaya),
  penyelesaian_qty: Number(r.penyelesaian_qty),
}));

console.log(`\n[parser] masukan ${sample.length} baris -> hasil ${parsed.rows.length} baris (invalid=${parsed.invalid_rows}).`);
if (expected.length !== got.length) {
  roundTripOk = false;
  console.log("  [parser] JUMLAH BARIS BERBEDA!");
} else {
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const g = got[i];
    const eq =
      e.tanggal === g.tanggal &&
      e.batch_no === g.batch_no &&
      e.kode === g.kode &&
      e.bahan_biaya === g.bahan_biaya &&
      Math.abs(e.pengeluaran_biaya - g.pengeluaran_biaya) < 0.011 &&
      Math.abs(e.pengeluaran_qty - g.pengeluaran_qty) < 0.011 &&
      Math.abs(e.penyelesaian_biaya - g.penyelesaian_biaya) < 0.011 &&
      Math.abs(e.penyelesaian_qty - g.penyelesaian_qty) < 0.011;
    if (!eq) {
      roundTripOk = false;
      console.log(`  [parser] baris ${i} TIDAK SAMA:\n    exp=${JSON.stringify(e)}\n    got=${JSON.stringify(g)}`);
      if (i > 10) break;
    }
  }
}
if (roundTripOk) console.log("[parser] ROUND-TRIP OK");

await local.close();

function collectDiffs(a, b, prefix = "", out = []) {
  if (a === null || a === undefined || b === null || b === undefined) {
    if (a !== b) out.push(`${prefix}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  }
  if (typeof a !== typeof b) {
    out.push(`${prefix}: tipe ${typeof a} vs ${typeof b}`);
    return out;
  }
  if (typeof a === "number") {
    if (Object.is(a, b) === false && Math.abs(a - b) > 1e-9) out.push(`${prefix}: ${a} vs ${b}`);
    return out;
  }
  if (typeof a === "string" || typeof a === "boolean") {
    if (a !== b) out.push(`${prefix}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      out.push(`${prefix}: panjang ${a.length} vs ${b.length}`);
    } else {
      for (let i = 0; i < a.length; i++) collectDiffs(a[i], b[i], `${prefix}[${i}]`, out);
    }
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a) || !(k in b)) {
      out.push(`${prefix}.${k}: ada di satu sisi saja (${k in a ? "A" : "B"})`);
      continue;
    }
    collectDiffs(a[k], b[k], `${prefix}.${k}`, out);
  }
  return out;
}

function buildXlsx(sampleRows) {
  const row0 = ["Tanggal", "Batch No.", "Kode", "Bahan dan Biaya", "Keterangan"];
  row0[5] = "Pengeluaran Barang";
  row0[8] = "Penyelesaian Pesanan";
  row0[11] = "Total Tipe Transaksi";
  const row1 = ["", "", "", "", "", "Biaya", "Kuantitas", "Alokasi", "Biaya", "Kuantitas", "Alokasi", "Biaya", "Kuantitas", "Alokasi"];
  const aoa = [row0, row1];
  for (const r of sampleRows) {
    aoa.push([
      new Date(String(r.tanggal) + "T00:00:00"),
      String(r.batch_no).toUpperCase(),
      String(r.kode),
      String(r.bahan_biaya ?? ""),
      String(r.keterangan ?? ""),
      Number(r.pengeluaran_biaya) || 0,
      Number(r.pengeluaran_qty) || 0,
      0,
      Number(r.penyelesaian_biaya) || 0,
      Number(r.penyelesaian_qty) || 0,
      0,
      (Number(r.pengeluaran_biaya) || 0) + (Number(r.penyelesaian_biaya) || 0),
      (Number(r.pengeluaran_qty) || 0) + (Number(r.penyelesaian_qty) || 0),
      0,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws["!merges"] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } },
    { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } },
    { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } },
  ];
  // simulasikan merge batch & tanggal vertikal (kelompok baris batch sama)
  let start = 2;
  let prevBatch = null;
  const ranges = [];
  for (let i = 0; i < sampleRows.length; i++) {
    const b = String(sampleRows[i].batch_no).toUpperCase();
    if (prevBatch !== null && b !== prevBatch) {
      if (i - start > 1) ranges.push({ s: { r: start, c: 0 }, e: { r: i - 1, c: 0 } });
      if (i - start > 1) ranges.push({ s: { r: start, c: 1 }, e: { r: i - 1, c: 1 } });
      start = i;
    }
    prevBatch = b;
  }
  if (sampleRows.length - start > 1) {
    ranges.push({ s: { r: start, c: 0 }, e: { r: sampleRows.length - 1, c: 0 } });
    ranges.push({ s: { r: start, c: 1 }, e: { r: sampleRows.length - 1, c: 1 } });
  }
  ws["!merges"] = [...(ws["!merges"] ?? []), ...ranges];
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: aoa.length - 1, c: 13 },
  });
  const wb = XLSX.utils.book_new();
  wb.SheetNames.push("Histori Pekerjaan Pesanan");
  wb.Sheets["Histori Pekerjaan Pesanan"] = ws;
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out;
}