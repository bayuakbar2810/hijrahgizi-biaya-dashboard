import * as XLSX from "xlsx";
const r = await fetch("https://docs.google.com/spreadsheets/d/1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII/export?format=csv&gid=143545477");
const wb = XLSX.read(await r.text(), { type: "string" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
const kodes = new Set(rows.slice(1).map(r => String(r[2]).trim()));
console.log("contoh kodes GPU:", [...kodes].slice(0, 8).join(", "));
for (const k of ["100203", "103441", "100201", "R100203"]) console.log(`GPU punya "${k}"?`, kodes.has(k));
// cari yang mirip 100203/103441
for (const pat of ["100203", "103441", "100201"]) {
  const found = [...kodes].filter(k => k.includes(pat));
  console.log(`mirip ${pat}:`, found.join(", ") || "-");
}
