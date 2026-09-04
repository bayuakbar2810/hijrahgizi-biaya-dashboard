import * as XLSX from "xlsx";
const r = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const wb = XLSX.read(await r.text(), { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
for (const kode of ["101998", "101801", "101903", "R101998"]) {
  const hit = rows.find(r => String(r[2]).trim() === kode);
  console.log(`GPU sheet punya ${kode}?`, hit ? `YA - ${hit[3]} | total=${hit[19]}` : "TIDAK");
}
