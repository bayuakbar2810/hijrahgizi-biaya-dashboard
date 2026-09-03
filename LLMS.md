# LLMS.md — Dokumentasi End-to-End untuk AI Agent / LLM
> **Proyek**: Dashboard Analisis Biaya & Yield Produksi — PT Hijrah Gizi Hewani (`hijrahgizi-biaya-dashboard`)  
> **Versi**: 2.0.0 | Next.js 16 (App Router) + React 19 + TypeScript + PGlite / PostgreSQL

---

## 1. Ringkasan Proyek & Domain Bisnis

### 1.1 Konteks Bisnis
Aplikasi ini adalah dashboard akuntansi biaya produksi manufaktur makanan (daging & bumbu olahan) untuk **PT Hijrah Gizi Hewani**. Dashboard ini mengolah data transaksi histori pekerjaan pesanan yang diekspor dari software akuntansi **Accurate** (format file Excel `.xlsx`).

### 1.2 Tujuan Utama Sistem
1. **Analisis Biaya & Yield per Batch Produksi (RTL)**:
   - Menghitung **Yield (%)** = $\frac{\text{Output Produk Jadi (KG)}}{\text{Input Daging Mentah (KG)}} \times 100\%$.
   - Menghitung **Biaya Potong per KG** = $\frac{\text{Total Biaya Proses (Rp)}}{\text{Output Produk Jadi (KG)}}$.
   - Memantau rasio kemasan **KG per Karton** (standar ideal: 10–15 kg/karton).
2. **Kalkulasi & Monitoring HPP per SKU**:
   - Menghitung **HPP (Harga Pokok Produksi)** per SKU = $\frac{\text{Total Biaya Penyelesaian}}{\text{Total Qty Penyelesaian}}$.
   - Membandingkan HPP aktual terhadap rata-rata historis SKU tersebut.
3. **Deteksi Anomali Otomatis (Severity: NORMAL, WATCH, ANOMALY)**:
   - `HIGH_CUTTING_COST`: Biaya potong per kg melebihi historis (+10% Watch, +20% Anomali).
   - `LOW_YIELD`: Yield aktual lebih rendah dari historis (-10% Watch, -20% Anomali).
   - `HIGH_HPP`: HPP per kg produk lebih mahal dari historis (+10% Watch, +20% Anomali).
   - Anomali karton jika di luar rentang 10–15 kg/karton.
4. **Audit Trail & Diff History Batch**:
   - Jika file Excel diunggah ulang dan terdapat revisi angka/baris pada batch lama, sistem mencatat riwayat perubahan (diff field, baris ditambah, baris dihapus) tanpa menduplikasi data.
5. **Catatan Investigasi Lintas Divisi**:
   - Setiap batch memiliki kolom catatan investigasi yang terhubung ke panduan investigasi (`INVESTIGATION_GUIDE`).
6. **Ekspor Laporan PDF Interaktif & Eksekutif**:
   - Format **Diskusi (Ringkas)**: Top 5 temuan anomali per jenis dengan bukti biaya untuk rapat pimpinan.
   - Format **Lengkap**: Ringkasan + Top 5 temuan + lampiran seluruh daftar temuan.

---

## 2. Arsitektur Teknologi

```
+-------------------------------------------------------------------------------+
|                             CLIENT / BROWSER                                  |
|   Next.js 16 (React 19) + Tailwind CSS v4 (OKLCH Tokens, Plus Jakarta Sans)   |
|   Tabs: Item RTL | Anomali | Catatan | Data Mentah | Master Produk | Upload   |
+---------------------------------------+---------------------------------------+
                                        | HTTP / JSON (Cookie: hfg_auth)
                                        v
+-------------------------------------------------------------------------------+
|                          NEXT.JS APP ROUTER API                               |
|   /api/analysis · /api/batch-detail · /api/upload · /api/products · /api/meta |
+-------------------+-----------------------------------+-----------------------+
                    |                                   |
         (Native TS Engine)                     (Database Layer)
                    v                                   v
+---------------------------------------+  +------------------------------------+
|         lib/analysis.ts & parser.ts   |  |   lib/db.ts (Dual Mode)            |
|   - Parse Excel (.xlsx) buffer        |  |   1. Local: PGlite (WASM Postgres) |
|   - Algoritma Biaya & Yield           |  |      disimpan di ./pgdata          |
|   - Deteksi Anomali & Statisik        |  |   2. Cloud: pg.Pool (Neon/Supabase)|
+---------------------------------------+  +------------------------------------+
                    ^
                    | (Opsi microservice alternatif)
+-------------------+-------------------+  +------------------------------------+
| py-service (FastAPI + Pandas :8000)   |  | worker (Cloudflare Workers)        |
| - parser.py / analysis.py             |  | - Port TS worker untuk Edge        |
+---------------------------------------+  +------------------------------------+
```

