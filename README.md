# Dashboard Analisis Biaya Produksi â€” Hijrah Gizi Hewani

Aplikasi web untuk menganalisis **pembiayaan yang dikeluarkan** berdasarkan histori
pekerjaan/pesanan (file Excel) PT Hijrah Gizi Hewani. Fokus: rincian beban per pesanan
(batch) yang selesai, komposisi material/biaya, biaya per kategori pekerjaan, dan
perbandingan output vs input.

## Teknologi

| Komponen | Pilihan |
| --- | --- |
| Frontend & API | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| Grafik | Chart.js (ringan) via react-chartjs-2 |
| Database | PostgreSQL via **PGlite** (Postgres WASM, tanpa instalasi server) |
| Mesin analisis | Python FastAPI + pandas (service terpisah, port 8000) |
| Desain UI | Skill **Impeccable** (`.opencode/skills/impeccable`) â€” lihat `DESIGN.md` |

## Alur Data

```
File Excel (.xlsx)
      â”‚ upload
      â–¼
Next.js API (/api/datasets)
      â”‚ â”€â”€â–º Python service (/parse-excel)  â†’ parse & bersihkan data (pandas)
      â–¼
PGlite (PostgreSQL) â€” tabel datasets & transactions (permanen di folder /pgdata)
      â”‚
      â–¼
Analisis: Next.js ambil data â†’ Python /analyze â†’ hasil JSON
      â–¼
Dashboard (KPI, grafik, tabel batch, drilldown detail per batch)
```

## Menjalankan Aplikasi

Cara termudah â€” klik dua kali **`start-all.bat`**. Ia akan:
1. Menginstal dependensi Python & web jika belum ada.
2. Menjalankan service analisis Python di `http://127.0.0.1:8000`.
3. Menjalankan aplikasi web di `http://localhost:3000` dan membuka browser.

Manual (dua terminal):

```bash
# Terminal 1 â€” service analisis Python
cd py-service
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2 â€” aplikasi web
npm install
npm run dev
# buka http://localhost:3000
```

## Cara Pakai

1. **Upload Excel** â€” klik tombol `+ Upload Excel` di panel kiri, pilih file
   `histori_pekerjaan_pesanan_*.xlsx`. Data tersimpan permanen (Postgres/PGlite).
2. **Pilih dataset** â€” centang dataset yang ingin dianalisis (bisa lebih dari satu),
   atau `Pilih Semua`.
3. **Filter** â€” atur rentang tanggal dan kategori pekerjaan, lalu `Terapkan & Analisis`.
4. **Lihat hasil**:
   - **KPI cards**: total biaya, total input (barang dikeluarkan), total output
     (pesanan selesai), rasio output/input, jumlah batch & transaksi.
   - **Tren biaya** per bulan/hari (input vs output vs jumlah batch).
   - **Komposisi material & biaya** menurut jenis (Bahan Baku, Produk Jadi, Biaya
     Proses, Kemasan, Labeling, dll.).
   - **Perbandingan Input vs Output** per kategori pekerjaan.
   - **Output vs Input** untuk 20 batch terbesar.
   - **Tabel batch/pesanan** â€” klik baris batch untuk **drilldown rincian per
     material/biaya** dari batch tersebut.
5. Tab **Data Transaksi** â€” melihat data mentah (cari berdasarkan batch/bahan/kode).

## Struktur Proyek

```
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ page.tsx                 # Halaman dashboard
â”‚   â””â”€â”€ api/
â”‚       â”œâ”€â”€ datasets/route.ts    # Upload Excel (POST) & daftar dataset (GET)
â”‚       â”œâ”€â”€ datasets/[id]/route.ts  # Hapus dataset
â”‚       â”œâ”€â”€ analysis/route.ts    # Analisis biaya (POST)
â”‚       â”œâ”€â”€ batch-detail/route.ts   # Rincian per batch (POST)
â”‚       â”œâ”€â”€ transactions/route.ts   # Data transaksi mentah (GET)
â”‚       â””â”€â”€ kategori/route.ts    # Daftar kategori pekerjaan (GET)
â”œâ”€â”€ components/                  # Komponen UI dashboard
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ db.ts                    # Koneksi PGlite (Postgres WASM) + skema
â”‚   â”œâ”€â”€ python.ts                # Klien service analisis Python
â”‚   â”œâ”€â”€ query.ts                 # Pembangun filter SQL
â”‚   â”œâ”€â”€ types.ts                 # Tipe data
â”‚   â””â”€â”€ format.ts                # Format angka/IDR
â”œâ”€â”€ py-service/                  # Service analisis Python (FastAPI)
â”‚   â”œâ”€â”€ main.py                  # Endpoint /parse-excel, /analyze, /batch-detail
â”‚   â”œâ”€â”€ parser.py                # Parsing & pembersihan Excel (pandas)
â”‚   â”œâ”€â”€ analysis.py              # Perhitungan analisis biaya
â”‚   â””â”€â”€ start.bat                # Menjalankan service Python
â”œâ”€â”€ pgdata/                      # Data PostgreSQL (PGlite) â€” jangan dihapus
â”œâ”€â”€ start-all.bat                # Menjalankan semuanya sekali klik
â””â”€â”€ next.config.ts               # serverExternalPackages utk PGlite
```

## Catatan

- **PGlite** adalah PostgreSQL asli yang dikompilasi ke WebAssembly. Data tersimpan
  permanen di folder `pgdata/` (jangan dihapus). Hapus folder tersebut hanya jika
  ingin mengosongkan seluruh data.
- Service Python **harus aktif** agar upload & analisis berfungsi (indikator
  "Service Analisis aktif/offline" di pojok kanan atas dashboard).
- Baris subtotal (`Total Batch No.`) dari file Excel otomatis dibuang saat parsing
  agar tidak menggandakan angka biaya.
- Untuk konfigurasi lanjut: ubah `PY_SERVICE_URL` (env) bila service Python
  dipindah alamat.

## Konsep Biaya yang Digunakan

- **Input (Pengeluaran Barang)**: biaya bahan/biaya proses yang dikeluarkan untuk
  mengerjakan pesanan (mis. bahan baku, biaya potong, kemasan).
- **Output (Penyelesaian Pesanan)**: nilai penyelesaian pesanan / produk jadi.
- **Total biaya** = input + output per baris transaksi.
- **Rasio Output/Input** = output Ã· input. Nilai â‰¥ 100% menandakan nilai hasil lebih
  besar daripada beban yang dikeluarkan.

## Desain UI

Dikerjakan dengan skill **Impeccable** (`npx skills add pbakaus/impeccable`), mode
*Operate*. Sistem token (OKLCH), tipografi, komponen, dan keadaan terdokumentasi di
**`DESIGN.md`**. Untuk audit/perbaikan berikutnya: `/audit`, `/polish`, `/typeset`.