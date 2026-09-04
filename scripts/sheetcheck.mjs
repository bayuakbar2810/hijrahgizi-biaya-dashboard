import * as XLSX from "xlsx";
const r0 = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=0");
const wb0 = XLSX.read(await r0.text(), { type: "string" });
const rows0 = XLSX.utils.sheet_to_json(wb0.Sheets[wb0.SheetNames[0]], { header: 1, raw: true, defval: "" });
for (const k of ["101801", "101998", "101903"]) {
  const hit = rows0.find(r => String(r[1]).trim() === k);
  console.log(`[sheet bahan] ${k}?`, hit ? `YA - ${hit[0]} | total=${hit[hit.length-1]}` : "TIDAK");
}
const rg = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const wbg = XLSX.read(await rg.text(), { type: "string" });
const rowsg = XLSX.utils.sheet_to_json(wbg.Sheets[wbg.SheetNames[0]], { header: 1, raw: true, defval: "" });
const hitg = rowsg.find(r => String(r[2]).trim() === "101998");
console.log(`[sheet GPU] 101998?`, hitg ? `YA - ${hitg[3]} | toko all=${hitg[19]}` : "TIDAK");
