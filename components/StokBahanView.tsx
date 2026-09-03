"use client";

import { useMemo, useState } from "react";
import type { BahanStokRow, ItemSummary } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { Panel, SkeletonRows, Th, Td } from "./ui";

type BahanRow = {
  kode: string;
  nama: string;
  n_batch: number;
  total_qty: number;
  total_biaya: number;
  last_date: string;
};

type StokItem = {
  nama: string;
  kode: string;
  total: number;
  gudang: Array<{ nama: string; qty: number }>;
};

export default function StokBahanView({ items }: { items: ItemSummary[] }) {
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<BahanStokRow[] | null>(null);
  const [skusTanpaBahan, setSkusTanpaBahan] = useState<string[]>([]);
  const [stokAt, setStokAt] = useState<string | null>(null);
  const [stokError, setStokError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return items;
    return items.filter(
      (i) => i.kode.toLowerCase().includes(ql) || i.nama.toLowerCase().includes(ql),
    );
  }, [items, q]);

  const toggle = (kode: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const all = filtered.map((i) => i.kode);
    const semuaTerpilih = all.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      for (const k of all) {
        if (semuaTerpilih) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const load = async () => {
    if (checked.size === 0) return;
    setLoading(true);
    setRows(null);
    setStokError(null);
    setStokAt(null);
    try {
      const chosen = items.filter((i) => checked.has(i.kode));
      const lists = await Promise.all(
        chosen.map(async (i) => {
          const r = await fetch(`/api/item-bahan?kode=${encodeURIComponent(i.kode)}`);
          const d = await r.json();
          return { sku: i, list: (d.bahan ?? []) as BahanRow[] };
        }),
      );
      const kodeSet = new Set<string>();
      for (const l of lists) for (const b of l.list) kodeSet.add(b.kode);
      const sres = await fetch("/api/stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode: [...kodeSet] }),
      });
      const sd = await sres.json();
      if (!sres.ok) throw new Error(sd.error ?? "Gagal memuat stok");
      setStokAt(sd.fetched_at ?? null);
      const stokMap = sd.items as Record<
        string,
        { nama: string; kode: string; total: number; gudang: Array<{ nama: string; qty: number }> }
      >;
      const out: BahanStokRow[] = [];
      const kosong: string[] = [];
      for (const l of lists) {
        let ada = 0;
        for (const b of l.list) {
          const s = stokMap[b.kode];
          if (!s) continue; // hanya bahan yang terdaftar di sheet stok
          ada++;
          out.push({
            skuKode: l.sku.kode,
            skuNama: l.sku.nama,
            kode: b.kode,
            nama: b.nama,
            nBatch: b.n_batch,
            qty: b.total_qty,
            biaya: b.total_biaya,
            lastDate: b.last_date,
            stokTotal: s.total,
            gudang: s.gudang,
          });
        }
        if (ada === 0) kosong.push(`${l.sku.kode} — ${l.sku.nama}`);
      }
      setRows(out);
      setSkusTanpaBahan(kosong);
    } catch (e) {
      setStokError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    if (!rows || rows.length === 0) return;
    const { generateBahanStokPdf } = await import("@/lib/report");
    generateBahanStokPdf(rows, { fetchedAt: stokAt });
  };

  const exportExcel = async () => {
    if (!rows || rows.length === 0) return;
    const { downloadBahanStokExcel } = await import("@/lib/excel");
    downloadBahanStokExcel(rows, { fetchedAt: stokAt });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* daftar SKU multi-pilih */}
      <Panel
        title="Pilih SKU RTL"
        subtitle={`${checked.size} dipilih · ${fmtNum(filtered.length, 0)} item${q ? " (hasil cari)" : ""}`}
        accent="out"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode / nama SKU…"
          className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
          aria-label="Cari SKU"
        />
        {filtered.length > 0 && (
          <button
            onClick={toggleAllFiltered}
            className="mb-2 text-[11px] font-semibold text-accent hover:underline"
          >
            {filtered.every((i) => checked.has(i.kode)) ? "Hapus semua pilihan" : "Pilih semua hasil cari"}
          </button>
        )}
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-3">
            Data SKU belum termuat — terapkan analisis terlebih dahulu.
          </p>
        ) : (
          <ul className="max-h-[520px] space-y-1 overflow-auto pr-1">
            {filtered.map((i) => (
              <li key={i.kode}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                    checked.has(i.kode)
                      ? "border-accent bg-accent-soft/50"
                      : "border-line bg-surface-2 hover:border-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(i.kode)}
                    onChange={() => toggle(i.kode)}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink" title={i.nama}>
                      {i.nama}
                    </span>
                    <span className="tnum block text-[10px] text-ink-3">
                      {i.kode} · {fmtNum(i.n_batch, 0)} batch · {fmtNum(i.total_qty, 0)} kg
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={load}
          disabled={checked.size === 0 || loading}
          className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Memuat…" : `Tampilkan bahan (${checked.size} SKU)`}
        </button>
      </Panel>

      {/* hasil */}
      <div className="lg:col-span-2">
        <Panel
          title="Bahan terpakai & stok gudang"
          subtitle={
            rows
              ? `${fmtNum(rows.length, 0)} baris bahan · hanya bahan yang terdaftar di sheet stok`
              : "hasil muncul di sini setelah SKU dipilih"
          }
          accent="in"
          right={
            <div className="flex flex-wrap items-center gap-2">
              {stokAt && (
                <span className="tnum text-[10px] text-ink-3">
                  Stok per {new Date(stokAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                onClick={exportPdf}
                disabled={!rows || rows.length === 0}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unduh PDF
              </button>
              <button
                onClick={exportExcel}
                disabled={!rows || rows.length === 0}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unduh Excel
              </button>
            </div>
          }
        >
          {stokError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {stokError}
            </div>
          )}
          {skusTanpaBahan.length > 0 && rows && (
            <p className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-ink-3">
              Tidak ada bahan di sheet untuk: {skusTanpaBahan.join("; ")}
            </p>
          )}
          {loading && rows === null ? (
            <SkeletonRows n={8} h="h-9" />
          ) : !rows ? (
            <p className="py-8 text-center text-sm text-ink-3">
              Centang satu atau beberapa SKU di kiri, lalu klik &ldquo;Tampilkan bahan&rdquo;.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-3">
              Tidak ada bahan SKU terpilih yang terdaftar di sheet stok.
            </p>
          ) : (
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
                  <tr>
                    <Th>SKU</Th>
                    <Th>Kode</Th>
                    <Th>Bahan &amp; biaya</Th>
                    <Th align="right">Jml batch</Th>
                    <Th align="right">Total qty</Th>
                    <Th align="right">Total biaya</Th>
                    <Th>Terakhir</Th>
                    <Th align="right">Stok</Th>
                    <Th>Letak gudang</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.skuKode}-${r.kode}-${i}`} className="border-t border-line/60">
                      <td className="max-w-[160px] px-3 py-1.5">
                        <span className="tnum block font-mono text-[11px] font-semibold text-accent">
                          {r.skuKode}
                        </span>
                        <span className="block truncate text-[11px] text-ink-2" title={r.skuNama}>
                          {r.skuNama}
                        </span>
                      </td>
                      <Td mono muted>
                        {r.kode}
                      </Td>
                      <td className="max-w-[200px] px-3 py-1.5">
                        <span className="block truncate text-[13px] text-ink" title={r.nama}>
                          {r.nama}
                        </span>
                      </td>
                      <Td align="right">{fmtNum(r.nBatch, 0)}</Td>
                      <Td align="right">{fmtNum(r.qty, 1)}</Td>
                      <Td align="right" strong>
                        {fmtIDR(r.biaya)}
                      </Td>
                      <Td mono muted>
                        {fmtDate(r.lastDate)}
                      </Td>
                      <td className="tnum px-3 py-1.5 text-right">
                        <span
                          className={`text-[13px] font-semibold ${
                            r.stokTotal > 0 ? "text-out" : "text-red-600"
                          }`}
                        >
                          {fmtNum(r.stokTotal, 0)}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-3 py-1.5">
                        {r.gudang.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.gudang.slice(0, 3).map((g) => (
                              <span
                                key={g.nama}
                                className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                                title={g.nama}
                              >
                                {g.nama}: {fmtNum(g.qty, 0)}
                              </span>
                            ))}
                            {r.gudang.length > 3 && (
                              <span
                                className="text-[10px] text-ink-3"
                                title={r.gudang
                                  .slice(3)
                                  .map((g) => `${g.nama}: ${g.qty}`)
                                  .join(", ")}
                              >
                                +{r.gudang.length - 3} gudang
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-red-600">stok kosong semua</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            Hanya bahan yang terdaftar di Google Sheet stok yang ditampilkan (biaya proses, dll
            di luar sheet tidak ditampilkan). Stok disegarkan tiap ±10 menit.
          </p>
        </Panel>
      </div>
    </div>
  );
}