import * as XLSX from "xlsx";
import type { BahanStokRow } from "./types";
import { fmtDate } from "./format";

/* Workbook bahan terpakai & stok untuk SKU terpilih. */
export function downloadBahanStokExcel(
  rows: BahanStokRow[],
  opts: { fetchedAt?: string | null } = {},
) {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ["LAPORAN BAHAN TERPAKAI & STOK GUDANG — HIJRAH GIZI HEWANI"],
    ["Dicetak", new Date().toLocaleString("id-ID")],
    ["Stok per", opts.fetchedAt ? new Date(opts.fetchedAt).toLocaleString("id-ID") : "-"],
    [],
    [
      "SKU",
      "Nama SKU",
      "Kode Bahan",
      "Nama Bahan",
      "Jml Batch",
      "Total Qty",
      "Total Biaya (Rp)",
      "Terakhir Dipakai",
      "Stok Total",
      "Letak Gudang",
    ],
  ];
  for (const r of rows) {
    aoa.push([
      r.skuKode,
      r.skuNama,
      r.kode,
      r.nama,
      r.nBatch,
      Number(r.qty.toFixed(2)),
      r.biaya,
      fmtDate(r.lastDate),
      r.stokTotal,
      r.gudang.map((g) => `${g.nama}: ${g.qty}`).join("; "),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Bahan & Stok");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `bahan-stok-${today}.xlsx`);
}