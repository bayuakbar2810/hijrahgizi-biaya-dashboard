import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";
import { buildFilterClause, type Filter } from "@/lib/query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const filter: Filter = {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    batch: sp.get("batch") ?? undefined,
    q: sp.get("q") ?? undefined,
    sku: sp.get("sku") ?? undefined,
    product_type: sp.get("product_type") ?? undefined,
  };
  const limit = Math.min(Number(sp.get("limit") ?? 300), 2000);
  const offset = Number(sp.get("offset") ?? 0);

  const { clause, params } = buildFilterClause(filter);
  const db = await getDb();

  const count = await db.query(
    `SELECT COUNT(*) AS n FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode ${clause}`,
    params,
  );
  const total = Number((count.rows[0] as { n?: number | string } | undefined)?.n ?? 0);

  const rows = await db.query(
    `SELECT t.id, t.tanggal, t.batch_no, t.kode, t.bahan_biaya, t.keterangan,
            t.pengeluaran_biaya, t.pengeluaran_qty,
            t.penyelesaian_biaya, t.penyelesaian_qty,
            t.total_biaya, t.total_qty,
            COALESCE(pm.product_type, 'OTHER') AS product_type,
            COALESCE(pm.is_rtl, 0) AS is_rtl,
            COALESCE(pm.is_packaging, 0) AS is_packaging
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     ${clause}
     ORDER BY t.tanggal DESC, t.batch_no, t.kode
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return NextResponse.json({ total, limit, offset, rows: rows.rows });
}