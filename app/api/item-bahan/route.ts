import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* Histori bahan & biaya yang dipakai untuk membuat satu SKU RTL,
   diagregasi dari seluruh batch yang memproduksi SKU tersebut. */
export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const kode = new URL(request.url).searchParams.get("kode")?.trim() ?? "";
  if (!kode) {
    return NextResponse.json({ error: "kode wajib diisi" }, { status: 400 });
  }
  const db = await getDb();

  const { rows: batchRows } = await db.query(
    `SELECT DISTINCT batch_no FROM production_transactions
     WHERE kode = $1 AND penyelesaian_qty > 0`,
    [kode],
  );
  const batches = (batchRows as Array<{ batch_no: string }>).map((r) => r.batch_no);
  if (batches.length === 0) {
    return NextResponse.json({ bahan: [], current: [], latest: null, n_batches: 0 });
  }

  /* Batch terakhir yang memproduksi SKU ini (resep "saat ini"). */
  const { rows: latestRows } = await db.query(
    `SELECT batch_no, tanggal FROM production_transactions
     WHERE kode = $1 AND penyelesaian_qty > 0
     ORDER BY tanggal DESC, batch_no DESC LIMIT 1`,
    [kode],
  );
  const latest = latestRows[0] as { batch_no: string; tanggal: string } | undefined;

  const { rows: currentRows } = await db.query(
    `SELECT t.kode, MAX(t.bahan_biaya) AS nama, SUM(t.pengeluaran_qty) AS qty
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = $1 AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
     GROUP BY t.kode`,
    [latest?.batch_no ?? ""],
  );

  const { rows } = await db.query(
    `SELECT t.kode,
            MAX(t.bahan_biaya) AS nama,
            COUNT(DISTINCT t.batch_no)::int AS n_batch,
            SUM(t.pengeluaran_qty) AS total_qty,
            MAX(t.tanggal) AS last_date
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = ANY($1::text[])
       AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
     GROUP BY t.kode
     ORDER BY SUM(t.pengeluaran_qty) DESC`,
    [batches],
  );

  /* Riwayat pemakaian per batch (untuk urutan terbaru di atas). */
  const { rows: histRows } = await db.query(
    `SELECT t.batch_no, t.tanggal, t.kode, MAX(t.bahan_biaya) AS nama, SUM(t.pengeluaran_qty) AS qty
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = ANY($1::text[])
       AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
     GROUP BY t.batch_no, t.tanggal, t.kode`,
    [batches],
  );
  const byBatch = new Map<string, { batch_no: string; tanggal: string; items: Array<{ kode: string; nama: string; qty: number }> }>();
  for (const h of histRows as Array<{ batch_no: string; tanggal: string; kode: string; nama: string; qty: string }>) {
    let e = byBatch.get(h.batch_no);
    if (!e) {
      e = { batch_no: h.batch_no, tanggal: h.tanggal, items: [] };
      byBatch.set(h.batch_no, e);
    }
    e.items.push({ kode: h.kode, nama: h.nama, qty: Number(h.qty) || 0 });
  }
  const history = [...byBatch.values()].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  return NextResponse.json({
    n_batches: batches.length,
    latest: latest ?? null,
    current: currentRows,
    bahan: rows,
    history,
  });
}