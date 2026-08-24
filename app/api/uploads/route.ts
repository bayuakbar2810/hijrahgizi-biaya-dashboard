import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAdminAuth, readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, filename, uploaded_at, n_rows, n_batch, new_batch, updated_batch
     FROM source_files ORDER BY uploaded_at DESC LIMIT 50`,
  );
  return NextResponse.json({ uploads: rows });
}

export async function DELETE(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat menghapus data" }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }
  const db = await getDb();
  const cnt = await db.query(
    `SELECT COUNT(*)::int AS n FROM production_transactions WHERE source_file = $1`,
    [body.id],
  );
  const n = Number((cnt.rows[0] as { n: number } | undefined)?.n ?? 0);
  await db.query(`DELETE FROM production_transactions WHERE source_file = $1`, [body.id]);
  await db.query(`DELETE FROM source_files WHERE id = $1`, [body.id]);
  return NextResponse.json({ ok: true, rows_deleted: n });
}