### 2.1 Dual Engine (TypeScript vs Python)
- **Primary Engine**: Seluruh logika parsing Excel dan analisis biaya sudah di-port secara native ke TypeScript (`lib/parser.ts`, `lib/analysis.ts`). Next.js dapat menjalankan parsing dan analisis secara *in-process* tanpa dependensi eksternal.
- **Secondary Engine**: `py-service/` (FastAPI + Pandas di port 8000) dan `worker/` (Cloudflare Worker) disediakan sebagai alternatif service terpisah bila dibutuhkan skala mikro.

### 2.2 Database Storage Engine
- **Local Dev / Desktop**: Menggunakan **PGlite** (`@electric-sql/pglite` v0.5.5), PostgreSQL berbasis WASM yang menyimpan data fisik di direktori `./pgdata/`. Tidak membutuhkan instalasi server PostgreSQL.
- **Production / Cloud**: Jika environment variable `DATABASE_URL` diset, otomatis beralih ke PostgreSQL Pool (`pg.Pool`) seperti Neon Tech atau Supabase.

---

## 3. Struktur Direktori & File Kunci

```
hijrahgizi-biaya-dashboard/
├── app/
│   ├── api/
│   │   ├── analysis/route.ts       # POST: Eksekusi analisis agregat filter/kpi
│   │   ├── batch-detail/route.ts   # POST: Rincian mendalam 1 batch tertentu
│   │   ├── batch-history/route.ts  # GET: Log riwayat update & diff batch
│   │   ├── batch-notes/route.ts    # GET, POST: Catatan investigasi batch
│   │   ├── login/route.ts          # POST: Login & set auth cookie (JWT/HMAC)
│   │   ├── logout/route.ts         # POST: Clear auth cookie
│   │   ├── me/route.ts             # GET: Cek session user saat ini
│   │   ├── meta/route.ts           # GET: Metadata rentang tanggal, SKU list, files
│   │   ├── products/route.ts       # GET, PUT: CRUD Master Produk & klasifikasi
│   │   ├── raw/route.ts            # GET: Data mentah transaksi dengan paginasi
│   │   ├── upload/
│   │   │   ├── route.ts            # POST: Upload file .xlsx & buat preview
│   │   │   ├── confirm/route.ts    # POST: Simpan preview ke DB & kalkulasi diff
│   │   │   └── cancel/route.ts     # POST: Batalkan staging preview
│   │   └── uploads/route.ts        # GET, DELETE: Riwayat file & hapus file
│   ├── globals.css                 # Token warna OKLCH, font, scrollbar, anim
│   ├── layout.tsx                  # Root layout & Google Font Plus Jakarta Sans
│   └── page.tsx                    # Halaman utama dengan wrapper <AuthGate />
├── components/
│   ├── AnomalyView.tsx             # Tabel daftar temuan anomali
│   ├── AuthGate.tsx                # Gatekeeper autentikasi
│   ├── BatchDetailModal.tsx        # Modal rincian batch, input, output, performa, diff
│   ├── Dashboard.tsx               # Orchestrator state dashboard & tab navigation
│   ├── ItemHistoryModal.tsx        # Modal riwayat batch untuk satu SKU produk
│   ├── ItemTable.tsx               # Tabel ringkasan performa per SKU RTL
│   ├── KpiCards.tsx                # 8 kartu metrik KPI utama
│   ├── LoginForm.tsx               # UI login (Admin / Viewer)
│   ├── NotesView.tsx               # Tab log catatan investigasi semua batch
│   ├── ProductMaster.tsx           # Tab manajemen klasifikasi produk
│   ├── RawDataView.tsx             # Tab eksplorasi data mentah transaksi
│   ├── UploadPanel.tsx             # Panel upload Excel, staging preview, diff log
│   └── ui.tsx                      # Reusable UI primitives: StatusBadge, Panel, Th, Td
├── lib/
│   ├── analysis.ts                 # Core algorithm: Yield, Cost Potong, HPP, Anomaly
│   ├── analytics.ts                # DB helper untuk load transaksi ter-enrich & settings
│   ├── auth.ts                     # Auth helpers, HMAC-SHA256 signature, cookie handler
│   ├── db.ts                       # Inisialisasi DB (PGlite / pg Pool), skema, seed
│   ├── format.ts                   # Formatter angka, IDR, tanggal Indonesia
│   ├── investigation.ts            # Knowledge base panduan investigasi per anomali
│   ├── parser.ts                   # Parsing file Excel Accurate, normalisasi baris
│   ├── preview.ts                  # Staging buffer upload ter-gzip di DB
│   ├── python.ts                   # Interface bridge ke engine analisis
│   ├── query.ts                    # Dynamic SQL WHERE clause builder
│   ├── report.ts                   # Generator PDF (jsPDF + autotable)
│   └── types.ts                    # Definisi TypeScript types & interfaces
├── py-service/                     # Python FastAPI microservice (Opsional)
│   ├── main.py                     # Endpoint FastAPI
│   ├── parser.py                   # Parsing Pandas
│   └── analysis.py                 # Perhitungan Analisis Python
├── worker/                         # Cloudflare Workers TypeScript package
├── scripts/
│   └── migrate-to-neon.mjs         # Skrip migrasi data dari PGlite lokal ke Neon Postgres
├── product_master_draft.csv        # Seed data awal klasifikasi 600+ SKU
├── DESIGN.md                       # Dokumentasi sistem desain UI & token OKLCH
└── package.json
```

