import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { readAdminAuth, readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const db = await getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    conds.push(`tanggal >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conds.push(`tanggal <= $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT id, tanggal, kompetitor, produk, harga_kompetitor, harga_hijrah, created_by, created_at
     FROM competitor_survey ${where} ORDER BY tanggal DESC, created_at DESC`,
    params,
  );
  return NextResponse.json({ entries: rows });
}

/* Input survey terbuka untuk admin & tim produksi. */
export async function POST(request: Request) {
  const session = readAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as {
    tanggal?: string;
    kompetitor?: string;
    produk?: string;
    harga_kompetitor?: number;
    harga_hijrah?: number;
  };
  const tanggal = body.tanggal?.trim() ?? "";
  const kompetitor = body.kompetitor?.trim() ?? "";
  const produk = body.produk?.trim() ?? "";
  const hk = Number(body.harga_kompetitor);
  const hh = Number(body.harga_hijrah);
  if (!tanggal || !kompetitor || !produk || !Number.isFinite(hk) || !Number.isFinite(hh)) {
    return NextResponse.json(
      { error: "tanggal, kompetitor, produk, dan kedua harga wajib diisi" },
      { status: 400 },
    );
  }
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO competitor_survey
      (id, tanggal, kompetitor, produk, harga_kompetitor, harga_hijrah, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, tanggal, kompetitor, produk, hk, hh, session.username, new Date().toISOString()],
  );
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const session = readAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as {
    id?: string;
    tanggal?: string;
    kompetitor?: string;
    produk?: string;
    harga_kompetitor?: number;
    harga_hijrah?: number;
  };
  if (!body.id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }
  const db = await getDb();
  await db.query(
    `UPDATE competitor_survey SET tanggal=$2, kompetitor=$3, produk=$4,
            harga_kompetitor=$5, harga_hijrah=$6 WHERE id=$1`,
    [body.id, body.tanggal, body.kompetitor, body.produk, Number(body.harga_kompetitor), Number(body.harga_hijrah)],
  );
  return NextResponse.json({ ok: true });
}

/* Hapus data survey hanya admin. */
export async function DELETE(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat menghapus survey" }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }
  const db = await getDb();
  await db.query(`DELETE FROM competitor_survey WHERE id = $1`, [body.id]);
  return NextResponse.json({ ok: true });
}