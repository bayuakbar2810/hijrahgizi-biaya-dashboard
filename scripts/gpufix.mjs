import fs from "fs";
let t = fs.readFileSync("lib/report.ts", "utf8");

const stokFnStart = t.indexOf("export function generateBahanStokPdf");
const detailFnStart = t.indexOf("export function generateBahanDetailPdf");
if (stokFnStart < 0 || detailFnStart < 0) throw new Error("marker tidak ketemu");

let head = t.slice(0, stokFnStart);
let stokFn = t.slice(stokFnStart, detailFnStart);
let tail = t.slice(detailFnStart);

// 1. tambah GPU di band SKU (band memakai em-dash rusak "â€”")
const bandOld = "doc.text(`${sku.skuKode} \u00E2\u20AC\u201D ${sku.skuNama}`, 17, y + 5.7);";
const bandNew = "doc.text(\n      `${sku.skuKode} - ${sku.skuNama}` +\n        (gpuTop !== null ? `  -  STOK GPU ${fmtNum(gpuTop, 0)} PCS` : \"\"),\n      17,\n      y + 5.7,\n    );";
if (!stokFn.includes(bandOld)) throw new Error("band text tidak ketemu");
stokFn = stokFn.split(bandOld).join(bandNew);

// 2. deklarasikan gpuTop di awal loop
const loopOld = "let y = 34;\n  for (const sku of skus) {";
const loopNew = "let y = 34;\n  const gpuTop = sku.rows.find((r) => r.stokGpu !== null)?.stokGpu ?? null;\n  for (const sku of skus) {";
if (!stokFn.includes(loopOld)) throw new Error("loop tidak ketemu");
stokFn = stokFn.split(loopOld).join(loopNew);

// 3. hapus kolom Stok GPU (pcs) dari tabel 1
const rm = [
  ['"Stok gudang (kg)", "Letak gudang", "Stok GPU (pcs)"]],', '"Stok gudang (kg)", "Letak gudang"]],'],
  ["\n        r.stokGpu !== null ? fmtNum(r.stokGpu, 0) : \"-\",", ""],
  ["\n        6: { halign: \"right\" },", ""],
];
for (const [from, to] of rm) stokFn = stokFn.split(from).join(to);

// 4. perbaiki didParseCell tabel 1
const cellOld = "if (data.section === \"body\" && (data.column.index === 4 || data.column.index === 6)) {\n          const r = currentRows[data.row.index];\n          if (r) {\n            const v = data.column.index === 4 ? r.stokGudang : (r.stokGpu ?? 0);\n            data.cell.styles.textColor = v > 0 ? GREEN : RED;\n          }";
const cellNew = "if (data.section === \"body\" && data.column.index === 4) {\n          const r = currentRows[data.row.index];\n          if (r) {\n            data.cell.styles.textColor = r.stokGudang > 0 ? GREEN : RED;\n          }";
if (!stokFn.includes(cellOld)) throw new Error("didParseCell tidak ketemu");
stokFn = stokFn.split(cellOld).join(cellNew);

// 5. bersihkan semua mojibake tersisa di seluruh file
const fixes = [
  ["\u00C3\u00B7", "\u00F7"],
  ["\u00C3\u2014", "\u00D7"],
  ["\u00C2\u00B1", "\u00B1"],
  ["\u00C2\u00A2", "\u00A2"],
  ["\u00C2\u00B7", "\u00B7"],
  ["\u00E2\u20AC\u0153", "'"],
  ["\u00E2\u20AC\u009D", "'"],
  ["\u00E2\u20AC\u2122", "'"],
  ["\u00E2\u20AC\u00A6", "..."],
  ["\u00E2\u20AC\u201C", "-"],
  ["\u00E2\u20AC\u201D", "-"],
  ["\u00E2\u20AC\u00A2", "\u2022"],
  ["\u00E2\u20AC", "-"],
  ["\u00C2", ""],
  ["\uFEFF", ""],
];
for (const [from, to] of fixes) t = (head + stokFn + tail).split(from).join(to);
t = head.replace ? stokFn : t;
t = (head.length ? head : "") + stokFn + tail;
// terapkan fixes ke gabungan penuh
let full = head + stokFn + tail;
for (const [from, to] of fixes) full = full.split(from).join(to);
t = full;

// 6. detail pdf: hapus columnStyles 7 yatim
const dStart = t.indexOf("export function generateBahanDetailPdf");
let dTail = t.slice(dStart);
dTail = dTail.split("6: { halign: \"center\" },\n        7: { halign: \"right\" },").join("6: { halign: \"center\" },");
t = t.slice(0, dStart) + dTail;

fs.writeFileSync("lib/report.ts", t, "utf8");
console.log("OK - gpuTop:", t.includes("gpuTop"), "| band STOK GPU:", t.includes("STOK GPU"), "| kolom GPU tabel:", t.includes('"Stok GPU (pcs)"') ? "MASIH (X)" : "hapus (OK)", "| mojibake Ã:", t.includes("Ã") || t.includes("â€") ? "MASIH (X)" : "bersih");