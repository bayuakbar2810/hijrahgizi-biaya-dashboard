import * as XLSX from "xlsx";
const r = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const wb = XLSX.read(await r.text(), { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
const hit = rows.find(r => String(r[2]).trim() === "100998");
console.log("100998 di sheet GPU:", hit ? JSON.stringify({ nama: hit[3], total: hit[19] }) : "TIDAK ADA");
