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
const f = fs.readdirSync(".").filter(x => x.startsWith("bahan-stok") && x.endsWith(".pdf"))[0];
const txt = extract(f);
const i = txt.indexOf("Letak gudang");
console.log("=== konteks setelah header tabel 1 ===");
console.log(txt.slice(i, i + 400).replace(/\s+/g, " "));
