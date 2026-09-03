import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const batchNo = searchParams.get("batch_no")?.trim() ?? "";
  const db = await getDb();

  if (batchNo) {
    const { rows } = await db.query(
      `SELECT batch_no, notes, updated_at FROM batch_notes WHERE batch_no = $1`,
      [batchNo],
    );
    const row = (rows[0] as { notes?: string; updated_at?: string } | undefined) ?? {};
    return NextResponse.json({
      batch_no: batchNo,
      notes: row.notes ?? "",
      updated_at: row.updated_at ?? null,
    });
  }

  // Log alasan: semua batch yang punya catatan investigasi, terbaru dulu.
  const { rows } = await db.query(
    `SELECT n.batch_no, n.notes, n.updated_at,
            (SELECT MIN(t.tanggal) FROM production_transactions t WHERE t.batch_no = n.batch_no) AS tanggal,
            (SELECT COUNT(*)::int FROM production_transactions t WHERE t.batch_no = n.batch_no) AS n_rows
     FROM batch_notes n
     WHERE NULLIF(n.notes, '') IS NOT NULL
     ORDER BY n.updated_at DESC
     LIMIT 200`,
  );
  return NextResponse.json({ notes: rows });
}

/* Catatan investigasi bisa diisi admin maupun tim produksi. */
export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as { batch_no?: string; notes?: string };
  const batchNo = body.batch_no?.trim() ?? "";
  if (!batchNo) {
    return NextResponse.json({ error: "batch_no wajib diisi" }, { status: 400 });
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO batch_notes (batch_no, notes, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (batch_no) DO UPDATE SET notes = $2, updated_at = $3`,
    [batchNo, body.notes ?? "", now],
  );
  return NextResponse.json({ ok: true, batch_no: batchNo, updated_at: now });
}