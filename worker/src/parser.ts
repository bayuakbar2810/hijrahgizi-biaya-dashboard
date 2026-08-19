// Port dari py-service/parser.py — parsing Excel histori pekerjaan pesanan.
import * as XLSX from "xlsx";

const MAIN_SHEET = "Histori Pekerjaan Pesanan";

const NUMERIC_COLS = [
  "pengeluaran_alokasi",
  "pengeluaran_biaya",
  "pengeluaran_qty",
  "penyelesaian_alokasi",
  "penyelesaian_biaya",
  "penyelesaian_qty",
  "total_alokasi",
  "total_biaya",
  "total_qty",
];

const WANT: Record<string, string> = {
  tanggal: "tanggal",
  "batch no": "batch_no",
  kode: "kode",
  "bahan dan biaya": "bahan_biaya",
  keterangan: "keterangan",
  "pengeluaran barang biaya": "pengeluaran_biaya",
  "pengeluaran barang kuantitas": "pengeluaran_qty",
  "pengeluaran barang alokasi": "pengeluaran_alokasi",
  "penyelesaian pesanan biaya": "penyelesaian_biaya",
  "penyelesaian pesanan kuantitas": "penyelesaian_qty",
  "penyelesaian pesanan alokasi": "penyelesaian_alokasi",
  "total tipe transaksi biaya": "total_biaya",
  "total tipe transaksi kuantitas": "total_qty",
  "total tipe transaksi alokasi": "total_alokasi",
};

const REQUIRED_KEYS = [
  "tanggal",
  "batch no",
  "kode",
  "bahan dan biaya",
  "pengeluaran barang biaya",
  "penyelesaian pesanan biaya",
  "penyelesaian pesanan kuantitas",
];

export type PrdRow = Record<string, any>;

function _norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function _key(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/ - /g, " ")
    .replace(/-/g, " ")
    .replace(/ \(%\)/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\./g, "");
}

function _num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function _round2(x: number): number {
  return Math.round(x * 100) / 100;
}

type Grid = Array<Array<unknown>>;

function buildGrid(ws: XLSX.WorkSheet): Grid {
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const nR = range.e.r + 1;
  const nC = range.e.c + 1;
  const grid: Grid = Array.from({ length: nR }, () => new Array(nC).fill(undefined));
  const merges = (ws["!merges"] as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>) ?? [];
  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      grid[r][c] = cell ? cell.v : undefined;
    }
  }
  for (const m of merges) {
    if (m.s.r <= 1) {
      const anchor = grid[m.s.r]?.[m.s.c];
      if (anchor !== undefined && anchor !== null) {
        for (let r = m.s.r; r <= Math.min(m.e.r, 1); r++) {
          for (let c = m.s.c; c <= m.e.c; c++) grid[r][c] = anchor;
        }
      }
    }
  }
  return grid;
}

function _flattenColumns(grid: Grid, nC: number): string[] {
  const cols: string[] = [];
  for (let c = 0; c < nC; c++) {
    const rawA = grid[0]?.[c];
    const rawB = grid[1]?.[c];
    const a = String(rawA === undefined || rawA === null ? "nan" : rawA).trim();
    const b = String(
      rawB === undefined || rawB === null ? `Unnamed: ${c}_level_1` : rawB,
    ).trim();
    if (b.startsWith("Unnamed") || b === "") cols.push(a);
    else if (a && a !== b && !a.startsWith("Unnamed")) cols.push(`${a} - ${b}`);
    else cols.push(b);
  }
  return cols;
}

function _singleHeader(grid: Grid, nC: number): string[] {
  const cols: string[] = [];
  for (let c = 0; c < nC; c++) {
    const v = grid[0]?.[c];
    cols.push(v === undefined || v === null ? `Unnamed: ${c}` : String(v));
  }
  return cols;
}

function _mapColumns(columns: string[]): { mapping: Record<string, string>; missing: string[] } {
  const lookup: Record<string, string> = {};
  for (const c of columns) {
    const k = _key(c);
    if (k && !(k in lookup)) lookup[k] = c;
  }
  const mapping: Record<string, string> = {};
  for (const [key, out] of Object.entries(WANT)) {
    if (key in lookup) mapping[out] = lookup[key];
  }
  const missing = REQUIRED_KEYS.filter((c) => !(c in lookup));
  return { mapping, missing };
}

function fmtDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const dc = XLSX.SSF.parse_date_code(v);
    if (dc) return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
    return null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return fmtDate(d);
    return null;
  }
  return null;
}

