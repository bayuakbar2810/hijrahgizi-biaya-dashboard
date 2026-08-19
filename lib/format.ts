const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const idrExact = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtIDR(v: number | null | undefined, exact = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return exact ? idrExact.format(v) : idr.format(v);
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
  }).format(v);
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${(v * 100).toFixed(2)}%`;
}

export function shortIDR(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const abs = Math.abs(v);
  const suffix = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${suffix}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${suffix}${(abs / 1e9).toFixed(2)} M`;
  if (abs >= 1e6) return `${suffix}${(abs / 1e6).toFixed(1)} jt`;
  if (abs >= 1e3) return `${suffix}${(abs / 1e3).toFixed(0)} rb`;
  return `${suffix}${abs.toFixed(0)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}