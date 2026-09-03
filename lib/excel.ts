import * as XLSX from "xlsx";
import type { BahanStokSku } from "./types";
import { fmtDate } from "./format";

/* Workbook bahan & stok per SKU terpilih (dipisah per SKU). */
export function downloadBahanStokExcel(
  skus: BahanStokSku[],
  opts: { fetchedAt?: string | null; includeHistory?: boolean } = {},
) {
  const includeHistory = opts.includeHistory !== false;
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ["LAPORAN BAHAN TERPAKAI & STOK (GUDANG + GPU) - HIJRAH GIZI HEWANI"],
    ["Dicetak", new Date().toLocaleString("id-ID")],
    ["Stok per", opts.fetchedAt ? new Date(opts.fetchedAt).toLocaleString("id-ID") : "-"],
    [],
  ];
  for (const sku of skus) {
    aoa.push([
      `SKU ${sku.skuKode} - ${sku.skuNama}`,
      `${sku.nBatches} batch historis`,
      sku.latestBatch ? `Batch terakhir: ${sku.latestBatch} (${sku.latestTanggal ?? ""})` : "",
    ]);
    aoa.push([
      "Bahan",
      "Kode",
      "Qty dipakai batch terakhir",
      "Biaya batch terakhir (Rp)",
      "Total dipakai (semua batch)",
      "Total biaya (Rp)",
      "Terakhir dipakai",
      "Stok gudang (kg)",
      "Letak gudang",
      "Stok GPU (pcs)",
    ]);
    for (const r of sku.rows) {
      aoa.push([
        r.nama,
        r.kode,
        r.qtyTerakhir !== null ? Number(r.qtyTerakhir.toFixed(6)) : "-",
        r.biayaTerakhir !== null ? r.biayaTerakhir : "-",
        Number(r.qtyHistoris.toFixed(6)),
        r.biayaHistoris,
        fmtDate(r.lastDate),
        r.stokGudang,
        r.gudang.map((g) => `${g.nama}: ${g.qty}`).join("; "),
        r.stokGpu !== null ? r.stokGpu : "-",
      ]);
    }
    if (includeHistory) {
      const stokOf = new Map(sku.rows.map((r) => [r.kode, r.stokGudang]));
      aoa.push([]);
      aoa.push(["Riwayat pemakaian per batch (terbaru dulu)"]);
      aoa.push([
        "Tanggal produksi",
        "Batch",
        "Bahan",
        "Kode bahan",
        "Qty dipakai",
        "Biaya (Rp)",
        "Biaya satuan (Rp)",
        "Sisa stok (kg)",
      ]);
      for (const h of sku.history) {
        for (const it of h.items) {
          const satuan = it.qty > 0 ? it.biaya / it.qty : null;
          aoa.push([
            fmtDate(h.tanggal),
            h.batch_no,
            it.nama,
            it.kode,
            Number(it.qty.toFixed(6)),
            it.biaya,
            satuan != null ? Number(satuan.toFixed(2)) : "-",
            stokOf.get(it.kode) ?? "-",
          ]);
        }
      }
      aoa.push([]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Bahan & Stok");
  XLSX.writeFile(wb, `bahan-stok-${new Date().toISOString().slice(0, 10)}.xlsx`);
}