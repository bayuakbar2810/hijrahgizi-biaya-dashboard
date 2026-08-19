import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";
import { pythonParse } from "@/lib/python";
import { setPreview } from "@/lib/preview";
import type { UploadPreview } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "File tidak terbaca" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File Excel wajib diunggah" }, { status: 400 });
  }
  if (!(file instanceof Blob) || !/\.xlsx$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Format tidak didukung. Unggah file .xlsx." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await pythonParse(buffer, file.name);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membaca Excel" },
      { status: 400 },
    );
  }

  const rows = parsed.rows ?? [];
  const summary = parsed.summary;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris data valid pada file." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const existing = await db.query(`SELECT DISTINCT batch_no FROM production_transactions`);
  const existingSet = new Set(
    (existing.rows as Array<{ batch_no: string }>).map((r) => r.batch_no),
  );
  const fileBatches = new Set(rows.map((r) => r.batch_no));

  let newBatch = 0;
  let updatedBatch = 0;
  for (const b of fileBatches) {
    if (existingSet.has(b)) updatedBatch++;
    else newBatch++;
  }

  const previewId = crypto.randomUUID();
  setPreview(previewId, {
    rows,
    filename: file.name,
    newBatch,
    updatedBatch,
    createdAt: Date.now(),
  });

  const preview: UploadPreview = {
    preview_id: previewId,
    filename: summary.filename,
    sheet: summary.sheet,
    row_count: summary.row_count,
    batch_count: summary.batch_count,
    kode_count: summary.kode_count,
    date_min: summary.date_min,
    date_max: summary.date_max,
    total_biaya: summary.total_biaya,
    new_batch: newBatch,
    updated_batch: updatedBatch,
    invalid_rows: parsed.invalid_rows ?? 0,
    missing_columns: parsed.missing_columns ?? [],
  };
  return NextResponse.json(preview);
}