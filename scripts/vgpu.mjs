import fs from "fs";
import zlib from "zlib";
function extract(f) {
  const buf = fs.readFileSync(f);
  const s = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m, all = "";
  while ((m = re.exec(s)) !== null) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end === -1) continue;
    let data = buf.subarray(start, end), text = null;
    for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) { try { text = fn(data).toString("latin1"); break; } catch {} }
    if (text === null) text = data.toString("latin1");
    if (text.includes("Tj") || text.includes("TJ")) all += text + "\n";
  }
  return [...all.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map(mm => mm[1].replace(/\\([()\\])/g, "$1")) .join(" ");
}
const stok = extract("bahan-stok-2026-09-04.pdf");
const det = extract("bahan-detail-2026-09-04.pdf");
// R102045 GPU = 1926
console.log("[stok PDF] GPU 1926 utk R102045:", stok.includes("1926") ? "ADA" : "TIDAK");
console.log("[detail PDF] GPU 1926:", det.includes("1926") ? "ADA" : "TIDAK");
// Total biaya & satuan di detail: cari Rp values di kolom (cukup cek ada angka Rp)
const rpCount = (det.match(/Rp[\d.]+/g) || []).length;
console.log("[detail PDF] jumlah nilai Rp:", rpCount);
// pastikan tidak semua "-" di kolom biaya detail: hitung baris yg memuat Rp
const rowsOk = det.split("\n").filter(l => l.includes("Rp")).length;
console.log("baris mengandung Rp:", rowsOk > 0 ? "ADA" : "TIDAK");
