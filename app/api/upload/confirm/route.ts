import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb, nowIso } from "@/lib/db";
import { readAuth } from "@/lib/auth";
import { getPreview, deletePreview } from "@/lib/preview";
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
  const preview = await getPreview(body.preview_id);
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

  // Snapshot versi lama tiap batch + hitung diff terhadap data baru (untuk riwayat).
  const DIFF_FIELDS = [
    "tanggal",
    "kode",
    "bahan_biaya",
    "keterangan",
    "pengeluaran_biaya",
    "pengeluaran_qty",
    "penyelesaian_biaya",
    "penyelesaian_qty",
  ] as const;
  const biayaOf = (r: Partial<PrdRow>) =>
    (Number(r.pengeluaran_biaya) || 0) + (Number(r.penyelesaian_biaya) || 0);
  const qtyOf = (r: Partial<PrdRow>) =>
    (Number(r.pengeluaran_qty) || 0) + (Number(r.penyelesaian_qty) || 0);

  const batchHistoryInserts: Array<{
    id: string;
    batch_no: string;
    changed_at: string;
    source_filename: string;
    n_rows_old: number;
    n_rows_new: number;
    total_biaya_old: number;
    total_biaya_new: number;
    total_qty_old: number;
    total_qty_new: number;
    diff_json: string;
    rows_old_json: string;
  }> = [];

  for (const b of batches) {
    const oldRes = await db.query(
      `SELECT tanggal, kode, bahan_biaya, keterangan,
              pengeluaran_biaya, pengeluaran_qty, penyelesaian_biaya, penyelesaian_qty
       FROM production_transactions WHERE batch_no = $1 ORDER BY tanggal, kode`,
      [b],
    );
    const oldRows = oldRes.rows as unknown as Array<Partial<PrdRow>>;
    if (oldRows.length === 0) continue; // batch baru — tidak ada versi lama
    const newRows = rows.filter((r) => r.batch_no === b);

    const changed: Array<Record<string, unknown>> = [];
    const n = Math.max(oldRows.length, newRows.length);
    let identical = oldRows.length === newRows.length;
    for (let i = 0; i < n; i++) {
      const o = oldRows[i];
      const nw = newRows[i];
      if (!o || !nw) {
        identical = false;
        continue;
      }
      const fields: Array<Record<string, unknown>> = [];
      for (const f of DIFF_FIELDS) {
        const ov = String(o[f] ?? "");
        const nv = String(nw[f] ?? "");
        if (ov !== nv) fields.push({ f, old: o[f] ?? "", new: nw[f] ?? "" });
      }
      if (fields.length > 0) {
        identical = false;
        changed.push({
          i,
          kode: nw.kode ?? o.kode ?? "",
          bahan: nw.bahan_biaya ?? o.bahan_biaya ?? "",
          fields,
        });
      }
    }
    if (identical) continue; // tidak ada perubahan nilai — tidak perlu riwayat

    const diff = {
      changed,
      added: newRows.slice(oldRows.length).map((r) => ({
        kode: r.kode ?? "",
        bahan: r.bahan_biaya ?? "",
      })),
      removed: oldRows.slice(newRows.length).map((r) => ({
        kode: r.kode ?? "",
        bahan: r.bahan_biaya ?? "",
      })),
    };
    batchHistoryInserts.push({
      id: crypto.randomUUID(),
      batch_no: b,
      changed_at: uploadedAt,
      source_filename: preview.filename,
      n_rows_old: oldRows.length,
      n_rows_new: newRows.length,
      total_biaya_old: oldRows.reduce((s, r) => s + biayaOf(r), 0),
      total_biaya_new: newRows.reduce((s, r) => s + biayaOf(r), 0),
      total_qty_old: oldRows.reduce((s, r) => s + qtyOf(r), 0),
      total_qty_new: newRows.reduce((s, r) => s + qtyOf(r), 0),
      diff_json: JSON.stringify(diff),
      rows_old_json: JSON.stringify(oldRows),
    });
  }

  try {
    await db.exec("BEGIN");

    for (const h of batchHistoryInserts) {
      await db.query(
        `INSERT INTO batch_history
          (id, batch_no, changed_at, source_filename, n_rows_old, n_rows_new,
           total_biaya_old, total_biaya_new, total_qty_old, total_qty_new, diff_json, rows_old_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          h.id,
          h.batch_no,
          h.changed_at,
          h.source_filename,
          h.n_rows_old,
          h.n_rows_new,
          h.total_biaya_old,
          h.total_biaya_new,
          h.total_qty_old,
          h.total_qty_new,
          h.diff_json,
          h.rows_old_json,
        ],
      );
    }

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

  await deletePreview(body.preview_id);

  return NextResponse.json({
    ok: true,
    filename: preview.filename,
    rows: rows.length,
    batches: batches.size,
    new_batch: preview.newBatch,
    updated_batch: preview.updatedBatch,
    changed_batches: batchHistoryInserts.length,
    uploaded_at: uploadedAt,
  });
}