function _isEmpty(v: unknown): boolean {
  return v === undefined || v === null || _norm(v) === "";
}

export function parseExcel(content: ArrayBuffer, filename: string) {
  const wb = XLSX.read(new Uint8Array(content), { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.includes(MAIN_SHEET) ? MAIN_SHEET : wb.SheetNames[0];
  if (!sheetName) throw new Error("File Excel kosong (tidak ada sheet).");
  const ws = wb.Sheets[sheetName];
  const grid = buildGrid(ws);
  const nC = grid[0]?.length ?? 0;

  let mapping: Record<string, string>;
  let missing: string[];
  let dataStart: number;
  const first = _mapColumns(_flattenColumns(grid, nC));
  if (first.missing.length === 0) {
    mapping = first.mapping;
    missing = [];
    dataStart = 2;
  } else {
    const second = _mapColumns(_singleHeader(grid, nC));
    if (second.missing.length === 0) {
      mapping = second.mapping;
      missing = [];
      dataStart = 1;
    } else {
      throw new Error(`Kolom berikut tidak ditemukan: ${first.missing.join(", ")}`);
    }
  }

  const colIdx: Record<string, number> = {};
  for (const [out, colName] of Object.entries(mapping)) {
    colIdx[out] = _flattenColumns(grid, nC).indexOf(colName);
  }

  const recs: PrdRow[] = [];
  for (let r = dataStart; r < grid.length; r++) {
    const rec: PrdRow = {};
    for (const key of Object.keys(mapping)) {
      const idx = colIdx[key];
      rec[key] = idx >= 0 ? grid[r]?.[idx] : undefined;
    }
    for (const c of NUMERIC_COLS) {
      if (rec[c] === undefined || rec[c] === null) rec[c] = 0;
    }
    recs.push(rec);
  }

  const before = recs.length;
  let invalidRows = 0;

  const out = recs.filter((r) => !_norm(r.batch_no).toUpperCase().startsWith("TOTAL"));
  const out2 = out.filter((r) => _norm(r.kode) !== "");
  const out3 = out2.filter((r) => {
    const batchNa = _isEmpty(r.batch_no);
    const bb = _norm(r.bahan_biaya).toUpperCase();
    const isFooter =
      batchNa && bb.includes("BIAYA") && _num(r.pengeluaran_biaya) === 0 && _num(r.penyelesaian_biaya) === 0;
    return !isFooter;
  });
  invalidRows += before - out3.length;

  let lastBatch: unknown;
  let lastTanggal: unknown;
  let lastKet: unknown;
  for (const r of out3) {
    if (_isEmpty(r.batch_no)) r.batch_no = lastBatch;
    else lastBatch = r.batch_no;
    if (_isEmpty(r.tanggal)) r.tanggal = lastTanggal;
    else lastTanggal = r.tanggal;
    if (r.keterangan === undefined || _isEmpty(r.keterangan)) r.keterangan = lastKet;
    else lastKet = r.keterangan;
  }

  const out4 = out3.filter((r) => _norm(r.batch_no) !== "");

  let badDate = 0;
  for (const r of out4) {
    const d = fmtDate(r.tanggal);
    if (d === null) badDate++;
    r.tanggal = d;
  }
  invalidRows += badDate;
  const out5 = out4.filter((r) => r.tanggal !== null);

  for (const r of out5) {
    r.total_biaya = _num(r.pengeluaran_biaya) + _num(r.penyelesaian_biaya);
    r.total_qty = _num(r.pengeluaran_qty) + _num(r.penyelesaian_qty);
    r.total_alokasi = _num(r.pengeluaran_alokasi) + _num(r.penyelesaian_alokasi);
  }

  for (const r of out5) {
    for (const f of ["bahan_biaya", "keterangan", "batch_no", "kode"]) {
      r[f] = _norm(r[f]);
    }
    for (const f of NUMERIC_COLS) {
      r[f] = _round2(_num(r[f]));
    }
  }

  const rows = out5;
  const totalBiaya = rows.reduce((a, r) => a + _num(r.total_biaya), 0);
  const dates = rows.map((r) => String(r.tanggal)).filter((d) => d !== "");

  const summary = {
    filename,
    sheet: sheetName,
    row_count: rows.length,
    batch_count: new Set(rows.map((r) => String(r.batch_no))).size,
    kode_count: new Set(rows.map((r) => String(r.kode))).size,
    date_min: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : "",
    date_max: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : "",
    total_biaya: _round2(totalBiaya),
  };

  return {
    rows,
    summary,
    missing_columns: [],
    invalid_rows: invalidRows,
  };
}