import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, AnomalyRow } from "./types";
import { fmtIDR, fmtNum, fmtPct, fmtDate } from "./format";

const BRAND: [number, number, number] = [15, 125, 148];
const BRAND_DARK: [number, number, number] = [10, 84, 100];
const INK: [number, number, number] = [42, 52, 60];
const GRAY: [number, number, number] = [112, 122, 130];
const LINE: [number, number, number] = [210, 220, 225];
const BAND: [number, number, number] = [232, 243, 246];
const RED: [number, number, number] = [186, 60, 50];
const AMBER: [number, number, number] = [186, 128, 40];
const GREEN: [number, number, number] = [39, 148, 104];

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

function sevColor(sev: string | undefined): [number, number, number] {
  if (sev === "ANOMALY") return RED;
  if (sev === "WATCH") return AMBER;
  return GREEN;
}

function fmtMetric(type: string, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  if (type === "LOW_YIELD") return fmtPct(v);
  return fmtIDR(v);
}

function penyebab(a: AnomalyRow): string {
  const dev =
    a.variance_pct === null || a.variance_pct === undefined
      ? ""
      : ` (deviasi ${fmtPct(a.variance_pct)} dari rata-rata)`;
  if (a.historical === null || a.historical === undefined) {
    return `Nilai ${fmtMetric(a.type, a.current)} — belum ada rata-rata historis untuk dibandingkan.`;
  }
  if (a.type === "LOW_YIELD") {
    return `Yield ${fmtPct(a.current)} lebih rendah dari rata-rata historis ${fmtPct(a.historical)}${dev}.`;
  }
  if (a.type === "HIGH_CUTTING_COST") {
    return `Biaya potong per kg ${fmtIDR(a.current)} lebih tinggi dari rata-rata historis ${fmtIDR(a.historical)}${dev}.`;
  }
  return `HPP ${fmtIDR(a.current)} lebih tinggi dari rata-rata historis ${fmtIDR(a.historical)}${dev}.`;
}

function drawBand(doc: jsPDF, title: string, subtitle: string, right: string) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 30, doc.internal.pageSize.getWidth(), 1.4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 14, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 14, 20);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(right, doc.internal.pageSize.getWidth() - 14, 13, { align: "right" });
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(14, h - 12, w - 14, h - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("Hijrah Gizihew · Laporan Rincian Temuan Analisis Biaya & Yield Produksi", 14, h - 8);
    doc.text(
      `Halaman ${i} dari ${pages} · Dihasilkan ${new Date().toLocaleString("id-ID")}`,
      w - 14,
      h - 8,
      { align: "right" },
    );
  }
}

function sectionTitle(doc: jsPDF, y: number, label: string): number {
  doc.setFillColor(...BAND);
  const w = doc.internal.pageSize.getWidth();
  doc.roundedRect(14, y - 4.6, w - 28, 8, 1.2, 1.2, "F");
  doc.setTextColor(...BRAND_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label, 17, y + 0.2);
  doc.setTextColor(...INK);
  return y + 7;
}

export function generateReportPdf(result: AnalysisResult) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const { meta } = result;

  const rangeLabel = meta?.from && meta?.to ? `${fmtDate(meta.from)} s/d ${fmtDate(meta.to)}` : "Semua periode";
  const now = new Date().toLocaleString("id-ID");

  drawBand(
    doc,
    "LAPORAN RINCIAN TEMUAN ANALISIS BIAYA & YIELD",
    "Hijrah Gizihew · Penyebab anomali per batch & SKU · Bahan diskusi",
    `Periode: ${rangeLabel}\nDibuat: ${now}`,
  );

  /* ---- Ringkasan singkat ---- */
  let y = 40;
  y = sectionTitle(doc, y, "Ringkasan");

  const anomalies = [...result.anomalies].sort((a, b) => {
    const batchCmp = a.batch_no.localeCompare(b.batch_no);
    if (batchCmp !== 0) return batchCmp;
    const r = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
    if (r !== 0) return r;
    return Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0);
  });

  const nBatchAnom = new Set(anomalies.map((a) => a.batch_no)).size;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(
    doc.splitTextToSize(
      `Ditemukan ${fmtNum(anomalies.length, 0)} temuan anomali pada ${fmtNum(nBatchAnom, 0)} batch ` +
        `dari ${fmtNum(meta?.n_rtl_batch ?? 0, 0)} batch RTL untuk periode ${rangeLabel}. ` +
        `Temuan dihitung terhadap rata-rata historis per SKU (biaya potong per kg, yield, dan HPP).`,
      w - 28,
    ),
    14,
    y + 2,
  );

  /* ---- Legenda jenis temuan ---- */
  y += 12;
  y = sectionTitle(doc, y, "Legenda Jenis Temuan");

  const legend = [
    "Biaya potong tinggi — biaya potong per kg batch melebihi rata-rata historis biaya potong per kg.",
    "Yield rendah — output RTL (kg) per batch di bawah rata-rata historis yield batch RTL.",
    "HPP tinggi — HPP per SKU melebihi rata-rata historis HPP SKU tersebut.",
    "Severity: ANOMALI = menyimpang signifikan · WATCH = perlu dicermati · NORMAL = dalam batas wajar.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(legend.join("  "), w - 28), 14, y + 2);

  /* ---- Rincian temuan ---- */
  y += 12;
  y = sectionTitle(doc, y, `Rincian Temuan (${fmtNum(anomalies.length, 0)})`);

  autoTable(doc, {
    startY: y + 4,
    head: [["Batch No.", "Tanggal", "SKU", "Nama Produk", "Jenis Temuan", "Penyebab", "Status"]],
    body: anomalies.map((a: AnomalyRow) => [
      a.batch_no,
      fmtDate(a.tanggal),
      a.sku ?? "-",
      a.nama ?? "-",
      ANOM_LABEL[a.type] ?? a.type,
      penyebab(a),
      SEV_LABEL[a.severity] ?? a.severity,
    ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.6, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 7.2, fontStyle: "bold" },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: {
      1: { halign: "center" },
      6: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const sev = anomalies[data.row.index]?.severity;
        data.cell.styles.textColor = sevColor(sev);
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;
  y += 6;

  /* ---- Catatan metodologi ---- */
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 24;
  }
  y = sectionTitle(doc, y, "Catatan");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  const notes = doc.splitTextToSize(
    "1. Nilai pembanding (rata-rata historis) dihitung dari batch RTL periode sebelumnya untuk SKU yang sama.  " +
      "2. Deviasi adalah selisih nilai saat ini terhadap rata-rata historis dalam persen.  " +
      "3. Untuk rincian input biaya, komposisi kemasan, dan data lengkap per batch, lihat aplikasi dashboard (tab Item RTL / Data mentah).",
    w - 28,
  );
  doc.text(notes, 14, y + 2);

  drawFooter(doc);

  const fname = `laporan-rincian-temuan-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`;
  doc.save(fname);
}