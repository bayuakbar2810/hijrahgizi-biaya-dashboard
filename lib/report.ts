import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, AnomalyRow, BatchDetail } from "./types";
import { fmtIDR, fmtNum, fmtPct, fmtDate } from "./format";
import { INVESTIGATION_GUIDE } from "./investigation";

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

const PTYPE_LABEL: Record<string, string> = {
  RAW_MATERIAL: "Bahan baku",
  PACKAGING: "Kemasan",
  PROCESS_COST: "Biaya proses",
  BY_PRODUCT: "Produk sampingan",
  FINISHED_PRODUCT: "Produk jadi",
  OTHER: "Lainnya",
};

export type ReportEvidence = {
  anomaly: AnomalyRow;
  detail: BatchDetail | null;
};

export function selectTopAnomalies(result: AnalysisResult, n = 5): AnomalyRow[] {
  const sorted = [...result.anomalies].sort((a, b) => {
    const r = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
    if (r !== 0) return r;
    return Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0);
  });
  const out: AnomalyRow[] = [];
  const seenBatches = new Set<string>();
  for (const a of sorted) {
    if (seenBatches.has(a.batch_no)) continue;
    seenBatches.add(a.batch_no);
    out.push(a);
    if (out.length >= n) break;
  }
  return out;
}

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

function lastY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - 18) {
    doc.addPage();
    return 22;
  }
  return y;
}

function kpiBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  doc.setDrawColor(...LINE);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(label.toUpperCase(), x + 4, y + 6.5);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(value, x + 4, y + 14);
}

