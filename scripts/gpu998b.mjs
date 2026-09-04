import * as XLSX from "xlsx";
const r = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const t = await r.text();
const wb = XLSX.read(t, { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
const header = rows[0].map(h => h.replace(/\s+/g, " ").trim());
console.log("header:", JSON.stringify(header));
const hit = rows.find(r => String(r[2]).trim() === "102045");
console.log("baris 102045:", JSON.stringify(hit));
