import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const url = new URL(request.url);
  const batchNo = url.searchParams.get("batch_no");
  const db = await getDb();

  if (batchNo) {
    const { rows } = await db.query(
      `SELECT id, batch_no, changed_at, source_filename,
              n_rows_old, n_rows_new, total_biaya_old, total_biaya_new,
              total_qty_old, total_qty_new, diff_json
       FROM batch_history WHERE batch_no = $1 ORDER BY changed_at DESC`,
      [batchNo],
    );
    return NextResponse.json({
      entries: rows.map((r) => ({ ...r, diff: JSON.parse(String(r.diff_json)) })),
    });
  }

  const { rows } = await db.query(
    `SELECT id, batch_no, changed_at, source_filename,
            n_rows_old, n_rows_new, total_biaya_old, total_biaya_new,
            total_qty_old, total_qty_new, diff_json
     FROM batch_history ORDER BY changed_at DESC LIMIT 100`,
  );
  return NextResponse.json({
    entries: rows.map((r) => ({ ...r, diff: JSON.parse(String(r.diff_json)) })),
  });
}