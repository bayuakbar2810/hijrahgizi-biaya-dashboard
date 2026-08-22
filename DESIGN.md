# DESIGN â€” Dashboard Analisis Biaya Hijrah Gizi Hewani

Direktori desain visual untuk dashboard ini. Berlaku sebagai sumber kebenaran (source of
truth) saat mengubah UI.

## Mode

**Operate.** Pengguna adalah analis yang sedang menyelesaikan tugas membaca & meneliti
biaya. Prioritas: scanability, konsistensi, keterbacaan angka & tabel, keadaan (state)
yang lengkap. Ekspresi berlebih dikorbankan demi kepercayaan yang langsung terbentuk.

## Identitas visual

- **Satu keluarga tipografi**: Plus Jakarta Sans (via `next/font`), untuk judul, label,
  body, dan data. Tidak ada keluarga kedua tanpa peran yang tak bisa dilakukan yang lain.
- **Angka data** selalu `tabular-nums` (`.tnum`) sehingga kolom tabel dan KPI sejajar.
- **Palet**: netral bertinta (bukan abu-abu murni), disusun dalam ruang warna **OKLCH**
  agar lightness & chroma bisa disetel secara terprediksi. Semua token ada di
  `app/globals.css` (`@theme`).

### Token warna

| Peran | Nilai (OKLCH) | Kelas Tailwind |
| --- | --- | --- |
| Kanvas latar | `0.965 0.006 210` | `bg-canvas` |
| Permukaan panel | `0.995 0.002 210` | `bg-surface` |
| Permukaan sekunder / header tabel | `0.945 0.008 210` | `bg-surface-2` |
| Permukaan tersier / skeleton | `0.915 0.01 210` | `bg-surface-3` |
| Teks utama | `0.24 0.018 225` | `text-ink` |
| Teks sekunder | `0.46 0.02 225` | `text-ink-2` |
| Teks redup / placeholder | `0.6 0.02 225` | `text-ink-3` |
| Garis / border | `0.885 0.012 215` | `border-line` |
| Garis kuat | `0.78 0.016 215` | `border-line-strong` |
| Aksen (aksi, seleksi, fokus) | `0.52 0.11 205` (teal) | `bg-accent`, `text-accent` |
| Input / biaya dikeluarkan | `0.58 0.14 235` (biru) | `text-in`, `bg-in-soft` |
| Output / pesanan selesai | `0.62 0.13 160` (emerald) | `text-out`, `bg-out-soft` |
| Total biaya | `0.5 0.13 290` (violet) | `text-total`, `bg-total-soft` |

Aksen hanya dipakai untuk aksi utama, seleksi aktif, dan indikator status â€” bukan dekorasi.
Data memakai hue berbeda per makna (input biru, output hijau, total violet), dengan
tambahan label/nilai sehingga warna bukan satu-satunya kode.

## Skala & spasi

- Basis spasi **4px** (`p-1`â€¦`p-6`); panel `rounded-xl` (12px), pil hanya untuk kontrol
  kecil (badge tipe/kategori). Elevasi panel: **border 1px + shadow lembut** (bukan border
  di bawah bayangan lebar â€” hindari "ghost card").
- Judul panel: teks 14px semibold + titik aksen kecil. Hierarki tabel: header sticky
  `uppercase` 11px di atas permukaan sekunder.
- Tipe: KPI angka 1.45rem/2; body 14px; tabel data 13px; meta 10â€“11px. Ratio antar langkah
  ~1.2. Ukuran label tabel naik sedikit, bukan radial.

## Komponen & keadaan

Setiap kontrol interaktif punya: default, hover, focus-visible (ring aksen 2px + offset),
active, disabled, loading, error.

- **Tombol**: satu vokabular â€” `rounded-lg`, aksen untuk aksi primer (teks putih),
  `border-line-strong` untuk sekunder.
- **Input/select/checkbox**: border `line-strong`, fokus `border-accent`, caret aksen.
- **Badge tipe transaksi**: INPUT = `bg-in-soft text-in`, OUTPUT = `bg-out-soft text-out`.
- **Loading**: skeleton (bukan spinner di tengah konten). **Empty state**: judul + instruksi.
- **Modal**: `<dialog>`-style â€” backdrop blur, Esc menutup, fokus awal ke tombol tutup,
  baris total sticky di bawah.

## Motion

- Hanya transisi state 150â€“250ms (hover/focus/active/disabled). Tidak ada animasi
  orkestrasi masuk halaman. `prefers-reduced-motion: reduce` mematikan transisi.

## Permukaan browser

Selection, caret, scrollbar (tipis, border-radius), dan focus ring di-tema dari palet â€”
detail yang membuat halaman terasa "dibangun", bukan dirakit.

## Responsif

- Sidebar (data + filter) menjadi blok penuh di layar sempit; grid chart turun ke satu
  kolom; tabel menggulir horizontal di dalam panel (`max-h` + `overflow-auto`).
- Struktur responsif bersifat struktural (collapse/reflow), bukan tipografi fluid.

## File utama

- Token & base: `app/globals.css`
- Font & metadata: `app/layout.tsx`
- Komponen: `components/Dashboard.tsx`, `components/ui.tsx`, `components/KpiCards.tsx`,
  `components/ItemTable.tsx`, `components/ItemHistoryModal.tsx`,
  `components/BatchDetailModal.tsx`, `components/AnomalyView.tsx`,
  `components/RawDataView.tsx`, `components/ProductMaster.tsx`,
  `components/UploadPanel.tsx`
