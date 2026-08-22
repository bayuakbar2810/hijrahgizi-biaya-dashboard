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
  const { rows } = await db.query(
    `SELECT id, filename, uploaded_at, n_rows, n_batch, new_batch, updated_batch
     FROM source_files ORDER BY uploaded_at DESC LIMIT 50`,
  );
  return NextResponse.json({ uploads: rows });
}