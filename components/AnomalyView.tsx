"use client";

import type { AnomalyRow } from "@/lib/types";
import { fmtDate, fmtNum } from "@/lib/format";
import { StatusBadge, NoteBadge, Th, Td } from "./ui";

const ANOMALY_LABEL: Record<string, string> = {
  HIGH_CUTTING_COST: "Biaya potong tinggi",
  LOW_YIELD: "Yield rendah",
  HIGH_HPP: "HPP tinggi",
};

export default function AnomalyView({
  anomalies,
  onOpenBatch,
  noteMap,
}: {
  anomalies: AnomalyRow[];
  onOpenBatch: (batchNo: string) => void;
  noteMap: Map<string, boolean>;
}) {
  if (anomalies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-3">
        Tidak ada anomali pada filter ini.
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
            <tr>
              <Th>Batch</Th>
              <Th>Tanggal</Th>
              <Th>Produk</Th>
              <Th>Jenis anomali</Th>
              <Th align="right">Aktual</Th>
              <Th align="right">Historis</Th>
              <Th align="right">Selisih</Th>
              <Th>Severity</Th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((a, i) => (
              <tr
                key={i}
                className="cursor-pointer border-t border-line/60 hover:bg-accent-soft/40"
                onClick={() => onOpenBatch(a.batch_no)}
              >
                <td className="px-3 py-1.5">
                  <span className="tnum font-mono text-xs font-semibold text-accent">
                    {a.batch_no}
                  </span>
                  {noteMap.get(a.batch_no) && (
                    <span className="ml-1.5 align-middle">
                      <NoteBadge />
                    </span>
                  )}
                </td>
                <Td mono muted>
                  {fmtDate(a.tanggal)}
                </Td>
                <td className="max-w-[200px] px-3 py-1.5">
                  <span
                    className="block truncate text-[13px] font-medium text-ink"
                    title={a.nama ?? undefined}
                  >
                    {a.nama ?? a.sku ?? "—"}
                  </span>
                </td>
                <Td>
                  <span className="text-[13px] font-medium text-ink">
                    {ANOMALY_LABEL[a.type] ?? a.type}
                  </span>
                </Td>
                <Td align="right" strong>
                  {fmtNum(a.current, 1)}
                </Td>
                <Td align="right" muted>
                  {a.historical != null ? fmtNum(a.historical, 1) : "-"}
                </Td>
                <td className="px-3 py-1.5 text-right">
                  {a.variance_pct != null ? (
                    <span
                      className={`tnum text-[12px] font-semibold ${
                        a.severity === "ANOMALY"
                          ? "text-red-600"
                          : a.severity === "WATCH"
                            ? "text-amber-600"
                            : "text-ink-3"
                      }`}
                    >
                      {a.variance_pct >= 0 ? "+" : ""}
                      {fmtNum(a.variance_pct, 1)}%
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-3">–</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge severity={a.severity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}