---

## 4. Skema Database & Data Model

Database PostgreSQL (PGlite / Cloud) mengelola tabel-tabel berikut:

### 4.1 Tabel `product_master`
Menyimpan klasifikasi setiap kode item/produk:
```sql
CREATE TABLE product_master (
  kode TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  product_type TEXT NOT NULL,  -- RAW_MATERIAL, PACKAGING, PROCESS_COST, BY_PRODUCT, FINISHED_PRODUCT, OTHER
  is_rtl INTEGER NOT NULL DEFAULT 0,         -- 1 jika produk jadi retail/RTL
  is_main_output INTEGER NOT NULL DEFAULT 0, -- 1 jika output utama
  is_by_product INTEGER NOT NULL DEFAULT 0,  -- 1 jika produk sampingan (masuk input daging)
  is_packaging INTEGER NOT NULL DEFAULT 0,   -- 1 jika kemasan/kardus/plastik
  active INTEGER NOT NULL DEFAULT 1
);
```

### 4.2 Tabel `production_transactions`
Menyimpan setiap baris transaksi pengeluaran (input) dan penyelesaian (output):
```sql
CREATE TABLE production_transactions (
  id TEXT PRIMARY KEY,
  source_file TEXT,
  tanggal TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  kode TEXT,
  bahan_biaya TEXT,
  keterangan TEXT,
  pengeluaran_alokasi DOUBLE PRECISION DEFAULT 0,
  pengeluaran_biaya DOUBLE PRECISION DEFAULT 0,
  pengeluaran_qty DOUBLE PRECISION DEFAULT 0,
  penyelesaian_alokasi DOUBLE PRECISION DEFAULT 0,
  penyelesaian_biaya DOUBLE PRECISION DEFAULT 0,
  penyelesaian_qty DOUBLE PRECISION DEFAULT 0,
  total_alokasi DOUBLE PRECISION DEFAULT 0,
  total_biaya DOUBLE PRECISION DEFAULT 0,
  total_qty DOUBLE PRECISION DEFAULT 0,
  uploaded_at TEXT
);
CREATE INDEX idx_ppt_batch ON production_transactions(batch_no);
CREATE INDEX idx_ppt_tanggal ON production_transactions(tanggal);
CREATE INDEX idx_ppt_kode ON production_transactions(kode);
```

