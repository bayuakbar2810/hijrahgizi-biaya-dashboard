import fs from "fs";
const t = fs.readFileSync("lib/report.ts", "utf8");
const i = t.indexOf("export function generateBahanStokPdf");
const j = t.indexOf("export function generateBahanDetailPdf");
const lines = t.slice(i, j).split("\n");
for (let k = 0; k < lines.length; k++) {
  if (lines[k].includes("doc.text(") && lines[k].includes("skuKode")) {
    for (let x = k; x <= k + 5; x++) console.log(`[${x + 1}] ${lines[x]}`);
  }
}
