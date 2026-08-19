import { getDb } from "./db";
import type { PrdRow } from "./types";

type StoredPreview = {
  rows: PrdRow[];
  filename: string;
  newBatch: number;
  updatedBatch: number;
  createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;

export async function setPreview(id: string, data: StoredPreview): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM previews WHERE created_at < $1`, [
    new Date(Date.now() - TTL_MS).toISOString(),
  ]);
  await db.query(
    `INSERT INTO previews (id, filename, rows_json, new_batch, updated_batch, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       filename = EXCLUDED.filename,
       rows_json = EXCLUDED.rows_json,
       new_batch = EXCLUDED.new_batch,
       updated_batch = EXCLUDED.updated_batch,
       created_at = EXCLUDED.created_at`,
    [
      id,
      data.filename,
      JSON.stringify(data.rows),
      data.newBatch,
      data.updatedBatch,
      new Date(data.createdAt).toISOString(),
    ],
  );
}

export async function getPreview(id: string): Promise<StoredPreview | null> {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT filename, rows_json, new_batch, updated_batch, created_at
     FROM previews WHERE id = $1`,
    [id],
  );
  const r = rows[0] as
    | {
        filename: string;
        rows_json: string;
        new_batch: number;
        updated_batch: number;
        created_at: string;
      }
    | undefined;
  if (!r) return null;
  const createdAt = Date.parse(r.created_at);
  if (Number.isNaN(createdAt) || Date.now() - createdAt > TTL_MS) {
    await deletePreview(id);
    return null;
  }
  return {
    rows: JSON.parse(r.rows_json) as PrdRow[],
    filename: r.filename,
    newBatch: Number(r.new_batch),
    updatedBatch: Number(r.updated_batch),
    createdAt,
  };
}

export async function deletePreview(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM previews WHERE id = $1`, [id]);
}