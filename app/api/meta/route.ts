import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const db = await getDb();

  const range = await db.query(
    `SELECT MIN(tanggal) AS min, MAX(tanggal) AS max, COUNT(*) AS n FROM production_transactions`,
  );
  const r0 = range.rows[0] as { min?: string | null; max?: string | null; n?: number | string };
  const hasData = Number(r0?.n ?? 0) > 0;

  const batches = await db.query(
    `SELECT DISTINCT batch_no FROM production_transactions ORDER BY batch_no`,
  );
  const skus = await db.query(
    `SELECT kode, nama_produk FROM product_master WHERE is_rtl = 1 ORDER BY nama_produk`,
  );
  const files = await db.query(
    `SELECT id, filename, uploaded_at, n_rows, n_batch, new_batch, updated_batch
     FROM source_files ORDER BY uploaded_at DESC LIMIT 50`,
  );
  const settings = await db.query(`SELECT key, value FROM settings`);

  const settingsObj: Record<string, number> = {};
  for (const s of settings.rows as Array<{ key: string; value: string }>) {
    const n = Number(s.value);
    if (!Number.isNaN(n)) settingsObj[s.key] = n;
  }

  return NextResponse.json({
    has_data: hasData,
    from: r0?.min ?? null,
    to: r0?.max ?? null,
    n_rows: Number(r0?.n ?? 0),
    batches: (batches.rows as Array<{ batch_no: string }>).map((r) => r.batch_no),
    skus: (skus.rows as Array<{ kode: string; nama_produk: string }>).map((r) => ({
      kode: r.kode,
      nama: r.nama_produk,
    })),
    source_files: files.rows,
    settings: settingsObj,
    anomaly_types: [
      "HIGH_CUTTING_COST",
      "LOW_YIELD",
      "HIGH_HPP",
    ],
  });
}