import fs from "fs";
// 1. scan mojibake semua file utama
for (const f of ["components/StokBahanView.tsx", "lib/report.ts", "lib/excel.ts", "components/ItemHistoryModal.tsx", "components/Dashboard.tsx"]) {
  const t = fs.readFileSync(f, "utf8");
  const weird = [...new Set([...t].filter(c => c.charCodeAt(0) > 127 && !["·","—","±","…","×","✕","→","▾","▲","▼","⇅","▸","✓","−","↳","•","📝","÷","–","“","”","'","≥"].includes(c)))];
  console.log(f, weird.length ? "MOJIBAKE: " + JSON.stringify(weird) : "bersih");
}
// 2. header tabel StokBahanView sekarang
const v = fs.readFileSync("components/StokBahanView.tsx", "utf8");
for (const m of v.matchAll(/<Th[^>]*>[^<]*<\/Th>/g)) console.log("  ", m[0]);
