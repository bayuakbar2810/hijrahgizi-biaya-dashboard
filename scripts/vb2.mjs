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
const det = extract("bahan-detail-2026-09-04.pdf");
// hitung nilai biaya satuan non-nol di tabel sering dipakai
const satuanVals = [...det.matchAll(/Rp(\d[\d,.]+)/g)].map(m => m[1]);
console.log("contoh nilai Rp di PDF detail:", satuanVals.slice(0, 8).join(", "));
console.log("ada Rp0.00?", /Rp0[.,]00\b/.test(joined(det)));
function joined(t) { return t; }
const i = det.indexOf("Total biaya (Rp)");
console.log("konteks kolom Total biaya:", det.slice(i, i + 120).replace(/\s+/g, " "));
