"use client";

import { useCallback, useMemo, useState } from "react";
import type { ItemSummary } from "@/lib/types";
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
  const [selected, setSelected] = useState<ItemSummary | null>(null);
  const [bahan, setBahan] = useState<BahanRow[] | null>(null);
  const [nBatches, setNBatches] = useState(0);
  const [stok, setStok] = useState<Record<string, StokItem> | null>(null);
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

  const select = useCallback(async (item: ItemSummary) => {
    setSelected(item);
    setBahan(null);
    setStok(null);
    setStokError(null);
    setStokAt(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/item-bahan?kode=${encodeURIComponent(item.kode)}`);
      const d = await res.json();
      const list = (d.bahan ?? []) as BahanRow[];
      setBahan(list);
      setNBatches(d.n_batches ?? 0);
      if (list.length > 0) {
        const kodeParam = list.map((b) => b.kode).join(",");
        const sres = await fetch(`/api/stok?kode=${encodeURIComponent(kodeParam)}`);
        const sd = await sres.json();
        if (sres.ok) {
          setStok(sd.items ?? {});
          setStokAt(sd.fetched_at ?? null);
        } else {
          setStokError(sd.error ?? "Gagal memuat stok");
        }
      }
    } catch {
      setBahan([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* daftar SKU */}
      <Panel
        title="SKU RTL"
        subtitle={`${fmtNum(filtered.length, 0)} item${q ? " (hasil cari)" : ""}`}
        accent="out"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode / nama SKU…"
          className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
          aria-label="Cari SKU"
        />
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-3">
            Data SKU belum termuat — terapkan analisis terlebih dahulu.
          </p>
        ) : (
          <ul className="max-h-[560px] space-y-1 overflow-auto pr-1">
            {filtered.map((i) => (
              <li key={i.kode}>
                <button
                  onClick={() => select(i)}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    selected?.kode === i.kode
                      ? "border-accent bg-accent-soft/50"
                      : "border-line bg-surface-2 hover:border-accent"
                  }`}
                >
                  <span className="tnum block font-mono text-[11px] text-ink-3">{i.kode}</span>
                  <span className="block truncate text-[13px] font-medium text-ink" title={i.nama}>
                    {i.nama}
                  </span>
                  <span className="tnum block text-[10px] text-ink-3">
                    {fmtNum(i.n_batch, 0)} batch · {fmtNum(i.total_qty, 0)} kg
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* detail bahan + stok */}
      <div className="lg:col-span-2">
        <Panel
          title={selected ? `Bahan terpakai — ${selected.kode}` : "Histori bahan & stok"}
          subtitle={
            selected
              ? `${selected.nama} · dari ${fmtNum(nBatches, 0)} batch produksi`
              : "pilih SKU di daftar kiri untuk melihat bahan yang pernah dipakai"
          }
          accent="in"
          right={
            stokAt ? (
              <span className="tnum text-[10px] text-ink-3">
                Stok: Google Sheet · {new Date(stokAt).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : undefined
          }
        >
          {!selected ? (
            <p className="py-8 text-center text-sm text-ink-3">
              Pilih SKU RTL dari daftar di kiri.
            </p>
          ) : loading ? (
            <SkeletonRows n={8} h="h-9" />
          ) : stokError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {stokError}
            </div>
          ) : !bahan || bahan.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-3">
              Tidak ada data bahan untuk SKU ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-surface-2/95">
                  <tr>
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
                  {bahan.map((b) => {
                    const s = stok?.[b.kode];
                    return (
                      <tr key={b.kode} className="border-t border-line/60">
                        <Td mono muted>
                          {b.kode}
                        </Td>
                        <td className="max-w-[200px] px-3 py-1.5">
                          <span className="block truncate text-[13px] text-ink" title={b.nama}>
                            {b.nama}
                          </span>
                        </td>
                        <Td align="right">{fmtNum(b.n_batch, 0)}</Td>
                        <Td align="right">{fmtNum(b.total_qty, 1)}</Td>
                        <Td align="right" strong>
                          {fmtIDR(b.total_biaya)}
                        </Td>
                        <Td mono muted>
                          {fmtDate(b.last_date)}
                        </Td>
                        <td className="tnum px-3 py-1.5 text-right">
                          {s ? (
                            <span
                              className={`text-[13px] font-semibold ${
                                s.total > 0 ? "text-out" : "text-red-600"
                              }`}
                            >
                              {fmtNum(s.total, 0)}
                            </span>
                          ) : stok ? (
                            <span className="text-[11px] text-ink-3">tidak ada di sheet</span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="max-w-[260px] px-3 py-1.5">
                          {s && s.gudang.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {s.gudang.slice(0, 3).map((g) => (
                                <span
                                  key={g.nama}
                                  className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                                  title={g.nama}
                                >
                                  {g.nama}: {fmtNum(g.qty, 0)}
                                </span>
                              ))}
                              {s.gudang.length > 3 && (
                                <span
                                  className="text-[10px] text-ink-3"
                                  title={s.gudang
                                    .slice(3)
                                    .map((g) => `${g.nama}: ${g.qty}`)
                                    .join(", ")}
                                >
                                  +{s.gudang.length - 3} gudang
                                </span>
                              )}
                            </div>
                          ) : s ? (
                            <span className="text-[11px] text-red-600">stok kosong semua</span>
                          ) : (
                            <span className="text-[11px] text-ink-3">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            Stok otomatis dicocokkan dari Google Sheet stok gudang berdasarkan kode barang
            (diperbarui tiap ±10 menit).
          </p>
        </Panel>
      </div>
    </div>
  );
}