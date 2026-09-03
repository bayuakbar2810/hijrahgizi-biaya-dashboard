import * as XLSX from "xlsx";
import type { BahanStokSku } from "./types";
import { fmtDate } from "./format";

/* Workbook bahan terpakai & stok untuk SKU terpilih. */

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
      "Bahan", "Kode", "Qty saat ini", "Qty historis",
      "Stok gudang", "Letak gudang", "Stok GPU", "Letak GPU",
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
        r.gpu && r.gpu.length > 0 ? r.gpu.map((g) => `${g.nama}: ${g.qty}`).join("; ") : "kosong",
      ]);
    }
    aoa.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Bahan & Stok");
  XLSX.writeFile(wb, `bahan-stok-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
