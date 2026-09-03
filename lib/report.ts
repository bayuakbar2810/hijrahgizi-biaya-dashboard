import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, AnomalyRow, BatchDetail, BahanStokSku } from "./types";
import { fmtIDR, fmtNum, fmtDate } from "./format";

/* Yield dari analisis sudah dalam satuan persen (mis. 100 = 100%) â€” jangan dikali lagi. */
function fmtPctVal(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${fmtNum(v, digits)}%`;
}

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
  LOW_YIELD: "Yield rendah (hasil produksi kecil)",
  HIGH_HPP: "HPP tinggi (produk kemahalan)",
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

export type ReportMode = "diskusi" | "lengkap";

/* Kunci famil produk: 4 kata pertama nama (upper) â€” varian ukuran/rasa dihitung satu. */
function familyKey(a: AnomalyRow): string {
  const n = String(a.nama ?? "").trim().toUpperCase();
  if (n) {
    const words = n.split(/\s+/).slice(0, 4).join(" ");
    if (words) return words;
  }
  return String(a.sku ?? a.batch_no);
}

/*
 * Pilihan Top-N untuk bahan diskusi: diseimbangkan antar JENIS anomali
 * (round-robin per jenis, urut severity & besar deviasi) dan bebas duplikasi
 * batch maupun famil produk, agar tiap jenis terwakili.
 */
export function selectTopAnomalies(result: AnalysisResult, n = 5): AnomalyRow[] {
  const byType = new Map<string, AnomalyRow[]>();
  for (const a of result.anomalies) {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type)!.push(a);
  }

  const queues: AnomalyRow[][] = [];
  for (const list of byType.values()) {
    const sorted = [...list].sort((a, b) => {
      const r = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
      if (r !== 0) return r;
      return Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0);
    });
    const seenBatch = new Set<string>();
    const seenFamily = new Set<string>();
    const q: AnomalyRow[] = [];
    for (const a of sorted) {
      const fam = familyKey(a);
      if (seenBatch.has(a.batch_no) || seenFamily.has(fam)) continue;
      seenBatch.add(a.batch_no);
      seenFamily.add(fam);
      q.push(a);
    }
    queues.push(q);
  }
  queues.sort((qa, qb) => {
    const ea = qa[0];
    const eb = qb[0];
    if (!ea) return 1;
    if (!eb) return -1;
    const r = (SEV_RANK[ea.severity] ?? 1) - (SEV_RANK[eb.severity] ?? 1);
    if (r !== 0) return r;
    return Math.abs(eb.variance_pct ?? 0) - Math.abs(ea.variance_pct ?? 0);
  });

  const out: AnomalyRow[] = [];
  const usedBatches = new Set<string>();
  const usedFamilies = new Set<string>();
  let added = true;
  while (out.length < n && added) {
    added = false;
    for (const q of queues) {
      if (out.length >= n) break;
      while (q.length > 0) {
        const a = q.shift()!;
        const fam = familyKey(a);
        if (usedBatches.has(a.batch_no) || usedFamilies.has(fam)) continue;
        usedBatches.add(a.batch_no);
        usedFamilies.add(fam);
        out.push(a);
        added = true;
        break;
      }
    }
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
  if (type === "LOW_YIELD") return fmtPctVal(v);
  return fmtIDR(v);
}

/* Narasi penyebab â€” bahasa sederhana, arah penyimpangan dijelaskan dengan kata. */
function penyebab(a: AnomalyRow): string {
  if (a.historical === null || a.historical === undefined) {
    return `Nilai sekarang ${fmtMetric(a.type, a.current)} â€” belum ada rata-rata pembanding (data historis belum cukup).`;
  }
  const dev = a.variance_pct;
  const devAbs = dev == null ? "" : `${fmtNum(Math.abs(dev), 1)}%`;
  if (a.type === "LOW_YIELD") {
    return `Yield sekarang ${fmtPctVal(a.current)}, rata-rata biasanya ${fmtPctVal(a.historical)}${devAbs ? ` â€” lebih rendah ${devAbs}` : ""}.`;
  }
  if (a.type === "HIGH_CUTTING_COST") {
    return `Biaya potong per kg sekarang ${fmtIDR(a.current)}, rata-rata biasanya ${fmtIDR(a.historical)}${devAbs ? ` â€” lebih mahal ${devAbs}` : ""}.`;
  }
  return `HPP sekarang ${fmtIDR(a.current)}, rata-rata biasanya ${fmtIDR(a.historical)}${devAbs ? ` â€” lebih mahal ${devAbs}` : ""}.`;
}

/* ---- util tata letak: teks dengan tinggi baris terkontrol (anti tumpang tindih) ---- */

function lineH(doc: jsPDF, factor = 1.35): number {
  return doc.getFontSize() * 0.352778 * factor;
}

function drawWrapped(doc: jsPDF, text: string, x: number, y: number, maxW: number): number {
  const lines = doc.splitTextToSize(text, maxW) as string[];
  const lh = lineH(doc);
  for (let i = 0; i < lines.length; i++) doc.text(lines[i], x, y + i * lh);
  return y + lines.length * lh;
}

function countWrapped(doc: jsPDF, text: string, maxW: number): number {
  return (doc.splitTextToSize(text, maxW) as string[]).length;
}

function drawBand(doc: jsPDF, title: string, subtitle: string, periode: string, dibuat: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 30, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 30, w, 1.4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.text(title, 14, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 14, 20.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(periode, w - 14, 11.5, { align: "right" });
  doc.text(dibuat, w - 14, 17.5, { align: "right" });
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
    doc.text("Hijrah Gizi Hewani Â· Laporan Temuan Anomali Produksi", 14, h - 8);
    doc.text(
      `Halaman ${i} dari ${pages} Â· Dicetak ${new Date().toLocaleString("id-ID")}`,
      w - 14,
      h - 8,
      { align: "right" },
    );
  }
}

function sectionTitle(doc: jsPDF, y: number, label: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BAND);
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

/* Kotak nilai: label + angka. Ukuran font angka menyusut otomatis bila panjang. */
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
  doc.setFontSize(7);
  const labelLines = doc.splitTextToSize(label.toUpperCase(), w - 8) as string[];
  let ly = y + 5.5;
  for (const ln of labelLines.slice(0, 2)) {
    doc.text(ln, x + 4, ly);
    ly += lineH(doc, 1.25);
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  let vs = 11.5;
  doc.setFontSize(vs);
  while (doc.getTextWidth(value) > w - 8 && vs > 6.5) {
    vs -= 0.5;
    doc.setFontSize(vs);
  }
  doc.text(value, x + 4, y + h - 4.5);
}

/* ---- halaman bukti per temuan ---- */

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

  /* pita judul temuan */
  doc.setFillColor(...sevColor(a.severity));
  doc.roundedRect(14, y, w - 28, 8.5, 1.2, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `#${idx}  ${ANOM_LABEL[a.type] ?? a.type} â€” ${SEV_LABEL[a.severity] ?? a.severity}`,
    17,
    y + 5.7,
  );
  y += 13;

  /* info temuan (tinggi dinamis) */
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y =
    drawWrapped(
      doc,
      `Batch ${a.batch_no} Â· ${fmtDate(a.tanggal)} Â· Produk: ${a.sku ?? "-"} â€” ${a.nama ?? "-"}`,
      14,
      y,
      w - 28,
    ) + 3;

  /* kotak angka utama â€” label menyesuaikan jenis anomali */
  const curLabel =
    a.type === "LOW_YIELD"
      ? "Yield sekarang"
      : a.type === "HIGH_CUTTING_COST"
        ? "Biaya potong / kg sekarang"
        : "HPP produk sekarang";
  kpiBox(doc, 14, y, bw, 20, curLabel, fmtMetric(a.type, a.current));
  kpiBox(doc, 14 + bw + 4, y, bw, 20, "Rata-rata biasanya", fmtMetric(a.type, a.historical));
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    20,
    "Selisih vs biasanya",
    a.variance_pct != null ? `${a.variance_pct >= 0 ? "+" : "-"}${fmtNum(Math.abs(a.variance_pct), 1)}%` : "-",
  );
  y += 24;

  if (!detail) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    y = drawWrapped(doc, "Rincian biaya batch tidak tersedia (gagal dimuat).", 14, y, w - 28) + 6;
    return y;
  }

  /* kotak konteks batch */
  kpiBox(doc, 14, y, bw, 20, "Yield batch ini", fmtPctVal(detail.yield_pct));
  kpiBox(doc, 14 + bw + 4, y, bw, 20, "Hasil produksi", `${fmtNum(detail.total_rtl_output_kg, 1)} kg`);
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    20,
    "Biaya potong / kg batch",
    detail.cost_potong_per_kg != null ? fmtIDR(detail.cost_potong_per_kg) : "-",
  );
  y += 26;

  /* Rincian 1: produk yang dihasilkan */
  y = ensureSpace(doc, y, 34);
  y = sectionTitle(doc, y, "Rincian 1 â€” Produk yang dihasilkan batch ini");
  autoTable(doc, {
    startY: y + 3,
    head: [["Kode", "Nama Produk", "Jumlah (kg)", "Total Biaya", "HPP per kg", "Selisih vs biasanya"]],
    body: detail.main_output.map((s) => [
      s.kode,
      s.nama,
      fmtNum(s.qty, 1),
      fmtIDR(s.biaya),
      fmtIDR(s.hpp),
      s.variance_pct != null
        ? `${s.variance_pct >= 0 ? "+" : "-"}${fmtNum(Math.abs(s.variance_pct), 1)}%`
        : "-",
    ]),
    foot: [
      [
        "",
        "TOTAL HASIL PRODUKSI",
        fmtNum(detail.total_rtl_output_kg, 1),
        fmtIDR(detail.main_output.reduce((s, x) => s + x.biaya, 0)),
        "",
        "",
      ],
    ],
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = lastY(doc, y) + 9;

  /* Rincian 2: bahan & biaya terbesar */
  const totalInputBiaya = detail.inputs.reduce((s, x) => s + x.biaya, 0);
  const totalInputQty = detail.inputs.reduce((s, x) => s + x.qty, 0);
  y = ensureSpace(doc, y, 34);
  y = sectionTitle(doc, y, "Rincian 2 â€” Bahan & biaya terbesar pembentuk HPP");
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
    head: [["Kode", "Nama Bahan / Biaya", "Jenis", "Jumlah", "Biaya"]],
    body: inputBody,
    foot: [["", "TOTAL SEMUA BIAYA", "", fmtNum(totalInputQty, 1), fmtIDR(totalInputBiaya)]],
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = lastY(doc, y) + 9;

  /* Rincian 3: ringkasan per jenis + hitungan HPP */
  y = ensureSpace(doc, y, 28);
  y = sectionTitle(doc, y, "Rincian 3 â€” Ringkasan biaya per jenis & asal angka HPP");
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
    .join("   Â·   ");
  y = drawWrapped(doc, jenisLine, 14, y + 2, w - 28) + 3;

  const hppGabungan =
    detail.total_rtl_output_kg > 0 ? totalInputBiaya / detail.total_rtl_output_kg : null;
  const hppText =
    `Asal angka HPP: total biaya bahan & proses ${fmtIDR(totalInputBiaya)} Ã· hasil produksi ` +
    `${fmtNum(detail.total_rtl_output_kg, 1)} kg = ${hppGabungan != null ? fmtIDR(hppGabungan) : "-"} per kg ` +
    `(HPP gabungan seluruh produk batch ini; HPP tiap produk ada di Rincian 1).`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const hLines = countWrapped(doc, hppText, w - 34);
  const boxH = 7 + hLines * lineH(doc, 1.3);
  y = ensureSpace(doc, y, boxH + 4);
  doc.setFillColor(...BAND);
  doc.roundedRect(14, y, w - 28, boxH, 1.5, 1.5, "F");
  doc.setTextColor(...BRAND_DARK);
  y = drawWrapped(doc, hppText, 17, y + 5, w - 34) + 6;
  doc.setTextColor(...INK);
  return y + 4;
}

export function generateReportPdf(
  result: AnalysisResult,
  evidence: ReportEvidence[] = [],
  mode: ReportMode = "lengkap",
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const { meta } = result;

  const rangeLabel = meta?.from && meta?.to ? `${fmtDate(meta.from)} s/d ${fmtDate(meta.to)}` : "Semua periode";
  const now = new Date().toLocaleString("id-ID");

  drawBand(
    doc,
    "LAPORAN TEMUAN ANOMALI PRODUKSI",
    "Hijrah Gizi Hewani Â· Ringkasan + 5 temuan utama dengan bukti Â· bahan diskusi",
    `Periode: ${rangeLabel}`,
    `Dicetak: ${now}`,
  );

  /* ---- Ringkasan ---- */
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
  const ringkasText =
    `Total ${fmtNum(anomalies.length, 0)} temuan anomali pada ${fmtNum(nBatchAnom, 0)} batch ` +
    `dari ${fmtNum(meta?.n_rtl_batch ?? 0, 0)} batch produksi RTL (periode ${rangeLabel}).` +
    (mode === "diskusi"
      ? " Laporan ringkas ini memuat ringkasan dan 5 temuan terpilih beserta bukti biayanya, sebagai bahan diskusi dengan divisi terkait."
      : " Laporan lengkap ini memuat ringkasan, 5 temuan terpilih beserta bukti biayanya, dan lampiran daftar seluruh temuan.");
  y = drawWrapped(doc, ringkasText, 14, y + 2, w - 28) + 5;

  /* ---- Arti istilah ---- */
  y = ensureSpace(doc, y, 30);
  y = sectionTitle(doc, y, "Arti Istilah");
  const legend = [
    "Biaya potong tinggi = biaya potong per kg pada batch ini lebih mahal dari rata-rata biasanya.",
    "Yield rendah = hasil produksi (kg) batch ini lebih kecil dari biasanya bila dibanding input dagingnya.",
    "HPP tinggi = harga pokok produksi per kg produk lebih mahal dari rata-rata biasanya.",
    "Status: ANOMALI = penyimpangan besar Â· PERLU DICERMATI = sedikit menyimpang Â· NORMAL = masih wajar.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const l of legend) {
    y = ensureSpace(doc, y, 10);
    y = drawWrapped(doc, `â€¢  ${l}`, 14, y + 2, w - 28) + 2;
  }

  /* ---- 5 temuan utama + bukti ---- */
  if (evidence.length > 0) {
    doc.addPage();
    y = 22;
    y = sectionTitle(doc, y, "5 Temuan Utama â€” Bahan Diskusi");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    y =
      drawWrapped(
        doc,
        "Lima temuan terpilih â€” mewakili tiap jenis anomali, tanpa duplikasi produk, diurutkan dari penyimpangan terbesar. Setiap temuan disertai rincian bukti biaya batch-nya.",
        14,
        y + 2,
        w - 28,
      ) + 6;
    for (let i = 0; i < evidence.length; i++) {
      y = ensureSpace(doc, y, 50);
      y = drawEvidence(doc, y, i + 1, evidence[i].anomaly, evidence[i].detail);
    }
  }

  /* ---- Lampiran: semua temuan (hanya mode lengkap) ---- */
  if (mode === "lengkap") {
    doc.addPage();
    y = 22;
    y = sectionTitle(doc, y, `Lampiran â€” Daftar Semua Temuan (${fmtNum(anomalies.length, 0)})`);

    autoTable(doc, {
      startY: y + 4,
      head: [["Batch", "Tanggal", "Kode", "Nama Produk", "Jenis Temuan", "Penyebab", "Status"]],
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
      headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7.2, fontStyle: "bold" },
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
  }

  /* ---- Catatan ---- */
  y = ensureSpace(doc, y, 24);
  y = sectionTitle(doc, y, "Catatan");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  const notes = [
    "1. Rata-rata biasanya dihitung dari batch produksi RTL sebelumnya untuk produk yang sama.",
    "2. Selisih = beda nilai sekarang terhadap rata-rata biasanya, dalam persen.",
    "3. HPP gabungan = total biaya bahan & proses batch Ã· total hasil produksi (kg).",
    mode === "diskusi"
      ? "4. Daftar lengkap semua temuan tersedia pada versi lengkap laporan atau di aplikasi dashboard."
      : "4. Rincian interaktif per batch tersedia di aplikasi dashboard.",
  ];
  for (const n of notes) {
    y = ensureSpace(doc, y, 8);
    y = drawWrapped(doc, n, 14, y + 2, w - 28) + 1.5;
  }

  drawFooter(doc);

  const fname =
    mode === "diskusi"
      ? `laporan-diskusi-top5-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`
      : `laporan-lengkap-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`;
  doc.save(fname);
}


/* Laporan bahan terpakai & stok (gudang + GPU), dipisah per SKU terpilih. */
export function generateBahanStokPdf(
  skus: BahanStokSku[],
  opts: { fetchedAt?: string | null; includeHistory?: boolean } = {},
) {
  const includeHistory = opts.includeHistory !== false;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 26, "F");
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 26, w, 1.4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("LAPORAN BAHAN TERPAKAI & STOK (GUDANG + GPU)", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Hijrah Gizi Hewani · hanya bahan yang terdaftar di sheet stok · dipisah per SKU", 14, 19);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const totalRows = skus.reduce((s, x) => s + x.rows.length, 0);
  doc.text(
    `${skus.length} SKU · ${totalRows} baris bahan` +
      (opts.fetchedAt ? `\nStok per: ${new Date(opts.fetchedAt).toLocaleString("id-ID")}` : ""),
    w - 14,
    12,
    { align: "right" },
  );

  let y = 34;
  for (const sku of skus) {
    /* header SKU */
    y = y > doc.internal.pageSize.getHeight() - 70 ? (doc.addPage(), 22) : y;
    doc.setFillColor(...BRAND_DARK);
    doc.roundedRect(14, y, w - 28, 8.5, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${sku.skuKode} — ${sku.skuNama}`, 17, y + 5.7);
    doc.setFontSize(7.5);
    doc.text(
      `${sku.nBatches} batch historis` +
        (sku.latestBatch ? ` · batch terakhir ${sku.latestBatch} (${fmtDate(sku.latestTanggal)})` : ""),
      w - 17,
      y + 5.7,
      { align: "right" },
    );
    y += 12;

    /* tabel bahan utama */
    autoTable(doc, {
      startY: y,
      head: [["Bahan", "Kode", "Qty dipakai batch terakhir", "Total dipakai (semua batch)", "Terakhir dipakai", "Stok gudang", "Letak gudang", "Stok GPU"]],
      body: sku.rows.map((r) => [
        r.nama,
        r.kode,
        r.qtyTerakhir !== null ? fmtNum(r.qtyTerakhir, 1) : "-",
        fmtNum(r.qtyHistoris, 1),
        fmtDate(r.lastDate),
        fmtNum(r.stokGudang, 0),
        r.gudang.map((g) => `${g.nama}: ${fmtNum(g.qty, 0)}`).join("; "),
        r.stokGpu !== null ? fmtNum(r.stokGpu, 0) : "-",
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.4, textColor: INK },
      headStyles: { fillColor: BRAND, textColor: 255, fontSize: 7.2, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        5: { halign: "right" },
        7: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && (data.column.index === 5 || data.column.index === 7)) {
          const r = sku.rows[data.row.index];
          if (r) {
            const v = data.column.index === 5 ? r.stokGudang : (r.stokGpu ?? 0);
            data.cell.styles.textColor = v > 0 ? GREEN : RED;
          }
        }
      },
      margin: { left: 14, right: 14, bottom: 16 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 8;

    const stokOf = new Map(sku.rows.map((r) => [r.kode, r.stokGudang]));
    /* riwayat pemakaian per batch */
    if (includeHistory) {
    y = y > doc.internal.pageSize.getHeight() - 50 ? (doc.addPage(), 22) : y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(`Riwayat pemakaian per batch (terbaru dulu)`, 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Tanggal produksi", "Batch", "Jml bahan", "Bahan dipakai", "Sisa stok di gudang"]],
      body: sku.history.map((h) => [
        fmtDate(h.tanggal),
        h.batch_no,
        String(h.items.length),
        h.items.map((it) => `${it.nama} (${it.kode}) = ${it.qty.toFixed(1)}`).join(" | "),
        h.items.map((it) => `${it.kode}: ${stokOf.get(it.kode) ?? "-"}`).join(" | "),
      ]),
      theme: "grid",
      styles: { fontSize: 6.8, cellPadding: 1.2, textColor: INK },
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontSize: 7, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BAND },
      margin: { left: 14, right: 14, bottom: 16 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 10;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(14, doc.internal.pageSize.getHeight() - 12, w - 14, doc.internal.pageSize.getHeight() - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("Hijrah Gizi Hewani · Laporan Bahan Terpakai & Stok (Gudang + GPU)", 14, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Halaman ${i} dari ${pages} · Dicetak ${new Date().toLocaleString("id-ID")}`, w - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }

  doc.save(`bahan-stok-${new Date().toISOString().slice(0, 10)}.pdf`);
}
