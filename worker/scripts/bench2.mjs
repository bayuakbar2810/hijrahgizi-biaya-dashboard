import { PGlite } from "@electric-sql/pglite";
import path from "path";
const db = new PGlite(path.join("..", "pgdata"));
const { rows } = await db.query("SELECT tanggal,batch_no,kode,bahan_biaya,keterangan,pengeluaran_biaya,pengeluaran_qty,penyelesaian_biaya,penyelesaian_qty,total_biaya,total_qty FROM production_transactions ORDER BY tanggal,batch_no");
const sres = await db.query("SELECT key,value FROM settings");
const settings = {};
for (const r of sres.rows) { const n = Number(r.value); settings[r.key] = Number.isNaN(n) ? r.value : n; }
const analysis = await import("../.tmp-test/analysis.cjs");
for (const n of [500, 1000, 2000, 4000, 8000]) {
  const sub = rows.slice(0, n);
  const t = Date.now();
  const o = analysis.analyze(sub, {}, settings);
  console.log(`analyze ${n} rows: ${Date.now()-t}ms (batches=${o.batches.length})`);
}
await db.close();
