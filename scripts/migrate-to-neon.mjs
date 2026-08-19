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