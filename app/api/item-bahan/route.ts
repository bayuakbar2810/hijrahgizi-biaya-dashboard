import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Agg = { kode: string; nama: string; n_batch: number; total_qty: number; total_biaya: number; last_date: string };

/* Histori bahan untuk SATU atau BANYAK SKU sekaligus.
   GET  ?kode=X          (kompatibilitas lama)
   POST { kodes: [] }    (cepat: 1 request untuk semua SKU) */
export async function GET(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const kode = new URL(request.url).searchParams.get("kode")?.trim() ?? "";
  if (!kode) {
    return NextResponse.json({ error: "kode wajib diisi" }, { status: 400 });
  }
  const res = await respond([kode]);
  const j = (await res.json()) as { results?: Record<string, unknown> };
  const entry = (j.results?.[kode] ?? {
    bahan: [],
    current: [],
    latest: null,
    n_batches: 0,
    history: [],
  }) as Record<string, unknown>;
  return NextResponse.json(entry);
}

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { kodes?: string[] } | null;
  const kodes = (body?.kodes ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (kodes.length === 0) {
    return NextResponse.json({ error: "kodes wajib diisi" }, { status: 400 });
  }
  return respond(kodes, {});
}

async function respond(kodes: string[], empty: Record<string, unknown> = {}) {
  const db = await getDb();

  /* 1. Semua batch produksi per SKU (sekaligus tanggal utk batch terakhir) - 1 query */
  const { rows: skuBatchRows } = await db.query(
    `SELECT kode, batch_no, tanggal FROM production_transactions
     WHERE kode = ANY($1::text[]) AND penyelesaian_qty > 0`,
    [kodes],
  );
  const batchesBySku = new Map<string, Set<string>>();
  const latestBySku = new Map<string, { batch_no: string; tanggal: string }>();
  const unionBatches = new Set<string>();
  for (const r of skuBatchRows as Array<{ kode: string; batch_no: string; tanggal: string }>) {
    let set = batchesBySku.get(r.kode);
    if (!set) {
      set = new Set<string>();
      batchesBySku.set(r.kode, set);
    }
    set.add(r.batch_no);
    unionBatches.add(r.batch_no);
    const cur = latestBySku.get(r.kode);
    if (!cur || r.tanggal > cur.tanggal || (r.tanggal === cur.tanggal && r.batch_no > cur.batch_no)) {
      latestBySku.set(r.kode, { batch_no: r.batch_no, tanggal: r.tanggal });
    }
  }

  /* SKU tanpa batch produksi */
  const results: Record<string, unknown> = { ...empty };
  for (const k of kodes) {
    if (!batchesBySku.has(k)) {
      results[k] = { bahan: [], current: [], latest: null, n_batches: 0, history: [] };
    }
  }
  const batchList = [...unionBatches];
  if (batchList.length === 0) {
    return NextResponse.json({ results });
  }

  /* 2. Riwayat pemakaian per batch (tanpa kemasan & biaya proses & item RTL) - 1 query */
  const { rows: histRows } = await db.query(
    `SELECT t.batch_no, t.tanggal, t.kode, MAX(t.bahan_biaya) AS nama, SUM(t.pengeluaran_qty) AS qty, SUM(t.pengeluaran_biaya) AS biaya
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = ANY($1::text[])
       AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
       AND t.bahan_biaya NOT ILIKE 'rtl%'
     GROUP BY t.batch_no, t.tanggal, t.kode`,
    [batchList],
  );
  const histByBatch = new Map<string, { batch_no: string; tanggal: string; items: Array<{ kode: string; nama: string; qty: number; biaya: number }> }>();
  for (const h of histRows as Array<{ batch_no: string; tanggal: string; kode: string; nama: string; qty: string; biaya: string }>) {
    let e = histByBatch.get(h.batch_no);
    if (!e) {
      e = { batch_no: h.batch_no, tanggal: h.tanggal, items: [] };
      histByBatch.set(h.batch_no, e);
    }
    e.items.push({ kode: h.kode, nama: h.nama, qty: Number(h.qty) || 0, biaya: Number(h.biaya) || 0 });
  }
  const history = [...histByBatch.values()].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  /* 3. Agregat historis per (bahan) utk semua batch gabungan - 1 query */
  const { rows: aggRows } = await db.query(
    `SELECT t.kode,
            MAX(t.bahan_biaya) AS nama,
            COUNT(DISTINCT t.batch_no)::int AS n_batch,
            SUM(t.pengeluaran_qty) AS total_qty,
            SUM(t.pengeluaran_biaya) AS total_biaya,
            MAX(t.tanggal) AS last_date
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = ANY($1::text[])
       AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
       AND t.bahan_biaya NOT ILIKE 'rtl%'
     GROUP BY t.kode`,
    [batchList],
  );
  const aggByKode = new Map<string, Agg>();
  for (const a of aggRows as unknown as Agg[]) {
    aggByKode.set(a.kode, {
      ...a,
      total_qty: Number(a.total_qty) || 0,
      total_biaya: Number(a.total_biaya) || 0,
    });
  }

  /* 4. Bahan "saat ini" utk batch terakhir tiap SKU - 1 query */
  const latestBatches = [...new Set([...latestBySku.values()].map((l) => l.batch_no))];
  const { rows: curRows } = await db.query(
    `SELECT t.batch_no, t.kode, MAX(t.bahan_biaya) AS nama, SUM(t.pengeluaran_qty) AS qty,
            SUM(t.pengeluaran_biaya) AS biaya
     FROM production_transactions t
     LEFT JOIN product_master pm ON pm.kode = t.kode
     WHERE t.batch_no = ANY($1::text[])
       AND t.kode <> ''
       AND (t.pengeluaran_qty > 0 OR t.pengeluaran_biaya > 0)
       AND COALESCE(pm.product_type, 'OTHER') NOT IN ('PACKAGING', 'PROCESS_COST')
       AND t.bahan_biaya NOT ILIKE 'rtl%'
     GROUP BY t.batch_no, t.kode`,
    [latestBatches],
  );
  const curByBatch = new Map<string, Array<{ kode: string; nama: string; qty: number; biaya: number }>>();
  for (const c of curRows as Array<{ batch_no: string; kode: string; nama: string; qty: string; biaya: string }>) {
    let arr = curByBatch.get(c.batch_no);
    if (!arr) {
      arr = [];
      curByBatch.set(c.batch_no, arr);
    }
    arr.push({ kode: c.kode, nama: c.nama, qty: Number(c.qty) || 0, biaya: Number(c.biaya) || 0 });
  }

  /* Susun hasil per SKU */
  for (const k of kodes) {
    if (!batchesBySku.has(k)) continue;
    const batches = batchesBySku.get(k)!;
    const latest = latestBySku.get(k) ?? null;
    const histMap = new Map<string, Agg>();
    for (const b of batches) {
      const h = histByBatch.get(b);
      if (!h) continue;
      for (const it of h.items) {
        let agg = histMap.get(it.kode);
        if (!agg) {
          agg = { kode: it.kode, nama: it.nama, n_batch: 0, total_qty: 0, total_biaya: 0, last_date: "" };
          histMap.set(it.kode, agg);
        }
        agg.n_batch += 1;
        agg.total_qty += it.qty;
        agg.total_biaya += it.biaya;
        if (h.tanggal > agg.last_date) agg.last_date = h.tanggal;
        if (it.qty !== 0) agg.nama = it.nama;
      }
    }
    const cur = latest ? curByBatch.get(latest.batch_no) ?? [] : [];
    const skuHistory = history.filter((h) => batches.has(h.batch_no));
    results[k] = {
      n_batches: batches.size,
      latest,
      current: cur,
      bahan: [...histMap.values()].sort((a, b) => b.total_qty - a.total_qty),
      history: skuHistory,
    };
  }

  return NextResponse.json({ results });
}