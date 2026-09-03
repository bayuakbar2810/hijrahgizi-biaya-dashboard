var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// lib/format.ts
function fmtIDR(v, exact = false) {
  if (v === null || v === void 0 || Number.isNaN(v)) return "-";
  return exact ? idrExact.format(v) : idr.format(v);
}
function fmtNum(v, digits = 2) {
  if (v === null || v === void 0 || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits
  }).format(v);
}
function fmtDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}
var idr, idrExact;
var init_format = __esm({
  "lib/format.ts"() {
    "use strict";
    idr = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    });
    idrExact = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
});

// lib/report.ts
var report_exports = {};
__export(report_exports, {
  generateBahanStokPdf: () => generateBahanStokPdf,
  generateReportPdf: () => generateReportPdf,
  selectTopAnomalies: () => selectTopAnomalies
});
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
function fmtPctVal(v, digits = 1) {
  if (v === null || v === void 0 || Number.isNaN(v)) return "-";
  return `${fmtNum(v, digits)}%`;
}
function familyKey(a) {
  const n = String(a.nama ?? "").trim().toUpperCase();
  if (n) {
    const words = n.split(/\s+/).slice(0, 4).join(" ");
    if (words) return words;
  }
  return String(a.sku ?? a.batch_no);
}
function selectTopAnomalies(result, n = 5) {
  const byType = /* @__PURE__ */ new Map();
  for (const a of result.anomalies) {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type).push(a);
  }
  const queues = [];
  for (const list of byType.values()) {
    const sorted = [...list].sort((a, b) => {
      const r = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
      if (r !== 0) return r;
      return Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0);
    });
    const seenBatch = /* @__PURE__ */ new Set();
    const seenFamily = /* @__PURE__ */ new Set();
    const q = [];
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
  const out2 = [];
  const usedBatches = /* @__PURE__ */ new Set();
  const usedFamilies = /* @__PURE__ */ new Set();
  let added = true;
  while (out2.length < n && added) {
    added = false;
    for (const q of queues) {
      if (out2.length >= n) break;
      while (q.length > 0) {
        const a = q.shift();
        const fam = familyKey(a);
        if (usedBatches.has(a.batch_no) || usedFamilies.has(fam)) continue;
        usedBatches.add(a.batch_no);
        usedFamilies.add(fam);
        out2.push(a);
        added = true;
        break;
      }
    }
  }
  return out2;
}
function sevColor(sev) {
  if (sev === "ANOMALY") return RED;
  if (sev === "WATCH") return AMBER;
  return GREEN;
}
function fmtMetric(type, v) {
  if (v === null || v === void 0 || Number.isNaN(v)) return "-";
  if (type === "LOW_YIELD") return fmtPctVal(v);
  return fmtIDR(v);
}
function penyebab(a) {
  if (a.historical === null || a.historical === void 0) {
    return `Nilai sekarang ${fmtMetric(a.type, a.current)} \u2014 belum ada rata-rata pembanding (data historis belum cukup).`;
  }
  const dev = a.variance_pct;
  const devAbs = dev == null ? "" : `${fmtNum(Math.abs(dev), 1)}%`;
  if (a.type === "LOW_YIELD") {
    return `Yield sekarang ${fmtPctVal(a.current)}, rata-rata biasanya ${fmtPctVal(a.historical)}${devAbs ? ` \u2014 lebih rendah ${devAbs}` : ""}.`;
  }
  if (a.type === "HIGH_CUTTING_COST") {
    return `Biaya potong per kg sekarang ${fmtIDR(a.current)}, rata-rata biasanya ${fmtIDR(a.historical)}${devAbs ? ` \u2014 lebih mahal ${devAbs}` : ""}.`;
  }
  return `HPP sekarang ${fmtIDR(a.current)}, rata-rata biasanya ${fmtIDR(a.historical)}${devAbs ? ` \u2014 lebih mahal ${devAbs}` : ""}.`;
}
function lineH(doc, factor = 1.35) {
  return doc.getFontSize() * 0.352778 * factor;
}
function drawWrapped(doc, text, x, y, maxW) {
  const lines = doc.splitTextToSize(text, maxW);
  const lh = lineH(doc);
  for (let i = 0; i < lines.length; i++) doc.text(lines[i], x, y + i * lh);
  return y + lines.length * lh;
}
function countWrapped(doc, text, maxW) {
  return doc.splitTextToSize(text, maxW).length;
}
function drawBand(doc, title, subtitle, periode, dibuat) {
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
function drawFooter(doc) {
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
    doc.text("Hijrah Gizi Hewani \xB7 Laporan Temuan Anomali Produksi", 14, h - 8);
    doc.text(
      `Halaman ${i} dari ${pages} \xB7 Dicetak ${(/* @__PURE__ */ new Date()).toLocaleString("id-ID")}`,
      w - 14,
      h - 8,
      { align: "right" }
    );
  }
}
function sectionTitle(doc, y, label) {
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
function lastY(doc, fallback) {
  return doc.lastAutoTable?.finalY ?? fallback;
}
function ensureSpace(doc, y, needed) {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - 18) {
    doc.addPage();
    return 22;
  }
  return y;
}
function kpiBox(doc, x, y, w, h, label, value) {
  doc.setDrawColor(...LINE);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const labelLines = doc.splitTextToSize(label.toUpperCase(), w - 8);
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
function drawEvidence(doc, yStart, idx, a, detail) {
  const w = doc.internal.pageSize.getWidth();
  const bw = (w - 28 - 8) / 3;
  let y = yStart;
  doc.setFillColor(...sevColor(a.severity));
  doc.roundedRect(14, y, w - 28, 8.5, 1.2, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `#${idx}  ${ANOM_LABEL[a.type] ?? a.type} \u2014 ${SEV_LABEL[a.severity] ?? a.severity}`,
    17,
    y + 5.7
  );
  y += 13;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y = drawWrapped(
    doc,
    `Batch ${a.batch_no} \xB7 ${fmtDate(a.tanggal)} \xB7 Produk: ${a.sku ?? "-"} \u2014 ${a.nama ?? "-"}`,
    14,
    y,
    w - 28
  ) + 3;
  const curLabel = a.type === "LOW_YIELD" ? "Yield sekarang" : a.type === "HIGH_CUTTING_COST" ? "Biaya potong / kg sekarang" : "HPP produk sekarang";
  kpiBox(doc, 14, y, bw, 20, curLabel, fmtMetric(a.type, a.current));
  kpiBox(doc, 14 + bw + 4, y, bw, 20, "Rata-rata biasanya", fmtMetric(a.type, a.historical));
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    20,
    "Selisih vs biasanya",
    a.variance_pct != null ? `${a.variance_pct >= 0 ? "+" : "-"}${fmtNum(Math.abs(a.variance_pct), 1)}%` : "-"
  );
  y += 24;
  if (!detail) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    y = drawWrapped(doc, "Rincian biaya batch tidak tersedia (gagal dimuat).", 14, y, w - 28) + 6;
    return y;
  }
  kpiBox(doc, 14, y, bw, 20, "Yield batch ini", fmtPctVal(detail.yield_pct));
  kpiBox(doc, 14 + bw + 4, y, bw, 20, "Hasil produksi", `${fmtNum(detail.total_rtl_output_kg, 1)} kg`);
  kpiBox(
    doc,
    14 + 2 * (bw + 4),
    y,
    bw,
    20,
    "Biaya potong / kg batch",
    detail.cost_potong_per_kg != null ? fmtIDR(detail.cost_potong_per_kg) : "-"
  );
  y += 26;
  y = ensureSpace(doc, y, 34);
  y = sectionTitle(doc, y, "Rincian 1 \u2014 Produk yang dihasilkan batch ini");
  autoTable(doc, {
    startY: y + 3,
    head: [["Kode", "Nama Produk", "Jumlah (kg)", "Total Biaya", "HPP per kg", "Selisih vs biasanya"]],
    body: detail.main_output.map((s) => [
      s.kode,
      s.nama,
      fmtNum(s.qty, 1),
      fmtIDR(s.biaya),
      fmtIDR(s.hpp),
      s.variance_pct != null ? `${s.variance_pct >= 0 ? "+" : "-"}${fmtNum(Math.abs(s.variance_pct), 1)}%` : "-"
    ]),
    foot: [
      [
        "",
        "TOTAL HASIL PRODUKSI",
        fmtNum(detail.total_rtl_output_kg, 1),
        fmtIDR(detail.main_output.reduce((s, x) => s + x.biaya, 0)),
        "",
        ""
      ]
    ],
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BRAND, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 16 }
  });
  y = lastY(doc, y) + 9;
  const totalInputBiaya = detail.inputs.reduce((s, x) => s + x.biaya, 0);
  const totalInputQty = detail.inputs.reduce((s, x) => s + x.qty, 0);
  y = ensureSpace(doc, y, 34);
  y = sectionTitle(doc, y, "Rincian 2 \u2014 Bahan & biaya terbesar pembentuk HPP");
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
    fmtIDR(i.biaya)
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
    headStyles: { fillColor: BRAND, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 14, right: 14, bottom: 16 }
  });
  y = lastY(doc, y) + 9;
  y = ensureSpace(doc, y, 28);
  y = sectionTitle(doc, y, "Rincian 3 \u2014 Ringkasan biaya per jenis & asal angka HPP");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const jenisLine = detail.input_summary.map(
    (s) => `${PTYPE_LABEL[s.product_type] ?? s.product_type}: ${fmtIDR(s.biaya)}${s.qty > 0 ? ` (${fmtNum(s.qty, 1)})` : ""}`
  ).join("   \xB7   ");
  y = drawWrapped(doc, jenisLine, 14, y + 2, w - 28) + 3;
  const hppGabungan = detail.total_rtl_output_kg > 0 ? totalInputBiaya / detail.total_rtl_output_kg : null;
  const hppText = `Asal angka HPP: total biaya bahan & proses ${fmtIDR(totalInputBiaya)} \xF7 hasil produksi ${fmtNum(detail.total_rtl_output_kg, 1)} kg = ${hppGabungan != null ? fmtIDR(hppGabungan) : "-"} per kg (HPP gabungan seluruh produk batch ini; HPP tiap produk ada di Rincian 1).`;
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
function generateReportPdf(result, evidence = [], mode = "lengkap") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const { meta } = result;
  const rangeLabel = meta?.from && meta?.to ? `${fmtDate(meta.from)} s/d ${fmtDate(meta.to)}` : "Semua periode";
  const now = (/* @__PURE__ */ new Date()).toLocaleString("id-ID");
  drawBand(
    doc,
    "LAPORAN TEMUAN ANOMALI PRODUKSI",
    "Hijrah Gizi Hewani \xB7 Ringkasan + 5 temuan utama dengan bukti \xB7 bahan diskusi",
    `Periode: ${rangeLabel}`,
    `Dicetak: ${now}`
  );
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
  const ringkasText = `Total ${fmtNum(anomalies.length, 0)} temuan anomali pada ${fmtNum(nBatchAnom, 0)} batch dari ${fmtNum(meta?.n_rtl_batch ?? 0, 0)} batch produksi RTL (periode ${rangeLabel}).` + (mode === "diskusi" ? " Laporan ringkas ini memuat ringkasan dan 5 temuan terpilih beserta bukti biayanya, sebagai bahan diskusi dengan divisi terkait." : " Laporan lengkap ini memuat ringkasan, 5 temuan terpilih beserta bukti biayanya, dan lampiran daftar seluruh temuan.");
  y = drawWrapped(doc, ringkasText, 14, y + 2, w - 28) + 5;
  y = ensureSpace(doc, y, 30);
  y = sectionTitle(doc, y, "Arti Istilah");
  const legend = [
    "Biaya potong tinggi = biaya potong per kg pada batch ini lebih mahal dari rata-rata biasanya.",
    "Yield rendah = hasil produksi (kg) batch ini lebih kecil dari biasanya bila dibanding input dagingnya.",
    "HPP tinggi = harga pokok produksi per kg produk lebih mahal dari rata-rata biasanya.",
    "Status: ANOMALI = penyimpangan besar \xB7 PERLU DICERMATI = sedikit menyimpang \xB7 NORMAL = masih wajar."
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const l of legend) {
    y = ensureSpace(doc, y, 10);
    y = drawWrapped(doc, `\u2022  ${l}`, 14, y + 2, w - 28) + 2;
  }
  if (evidence.length > 0) {
    doc.addPage();
    y = 22;
    y = sectionTitle(doc, y, "5 Temuan Utama \u2014 Bahan Diskusi");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    y = drawWrapped(
      doc,
      "Lima temuan terpilih \u2014 mewakili tiap jenis anomali, tanpa duplikasi produk, diurutkan dari penyimpangan terbesar. Setiap temuan disertai rincian bukti biaya batch-nya.",
      14,
      y + 2,
      w - 28
    ) + 6;
    for (let i = 0; i < evidence.length; i++) {
      y = ensureSpace(doc, y, 50);
      y = drawEvidence(doc, y, i + 1, evidence[i].anomaly, evidence[i].detail);
    }
  }
  if (mode === "lengkap") {
    doc.addPage();
    y = 22;
    y = sectionTitle(doc, y, `Lampiran \u2014 Daftar Semua Temuan (${fmtNum(anomalies.length, 0)})`);
    autoTable(doc, {
      startY: y + 4,
      head: [["Batch", "Tanggal", "Kode", "Nama Produk", "Jenis Temuan", "Penyebab", "Status"]],
      body: anomalies.map((a) => [
        a.batch_no,
        fmtDate(a.tanggal),
        a.sku ?? "-",
        a.nama ?? "-",
        ANOM_LABEL[a.type] ?? a.type,
        penyebab(a),
        SEV_LABEL[a.severity] ?? a.severity
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.6, textColor: INK },
      headStyles: { fillColor: BRAND, fontSize: 7.2, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: {
        1: { halign: "center" },
        6: { halign: "center" }
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const sev = anomalies[data.row.index]?.severity;
          data.cell.styles.textColor = sevColor(sev);
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 14, right: 14, bottom: 16 }
    });
    y = lastY(doc, y) + 6;
  }
  y = ensureSpace(doc, y, 24);
  y = sectionTitle(doc, y, "Catatan");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  const notes = [
    "1. Rata-rata biasanya dihitung dari batch produksi RTL sebelumnya untuk produk yang sama.",
    "2. Selisih = beda nilai sekarang terhadap rata-rata biasanya, dalam persen.",
    "3. HPP gabungan = total biaya bahan & proses batch \xF7 total hasil produksi (kg).",
    mode === "diskusi" ? "4. Daftar lengkap semua temuan tersedia pada versi lengkap laporan atau di aplikasi dashboard." : "4. Rincian interaktif per batch tersedia di aplikasi dashboard."
  ];
  for (const n of notes) {
    y = ensureSpace(doc, y, 8);
    y = drawWrapped(doc, n, 14, y + 2, w - 28) + 1.5;
  }
  drawFooter(doc);
  const fname = mode === "diskusi" ? `laporan-diskusi-top5-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf` : `laporan-lengkap-${(meta?.from ?? "awal").slice(0, 10)}-${(meta?.to ?? "akhir").slice(0, 10)}.pdf`;
  doc.save(fname);
}
function generateBahanStokPdf(skus, opts = {}) {
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
  doc.text("Hijrah Gizi Hewani \xB7 hanya bahan yang terdaftar di sheet stok \xB7 dipisah per SKU", 14, 19);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const totalRows = skus.reduce((s, x) => s + x.rows.length, 0);
  doc.text(
    `${skus.length} SKU \xB7 ${totalRows} baris bahan` + (opts.fetchedAt ? `
Stok per: ${new Date(opts.fetchedAt).toLocaleString("id-ID")}` : ""),
    w - 14,
    12,
    { align: "right" }
  );
  let y = 34;
  for (const sku of skus) {
    y = y > doc.internal.pageSize.getHeight() - 60 ? (doc.addPage(), 22) : y;
    doc.setFillColor(...BRAND_DARK);
    doc.roundedRect(14, y, w - 28, 8.5, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${sku.skuKode} \u2014 ${sku.skuNama}`, 17, y + 5.7);
    doc.setFontSize(7.5);
    doc.text(
      `${sku.nBatches} batch historis` + (sku.latestBatch ? ` \xB7 batch terakhir ${sku.latestBatch} (${fmtDate(sku.latestTanggal)})` : ""),
      w - 17,
      y + 5.7,
      { align: "right" }
    );
    y += 12;
    autoTable(doc, {
      startY: y,
      head: [["Bahan", "Kode", "Qty saat ini", "Qty historis", "Stok gudang", "Letak gudang", "Stok GPU", "Letak GPU"]],
      body: sku.rows.map((r) => [
        r.nama,
        r.kode,
        r.qtySekarang !== null ? fmtNum(r.qtySekarang, 1) : "-",
        fmtNum(r.qtyHistoris, 1),
        fmtNum(r.stokGudang, 0),
        r.gudang.map((g) => `${g.nama}: ${fmtNum(g.qty, 0)}`).join("; "),
        r.stokGpu !== null ? fmtNum(r.stokGpu, 0) : "-",
        r.gpu && r.gpu.length > 0 ? r.gpu.map((g) => `${g.nama}: ${fmtNum(g.qty, 0)}`).join("; ") : "kosong"
      ]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.4, textColor: INK },
      headStyles: { fillColor: BRAND, fontSize: 7.2, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        6: { halign: "right" }
      },
      didParseCell: (data) => {
        if (data.section === "body" && (data.column.index === 4 || data.column.index === 6)) {
          const r = sku.rows[data.row.index];
          if (r) {
            const v = data.column.index === 4 ? r.stokGudang : r.stokGpu ?? 0;
            data.cell.styles.textColor = v > 0 ? GREEN : RED;
          }
        }
      },
      margin: { left: 14, right: 14, bottom: 16 }
    });
    y = doc.lastAutoTable?.finalY ?? y;
    y += 10;
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
    doc.text("Hijrah Gizi Hewani \xB7 Laporan Bahan Terpakai & Stok (Gudang + GPU)", 14, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Halaman ${i} dari ${pages} \xB7 Dicetak ${(/* @__PURE__ */ new Date()).toLocaleString("id-ID")}`, w - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  doc.save(`bahan-stok-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`);
}
var BRAND, BRAND_DARK, INK, GRAY, LINE, BAND, RED, AMBER, GREEN, ANOM_LABEL, SEV_LABEL, SEV_RANK, PTYPE_LABEL;
var init_report = __esm({
  "lib/report.ts"() {
    "use strict";
    init_format();
    BRAND = [15, 125, 148];
    BRAND_DARK = [10, 84, 100];
    INK = [42, 52, 60];
    GRAY = [112, 122, 130];
    LINE = [210, 220, 225];
    BAND = [232, 243, 246];
    RED = [186, 60, 50];
    AMBER = [186, 128, 40];
    GREEN = [39, 148, 104];
    ANOM_LABEL = {
      HIGH_CUTTING_COST: "Biaya potong tinggi",
      LOW_YIELD: "Yield rendah (hasil produksi kecil)",
      HIGH_HPP: "HPP tinggi (produk kemahalan)"
    };
    SEV_LABEL = {
      ANOMALY: "Anomali",
      WATCH: "Perlu dicermati",
      NORMAL: "Normal"
    };
    SEV_RANK = { ANOMALY: 0, WATCH: 1, NORMAL: 2 };
    PTYPE_LABEL = {
      RAW_MATERIAL: "Bahan baku",
      PACKAGING: "Kemasan",
      PROCESS_COST: "Biaya proses",
      BY_PRODUCT: "Produk sampingan",
      FINISHED_PRODUCT: "Produk jadi",
      OTHER: "Lainnya"
    };
  }
});

// lib/excel.ts
var excel_exports = {};
__export(excel_exports, {
  downloadBahanStokExcel: () => downloadBahanStokExcel
});
import * as XLSX from "xlsx";
function downloadBahanStokExcel(skus, opts = {}) {
  const wb = XLSX.utils.book_new();
  const aoa = [
    ["LAPORAN BAHAN TERPAKAI & STOK (GUDANG + GPU) \u2014 HIJRAH GIZI HEWANI"],
    ["Dicetak", (/* @__PURE__ */ new Date()).toLocaleString("id-ID")],
    ["Stok per", opts.fetchedAt ? new Date(opts.fetchedAt).toLocaleString("id-ID") : "-"],
    []
  ];
  for (const sku of skus) {
    aoa.push([
      `SKU ${sku.skuKode} \u2014 ${sku.skuNama}`,
      `${sku.nBatches} batch historis`,
      sku.latestBatch ? `Batch terakhir: ${sku.latestBatch} (${sku.latestTanggal ?? ""})` : ""
    ]);
    aoa.push([
      "Bahan",
      "Kode",
      "Qty saat ini",
      "Qty historis",
      "Stok gudang",
      "Letak gudang",
      "Stok GPU",
      "Letak GPU"
    ]);
    for (const r of sku.rows) {
      aoa.push([
        r.nama,
        r.kode,
        r.qtySekarang !== null ? Number(r.qtySekarang.toFixed(2)) : "-",
        Number(r.qtyHistoris.toFixed(2)),
        r.stokGudang,
        r.gudang.map((g) => `${g.nama}: ${g.qty}`).join("; "),
        r.stokGpu !== null ? r.stokGpu : "-",
        r.gpu && r.gpu.length > 0 ? r.gpu.map((g) => `${g.nama}: ${g.qty}`).join("; ") : "kosong"
      ]);
    }
    aoa.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Bahan & Stok");
  XLSX.writeFile(wb, `bahan-stok-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`);
}
var init_excel = __esm({
  "lib/excel.ts"() {
    "use strict";
  }
});

// scripts/perskutest.mts
import fs from "fs";
var base = "http://localhost:3100";
var login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Admin", password: "Hijrah2026" }) });
var cookie = login.headers.get("set-cookie")?.split(";")[0];
var analysis = await (await fetch(base + "/api/analysis", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" })).json();
var items = analysis.sku_hist.slice(0, 2);
var lists = await Promise.all(items.map(async (i) => {
  const d = await (await fetch(`${base}/api/item-bahan?kode=${encodeURIComponent(i.kode)}`, { headers: { Cookie: cookie } })).json();
  return { sku: i, ...d };
}));
var kodeSet = /* @__PURE__ */ new Set();
for (const l of lists) {
  for (const b of l.bahan ?? []) kodeSet.add(b.kode);
  for (const c of l.current ?? []) kodeSet.add(c.kode);
}
var sd = await (await fetch(base + "/api/stok", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ kode: [...kodeSet] }) })).json();
var out = [];
for (const l of lists) {
  const cur = new Map((l.current ?? []).map((c) => [c.kode, Number(c.qty) || 0]));
  const hist = new Map((l.bahan ?? []).map((b) => [b.kode, b]));
  const rows = [];
  for (const k of /* @__PURE__ */ new Set([...cur.keys(), ...hist.keys()])) {
    const sB = sd.items[k];
    if (!sB) continue;
    const h = hist.get(k);
    rows.push({ kode: k, nama: h?.nama ?? "", qtySekarang: cur.has(k) ? cur.get(k) : null, qtyHistoris: h ? Number(h.total_qty) || 0 : 0, stokGudang: sB.total, gudang: sB.gudang, stokGpu: sd.gpu[l.sku.kode] ? sd.gpu[l.sku.kode].total : null, gpu: sd.gpu[l.sku.kode] ? sd.gpu[l.sku.kode].lokasi : null });
  }
  out.push({ skuKode: l.sku.kode, skuNama: l.sku.nama, nBatches: l.n_batches ?? 0, latestBatch: l.latest?.batch_no ?? null, latestTanggal: l.latest?.tanggal ?? null, rows: rows.sort((a, b) => (b.qtySekarang ?? -1) - (a.qtySekarang ?? -1)) });
}
for (const sku of out) {
  console.log(`
SKU ${sku.skuKode} \u2014 ${sku.skuNama} | ${sku.nBatches} batch | terakhir ${sku.latestBatch} (${sku.latestTanggal})`);
  for (const r of sku.rows.slice(0, 5)) console.log(`   ${r.kode} ${String(r.nama).slice(0, 26)} | sekarang=${r.qtySekarang ?? "-"} | historis=${r.qtyHistoris.toFixed(1)} | stok gudang=${r.stokGudang} | stok GPU=${r.stokGpu ?? "-"}`);
}
console.log("\nGPU data ada untuk SKU:", out.filter((s) => s.rows.some((r) => r.stokGpu !== null)).map((s) => s.skuKode).join(", ") || "(tidak ada di sheet GPU)");
var { generateBahanStokPdf: generateBahanStokPdf2 } = await Promise.resolve().then(() => (init_report(), report_exports));
var jsPDF2 = (await import("jspdf")).jsPDF;
jsPDF2.prototype.save = function(n) {
  fs.writeFileSync(n, Buffer.from(this.output("arraybuffer")));
};
var { downloadBahanStokExcel: downloadBahanStokExcel2 } = await Promise.resolve().then(() => (init_excel(), excel_exports));
generateBahanStokPdf2(out, { fetchedAt: sd.fetched_at });
downloadBahanStokExcel2(out, { fetchedAt: sd.fetched_at });
console.log("\nPDF & Excel dibuat");
