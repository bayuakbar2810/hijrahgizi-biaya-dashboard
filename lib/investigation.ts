export const INVESTIGATION_GUIDE: Record<string, string[]> = {
  HIGH_CUTTING_COST: [
    "Tarif jasa potong / vendor naik dibanding periode lain.",
    "Efisiensi potong menurun (banyak sisa / potongan tidak optimal).",
    "Output RTL batch ini kecil padahal biaya potong tetap (penyebut kecil).",
    "Ada biaya proses yang salah dialokasikan ke batch ini.",
    "Cek: panel Biaya proses (baris PROCESS_COST) & validasi tarif vendor.",
  ],
  LOW_YIELD: [
    "Input daging lebih besar dari standar (berat kotor, es/air, bahan beku).",
    "Susut saat proses (kebocoran, overcook, trimming berlebihan).",
    "Ada output yang tidak tercatat / tidak di-SKU-kan (buang, contoh, sisa).",
    "Penimbangan input/output kurang akurat.",
    "Cek: perbandingan input daging vs output, dan kelengkapan pencatatan output.",
  ],
  HIGH_HPP: [
    "Harga bahan baku naik (harga daging / bahan penolong).",
    "Yield rendah di batch ini (otomatis menaikkan HPP per KG).",
    "Alokasi biaya bersama tidak proporsional antar SKU.",
    "Komposisi produk (berat isi) tidak sesuai standar.",
    "Cek: harga beli bahan, rasio yield, dan alokasi biaya ke tiap SKU.",
  ],
};