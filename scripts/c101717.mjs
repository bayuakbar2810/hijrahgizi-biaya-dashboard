import * as XLSX from "xlsx";
const r0 = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=0");
const wb0 = XLSX.read(await r0.text(), { type: "string" });
const rows0 = XLSX.utils.sheet_to_json(wb0.Sheets[wb0.SheetNames[0]], { header: 1, raw: true, defval: "" });
const hit = rows0.find(r => String(r[1]).trim() === "101717");
console.log("[sheet bahan] 101717 (Striploin Premium Indocube):", hit ? `total=${hit[hit.length-1]}` : "TIDAK ADA DI SHEET");