### 4.3 Tabel `batch_notes`
Menyimpan catatan hasil investigasi dan keterangan operasional batch:
```sql
CREATE TABLE batch_notes (
  batch_no TEXT PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
```

### 4.4 Tabel `batch_history`
Mencatat riwayat revisi dan perbedaan baris (*diff*) saat batch di-upload ulang:
```sql
CREATE TABLE batch_history (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  n_rows_old INTEGER NOT NULL,
  n_rows_new INTEGER NOT NULL,
  total_biaya_old DOUBLE PRECISION NOT NULL,
  total_biaya_new DOUBLE PRECISION NOT NULL,
  total_qty_old DOUBLE PRECISION NOT NULL,
  total_qty_new DOUBLE PRECISION NOT NULL,
  diff_json TEXT NOT NULL,      -- JSON { changed: [...], added: [...], removed: [...] }
  rows_old_json TEXT NOT NULL
);
CREATE INDEX idx_batch_history_batch ON batch_history(batch_no);
CREATE INDEX idx_batch_history_time ON batch_history(changed_at);
```

### 4.5 Tabel `source_files` & `previews`
- `source_files`: Metadata log file Excel yang telah selesai dikonfirmasi.
- `previews`: Staging area berbasis SQLite/PGlite gzipped JSON dengan TTL 30 menit untuk preview sebelum commit.

---

## 5. Pipeline Pengolahan Data Excel

### 5.1 Struktur Excel Accurate (`Histori Pekerjaan Pesanan`)
- Memiliki header bertingkat 2 baris (mis. `Pengeluaran Barang` subkolom `Biaya`, `Kuantitas`, `Alokasi ( % )`).
- Baris subtotal `Total Batch No. ...` dibersihkan otomatis oleh parser agar angka biaya tidak terhitung ganda.
- Baris footer biaya tanpa batch dibuang.
- Batch No dan Tanggal di-forward fill ke baris item detail di bawahnya jika kosong.

### 5.2 Heuristik Klasifikasi Produk Otomatis (Fallback)
Jika suatu SKU belum terdaftar di `product_master`, parser menerapkan aturan:
1. `bahan_biaya` diawali `"Biaya"` $\rightarrow$ `PROCESS_COST`.
2. Mengandung kata `"KARTON"`, `"PLASTIK"`, `"LABEL"`, `"ABSORBER"` (kecuali `"BRISKET PE"`) $\rightarrow$ `PACKAGING`.
3. Diawali `"Sample -"` $\rightarrow$ `OTHER`.
4. Diawali `"RTL"` atau `"RTLP"`, atau kode diawali `"R"`, `"P"`, `"RAW"` $\rightarrow$ `FINISHED_PRODUCT` (`is_rtl = true`).
5. Kode karton standar: `100929`, `100928`, `100927`.
6. Kode plastik karton standar: `R102252`, `R102253`, `R102253X`.

---

## 6. Algoritma Perhitungan & Logika Anomali

### 6.1 Formula Perhitungan Metrik

