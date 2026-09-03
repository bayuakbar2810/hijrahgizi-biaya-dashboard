import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb, nowIso } from "@/lib/db";
import { readAdminAuth } from "@/lib/auth";
import { getPreview, deletePreview } from "@/lib/preview";
import type { PrdRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHUNK = 800;
const HIST_CHUNK = 20;

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

const NUMERIC_FIELDS = new Set<string>([
  "pengeluaran_biaya",
  "pengeluaran_qty",
  "penyelesaian_biaya",
  "penyelesaian_qty",
]);

const biayaOf = (r: Partial<PrdRow>) =>
  (Number(r.pengeluaran_biaya) || 0) + (Number(r.penyelesaian_biaya) || 0);
const qtyOf = (r: Partial<PrdRow>) =>
  (Number(r.pengeluaran_qty) || 0) + (Number(r.penyelesaian_qty) || 0);

/* Kunci identitas baris: baris lama & baru dengan kunci sama dianggap baris yang sama. */
function rowKey(r: Partial<PrdRow>): string {
  return [String(r.tanggal ?? ""), String(r.kode ?? ""), String(r.bahan_biaya ?? ""), String(r.keterangan ?? "")].join("|");
}

/* Nilai pembanding: angka dibandingkan sebagai angka, teks sebagai teks ternormalisasi. */
function cmpVal(f: string, a: unknown, b: unknown): boolean {
  if (NUMERIC_FIELDS.has(f)) return Number(a) === Number(b);
  return String(a ?? "") === String(b ?? "");
}

export async function POST(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan aksi ini" }, { status: 403 });
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
  const batchList = Array.from(new Set(rows.map((r) => r.batch_no)));

  /* --- Ambil seluruh versi lama SEMUA batch dalam SATU query, kelompokkan di memori --- */
  const newByBatch = new Map<string, PrdRow[]>();
  for (const r of rows) {
    const arr = newByBatch.get(r.batch_no) ?? [];
    arr.push(r);
    newByBatch.set(r.batch_no, arr);
  }

  const oldRes = await db.query(
    `SELECT batch_no, tanggal, kode, bahan_biaya, keterangan,
            pengeluaran_biaya, pengeluaran_qty, penyelesaian_biaya, penyelesaian_qty
     FROM production_transactions WHERE batch_no = ANY($1::text[])
     ORDER BY batch_no, tanggal, kode`,
    [batchList],
  );
  const oldByBatch = new Map<string, Array<Partial<PrdRow>>>();
  for (const o of oldRes.rows as unknown as Array<Partial<PrdRow> & { batch_no: string }>) {
    const arr = oldByBatch.get(o.batch_no) ?? [];
    arr.push(o);
    oldByBatch.set(o.batch_no, arr);
  }

  /* --- Diff tiap batch yang punya versi lama (pencocokan berbasis kunci, bukan posisi) --- */
  const historyRows: Array<unknown[]> = [];
  let changedBatches = 0;
  for (const [b, oldRows] of oldByBatch) {
    const newRows = newByBatch.get(b) ?? [];

    // Antrian baris lama per kunci (mengakomodasi kunci ganda dalam satu batch).
    const oldQueues = new Map<string, Array<Partial<PrdRow>>>();
    for (const o of oldRows) {
      const k = rowKey(o);
      const q = oldQueues.get(k) ?? [];
      q.push(o);
      oldQueues.set(k, q);
    }

    const changed: Array<Record<string, unknown>> = [];
    const added: Array<{ kode: string; bahan: string }> = [];
    const matchedOld = new Set<Partial<PrdRow>>();
    for (const nw of newRows) {
      const q = oldQueues.get(rowKey(nw));
      const o = q?.shift();
      if (!o) {
        added.push({ kode: String(nw.kode ?? ""), bahan: String(nw.bahan_biaya ?? "") });
        continue;
      }
      matchedOld.add(o);
      const fields: Array<Record<string, unknown>> = [];
      for (const f of DIFF_FIELDS) {
        if (!cmpVal(f, o[f], nw[f])) fields.push({ f, old: o[f] ?? "", new: nw[f] ?? "" });
      }
      if (fields.length > 0) {
        changed.push({
          i: changed.length + 1,
          kode: String(nw.kode ?? ""),
          bahan: String(nw.bahan_biaya ?? ""),
          fields,
        });
      }
    }
    const removed = oldRows
      .filter((o) => !matchedOld.has(o))
      .map((o) => ({ kode: String(o.kode ?? ""), bahan: String(o.bahan_biaya ?? "") }));

    if (changed.length === 0 && added.length === 0 && removed.length === 0) continue;

    const diff = { changed, added, removed };
    historyRows.push([
      crypto.randomUUID(),
      b,
      uploadedAt,
      preview.filename,
      oldRows.length,
      newRows.length,
      oldRows.reduce((s, r) => s + biayaOf(r), 0),
      newRows.reduce((s, r) => s + biayaOf(r), 0),
      oldRows.reduce((s, r) => s + qtyOf(r), 0),
      newRows.reduce((s, r) => s + qtyOf(r), 0),
      JSON.stringify(diff),
      JSON.stringify(oldRows),
    ]);
    changedBatches++;
  }

  try {
    await db.exec("BEGIN");

    // Insert riwayat dalam sedikit query (20 baris × 12 param per query).
    for (let i = 0; i < historyRows.length; i += HIST_CHUNK) {
      const chunk = historyRows.slice(i, i + HIST_CHUNK);
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let p = 1;
      for (const h of chunk) {
        placeholders.push(
          `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
        );
        values.push(...h);
      }
      await db.query(
        `INSERT INTO batch_history
          (id, batch_no, changed_at, source_filename, n_rows_old, n_rows_new,
           total_biaya_old, total_biaya_new, total_qty_old, total_qty_new, diff_json, rows_old_json)
         VALUES ${placeholders.join(",")}`,
        values,
      );
    }

    // Hapus seluruh batch lama file ini dalam SATU query.
    await db.query(`DELETE FROM production_transactions WHERE batch_no = ANY($1::text[])`, [
      batchList,
    ]);

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
      [sourceId, preview.filename, uploadedAt, rows.length, batchList.length, preview.newBatch, preview.updatedBatch],
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
    batches: batchList.length,
    new_batch: preview.newBatch,
    updated_batch: preview.updatedBatch,
    changed_batches: changedBatches,
    uploaded_at: uploadedAt,
  });
}