import fs from "fs";
const t = fs.readFileSync("lib/report.ts", "utf8");
const i = t.indexOf("export function generateBahanStokPdf");
const j = t.indexOf("export function generateBahanDetailPdf");
const seg = t.slice(i, j);
const lines = seg.split("\n");
for (let k = 0; k < lines.length; k++) {
  if (/let y = 34|for \(const sku/.test(lines[k])) console.log(`[${k}] ${lines[k].trim()}`);
}
