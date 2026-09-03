import * as XLSX from "xlsx";
const r = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const wb = XLSX.read(await r.text(), { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
console.log("total baris:", rows.length);
console.log("header:");
rows[0].forEach((h, i) => console.log(`  [${i}]`, JSON.stringify(String(h))));
console.log("\n3 baris data:");
for (const r of rows.slice(1, 4)) console.log("  ", JSON.stringify(r).slice(0, 260));
