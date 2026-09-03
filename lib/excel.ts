import * as XLSX from "xlsx";
import type { AnalysisResult, AnomalyRow, SurveyEntry } from "./types";
import { fmtDate } from "./format";

const ANOM_LABEL: Record<string, string> = {
  HIGH_CUTTING_COST: "Biaya potong tinggi",
  LOW_YIELD: "Yield rendah",
  HIGH_HPP: "HPP tinggi",
};
const SEV_LABEL: Record<string, string> = {
  ANOMALY: "Anomali",
  WATCH: "Perlu dicermati",
  NORMAL: "Normal",
};
const SEV_RANK: Record<string, number> = { ANOMALY: 0, WATCH: 1, NORMAL: 2 };

function penyebab(a: AnomalyRow): string {
  if (a.historical === null || a.historical === undefined) {
    return `Nilai sekarang ${a.current} - belum ada rata-rata pembanding.`;
  }
  const devAbs = a.variance_pct == null ? "" : `${Math.abs(a.variance_pct).toFixed(1)}%`;
  if (a.type === "LOW_YIELD") {
    return `Yield sekarang ${a.current}%, rata-rata biasanya ${a.historical}%${devAbs ? ` - lebih rendah ${devAbs}` : ""}.`;
  }
  if (a.type === "HIGH_CUTTING_COST") {
    return `Biaya potong per kg sekarang ${a.current}, rata-rata biasanya ${a.historical}${devAbs ? ` - lebih mahal ${devAbs}` : ""}.`;
  }
  return `HPP sekarang ${a.current}, rata-rata biasanya ${a.historical}${devAbs ? ` - lebih mahal ${devAbs}` : ""}.`;
}

export function buildWorkbook(result: AnalysisResult, survey: SurveyEntry[] = []): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const { meta, kpi } = result;
  const rangeLabel = `${meta?.from ?? "awal"} s/d ${meta?.to ?? "akhir"}`;

  /* Ringkasan */
  const kpiRows: (string | number)[][] = [
    ["LAPORAN MINGGUAN ANALISIS BIAYA & YIELD PRODUKSI"],
    ["Hijrah Gizi Hewani"],
    ["Periode", rangeLabel],
    ["Dicetak", new Date().toLocaleString("id-ID")],
    [],
    ["Ringkasan", "Nilai"],
    ["Batch RTL", kpi.n_rtl_batch],
    ["Total output (kg)", kpi.total_rtl_output_kg],
    ["Rata-rata yield (%)", kpi.avg_yield_pct],
    ["Rata-rata biaya potong / kg (Rp)", kpi.avg_cost_potong_kg],
    ["Rata-rata kg / karton", kpi.avg_kg_karton],
    ["Rata-rata HPP (Rp)", kpi.avg_hpp],
    ["Batch terindikasi anomali", kpi.n_anomaly_batch],
    ["Item SKU anomali", kpi.n_anomaly_sku],
    [],
    ["Catatan", "Penjelasan"],
    ["Yield", "Output RTL (kg) dibagi input daging (kg), satuan persen."],
    ["HPP", "Harga pokok produksi per kg per SKU."],
    ["Anomali", "Penyimpangan terhadap rata-rata historis per SKU / batch."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), "Ringkasan");

  /* Temuan anomali */
  const anomalies = [...result.anomalies].sort(
    (a, b) =>
      a.batch_no.localeCompare(b.batch_no) ||
      (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1) ||
      Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0),
  );
  const anom: (string | number)[][] = [
    ["Batch", "Tanggal", "Kode", "Nama Produk", "Jenis Temuan", "Nilai Sekarang", "Rata-rata Biasanya", "Selisih (%)", "Status", "Penyebab"],
  ];
  for (const a of anomalies) {
    anom.push([
      a.batch_no,
      fmtDate(a.tanggal),
      a.sku ?? "-",
      a.nama ?? "-",
      ANOM_LABEL[a.type] ?? a.type,
      a.current,
      a.historical ?? "-",
      a.variance_pct != null ? Number(a.variance_pct.toFixed(2)) : "-",
      SEV_LABEL[a.severity] ?? a.severity,
      penyebab(a),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(anom), "Temuan");

  /* Survey harga kompetitor */
  const sv: (string | number)[][] = [
    ["Tanggal", "Kompetitor", "Produk", "Harga Kompetitor (Rp)", "Harga Hijrah (Rp)", "Gap (Rp)", "Gap (%)"],
  ];
  const svSorted = [...survey].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  for (const s of svSorted) {
    const gap = s.harga_kompetitor - s.harga_hijrah;
    const pct = s.harga_kompetitor > 0 ? (gap / s.harga_kompetitor) * 100 : null;
    sv.push([
      fmtDate(s.tanggal),
      s.kompetitor,
      s.produk,
      s.harga_kompetitor,
      s.harga_hijrah,
      gap,
      pct != null ? Number(pct.toFixed(2)) : "-",
    ]);
  }
  if (svSorted.length > 0) {
    const avgHk = svSorted.reduce((s, x) => s + x.harga_kompetitor, 0) / svSorted.length;
    const avgHh = svSorted.reduce((s, x) => s + x.harga_hijrah, 0) / svSorted.length;
    sv.push([]);
    sv.push([
      "RATA-RATA", "", "", Number(avgHk.toFixed(2)), Number(avgHh.toFixed(2)),
      Number((avgHk - avgHh).toFixed(2)),
      Number((((avgHk - avgHh) / avgHk) * 100).toFixed(2)),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sv), "Survey");

  /* Item SKU */
  const sku: (string | number)[][] = [
    ["Kode", "Nama Produk", "Jumlah Batch", "Qty Total (kg)", "Biaya Total (Rp)", "HPP Rata2 (Rp)", "HPP Min", "HPP Max", "Yield Rata2 (%)", "Cost Potong/kg (Rp)", "Kg/Karton", "Anomali", "Status"],
  ];
  for (const s of result.sku_hist) {
    sku.push([
      s.kode, s.nama, s.n_batch, s.total_qty, s.total_biaya,
      s.avg_hpp ?? "-", s.min_hpp ?? "-", s.max_hpp ?? "-",
      s.avg_yield_pct ?? "-", s.mode_cost_potong_kg ?? "-", s.avg_kg_karton ?? "-",
      s.n_anomaly, SEV_LABEL[s.severity] ?? s.severity,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sku), "Item SKU");

  /* Batch */
  const bat: (string | number)[][] = [
    ["Batch", "Tanggal", "Baris", "Output (kg)", "Yield (%)", "Biaya Potong/kg (Rp)", "Karton", "Kg/Karton", "Status"],
  ];
  for (const b of result.batches) {
    bat.push([
      b.batch_no, fmtDate(b.tanggal), b.n_rows, b.rtl_output_kg,
      b.yield_pct ?? "-", b.cost_potong_per_kg ?? "-", b.karton_pcs,
      b.kg_per_karton ?? "-", SEV_LABEL[b.status] ?? b.status,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bat), "Batch");

  const fname = `laporan-mingguan-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.xlsx`;
  return { wb, fname };
}

export function downloadExcelReport(result: AnalysisResult, survey: SurveyEntry[] = []) {
  const { wb, fname } = buildWorkbook(result, survey);
  XLSX.writeFile(wb, fname);
}