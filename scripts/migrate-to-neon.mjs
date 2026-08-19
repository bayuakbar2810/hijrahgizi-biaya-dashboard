// Migrasi data dari PGlite lokal (pgdata/) ke Postgres cloud (Neon).
// Jalankan dari root proyek:  $env:DATABASE_URL="postgresql://..." ; node scripts/migrate-to-neon.mjs
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import path from "path";
import fs from "fs";
import process from "process";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL wajib diisi (koneksi Neon).");
  process.exit(1);
}

const TABLES = [
  { name: "source_files", columns: ["id", "filename", "uploaded_at", "n_rows", "n_batch", "new_batch", "updated_batch"] },
  { name: "settings", columns: ["key", "value"] },
  { name: "product_master", columns: ["kode", "nama_produk", "product_type", "is_rtl", "is_main_output", "is_by_product", "is_packaging", "active"] },
  { name: "production_transactions", columns: ["id", "source_file", "tanggal", "batch_no", "kode", "bahan_biaya", "keterangan", "pengeluaran_alokasi", "pengeluaran_biaya", "pengeluaran_qty", "penyelesaian_alokasi", "penyelesaian_biaya", "penyelesaian_qty", "total_alokasi", "total_biaya", "total_qty", "uploaded_at"] },
  { name: "batch_notes", columns: ["batch_no", "notes", "updated_at"] },
];

const CHUNK = 500;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  n_rows INTEGER NOT NULL DEFAULT 0,
  n_batch INTEGER NOT NULL DEFAULT 0,
  new_batch INTEGER NOT NULL DEFAULT 0,
  updated_batch INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_master (
  kode TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  product_type TEXT NOT NULL,
  is_rtl INTEGER NOT NULL DEFAULT 0,
  is_main_output INTEGER NOT NULL DEFAULT 0,
  is_by_product INTEGER NOT NULL DEFAULT 0,
  is_packaging INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS production_transactions (
  id TEXT PRIMARY KEY,
  source_file TEXT,
  tanggal TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  kode TEXT,
  bahan_biaya TEXT,
  keterangan TEXT,
  pengeluaran_alokasi DOUBLE PRECISION DEFAULT 0,
  pengeluaran_biaya DOUBLE PRECISION DEFAULT 0,
  pengeluaran_qty DOUBLE PRECISION DEFAULT 0,
  penyelesaian_alokasi DOUBLE PRECISION DEFAULT 0,
  penyelesaian_biaya DOUBLE PRECISION DEFAULT 0,
  penyelesaian_qty DOUBLE PRECISION DEFAULT 0,
  total_alokasi DOUBLE PRECISION DEFAULT 0,
  total_biaya DOUBLE PRECISION DEFAULT 0,
  total_qty DOUBLE PRECISION DEFAULT 0,
  uploaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppt_batch ON production_transactions(batch_no);
CREATE INDEX IF NOT EXISTS idx_ppt_tanggal ON production_transactions(tanggal);
CREATE INDEX IF NOT EXISTS idx_ppt_kode ON production_transactions(kode);
CREATE TABLE IF NOT EXISTS batch_notes (
  batch_no TEXT PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
`;

async function main() {
  const localDir = path.join(process.cwd(), "pgdata");
  if (!fs.existsSync(localDir)) {
    console.error("Folder pgdata tidak ditemukan. Jalankan dari root proyek.");
    process.exit(1);
  }
  const local = new PGlite(localDir);
  await local.waitReady;

  const cloud = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cloud.connect();
  await cloud.query(SCHEMA);

  for (const t of TABLES) {
    const { rows } = await local.query(`SELECT * FROM ${t.name}`);
    console.log(`[${t.name}] ${rows.length} baris dibaca dari lokal.`);

    if (rows.length === 0) continue;

    await cloud.query(`TRUNCATE ${t.name}`);
    const cols = t.columns.join(", ");
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const placeholders = [];
      const values = [];
      let p = 1;
      for (const r of chunk) {
        placeholders.push(`(${t.columns.map(() => `$${p++}`).join(", ")})`);
        for (const c of t.columns) values.push(r[c] ?? null);
      }
      await cloud.query(
        `INSERT INTO ${t.name} (${cols}) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }
    console.log(`[${t.name}] selesai -> ${rows.length} baris di cloud.`);
  }

  await cloud.end();
  await local.close();
  console.log("\nMigrasi selesai.");
}

main().catch((e) => {
  console.error("Migrasi gagal:", e);
  process.exit(1);
});