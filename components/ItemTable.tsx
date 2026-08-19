"use client";

import { useMemo, useState } from "react";
import type { ItemSummary } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { StatusBadge, Th, Td } from "./ui";

type SortKey =
  | "kode"
  | "nama"
  | "total_qty"
  | "n_batch"
  | "avg_hpp"
  | "mode_cost_potong_kg"
  | "avg_yield_pct"
  | "min_yield_pct"
  | "max_yield_pct"
  | "avg_kg_karton"
  | "n_anomaly";

const TEXT_KEYS: SortKey[] = ["kode", "nama"];

export default function ItemTable({
  items,
  onOpen,
}: {
  items: ItemSummary[];
  onOpen: (kode: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const { key, dir } = sort;
    return [...items].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return String(av).localeCompare(String(bv), "id") * dir;
    });
  }, [items, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s && s.key === key
        ? s.dir === 1
          ? { key, dir: -1 }
          : null
        : { key, dir: TEXT_KEYS.includes(key) ? 1 : -1 },
    );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-3">
        Tidak ada item RTL yang cocok dengan filter.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
            <tr>
              <SortableTh label="Kode" k="kode" sort={sort} onSort={toggleSort} />
              <SortableTh label="Nama item RTL" k="nama" sort={sort} onSort={toggleSort} />
              <SortableTh label="Total output" k="total_qty" sort={sort} onSort={toggleSort} right />
              <SortableTh label="Batch" k="n_batch" sort={sort} onSort={toggleSort} right />
              <SortableTh label="HPP rata-rata" k="avg_hpp" sort={sort} onSort={toggleSort} right />
              <Th align="right">Rentang HPP</Th>
              <SortableTh
                label="Biaya potong / KG"
                k="mode_cost_potong_kg"
                sort={sort}
                onSort={toggleSort}
                right
              />
              <SortableTh label="Yield rata-rata" k="avg_yield_pct" sort={sort} onSort={toggleSort} right />
              <SortableTh label="Yield min" k="min_yield_pct" sort={sort} onSort={toggleSort} right />
              <SortableTh label="Yield max" k="max_yield_pct" sort={sort} onSort={toggleSort} right />
              <SortableTh label="KG / karton" k="avg_kg_karton" sort={sort} onSort={toggleSort} right />
              <SortableTh label="Anomali" k="n_anomaly" sort={sort} onSort={toggleSort} right />
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => (
              <tr
                key={it.kode}
                className="cursor-pointer border-t border-line/60 hover:bg-accent-soft/40"
                onClick={() => onOpen(it.kode)}
              >
                <Td mono muted>
                  {it.kode}
                </Td>
                <td className="max-w-[260px] px-3 py-1.5">
                  <span className="block truncate text-[13px] font-medium text-ink" title={it.nama}>
                    {it.nama}
                  </span>
                  {it.last_date && (
                    <span className="block text-[10px] text-ink-3">
                      terakhir {fmtDate(it.last_date)}
                    </span>
                  )}
                </td>
                <Td align="right" strong>
                  {fmtNum(it.total_qty, 1)} KG
                </Td>
                <Td align="right" muted>
                  {fmtNum(it.n_batch, 0)}
                </Td>
                <Td align="right" tone="total">
                  {it.avg_hpp != null ? fmtIDR(it.avg_hpp) : "-"}
                </Td>
                <Td align="right" muted>
                  {it.min_hpp != null && it.max_hpp != null
                    ? `${fmtIDR(it.min_hpp)} – ${fmtIDR(it.max_hpp)}`
                    : "-"}
                </Td>
                <Td align="right" tone="in">
                  {it.mode_cost_potong_kg != null ? fmtIDR(it.mode_cost_potong_kg) : "-"}
                </Td>
                <Td
                  align="right"
                  tone={it.avg_yield_pct != null && it.avg_yield_pct < 85 ? "in" : undefined}
                >
                  {it.avg_yield_pct != null ? `${fmtNum(it.avg_yield_pct, 1)}%` : "-"}
                </Td>
                <Td
                  align="right"
                  tone={it.min_yield_pct != null && it.min_yield_pct < 85 ? "in" : undefined}
                >
                  {it.min_yield_pct != null ? `${fmtNum(it.min_yield_pct, 1)}%` : "-"}
                </Td>
                <Td
                  align="right"
                  tone={it.max_yield_pct != null && it.max_yield_pct < 85 ? "in" : undefined}
                >
                  {it.max_yield_pct != null ? `${fmtNum(it.max_yield_pct, 1)}%` : "-"}
                </Td>
                <Td
                  align="right"
                  tone={
                    it.avg_kg_karton != null &&
                    (it.avg_kg_karton < 10 || it.avg_kg_karton > 15)
                      ? "in"
                      : undefined
                  }
                >
                  {it.avg_kg_karton != null ? fmtNum(it.avg_kg_karton, 2) : "-"}
                </Td>
                <Td align="right">
                  {it.n_anomaly > 0 ? (
                    <span className="tnum rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                      {fmtNum(it.n_anomaly, 0)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-3">–</span>
                  )}
                </Td>
                <td className="px-3 py-1.5">
                  <StatusBadge severity={it.severity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableTh({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort?.key === k;
  const dir = sort?.dir ?? 1;
  return (
    <Th align={right ? "right" : "left"}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${
          active ? "text-ink" : "hover:text-ink"
        }`}
        title={`Urutkan: ${label}`}
      >
        {label}
        <span className="tnum text-[9px]" aria-hidden="true">
          {active ? (dir === 1 ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </Th>
  );
}