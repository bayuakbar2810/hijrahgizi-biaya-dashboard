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
    return NextResponse.json({ bahan: [], n_batches: 0 });
  }

  const { rows } = await db.query(
    `SELECT kode,
            MAX(bahan_biaya) AS nama,
            COUNT(DISTINCT batch_no)::int AS n_batch,
            SUM(pengeluaran_qty) AS total_qty,
            SUM(pengeluaran_biaya) AS total_biaya,
            MAX(tanggal) AS last_date
     FROM production_transactions
     WHERE batch_no = ANY($1::text[])
       AND kode <> ''
       AND (pengeluaran_qty > 0 OR pengeluaran_biaya > 0)
     GROUP BY kode
     ORDER BY SUM(pengeluaran_biaya) DESC`,
    [batches],
  );
  return NextResponse.json({
    n_batches: batches.length,
    bahan: rows,
  });
}