| Metrik | Formula | Keterangan |
| :--- | :--- | :--- |
| **Output RTL** | $\sum \text{penyelesaian\_qty}$ untuk item `is_rtl` | Total KG produk jadi retail |
| **Input Daging** | $\sum \text{pengeluaran\_qty}$ item tipe `RAW_MATERIAL`, `BY_PRODUCT`, `FINISHED_PRODUCT` | Bahan mentah daging yang dipakai |
| **Yield (%)** | $\frac{\text{Output RTL (KG)}}{\text{Input Daging (KG)}} \times 100\%$ | Efisiensi rendemen daging |
| **Biaya Potong Total** | $\sum \text{pengeluaran\_biaya}$ item tipe `PROCESS_COST` | Biaya jasa/proses potong |
| **Biaya Potong / KG** | $\frac{\text{Biaya Potong Total}}{\text{Output RTL (KG)}}$ | Beban potong per kg output |
| **KG / Karton** | $\frac{\text{Output RTL (KG)}}{\text{Qty Karton (pcs)}}$ | Kepadatan kemasan (target 10-15 kg) |
| **HPP per SKU** | $\frac{\text{Biaya Penyelesaian SKU}}{\text{Qty Penyelesaian SKU}}$ | Biaya pokok per KG per varian |
| **HPP Gabungan Batch** | $\frac{\text{Total Biaya Input Seluruh Item}}{\text{Output RTL (KG)}}$ | Rata-rata biaya per KG batch |

### 6.2 Ambang Batas Anomali (Settings Default)
- `cost_var_watch`: **10%** | `cost_var_anomaly`: **20%**
- `yield_var_watch`: **10%** | `yield_var_anomaly`: **20%**
- `hpp_var_watch`: **10%** | `hpp_var_anomaly`: **20%**
- `karton_min_kg`: **10 kg** | `karton_max_kg`: **15 kg**

> **Catatan Kritis Logika Bisnis**:  
> - **Biaya Potong & HPP**: Hanya bernilai buruk (anomali) jika **lebih mahal** ($+ \text{variance}$) dibanding rata-rata historis. Jika lebih murah, dianggap performa baik dan tidak di-flag.
> - **Yield**: Hanya bernilai buruk jika **lebih rendah** ($- \text{variance}$) dibanding rata-rata historis.

---

## 7. Autentikasi & Hak Akses (RBAC)

Autentikasi menggunakan cookie `hfg_auth` bertanda tangan HMAC-SHA256:

| Role | Default Username | Default Password | Izin Akses |
| :--- | :--- | :--- | :--- |
| **Admin** | `Admin` | `Hijrah2026` | Akses penuh: Upload Excel, Hapus Dataset, Edit Master Produk, Tulis Catatan Investigasi, Download PDF |
| **Viewer** (Produksi) | `Produksi` | `ProduksiHijrah2026` | Read-only semua dashboard & data mentah + Tulis Catatan Investigasi (Tidak bisa upload/hapus/edit master) |

- **Header / Cookie**: `hfg_auth={username}|{role}|{timestamp}|{signature}`
- **TTL Sesi**: 7 hari.

---

## 8. Spesifikasi API Routes

| Endpoint | Method | Role Min | Deskripsi & Payload |
| :--- | :--- | :--- | :--- |
| `/api/login` | `POST` | Public | Body: `{ username, password }` $\rightarrow$ Set cookie `hfg_auth` |
| `/api/logout` | `POST` | Public | Menghapus cookie `hfg_auth` |
| `/api/me` | `GET` | Viewer | Mengembalikan status session `{ ok: true, username, role }` |
| `/api/meta` | `GET` | Viewer | Mengambil metadata rentang tanggal, daftar batch, SKU, settings |
| `/api/analysis` | `POST` | Viewer | Body: `{ from?, to?, batch?, sku?, q?, anomaly_type?, severity?, category? }` $\rightarrow$ Mengembalikan KPI, batch list, anomalies, dan item summaries |
| `/api/batch-detail`| `POST` | Viewer | Body: `{ batch_no }` $\rightarrow$ Mengembalikan data lengkap input, output, biaya proses, kemasan, historis |
| `/api/batch-notes` | `GET` | Viewer | Param: `batch_no?` $\rightarrow$ Mengambil catatan batch tertentu atau 200 catatan terbaru |
| `/api/batch-notes` | `POST` | Viewer | Body: `{ batch_no, notes }` $\rightarrow$ Menyimpan catatan investigasi |
| `/api/batch-history`| `GET` | Viewer | Param: `batch_no?` $\rightarrow$ Mengambil log diff perubahan nilai batch |
| `/api/products` | `GET` | Admin | Param: `q?`, `product_type?`, `limit?` $\rightarrow$ Daftar master produk |
| `/api/products` | `PUT` | Admin | Body: `Partial<ProductMaster> & { kode }` $\rightarrow$ Update klasifikasi produk |
| `/api/raw` | `GET` | Viewer | Param: `from?, to?, batch?, q?, sku?, limit?, offset?` $\rightarrow$ Data mentah transaksi |
| `/api/upload` | `POST` | Admin | Multipart FormData `{ file: .xlsx }` $\rightarrow$ Mengembalikan preview staging |
| `/api/upload/confirm`| `POST` | Admin | Body: `{ preview_id }` $\rightarrow$ Commit data ke DB & catat diff history |
| `/api/upload/cancel` | `POST` | Admin | Body: `{ preview_id }` $\rightarrow$ Batalkan staging preview |
| `/api/uploads` | `GET` | Viewer | Daftar riwayat file yang pernah diupload |
| `/api/uploads` | `DELETE` | Admin | Body: `{ id }` $\rightarrow$ Menghapus seluruh transaksi terkait file tersebut |

