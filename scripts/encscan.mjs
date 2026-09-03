import fs from "fs";
for (const f of ["lib/report.ts", "components/StokBahanView.tsx"]) {
  const t = fs.readFileSync(f, "utf8");
  const weird = [...new Set([...t].filter(c => c.charCodeAt(0) > 127 && !["·","—","±","…","×","✕","→","▾","▲","▼","⇅","▸","✓","−","↳","•","📝","÷","–","“","”","'"].includes(c)))];
  console.log(f, weird.length ? JSON.stringify(weird) : "bersih");
}
