"use client";

import type { ReactNode } from "react";
import { fmtIDR, fmtNum } from "@/lib/format";

type Tone = "neutral" | "in" | "out" | "total" | "warn";

const TONES: Record<Tone, { chip: string; value: string; bar: string }> = {
  neutral: { chip: "bg-surface-2 text-ink-2", value: "text-ink", bar: "bg-ink-3" },
  in: { chip: "bg-in-soft text-in", value: "text-in", bar: "bg-in" },
  out: { chip: "bg-out-soft text-out", value: "text-out", bar: "bg-out" },
  total: { chip: "bg-total-soft text-total", value: "text-total", bar: "bg-total" },
  warn: { chip: "bg-amber-100 text-amber-700", value: "text-amber-700", bar: "bg-amber-500" },
};

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-4 pb-3 pt-3.5 shadow-[var(--shadow-panel)]">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} aria-hidden="true" />
      <div className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-2">
        {label}
      </div>
      <div className={`tnum mt-1.5 text-[1.35rem] font-bold leading-tight ${t.value}`}>
        {value}
      </div>
      {sub && <div className="tnum mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export type PrdKpi = {
  n_rtl_batch: number;
  total_rtl_output_kg: number;
  avg_cost_potong_kg: number | null;
  avg_yield_pct: number | null;
  avg_kg_karton: number | null;
  avg_hpp: number | null;
  n_anomaly_batch: number;
  n_anomaly_sku: number;
};

export default function KpiCards({ kpi }: { kpi: PrdKpi }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Metric
        label="Batch RTL"
        value={fmtNum(kpi.n_rtl_batch, 0)}
        sub="batch dengan SKU RTL"
        tone="neutral"
      />
      <Metric
        label="Output RTL"
        value={`${fmtNum(kpi.total_rtl_output_kg, 1)} KG`}
        sub="total penyelesaian RTL"
        tone="out"
      />
      <Metric
        label="Biaya potong / KG"
        value={kpi.avg_cost_potong_kg ? fmtIDR(kpi.avg_cost_potong_kg) : "-"}
        sub="rata-rata batch"
        tone="in"
      />
      <Metric
        label="Yield rata-rata"
        value={kpi.avg_yield_pct != null ? `${fmtNum(kpi.avg_yield_pct, 1)}%` : "-"}
        sub="output / input daging"
        tone="neutral"
      />
      <Metric
        label="KG / karton"
        value={kpi.avg_kg_karton != null ? fmtNum(kpi.avg_kg_karton, 2) : "-"}
        sub="target 10–15 KG"
        tone="neutral"
      />
      <Metric
        label="HPP rata-rata"
        value={kpi.avg_hpp ? fmtIDR(kpi.avg_hpp) : "-"}
        sub="per KG SKU RTL"
        tone="total"
      />
      <Metric
        label="Batch anomali"
        value={fmtNum(kpi.n_anomaly_batch, 0)}
        sub={`dari ${fmtNum(kpi.n_rtl_batch, 0)} batch`}
        tone={kpi.n_anomaly_batch > 0 ? "warn" : "out"}
      />
      <Metric
        label="SKU HPP anomali"
        value={fmtNum(kpi.n_anomaly_sku, 0)}
        sub="HPP menyimpang dari historis"
        tone={kpi.n_anomaly_sku > 0 ? "warn" : "out"}
      />
    </div>
  );
}