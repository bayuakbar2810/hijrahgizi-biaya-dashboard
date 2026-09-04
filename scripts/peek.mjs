import fs from "fs";
let t = fs.readFileSync("lib/report.ts", "utf8");
const stokFnStart = t.indexOf("export function generateBahanStokPdf");
const detailFnStart = t.indexOf("export function generateBahanDetailPdf");
const stokFn = t.slice(stokFnStart, detailFnStart);
// tampilkan semua doc.text band kandidat
for (const m of stokFn.matchAll(/doc\.text\(`[^`]*\`,\s*17,\s*y \+ 5\.7\);/g)) console.log(JSON.stringify(m[0]));
