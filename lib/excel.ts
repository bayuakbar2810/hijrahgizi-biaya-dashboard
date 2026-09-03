import * as XLSX from "xlsx";
import type { BahanStokSku } from "./types";
import { fmtDate } from "./format";

/* Workbook bahan & stok per SKU terpilih (dipisah per SKU). */
export function downloadBahanStokExcel(
  skus: BahanStokSku[],
  opts: { fetchedAt?: string | null } = {},
) {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ["LAPORAN BAHAN TERPAKAI & STOK (GUDANG + GPU) — HIJRAH GIZI HEWANI"],
    ["Dicetak", new Date().toLocaleString("id-ID")],
    ["Stok per", opts.fetchedAt ? new Date(opts.fetchedAt).toLocaleString("id-ID") : "-"],
    [],
  ];
  for (const sku of skus) {
    aoa.push([
      `SKU ${sku.skuKode} — ${sku.skuNama}`,
      `${sku.nBatches} batch historis`,
      sku.latestBatch ? `Batch terakhir: ${sku.latestBatch} (${sku.latestTanggal ?? ""})` : "",
    ]);
    aoa.push([
      "Bahan",
      "Kode",
      "Qty dipakai batch terakhir",
      "Total dipakai (semua batch)",
      "Terakhir dipakai",
      "Stok gudang",
      "Letak gudang",
      "Stok GPU",
    ]);
    for (const r of sku.rows) {
      aoa.push([
        r.nama,
        r.kode,
        r.qtyTerakhir !== null ? Number(r.qtyTerakhir.toFixed(2)) : "-",
        Number(r.qtyHistoris.toFixed(2)),
        fmtDate(r.lastDate),
        r.stokGudang,
        r.gudang.map((g) => `${g.nama}: ${g.qty}`).join("; "),
        r.stokGpu !== null ? r.stokGpu : "-",
      ]);
    }
    aoa.push([]);
    aoa.push(["Riwayat pemakaian per batch (terbaru dulu)"]);
    aoa.push(["Tanggal produksi", "Batch", "Bahan dipakai (nama (kode) = qty)"]);
    for (const h of sku.history) {
      aoa.push([
        fmtDate(h.tanggal),
        h.batch_no,
        h.items.map((it) => `${it.nama} (${it.kode}) = ${it.qty.toFixed(1)}`).join(" | "),
      ]);
    }
    aoa.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Bahan & Stok");
  XLSX.writeFile(wb, `bahan-stok-${new Date().toISOString().slice(0, 10)}.xlsx`);
}