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
  return [...all.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map(mm => mm[1].replace(/\\([()\\])/g, "$1")).join(" ");
}
const stok = extract("bahan-stok-2026-09-04.pdf");
for (const kw of ["1899", "1926", "Stok GPU", "R102045", "102045"]) console.log(`[stok] ${kw} ->`, stok.includes(kw) ? "ADA" : "TIDAK");
const det = extract("bahan-detail-2026-09-04.pdf");
for (const kw of ["1899", "1926"]) console.log(`[detail] ${kw} ->`, det.includes(kw) ? "ADA" : "TIDAK");
// lihat sekitar R102045 di detail
const i = det.indexOf("R102045");
if (i >= 0) console.log("konteks R102045 (detail):", det.slice(i - 20, i + 160).replace(/\s+/g, " "));