---

## 9. Environment Variables

Daftar konfigurasi lingkungan pada `.env` / `.env.local`:

```env
# Koneksi Database (Jika tidak diset, sistem otomatis menggunakan PGlite lokal di folder /pgdata)
DATABASE_URL="postgresql://user:password@ep-host.region.aws.neon.tech/neondb?sslmode=require"

# Secret Kunci Autentikasi
AUTH_SECRET="hfg-dev-secret-2026"

# Kredensial Akun Default
ADMIN_USERNAME="Admin"
ADMIN_PASSWORD="Hijrah2026"
PROD_USERNAME="Produksi"
PROD_PASSWORD="ProduksiHijrah2026"

# Port & URL Service Python (Opsional jika memakai py-service terpisah)
PY_SERVICE_URL="http://127.0.0.1:8000"
```

---

## 10. Panduan Menjalankan & Perintah Penting

### 10.1 Mode Standalone (Rekomendasi Utama)
Cukup jalankan web Next.js karena engine analisis sudah native di TypeScript:
```bash
npm install
npm run dev
# Buka di http://localhost:3000
```

### 10.2 Mode Lengkap dengan Skrip Otomatis
Klik dua kali `start-all.bat` di root direktori untuk menjalankan service Python dan Next.js sekaligus.

### 10.3 Migrasi Data dari Lokal PGlite ke Cloud Postgres (Neon)
Jika ingin memindahkan seluruh database lokal (`pgdata/`) ke Postgres cloud:
```powershell
$env:DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
node scripts/migrate-to-neon.mjs
```

---

## 11. Panduan Pengembangan untuk AI / LLM

Bila Anda (LLM) diminta melakukan refactoring, penambahan fitur, atau modifikasi logika:

1. **Jaga Konsistensi Nilai Persentase**:
   - `yield_pct` dan `variance_pct` dihitung dalam skala $0-100$ (mis. `88.5` berarti `88.5%`), bukan skala desimal $0.885$. Jangan mengalikan dengan 100 lagi saat memformat di UI/PDF.
2. **Integritas Aturan Subtotal**:
   - Baris Excel dengan batch diawali `TOTAL` harus selalu difilter keluar dari perhitungan agregat.
3. **Prinsip Single Source of Truth Desain**:
   - Semua warna data wajib mengikuti palet di `app/globals.css` (`text-in`, `text-out`, `text-total`, `text-accent`). Jangan menggunakan sembarang warna Tailwind seperti `text-blue-500` di luar token yang ditetapkan dalam `DESIGN.md`.
4. **Preservasi Logika Diff Pencocokan**:
   - Pencocokan baris lama vs baru pada `app/api/upload/confirm/route.ts` menggunakan kunci komposit `rowKey` (`tanggal|kode|bahan_biaya|keterangan`), bukan nomor indeks baris, untuk mendukung pergeseran urutan baris dalam Excel.
