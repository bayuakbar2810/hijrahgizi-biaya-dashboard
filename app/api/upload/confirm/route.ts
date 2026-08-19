import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb, nowIso } from "@/lib/db";
import { readAuth } from "@/lib/auth";
import { getPreview } from "@/lib/preview";
import type { PrdRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHUNK = 400;

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as { preview_id?: string };
  if (!body.preview_id) {
    return NextResponse.json({ error: "preview_id wajib diisi" }, { status: 400 });
  }
  const preview = getPreview(body.preview_id);
  if (!preview) {
    return NextResponse.json(
      { error: "Preview kedaluwarsa. Silakan unggah ulang file." },
      { status: 410 },
    );
  }

  const rows = preview.rows;
  const db = await getDb();
  const uploadedAt = nowIso();
  const sourceId = crypto.randomUUID();
  const batches = new Set(rows.map((r) => r.batch_no));

  try {
    await db.exec("BEGIN");

    for (const b of batches) {
      await db.query(`DELETE FROM production_transactions WHERE batch_no = $1`, [b]);
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let p = 1;
      for (const r of chunk as PrdRow[]) {
        placeholders.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
        );
        values.push(
          crypto.randomUUID(),
          sourceId,
          r.tanggal,
          r.batch_no,
          r.kode ?? "",
          r.bahan_biaya ?? "",
          r.keterangan ?? "",
          0,
          Number(r.pengeluaran_biaya) || 0,
          Number(r.pengeluaran_qty) || 0,
          0,
          Number(r.penyelesaian_biaya) || 0,
          Number(r.penyelesaian_qty) || 0,
          0,
          Number(r.total_biaya) || 0,
          Number(r.total_qty) || 0,
          uploadedAt,
        );
      }
      await db.query(
        `INSERT INTO production_transactions
          (id, source_file, tanggal, batch_no, kode, bahan_biaya, keterangan,
           pengeluaran_alokasi, pengeluaran_biaya, pengeluaran_qty,
           penyelesaian_alokasi, penyelesaian_biaya, penyelesaian_qty,
           total_alokasi, total_biaya, total_qty, uploaded_at)
         VALUES ${placeholders.join(", ")}`,
        values,
      );
    }

    await db.query(
      `INSERT INTO source_files (id, filename, uploaded_at, n_rows, n_batch, new_batch, updated_batch)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sourceId,
        preview.filename,
        uploadedAt,
        rows.length,
        batches.size,
        preview.newBatch,
        preview.updatedBatch,
      ],
    );

    await db.exec("COMMIT");
  } catch (e) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload gagal" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    filename: preview.filename,
    rows: rows.length,
    batches: batches.size,
    new_batch: preview.newBatch,
    updated_batch: preview.updatedBatch,
    uploaded_at: uploadedAt,
  });
}