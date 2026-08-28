"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductType } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { PTypeBadge, SkeletonRows, NoteBadge, Th, Td } from "./ui";

type RawRow = {
  id: string;
  tanggal: string;
  batch_no: string;
  kode: string;
  bahan_biaya: string;
  keterangan: string;
  pengeluaran_biaya: number;
  pengeluaran_qty: number;
  penyelesaian_biaya: number;
  penyelesaian_qty: number;
  total_biaya: number;
  total_qty: number;
  product_type: string;
  is_rtl: number;
  is_packaging: number;
};

export default function RawDataView({
  onOpenBatch,
  noteMap,
}: {
  onOpenBatch: (batchNo: string) => void;
  noteMap: Map<string, boolean>;
}) {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (q: string, f: string, t: string, off: number, append: boolean) => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ limit: "300", offset: String(off) });
        if (q.trim()) sp.set("q", q.trim());
        if (f) sp.set("from", f);
        if (t) sp.set("to", t);
        const res = await fetch(`/api/raw?${sp}`);
        const d = await res.json();
        setTotal(d.total ?? 0);
        setRows((prev) => (append ? [...prev, ...(d.rows ?? [])] : (d.rows ?? [])));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    inputRef.current?.focus();
    load(query, from, to, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = () => load(query, from, to, 0, false);
  const more = () => {
    const next = offset + 300;
    setOffset(next);
    load(query, from, to, next, true);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Data mentah (raw)</h2>
          <p className="tnum mt-0.5 text-[11px] text-ink-3">
            {fmtNum(total, 0)} baris cocok Â· tampil {fmtNum(rows.length, 0)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Cari batch / bahan / kodeâ€¦"
            className="w-52 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
            aria-label="Cari data mentah"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
            aria-label="Dari tanggal"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
            aria-label="Sampai tanggal"
          />
          <button
            onClick={search}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Cari
          </button>
        </div>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
            <tr>
              <Th>Tanggal</Th>
              <Th>Batch</Th>
              <Th>Catatan</Th>
              <Th>Kode</Th>
              <Th>Bahan & biaya</Th>
              <Th>Jenis</Th>
              <Th align="right">Input</Th>
              <Th align="right">Output</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <SkeletonRows n={6} h="h-8" />
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-line/60 hover:bg-accent-soft/40"
                  onClick={() => onOpenBatch(r.batch_no)}
                >
                  <Td mono muted>
                    {fmtDate(r.tanggal)}
                  </Td>
                  <Td mono accent>
                    {r.batch_no}
                  </Td>
                  <td className="px-1 py-1.5">
                    {noteMap.get(r.batch_no) && <NoteBadge />}
                  </td>
                  <Td mono muted>
                    {r.kode}
                  </Td>
                  <td className="max-w-[240px] px-3 py-1.5">
                    <span className="block truncate text-[13px] text-ink" title={r.bahan_biaya}>
                      {r.bahan_biaya}
                    </span>
                    {r.keterangan && (
                      <span className="block truncate text-[11px] text-ink-3" title={r.keterangan}>
                        {r.keterangan}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <PTypeBadge product_type={r.product_type as ProductType} />
                  </td>
                  <Td align="right" tone="in">
                    {r.pengeluaran_biaya > 0 ? fmtIDR(r.pengeluaran_biaya) : "-"}
                  </Td>
                  <Td align="right" tone="out">
                    {r.penyelesaian_biaya > 0 ? fmtIDR(r.penyelesaian_biaya) : "-"}
                  </Td>
                  <Td align="right" strong>
                    {fmtIDR(r.total_biaya)}
                  </Td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="px-3 py-10 text-center text-sm text-ink-3">
                    Tidak ada data yang cocok
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > rows.length && (
        <div className="border-t border-line px-4 py-2.5 text-center">
          <button
            onClick={more}
            disabled={loading}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {loading ? "Memuatâ€¦" : `Muat lebih banyak (${fmtNum(total - rows.length, 0)} lagi)`}
          </button>
        </div>
      )}
    </section>
  );
}