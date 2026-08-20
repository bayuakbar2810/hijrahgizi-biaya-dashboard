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

function drawBand(doc: jsPDF, title: string, subtitle: string, right: string) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 30, doc.internal.pageSize.getWidth(), 1.4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
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
    doc.text(
      "Hijrah Gizihew · Laporan Analisis Biaya & Yield Produksi",
      14,
      h - 8,
    );
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

function kpiBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sub?: string,
) {
  doc.setDrawColor(...LINE);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(label.toUpperCase(), x + 4, y + 7);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(value, x + 4, y + 15);
  if (sub) {
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(sub, x + 4, y + 21);
  }
}

export function generateReportPdf(result: AnalysisResult) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const { meta, kpi } = result;

  const rangeLabel = meta?.from && meta?.to ? `${fmtDate(meta.from)} s/d ${fmtDate(meta.to)}` : "Semua periode";
  const now = new Date().toLocaleString("id-ID");

  drawBand(
    doc,
    "LAPORAN ANALISIS BIAYA & YIELD PRODUKSI",
    "Hijrah Gizihew · Bahan diskusi · Ringkasan hasil temuan analisis",
    `Periode: ${rangeLabel}\nDibuat: ${now}`,
  );

  /* ---- Ringkasan eksekutif (KPI) ---- */
  let y = 40;
  y = sectionTitle(doc, y, "Ringkasan Eksekutif");

  const boxW = (w - 28 - 8) / 3;
  const boxH = 24;
  const gap = 4;
  const bx = 14;
  kpiBox(doc, bx, y, boxW, boxH, "Batch RTL", fmtNum(kpi.n_rtl_batch, 0));
  kpiBox(doc, bx + (boxW + gap), y, boxW, boxH, "Total Output", `${fmtNum(kpi.total_rtl_output_kg, 1)} kg`);
  kpiBox(doc, bx + 2 * (boxW + gap), y, boxW, boxH, "Rata-rata Yield", fmtPct(kpi.avg_yield_pct));
  kpiBox(doc, bx, y + boxH + gap, boxW, boxH, "Biaya Potong / kg", fmtIDR(kpi.avg_cost_potong_kg));
  kpiBox(doc, bx + (boxW + gap), y + boxH + gap, boxW, boxH, "Kg / Karton", fmtNum(kpi.avg_kg_karton, 2));
  kpiBox(doc, bx + 2 * (boxW + gap), y + boxH + gap, boxW, boxH, "Rata-rata HPP", fmtIDR(kpi.avg_hpp));

  y += 2 * (boxH + gap) + 8;
  doc.setDrawColor(...LINE);
  doc.setFillColor(...BAND);
  doc.roundedRect(14, y, w - 28, 14, 1.5, 1.5, "FD");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const anomNote =
    `${fmtNum(kpi.n_anomaly_batch, 0)} batch terindikasi anomali ` +
    `(biaya potong / yield / HPP) dari ${fmtNum(meta?.n_rtl_batch ?? 0, 0)} batch RTL, ` +
    `dan ${fmtNum(kpi.n_anomaly_sku, 0)} item SKU tercatat anomali pada periode ${rangeLabel}.`;
  doc.text(doc.splitTextToSize(anomNote, w - 36), 17, y + 6);
  y += 20;

  /* ---- Temuan utama ---- */
  y = sectionTitle(doc, y, "Temuan Utama (Anomali)");

  const anomalies = [...result.anomalies].sort((a, b) => {
    const r = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
    if (r !== 0) return r;
    return Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0);
  });
  const cap = 80;
  const shown = anomalies.slice(0, cap);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(
    doc.splitTextToSize(
      shown.length > 0
        ? `Tabel berikut menampilkan ${fmtNum(shown.length, 0)} temuan paling signifikan dari ${fmtNum(anomalies.length, 0)} total temuan pada periode ${rangeLabel}, diurutkan berdasarkan tingkat severity dan besar deviasi dari rata-rata historis.`
        : "Tidak ada temuan anomali pada periode ini.",
      w - 28,
    ),
    14,
    y + 2,
  );

  if (shown.length > 0) {
    autoTable(doc, {
      startY: y + 9,
      head: [["Tanggal", "Batch", "SKU", "Nama Produk", "Jenis Temuan", "Nilai", "Rata-rata Historis", "Deviasi", "Status"]],
      body: shown.map((a: AnomalyRow) => [
        fmtDate(a.tanggal),
        a.batch_no,
        a.sku ?? "-",
        a.nama ?? "-",
        ANOM_LABEL[a.type] ?? a.type,
        fmtMetric(a.type, a.current),
        fmtMetric(a.type, a.historical),
        a.variance_pct === null || a.variance_pct === undefined ? "-" : fmtPct(a.variance_pct),
        SEV_LABEL[a.severity] ?? a.severity,
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.6, textColor: INK },
      headStyles: { fillColor: BRAND, fontSize: 7.2, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: {
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 8) {
          const sev = shown[data.row.index]?.severity;
          data.cell.styles.textColor = sevColor(sev);
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 14, right: 14, bottom: 16 },
    });
  }
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y + 12;
  y += 6;

  /* ---- Lampiran A: rincian item (SKU) ---- */
  y = sectionTitle(doc, y, "Lampiran A — Rincian Item (SKU)");

  autoTable(doc, {
    startY: y + 5,
    head: [
      ["Kode", "Nama Produk", "Batch", "Qty Total", "Biaya Total", "HPP Rata2", "HPP Min", "HPP Max", "Yield Rata2", "Cost Potong/kg", "Kg/Karton", "Anomali", "Status"],
    ],
    body: result.sku_hist.map((s) => [
      s.kode,
      s.nama,
      fmtNum(s.n_batch, 0),
      fmtNum(s.total_qty, 1),
      fmtIDR(s.total_biaya),
      fmtIDR(s.avg_hpp),
      fmtIDR(s.min_hpp),
      fmtIDR(s.max_hpp),
      fmtPct(s.avg_yield_pct),
      fmtIDR(s.mode_cost_potong_kg),
      fmtNum(s.avg_kg_karton, 2),
      fmtNum(s.n_anomaly, 0),
      SEV_LABEL[s.severity] ?? s.severity,
    ]),
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 1.4, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 6.8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right" },
      11: { halign: "center" },
      12: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 12) {
        data.cell.styles.textColor = sevColor(result.sku_hist[data.row.index]?.severity);
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y + 8;
  y += 6;

  /* ---- Lampiran B: rincian batch ---- */
  y = sectionTitle(doc, y, "Lampiran B — Rincian Batch");

  autoTable(doc, {
    startY: y + 5,
    head: [
      ["Batch No.", "Tanggal", "Baris", "Output (kg)", "Yield", "Biaya Potong/kg", "Karton", "Kg/Karton", "Status"],
    ],
    body: result.batches.map((b) => [
      b.batch_no,
      fmtDate(b.tanggal),
      fmtNum(b.n_rows, 0),
      fmtNum(b.rtl_output_kg, 1),
      fmtPct(b.yield_pct),
      fmtIDR(b.cost_potong_per_kg),
      fmtNum(b.karton_pcs, 0),
      fmtNum(b.kg_per_karton, 2),
      SEV_LABEL[b.status] ?? b.status,
    ]),
    theme: "grid",
    styles: { fontSize: 6.2, cellPadding: 1.2, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 6.5, fontStyle: "bold" },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 8) {
        data.cell.styles.textColor = sevColor(result.batches[data.row.index]?.status);
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y + 8;
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
    "1. Yield dihitung sebagai rasio output RTL terhadap input daging pada batch yang sama.  " +
      "2. Biaya potong per kg dibandingkan dengan rata-rata historis batch RTL sebelumnya; deviasi dihitung terhadap rata-rata tersebut.  " +
      "3. Kg/karton dievaluasi terhadap spesifikasi kemasan; penyimpangan signifikan ditandai sebagai temuan.  " +
      "4. Severity dibagi menjadi NORMAL, WATCH (perlu dicermati), dan ANOMALY.  " +
      "5. Laporan ini dihasilkan otomatis dari data produksi yang tersimpan; rincian per batch dapat dilihat pada aplikasi dashboard.",
    w - 28,
  );
  doc.text(notes, 14, y + 2);

  drawFooter(doc);

  const fname = `laporan-analisis-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`;
  doc.save(fname);
}