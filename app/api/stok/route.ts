import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_ID = "1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII";
const GID_BAHAN = "0";
const GID_GPU = "143545477";
const CACHE_MS = 10 * 60 * 1000;

type GudangRow = { nama: string; qty: number };
type StokItem = {
  nama: string;
  kode: string;
  booked: number;
  total: number;
  gudang: GudangRow[];
};
type GpuItem = {
  nama: string;
  kategori: string;
  kode: string;
  total: number;
  lokasi: GudangRow[];
};

let cache: {
  at: number;
  items: Map<string, StokItem>;
  gpu: Map<string, GpuItem>;
} | null = null;

async function fetchCsv(gid: string): Promise<string> {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(
      `Gagal mengambil sheet stok gid ${gid} (HTTP ${res.status}) — pastikan sheet dibagikan "siapa saja yang memiliki link".`,
    );
  }
  return res.text();
}

function parseCsvRows(csv: string): string[][] {
  const wb = XLSX.read(csv, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true, defval: "" }) as string[][];
}

const cleanHeader = (h: string) => h.replace(/\s+/g, " ").trim();

/* Sheet gid 0: stok bahan per gudang. */
function parseBahan(rows: string[][]): Map<string, StokItem> {
  const items = new Map<string, StokItem>();
  if (rows.length < 2) return items;
  const header = rows[0].map((h) => cleanHeader(String(h)));
  const idxNama = header.indexOf("Nama Barang");
  const idxKode = header.indexOf("Kode Barang");
  const idxBooked = header.indexOf("Booked");
  const idxTotal = header.indexOf("Grand Total");
  const skip = new Set(["Nama Barang", "Kode Barang", "Booked", "Total", "Grand Total", ""]);
  const gudangCols: Array<{ idx: number; nama: string }> = [];
  header.forEach((h, i) => {
    if (!skip.has(h)) gudangCols.push({ idx: i, nama: h });
  });
  for (const r of rows.slice(1)) {
    const kode = String(r[idxKode] ?? "").trim();
    if (!kode) continue;
    const gudang: GudangRow[] = [];
    for (const g of gudangCols) {
      const qty = Number(r[g.idx]) || 0;
      if (qty !== 0) gudang.push({ nama: g.nama, qty });
    }
    const total = idxTotal >= 0 ? Number(r[idxTotal]) || 0 : gudang.reduce((s, g) => s + g.qty, 0);
    items.set(kode, {
      nama: String(r[idxNama] ?? ""),
      kode,
      booked: idxBooked >= 0 ? Number(r[idxBooked]) || 0 : 0,
      total,
      gudang,
    });
  }
  return items;
}

/* Sheet STOK GPU: stok produk jadi RTL per lokasi DC/gudang. */
function parseGpu(rows: string[][]): Map<string, GpuItem> {
  const gpu = new Map<string, GpuItem>();
  if (rows.length < 2) return gpu;
  const header = rows[0].map((h) => cleanHeader(String(h)));
  const idxSku = header.indexOf("SKU");
  const idxNama = header.indexOf("Nama Item");
  const idxKategori = header.indexOf("KATEGORI PRODUK");
  const idxTotal = header.indexOf("Stock Toko All");
  const lokasiCols: Array<{ idx: number; nama: string }> = [];
  header.forEach((h, i) => {
    if (i > idxKategori && i < (idxTotal >= 0 ? idxTotal : header.length) && h && h !== "SKU" && h !== "Nama Item") {
      lokasiCols.push({ idx: i, nama: h.replace(/^Stock\s*/i, "").trim() });
    }
  });
  for (const r of rows.slice(1)) {
    const kode = String(r[idxSku] ?? "").trim();
    if (!kode || kode === "SKU") continue;
    const lokasi: GudangRow[] = [];
    for (const l of lokasiCols) {
      const qty = Number(r[l.idx]) || 0;
      if (qty !== 0) lokasi.push({ nama: l.nama, qty });
    }
    const total = idxTotal >= 0 ? Number(r[idxTotal]) || 0 : lokasi.reduce((s, l) => s + l.qty, 0);
    gpu.set(kode, {
      nama: String(r[idxNama] ?? ""),
      kategori: String(r[idxKategori] ?? ""),
      kode,
      total,
      lokasi,
    });
  }
  return gpu;
}

async function loadStok(): Promise<{ items: Map<string, StokItem>; gpu: Map<string, GpuItem> }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [csvBahan, csvGpu] = await Promise.all([fetchCsv(GID_BAHAN), fetchCsv(GID_GPU)]);
  const items = parseBahan(parseCsvRows(csvBahan));
  const gpu = parseGpu(parseCsvRows(csvGpu));
  cache = { at: Date.now(), items, gpu };
  return cache;
}

/* GET /api/stok?kode=100929,R102253 — stok bahan & stok GPU untuk kode tertentu. */
export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const kodeParam = new URL(request.url).searchParams.get("kode") ?? "";
  const wanted = kodeParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return respond(wanted);
}

/* POST /api/stok { kode: string[] } — untuk daftar kode yang panjang. */
export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { kode?: string[] } | null;
  const wanted = (body?.kode ?? []).map((s) => String(s).trim()).filter(Boolean);
  return respond(wanted);
}

/* Kode produksi berawalan "R" (mis. R100203) sedangkan sheet memakai angka saja (100203). */
function normKode(k: string): string {
  return k.replace(/^R(?=\d)/i, "").trim();
}

async function respond(wanted: string[]) {
  try {
    const { items, gpu } = await loadStok();
    const out: Record<string, StokItem> = {};
    const outGpu: Record<string, GpuItem> = {};
    for (const k of wanted) {
      const it = items.get(k) ?? items.get(normKode(k));
      if (it) out[k] = it;
      const g = gpu.get(k) ?? gpu.get(normKode(k));
      if (g) outGpu[k] = g;
    }
    return NextResponse.json({
      fetched_at: new Date(cache!.at).toISOString(),
      items: out,
      gpu: outGpu,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil stok" },
      { status: 502 },
    );
  }
}