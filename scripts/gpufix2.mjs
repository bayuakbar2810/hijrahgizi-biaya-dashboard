import fs from "fs";
let t = fs.readFileSync("lib/report.ts", "utf8");
const stokFnStart = t.indexOf("export function generateBahanStokPdf");
const detailFnStart = t.indexOf("export function generateBahanDetailPdf");

let head = t.slice(0, stokFnStart);
let stokFn = t.slice(stokFnStart, detailFnStart);
let tail = t.slice(detailFnStart);

// 1. band: ganti teks dengan versi + GPU (match em-dash rusak)
const bandRe = /doc\.text\(`\$\{sku\.skuKode\}[^\`]*`,\s*17,\s*y \+ 5\.7\);/;
if (!bandRe.test(stokFn)) throw new Error("band tidak ketemu");
stokFn = stokFn.replace(
  bandRe,
  "doc.text(\n      `${sku.skuKode} - ${sku.skuNama}` +\n        (gpuTop !== null ? `  -  STOK GPU ${fmtNum(gpuTop, 0)} PCS` : \"\"),\n      17,\n      y + 5.7,\n    );"
);
// gpuTop di awal loop
const loopRe = /(let y = 34;\s*\n\s*)(for \(const sku of skus\) \{)/;
if (!loopRe.test(stokFn)) throw new Error("loop tidak ketemu");
stokFn = stokFn.replace(loopRe, "$1const gpuTop = sku.rows.find((r) => r.stokGpu !== null)?.stokGpu ?? null;\n  $2");

// 2. hapus kolom GPU tabel 1
stokFn = stokFn.split('"Stok gudang (kg)", "Letak gudang", "Stok GPU (pcs)"]],').join('"Stok gudang (kg)", "Letak gudang"]],');
stokFn = stokFn.split("\n        r.stokGpu !== null ? fmtNum(r.stokGpu, 0) : \"-\",").join("");
stokFn = stokFn.split("\n        6: { halign: \"right\" },").join("");

// 3. didParseCell tabel 1: hanya stok gudang
stokFn = stokFn.split("data.column.index === 4 || data.column.index === 6").join("data.column.index === 4");
stokFn = stokFn.split("const v = data.column.index === 4 ? r.stokGudang : (r.stokGpu ?? 0);").join("const v = r.stokGudang;");

t = head + stokFn + tail;

// 4. detail: hapus columnStyles 7
const dStart = t.indexOf("export function generateBahanDetailPdf");
let dTail = t.slice(dStart);
dTail = dTail.split("6: { halign: \"center\" },\n        7: { halign: \"right\" },").join("6: { halign: \"center\" },");
t = t.slice(0, dStart) + dTail;

fs.writeFileSync("lib/report.ts", t, "utf8");
console.log("OK - gpuTop:", t.includes("gpuTop") ? "ya" : "?", "| STOK GPU band:", t.includes("STOK GPU") ? "ya" : "?", "| kolom GPU tabel:", t.includes('"Stok GPU (pcs)"') ? "MASIH (X)" : "hapus (OK)");
