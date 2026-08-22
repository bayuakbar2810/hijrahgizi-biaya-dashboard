import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

type QueryResult = { rows: Array<Record<string, unknown>> };

export type Db = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
  exec: (text: string) => Promise<void>;
};

const globalForDb = globalThis as unknown as { __db?: Db };

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

CREATE TABLE IF NOT EXISTS previews (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  new_batch INTEGER NOT NULL DEFAULT 0,
  updated_batch INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_history (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  n_rows_old INTEGER NOT NULL,
  n_rows_new INTEGER NOT NULL,
  total_biaya_old DOUBLE PRECISION NOT NULL,
  total_biaya_new DOUBLE PRECISION NOT NULL,
  total_qty_old DOUBLE PRECISION NOT NULL,
  total_qty_new DOUBLE PRECISION NOT NULL,
  diff_json TEXT NOT NULL,
  rows_old_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batch_history_batch ON batch_history(batch_no);
CREATE INDEX IF NOT EXISTS idx_batch_history_time ON batch_history(changed_at);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  karton_min_kg: "10",
  karton_max_kg: "15",
  cost_var_watch: "10",
  cost_var_anomaly: "20",
  yield_var_watch: "10",
  yield_var_anomaly: "20",
  hpp_var_watch: "10",
  hpp_var_anomaly: "20",
  exclude_name_prefixes: "RTL CST",
};

export async function getDb(): Promise<Db> {
  if (globalForDb.__db) return globalForDb.__db;
  const db = process.env.DATABASE_URL ? await initCloudDb() : await initLocalDb();
  globalForDb.__db = db;
  return db;
}

async function initCloudDb(): Promise<Db> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 20_000,
    ssl: { rejectUnauthorized: false },
  });
  const db: Db = {
    async query(text, params) {
      const res = await pool.query(text, params ?? []);
      return { rows: res.rows as Array<Record<string, unknown>> };
    },
    async exec(text) {
      await pool.query(text);
    },
  };
  await db.exec(SCHEMA);
  await seedSettings(db);
  await seedProductMaster(db);
  return db;
}

async function initLocalDb(): Promise<Db> {
  const dir = path.join(process.cwd(), "pgdata");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.exec(SCHEMA);
  const local: Db = {
    async query(text, params) {
      const res = await db.query(text, params ?? []);
      return { rows: res.rows as Array<Record<string, unknown>> };
    },
    async exec(text) {
      await db.exec(text);
    },
  };
  await seedSettings(local);
  await seedProductMaster(local);
  await migrateLegacy(local);
  return local;
}

async function seedSettings(db: Db): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value],
    );
  }
}

async function seedProductMaster(db: Db): Promise<void> {
  const { rows } = await db.query(`SELECT COUNT(*) AS n FROM product_master`);
  const n = Number((rows[0] as { n?: number | string } | undefined)?.n ?? 0);
  if (n > 0) return;

  const csvPath = path.join(process.cwd(), "product_master_draft.csv");
  if (!fs.existsSync(csvPath)) return;

  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return;

  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[h.trim()] = i;
  });

  const byCode = new Map<string, { kode: string; nama: string; ptype: string; total: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (name: string): string => {
      const j = idx[name];
      return j !== undefined ? (cells[j] ?? "").trim() : "";
    };
    const kode = get("Kode");
    if (!kode) continue;
    const nama = get("nama_produk");
    const ptype = get("product_type");
    const total =
      Number(get("n_input") || 0) + Number(get("n_output") || 0);
    const prev = byCode.get(kode);
    if (!prev || total > prev.total) {
      byCode.set(kode, { kode, nama, ptype, total });
    }
  }

  for (const item of byCode.values()) {
    const ptype = item.ptype || "OTHER";
    const isRtl = ptype === "FINISHED_PRODUCT" ? 1 : 0;
    const isMain = ptype === "FINISHED_PRODUCT" ? 1 : 0;
    const isBy = ptype === "BY_PRODUCT" ? 1 : 0;
    const isPack = ptype === "PACKAGING" ? 1 : 0;
    await db.query(
      `INSERT INTO product_master (kode, nama_produk, product_type, is_rtl, is_main_output, is_by_product, is_packaging, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
      [item.kode, item.nama, ptype, isRtl, isMain, isBy, isPack],
    );
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function migrateLegacy(db: Db): Promise<void> {
  const hasTx = await db.query(`SELECT COUNT(*) AS n FROM production_transactions`);
  const n = Number((hasTx.rows[0] as { n?: number | string } | undefined)?.n ?? 0);
  if (n > 0) return;

  const legacy = await db.query(
    `SELECT COUNT(*) AS n FROM transactions`,
  ).catch(() => ({ rows: [{ n: 0 }] }));
  const legacyCount = Number(
    (legacy.rows[0] as { n?: number | string } | undefined)?.n ?? 0,
  );
  if (legacyCount === 0) return;

  const { rows } = await db.query(
    `SELECT tanggal, batch_no, kode, bahan_biaya, keterangan,
            pengeluaran_biaya, pengeluaran_qty, penyelesaian_biaya, penyelesaian_qty, total_biaya, total_qty
     FROM transactions`,
  );
  const now = new Date().toISOString();
  for (const r of rows as Array<Record<string, unknown>>) {
    await db.query(
      `INSERT INTO production_transactions
        (id, source_file, tanggal, batch_no, kode, bahan_biaya, keterangan,
         pengeluaran_alokasi, pengeluaran_biaya, pengeluaran_qty,
         penyelesaian_alokasi, penyelesaian_biaya, penyelesaian_qty,
         total_alokasi, total_biaya, total_qty, uploaded_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, 0, $7, $8, 0, $9, $10, 0, $11, $12, $13)`,
      [
        crypto.randomUUID(),
        r.tanggal,
        r.batch_no,
        r.kode ?? "",
        r.bahan_biaya ?? "",
        r.keterangan ?? "",
        r.pengeluaran_biaya ?? 0,
        r.pengeluaran_qty ?? 0,
        r.penyelesaian_biaya ?? 0,
        r.penyelesaian_qty ?? 0,
        r.total_biaya ?? 0,
        r.total_qty ?? 0,
        now,
      ],
    );
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}