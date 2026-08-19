import { getDb } from "./db";
import { buildFilterClause, type Filter } from "./query";
import type { PrdRow } from "./types";

export async function loadSettings(): Promise<Record<string, number | string>> {
  const db = await getDb();
  const { rows } = await db.query(`SELECT key, value FROM settings`);
  const out: Record<string, number | string> = {};
  for (const r of rows as Array<{ key: string; value: string }>) {
    const n = Number(r.value);
    out[r.key] = Number.isNaN(n) ? r.value : n;
  }
  return out;
}

export async function loadEnrichedRows(filter: Filter): Promise<PrdRow[]> {
  const db = await getDb();
  const { clause, params } = buildFilterClause(filter);
  const { rows } = await db.query(
    `SELECT t.tanggal, t.batch_no, t.kode, t.bahan_biaya, t.keterangan,
            t.pengeluaran_biaya, t.pengeluaran_qty,
            t.penyelesaian_biaya, t.penyelesaian_qty,
            t.total_biaya, t.total_qty,
            pm.product_type, pm.is_rtl, pm.is_main_output, pm.is_by_product, pm.is_packaging
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     ${clause}
     ORDER BY t.tanggal, t.batch_no`,
    params,
  );
  return (rows as unknown as PrdRow[]).map((r) => ({
    ...r,
    pengeluaran_biaya: Number(r.pengeluaran_biaya) || 0,
    pengeluaran_qty: Number(r.pengeluaran_qty) || 0,
    penyelesaian_biaya: Number(r.penyelesaian_biaya) || 0,
    penyelesaian_qty: Number(r.penyelesaian_qty) || 0,
    total_biaya: Number(r.total_biaya) || 0,
    total_qty: Number(r.total_qty) || 0,
  }));
}