function drawEvidence(
  doc: jsPDF,
  yStart: number,
  idx: number,
  a: AnomalyRow,
  detail: BatchDetail | null,
): number {
  const w = doc.internal.pageSize.getWidth();
  const bw = (w - 28 - 8) / 3;
  let y = yStart;

  /* header strip */
  doc.setFillColor(...sevColor(a.severity));
  doc.roundedRect(14, y, w - 28, 8.5, 1.2, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `#${idx}  ${ANOM_LABEL[a.type] ?? a.type} — ${SEV_LABEL[a.severity] ?? a.severity}`,
    17,
    y + 5.7,
  );
  y += 12;

  /* info line */
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    doc.splitTextToSize(
      `Batch ${a.batch_no} · ${fmtDate(a.tanggal)} · SKU ${a.sku ?? "-"} — ${a.nama ?? "-"}`,
      w - 28,
    ),
    14,
    y,
  );
  y += 5.5;

  /* metric boxes: aktual / historis / deviasi */
  kpiBox(doc, 14, y, bw, 18, "Nilai aktual", fmtMetric(a.type, a.current));
  kpiBox(doc, 14 + bw + 4, y, bw, 18, "Rata-rata historis", fmtMetric(a.type, a.historical));
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    18,
    "Deviasi",
    a.variance_pct != null ? fmtPct(a.variance_pct) : "-",
  );
  y += 22;

  if (!detail) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("Rincian komposisi batch tidak tersedia (batch-detail gagal dimuat).", 14, y);
    return y + 8;
  }

  /* boxes row 2: konteks batch */
  const totalInputBiaya = detail.inputs.reduce((s, x) => s + x.biaya, 0);
  const totalInputQty = detail.inputs.reduce((s, x) => s + x.qty, 0);
  const hppGabungan =
    detail.total_rtl_output_kg > 0 ? totalInputBiaya / detail.total_rtl_output_kg : null;
  kpiBox(doc, 14, y, bw, 18, "Yield batch", detail.yield_pct != null ? fmtPct(detail.yield_pct) : "-");
  kpiBox(
    doc,
    14 + bw + 4,
    y,
    bw,
    18,
    "Output RTL",
    `${fmtNum(detail.total_rtl_output_kg, 1)} kg`,
  );
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    18,
    "Biaya potong / kg",
    detail.cost_potong_per_kg != null ? fmtIDR(detail.cost_potong_per_kg) : "-",
  );
  y += 24;

  /* bukti 1: output RTL */
  y = sectionTitle(doc, y, `Bukti 1 — Output RTL batch (asal HPP)`);
  autoTable(doc, {
    startY: y + 3,
    head: [["SKU", "Nama Produk", "Qty (kg)", "Biaya", "HPP / kg", "vs Historis"]],
    body: detail.main_output.map((s) => [
      s.kode,
      s.nama,
      fmtNum(s.qty, 1),
      fmtIDR(s.biaya),
      fmtIDR(s.hpp),
      s.variance_pct != null ? fmtPct(s.variance_pct) : "-",
    ]),
    foot: [
      [
        "",
        "TOTAL OUTPUT RTL",
        fmtNum(detail.total_rtl_output_kg, 1),
        fmtIDR(detail.main_output.reduce((s, x) => s + x.biaya, 0)),
        "",
        "",
      ],
    ],
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = lastY(doc, y) + 8;

  /* bukti 2: input bahan & biaya */
  y = ensureSpace(doc, y, 30);
  y = sectionTitle(doc, y, "Bukti 2 — Input bahan & biaya (komponen terbesar HPP)");
  const inputsSorted = [...detail.inputs].sort((a2, b2) => b2.biaya - a2.biaya);
  const topInputs = inputsSorted.slice(0, 12);
  const rest = inputsSorted.slice(12);
  const restBiaya = rest.reduce((s, x) => s + x.biaya, 0);
  const restQty = rest.reduce((s, x) => s + x.qty, 0);
  const inputBody = topInputs.map((i) => [
    i.kode || "-",
    i.nama,
    PTYPE_LABEL[i.product_type] ?? i.product_type,
    i.qty > 0 ? fmtNum(i.qty, 1) : "-",
    fmtIDR(i.biaya),
  ]);
  if (rest.length > 0) {
    inputBody.push(["", `Lainnya (${rest.length} item)`, "", fmtNum(restQty, 1), fmtIDR(restBiaya)]);
  }
  autoTable(doc, {
    startY: y + 3,
    head: [["Kode", "Nama Item", "Jenis", "Qty", "Biaya"]],
    body: inputBody,
    foot: [["", "TOTAL INPUT", "", fmtNum(totalInputQty, 1), fmtIDR(totalInputBiaya)]],
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = lastY(doc, y) + 8;

  /* bukti 3: ringkasan per jenis + HPP gabungan */
  y = ensureSpace(doc, y, 22);
  y = sectionTitle(doc, y, "Bukti 3 — Ringkasan per jenis input & HPP gabungan");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const jenisLine = detail.input_summary
    .map(
      (s) =>
        `${PTYPE_LABEL[s.product_type] ?? s.product_type}: ${fmtIDR(s.biaya)}${
          s.qty > 0 ? ` (${fmtNum(s.qty, 1)})` : ""
        }`,
    )
    .join("   ·   ");
  doc.text(doc.splitTextToSize(jenisLine, w - 28), 14, y + 2);
  y += 8;
  doc.setFillColor(...BAND);
  doc.roundedRect(14, y, w - 28, 11, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(
    doc.splitTextToSize(
      `Asal HPP: total biaya input ${fmtIDR(totalInputBiaya)} ÷ output RTL ${fmtNum(
        detail.total_rtl_output_kg,
        1,
      )} kg = ${hppGabungan != null ? `${fmtIDR(hppGabungan)}/kg` : "-"} (HPP gabungan batch).`,
      w - 34,
    ),
    17,
    y + 4,
  );
  y += 16;

  /* fokus diskusi */
  y = ensureSpace(doc, y, 26);
  y = sectionTitle(doc, y, "Fokus diskusi / investigasi");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const bullets = INVESTIGATION_GUIDE[a.type] ?? [];
  for (const b of bullets) {
    const lines = doc.splitTextToSize(`- ${b}`, w - 30);
    y = ensureSpace(doc, y, lines.length * 4 + 2);
    doc.text(lines, 17, y + 2);
    y += lines.length * 4 + 2.5;
  }
  return y + 4;
}

export function generateReportPdf(result: AnalysisResult, evidence: ReportEvidence[] = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const { meta } = result;

  const rangeLabel = meta?.from && meta?.to ? `${fmtDate(meta.from)} s/d ${fmtDate(meta.to)}` : "Semua periode";
  const now = new Date().toLocaleString("id-ID");

  drawBand(
    doc,
    "LAPORAN RINCIAN TEMUAN ANALISIS BIAYA & YIELD",
    "Hijrah Gizihew · Ringkasan umum + Top 5 anomali (bahan diskusi divisi terkait)",
    `Periode: ${rangeLabel}\nDibuat: ${now}`,
  );

  /* ---- Ringkasan umum ---- */
  let y = 40;
  y = sectionTitle(doc, y, "Ringkasan Umum");

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
        `Laporan ini terdiri dari ringkasan umum, 5 anomali teratas dengan bukti pendukung untuk bahan diskusi, ` +
        `serta lampiran rincian seluruh temuan.`,
      w - 28,
    ),
    14,
    y + 2,
  );

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

  /* ---- Top 5 anomali + bukti ---- */
  if (evidence.length > 0) {
    doc.addPage();
    let ey = 24;
    ey = sectionTitle(doc, ey, "Top 5 Anomali — Bahan Diskusi (dengan bukti)");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(
      doc.splitTextToSize(
        "Lima anomali paling signifikan (satu per batch, diurutkan severity & besar deviasi) berikut disertai bukti komposisi biaya batch untuk dibahas bersama divisi terkait.",
        w - 28,
      ),
      14,
      ey + 2,
    );
    ey += 10;
    for (let i = 0; i < evidence.length; i++) {
      ey = ensureSpace(doc, ey, 46);
      ey = drawEvidence(doc, ey, i + 1, evidence[i].anomaly, evidence[i].detail);
    }
  }

  /* ---- Lampiran: rincian semua temuan ---- */
  doc.addPage();
  y = 24;
  y = sectionTitle(doc, y, `Lampiran — Rincian Semua Temuan (${fmtNum(anomalies.length, 0)})`);

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
  y = lastY(doc, y) + 6;

  /* ---- Catatan ---- */
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
      "3. HPP gabungan = total biaya input batch ÷ total output RTL batch; HPP per SKU memperhitungkan alokasi biaya masing-masing.  " +
      "4. Untuk rincian lengkap per batch, lihat aplikasi dashboard (tab Item RTL / Anomali / Data mentah).",
    w - 28,
  );
  doc.text(notes, 14, y + 2);

  drawFooter(doc);

  const fname = `laporan-rincian-temuan-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`;
  doc.save(fname);
}