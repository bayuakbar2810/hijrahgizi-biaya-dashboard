import type { ReactNode } from "react";
import type { ProductType, Severity } from "@/lib/types";

export const SEVERITY_LABEL: Record<Severity, string> = {
  NORMAL: "Normal",
  WATCH: "Perlu Dicermati",
  ANOMALY: "Perlu Investigasi",
};

/* Tanda batch yang sudah punya catatan investigasi. */
export function NoteBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
      title="Batch ini punya catatan investigasi"
    >
      <span aria-hidden="true">📝</span> Catatan
    </span>
  );
}

export function StatusBadge({ severity }: { severity: Severity }) {
  const cls =
    severity === "ANOMALY"
      ? "bg-red-100 text-red-700"
      : severity === "WATCH"
        ? "bg-amber-100 text-amber-700"
        : "bg-out-soft text-out";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          severity === "ANOMALY"
            ? "bg-red-500"
            : severity === "WATCH"
              ? "bg-amber-500"
              : "bg-out"
        }`}
        aria-hidden="true"
      />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const PTYPE_STYLE: Record<ProductType, string> = {
  RAW_MATERIAL: "bg-in-soft text-in",
  PACKAGING: "bg-surface-2 text-ink-2",
  PROCESS_COST: "bg-total-soft text-total",
  BY_PRODUCT: "bg-surface-2 text-ink-2",
  FINISHED_PRODUCT: "bg-out-soft text-out",
  OTHER: "bg-surface-3 text-ink-3",
};

export const PTYPE_LABEL: Record<ProductType, string> = {
  RAW_MATERIAL: "Bahan mentah",
  PACKAGING: "Kemasan",
  PROCESS_COST: "Biaya proses",
  BY_PRODUCT: "By-product",
  FINISHED_PRODUCT: "Produk jadi (RTL)",
  OTHER: "Lainnya",
};

export function PTypeBadge({ product_type }: { product_type: ProductType }) {
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${PTYPE_STYLE[product_type]}`}
    >
      {PTYPE_LABEL[product_type]}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  accent,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  accent?: "in" | "out" | "total" | "accent" | "red";
  children: ReactNode;
  right?: ReactNode;
}) {
  const dot =
    accent === "in"
      ? "bg-in"
      : accent === "out"
        ? "bg-out"
        : accent === "total"
          ? "bg-total"
          : accent === "red"
            ? "bg-red-500"
            : "bg-accent";
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-panel)]">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <span className="text-[11px] text-ink-3">· {subtitle}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-ink-3">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
          <path
            d="M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {children}
    </section>
  );
}

export function SkeletonRows({ n = 5, h = "h-9" }: { n?: number; h?: string }) {
  return (
    <div className="space-y-2 py-1" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className={`${h} animate-pulse rounded-md bg-surface-3`}
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-2 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono,
  muted,
  accent,
  strong,
  tone,
}: {
  children: ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  muted?: boolean;
  accent?: boolean;
  strong?: boolean;
  tone?: "in" | "out" | "total";
}) {
  const cls = [
    "px-3 py-1.5 text-[13px]",
    align === "right" ? "text-right" : "text-left",
    mono ? "tnum font-mono text-xs" : "tnum",
    muted ? "text-ink-3" : "",
    accent ? "text-accent font-medium" : "",
    strong ? "font-semibold text-ink" : "",
    tone === "in" ? "text-in" : "",
    tone === "out" ? "text-out" : "",
    tone === "total" ? "text-total" : "",
    !muted && !accent && !strong && !tone ? "text-ink-2" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <td className={cls}>{children}</td>;
}