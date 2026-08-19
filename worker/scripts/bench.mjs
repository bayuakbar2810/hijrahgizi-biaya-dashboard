import * as XLSX from "xlsx";
import { PGlite } from "@electric-sql/pglite";
import path from "path";

const db = new PGlite(path.join("..", "pgdata"));

const { rows } = await db.query(
  "SELECT tanggal,batch_no,kode,bahan_biaya,keterangan,pengeluaran_biaya,pengeluaran_qty,penyelesaian_biaya,penyelesaian_qty,total_biaya,total_qty FROM production_transactions ORDER BY tanggal,batch_no"
);
const sres = await db.query("SELECT key,value FROM settings");
const settings = {};
for (const r of sres.rows) {
  const n = Number(r.value);
  settings[r.key] = Number.isNaN(n) ? r.value : n;
}

// build a realistic 2-level header xlsx with all rows
const row0 = ["Tanggal","Batch No.","Kode","Bahan dan Biaya","Keterangan"];
row0[5]="Pengeluaran Barang"; row0[8]="Penyelesaian Pesanan"; row0[11]="Total Tipe Transaksi";
const row1 = ["","","","","","Biaya","Kuantitas","Alokasi","Biaya","Kuantitas","Alokasi","Biaya","Kuantitas","Alokasi"];
const aoa = [row0, row1];
for (const r of rows) {
  aoa.push([r.tanggal, r.batch_no, r.kode, r.bahan_biaya, r.keterangan, r.pengeluaran_biaya, r.pengeluaran_qty, 0, r.penyelesaian_biaya, r.penyelesaian_qty, 0, r.total_biaya, r.total_qty, 0]);
}
const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
ws["!merges"] = [
  {s:{r:0,c:5},e:{r:0,c:7}},{s:{r:0,c:8},e:{r:0,c:10}},{s:{r:0,c:11},e:{r:0,c:13}}
];
ws["!ref"]="A1:N"+(aoa.length);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
console.log("xlsx size KB:", (buf.length/1024).toFixed(1));

const parser = await import("../.tmp-test/parser.cjs");
const t0 = Date.now();
const parsed = parser.parseExcel(buf);
console.log("parse wall ms:", Date.now()-t0, "rows:", parsed.rows.length);

const analysis = await import("../.tmp-test/analysis.cjs");
// filtered: only Jan-Feb 2024 rows
const cutoff = new Date("2024-02-29");
const sub = rows.filter(r => r.tanggal <= cutoff);
console.log("subset rows:", sub.length);
const t1 = Date.now();
const o1 = analysis.analyze(sub, {}, settings);
console.log("analyze subset ms:", Date.now()-t1, "batches:", o1.batches.length);

// smaller subset 1 month
const cutoff2 = new Date("2024-01-31");
const sub2 = rows.filter(r => r.tanggal <= cutoff2);
console.log("subset2 rows:", sub2.length);
const t2 = Date.now();
const o2 = analysis.analyze(sub2, {}, settings);
console.log("analyze subset2 ms:", Date.now()-t2, "batches:", o2.batches.length);

await db.close();


