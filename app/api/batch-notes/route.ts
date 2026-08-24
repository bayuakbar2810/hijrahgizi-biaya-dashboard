import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan aksi ini" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const batchNo = searchParams.get("batch_no")?.trim() ?? "";
  if (!batchNo) {
    return NextResponse.json({ error: "batch_no wajib diisi" }, { status: 400 });
  }
  const db = await getDb();
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

export async function POST(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan aksi ini" }, { status: 403 });
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