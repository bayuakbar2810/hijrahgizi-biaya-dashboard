import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_ID = "1BmxBt-OXkTDSKfoPv8jDBn70gsCGs_v6PFbJnOPBOII";
const CACHE_MS = 10 * 60 * 1000;

type GudangRow = { nama: string; qty: number };
type StokItem = {
  nama: string;
  kode: string;
  booked: number;
  total: number;
  gudang: GudangRow[];
};

let cache: { at: number; items: Map<string, StokItem> } | null = null;

/* Ambil & parse sheet stok (CSV publik); di-cache 10 menit agar hemat kuota. */
async function loadStok(): Promise<Map<string, StokItem>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Gagal mengambil sheet stok (HTTP ${res.status}) — pastikan sheet dibagikan "siapa saja yang memiliki link".`);
  }
  const csv = await res.text();
  const wb = XLSX.read(csv, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true, defval: "" });
  if (rows.length < 2) throw new Error("Sheet stok kosong.");

  const header = rows[0].map((h) => String(h).trim());
  const idxNama = header.indexOf("Nama Barang");
  const idxKode = header.indexOf("Kode Barang");
  const idxBooked = header.indexOf("Booked");
  const idxTotal = header.indexOf("Grand Total");
  const skip = new Set(["Nama Barang", "Kode Barang", "Booked", "Total", "Grand Total", ""]);
  const gudangCols: Array<{ idx: number; nama: string }> = [];
  header.forEach((h, i) => {
    if (!skip.has(h)) gudangCols.push({ idx: i, nama: h });
  });

  const items = new Map<string, StokItem>();
  for (const r of rows.slice(1)) {
    const kode = String(r[idxKode] ?? "").trim();
    if (!kode) continue;
    const gudang: GudangRow[] = [];
    for (const g of gudangCols) {
      const qty = Number(r[g.idx]) || 0;
      if (qty !== 0) gudang.push({ nama: g.nama, qty });
    }
    const total =
      idxTotal >= 0
        ? Number(r[idxTotal]) || 0
        : gudang.reduce((s, g) => s + g.qty, 0);
    items.set(kode, {
      nama: String(r[idxNama] ?? ""),
      kode,
      booked: idxBooked >= 0 ? Number(r[idxBooked]) || 0 : 0,
      total,
      gudang,
    });
  }
  cache = { at: Date.now(), items };
  return items;
}

/* GET /api/stok?kode=100929,R102253 — stok untuk kode bahan tertentu. */
export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const kodeParam = new URL(request.url).searchParams.get("kode") ?? "";
  const wanted = kodeParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const items = await loadStok();
    const out: Record<string, StokItem> = {};
    for (const k of wanted) {
      const it = items.get(k);
      if (it) out[k] = it;
    }
    return NextResponse.json({
      fetched_at: new Date(cache!.at).toISOString(),
      items: out,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil stok" },
      { status: 502 },
    );
  }
}