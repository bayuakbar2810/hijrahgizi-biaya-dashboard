# Dashboard Analisis Biaya Produksi — Hijrah Gizihew

Aplikasi web untuk menganalisis **pembiayaan yang dikeluarkan** berdasarkan histori
pekerjaan/pesanan (file Excel) PT Hijrah Gizihew. Fokus: rincian beban per pesanan
(batch) yang selesai, komposisi material/biaya, biaya per kategori pekerjaan, dan
perbandingan output vs input.

## Teknologi

| Komponen | Pilihan |
| --- | --- |
| Frontend & API | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| Grafik | Chart.js (ringan) via react-chartjs-2 |
| Database | PostgreSQL via **PGlite** (Postgres WASM, tanpa instalasi server) |
| Mesin analisis | Python FastAPI + pandas (service terpisah, port 8000) |
| Desain UI | Skill **Impeccable** (`.opencode/skills/impeccable`) — lihat `DESIGN.md` |

## Alur Data

```
File Excel (.xlsx)
      │ upload
      ▼
Next.js API (/api/datasets)
      │ ──► Python service (/parse-excel)  → parse & bersihkan data (pandas)
      ▼
PGlite (PostgreSQL) — tabel datasets & transactions (permanen di folder /pgdata)
      │
      ▼
Analisis: Next.js ambil data → Python /analyze → hasil JSON
      ▼
Dashboard (KPI, grafik, tabel batch, drilldown detail per batch)
```

## Menjalankan Aplikasi

Cara termudah — klik dua kali **`start-all.bat`**. Ia akan:
1. Menginstal dependensi Python & web jika belum ada.
2. Menjalankan service analisis Python di `http://127.0.0.1:8000`.
3. Menjalankan aplikasi web di `http://localhost:3000` dan membuka browser.

Manual (dua terminal):

```bash
# Terminal 1 — service analisis Python
cd py-service
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2 — aplikasi web
npm install
npm run dev
# buka http://localhost:3000
```

## Cara Pakai

1. **Upload Excel** — klik tombol `+ Upload Excel` di panel kiri, pilih file
   `histori_pekerjaan_pesanan_*.xlsx`. Data tersimpan permanen (Postgres/PGlite).
2. **Pilih dataset** — centang dataset yang ingin dianalisis (bisa lebih dari satu),
   atau `Pilih Semua`.
3. **Filter** — atur rentang tanggal dan kategori pekerjaan, lalu `Terapkan & Analisis`.
4. **Lihat hasil**:
   - **KPI cards**: total biaya, total input (barang dikeluarkan), total output
     (pesanan selesai), rasio output/input, jumlah batch & transaksi.
   - **Tren biaya** per bulan/hari (input vs output vs jumlah batch).
   - **Komposisi material & biaya** menurut jenis (Bahan Baku, Produk Jadi, Biaya
     Proses, Kemasan, Labeling, dll.).
   - **Perbandingan Input vs Output** per kategori pekerjaan.
   - **Output vs Input** untuk 20 batch terbesar.
   - **Tabel batch/pesanan** — klik baris batch untuk **drilldown rincian per
     material/biaya** dari batch tersebut.
5. Tab **Data Transaksi** — melihat data mentah (cari berdasarkan batch/bahan/kode).

## Struktur Proyek

```
├── app/
│   ├── page.tsx                 # Halaman dashboard
│   └── api/
│       ├── datasets/route.ts    # Upload Excel (POST) & daftar dataset (GET)
│       ├── datasets/[id]/route.ts  # Hapus dataset
│       ├── analysis/route.ts    # Analisis biaya (POST)
│       ├── batch-detail/route.ts   # Rincian per batch (POST)
│       ├── transactions/route.ts   # Data transaksi mentah (GET)
│       └── kategori/route.ts    # Daftar kategori pekerjaan (GET)
├── components/                  # Komponen UI dashboard
├── lib/
│   ├── db.ts                    # Koneksi PGlite (Postgres WASM) + skema
│   ├── python.ts                # Klien service analisis Python
│   ├── query.ts                 # Pembangun filter SQL
│   ├── types.ts                 # Tipe data
│   └── format.ts                # Format angka/IDR
├── py-service/                  # Service analisis Python (FastAPI)
│   ├── main.py                  # Endpoint /parse-excel, /analyze, /batch-detail
│   ├── parser.py                # Parsing & pembersihan Excel (pandas)
│   ├── analysis.py              # Perhitungan analisis biaya
│   └── start.bat                # Menjalankan service Python
├── pgdata/                      # Data PostgreSQL (PGlite) — jangan dihapus
├── start-all.bat                # Menjalankan semuanya sekali klik
└── next.config.ts               # serverExternalPackages utk PGlite
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
- **Rasio Output/Input** = output ÷ input. Nilai ≥ 100% menandakan nilai hasil lebih
  besar daripada beban yang dikeluarkan.

## Desain UI

Dikerjakan dengan skill **Impeccable** (`npx skills add pbakaus/impeccable`), mode
*Operate*. Sistem token (OKLCH), tipografi, komponen, dan keadaan terdokumentasi di
**`DESIGN.md`**. Untuk audit/perbaikan berikutnya: `/audit`, `/polish`, `/typeset`.