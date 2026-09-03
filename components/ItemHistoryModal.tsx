"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchAnalytics, ItemSummary } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { SkeletonRows, StatusBadge, NoteBadge, Th, Td } from "./ui";

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

type BatchWithSku = BatchAnalytics & {
  sku_qty: number;
  sku_hpp: number | null;
  sku_variance: number | null;
  sku_severity: "NORMAL" | "WATCH" | "ANOMALY";
};

export default function ItemHistoryModal({
  item,
  onClose,
  onOpenBatch,
  noteMap,
}: {
  item: ItemSummary;
  onClose: () => void;
  onOpenBatch: (batchNo: string) => void;
  noteMap: Map<string, boolean>;
}) {
  const [batches, setBatches] = useState<BatchWithSku[] | null>(null);
  const [bahan, setBahan] = useState<BahanRow[] | null>(null);
  const [stok, setStok] = useState<Record<string, StokItem> | null>(null);
  const [stokAt, setStokAt] = useState<string | null>(null);
  const [stokError, setStokError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setBatches(null);
    setError(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: item.kode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal memuat histori");
      const rows: BatchWithSku[] = (d.batches ?? []).map((b: BatchAnalytics) => {
        const s = (b.sku_hpps ?? []).find((x) => x.kode === item.kode);
        return {
          ...b,
          sku_qty: s?.qty ?? 0,
          sku_hpp: s?.hpp ?? null,
          sku_variance: s?.variance_pct ?? null,
          sku_severity: s?.severity ?? "NORMAL",
        };
      });
      setBatches(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    }
  }, [item.kode]);

  const loadBahan = useCallback(async () => {
    setBahan(null);
    setStok(null);
    setStokError(null);
    try {
      const res = await fetch(`/api/item-bahan?kode=${encodeURIComponent(item.kode)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal memuat bahan");
      const list = (d.bahan ?? []) as BahanRow[];
      setBahan(list);
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
    } catch (e) {
      setBahan([]);
      setStokError(e instanceof Error ? e.message : "Gagal memuat bahan");
    }
  }, [item.kode]);

  useEffect(() => {
    load();
    loadBahan();
    closeRef.current?.focus();
  }, [load, loadBahan]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Riwayat produksi ${item.kode}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Riwayat produksi item RTL
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="tnum font-mono text-xs text-ink-3">{item.kode}</span>
              <h3 className="truncate text-lg font-bold text-ink">{item.nama}</h3>
              <StatusBadge severity={item.severity} />
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Tutup"
          >
            âœ•
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <SummaryGrid item={item} />

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!batches && !error && <SkeletonRows n={8} h="h-10" />}

          {batches && batches.length === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-3">
              Tidak ada batch produksi untuk item ini pada data.
            </div>
          )}

          {batches && batches.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
                    <tr>
                      <Th>Batch</Th>
                      <Th>Tanggal</Th>
                      <Th align="right">Qty item</Th>
                      <Th align="right">HPP item</Th>
                      <Th align="right">Yield batch</Th>
                      <Th align="right">Biaya potong / KG</Th>
                      <Th align="right">KG / karton</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr
                        key={b.batch_no}
                        className="cursor-pointer border-t border-line/60 hover:bg-accent-soft/40"
                        onClick={() => onOpenBatch(b.batch_no)}
                        title="Klik untuk rincian batch"
                      >
                        <td className="px-3 py-1.5">
                          <span className="tnum block font-mono text-xs font-semibold text-accent">
                            {b.batch_no}
                          </span>
                          <span className="text-[10px] text-ink-3">
                            {fmtNum(b.n_rows, 0)} baris
                          </span>
                          {noteMap.get(b.batch_no) && (
                            <span className="ml-1 align-middle">
                              <NoteBadge />
                            </span>
                          )}
                        </td>
                        <Td mono muted>
                          {fmtDate(b.tanggal)}
                        </Td>
                        <Td align="right" strong>
                          {fmtNum(b.sku_qty, 1)} KG
                        </Td>
                        <td className="px-3 py-1.5 text-right">
                          <span
                            className={`tnum text-[13px] font-semibold ${
                              b.sku_severity === "ANOMALY"
                                ? "text-red-600"
                                : b.sku_severity === "WATCH"
                                  ? "text-amber-600"
                                  : "text-ink"
                            }`}
                          >
                            {b.sku_hpp != null ? fmtIDR(b.sku_hpp) : "-"}
                          </span>
                          {b.sku_variance != null && (
                            <span className="tnum ml-1.5 text-[10px] text-ink-3">
                              {b.sku_variance >= 0 ? "+" : ""}
                              {fmtNum(b.sku_variance, 1)}%
                            </span>
                          )}
                        </td>
                        <Td
                          align="right"
                          tone={b.yield_pct != null && b.yield_pct < 85 ? "in" : undefined}
                        >
                          {b.yield_pct != null ? `${fmtNum(b.yield_pct, 1)}%` : "-"}
                        </Td>
                        <Td align="right" tone="in">
                          {b.cost_potong_per_kg != null ? fmtIDR(b.cost_potong_per_kg) : "-"}
                        </Td>
                        <Td
                          align="right"
                          tone={
                            b.kg_per_karton != null &&
                            (b.kg_per_karton < 10 || b.kg_per_karton > 15)
                              ? "in"
                              : undefined
                          }
                        >
                          {b.kg_per_karton != null ? fmtNum(b.kg_per_karton, 2) : "-"}
                        </Td>
                        <td className="px-3 py-1.5">
                          <StatusBadge severity={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-3">
                Klik baris batch untuk membuka rincian lengkap (output, input, biaya proses, kemasan,
                yield, perbandingan historis).
              </p>
            </div>
          )}

          {bahan && bahan.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/95 px-4 py-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    Bahan &amp; biaya yang pernah dipakai (historis)
                  </h4>
                  <p className="tnum text-[11px] text-ink-3">
                    {bahan.length} bahan  -  dari {fmtNum(batches?.length ?? 0, 0)} batch produksi item ini
                  </p>
                </div>
                <span className="tnum text-[10px] text-ink-3">
                  {stokAt
                    ? `Stok dari Google Sheet  -  diperbarui ${new Date(stokAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                    : stokError
                      ? `Stok: ${stokError}`
                      : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-2/95">
                    <tr>
                      <Th>Kode</Th>
                      <Th>Bahan &amp; biaya</Th>
                      <Th align="right">Jml batch</Th>
                      <Th align="right">Total qty</Th>
                      <Th align="right">Total biaya</Th>
                      <Th>Terakhir dipakai</Th>
                      <Th align="right">Stok tersedia</Th>
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
                          <td className="max-w-[220px] px-3 py-1.5">
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
              <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-3">
                Stok otomatis dicocokkan dari Google Sheet stok gudang berdasarkan kode barang (sinkron 2x sehari).
              </p>
            </div>
          )}
        </div>

        <div className="tnum border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
          tekan Esc untuk menutup
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({ item }: { item: ItemSummary }) {
  const stats = [
    {
      label: "Total output",
      value: `${fmtNum(item.total_qty, 1)} KG`,
      tone: "text-out",
    },
    { label: "Batch produksi", value: fmtNum(item.n_batch, 0), tone: "text-ink" },
    { label: "HPP rata-rata", value: item.avg_hpp != null ? fmtIDR(item.avg_hpp) : "-", tone: "text-total" },
    {
      label: "Rentang HPP",
      value:
        item.min_hpp != null && item.max_hpp != null
          ? `${fmtIDR(item.min_hpp)} — ${fmtIDR(item.max_hpp)}`
          : "-",
      tone: "text-ink-2",
    },
    {
      label: "Yield rata-rata",
      value: item.avg_yield_pct != null ? `${fmtNum(item.avg_yield_pct, 1)}%` : "-",
      tone: "text-ink",
    },
    {
      label: "Yield terendah",
      value: item.min_yield_pct != null ? `${fmtNum(item.min_yield_pct, 1)}%` : "-",
      tone: "text-in",
    },
    {
      label: "Yield tertinggi",
      value: item.max_yield_pct != null ? `${fmtNum(item.max_yield_pct, 1)}%` : "-",
      tone: "text-out",
    },
    {
      label: "KG / karton",
      value: item.avg_kg_karton != null ? fmtNum(item.avg_kg_karton, 2) : "-",
      tone: "text-ink",
    },
    {
      label: "Biaya potong / KG",
      value: item.mode_cost_potong_kg != null ? fmtIDR(item.mode_cost_potong_kg) : "-",
      tone: "text-in",
    },
    {
      label: "Batch anomali",
      value: fmtNum(item.n_anomaly, 0),
      tone: item.n_anomaly > 0 ? "text-red-600" : "text-ink-3",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
            {s.label}
          </div>
          <div className={`tnum mt-1 text-base font-bold ${s.tone}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}