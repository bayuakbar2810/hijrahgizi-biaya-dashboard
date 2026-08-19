"""Parsing & normalisasi file Excel histori pekerjaan pesanan PT Hijrah Gizihew.

Mendukung header flat maupun 2 tingkat (merged) dari export Accurate.
Menghasilkan kolom sesuai PRD (production_transactions) tanpa modifikasi data raw.
"""

import io
import re

import numpy as np
import pandas as pd

pd.set_option("future.no_silent_downcasting", True)

MAIN_SHEET = "Histori Pekerjaan Pesanan"

REQUIRED = [
    "Tanggal",
    "Batch No.",
    "Kode",
    "Bahan dan Biaya",
    "Pengeluaran Barang - Biaya",
    "Pengeluaran Barang - Kuantitas",
    "Penyelesaian Pesanan - Biaya",
    "Penyelesaian Pesanan - Kuantitas",
]

# Alokasi dan Total bersifat opsional untuk kompatibilitas; diisi 0 jika tidak ada.
OPTIONAL = [
    "Keterangan",
    "Pengeluaran Barang - Alokasi",
    "Penyelesaian Pesanan - Alokasi",
    "Total Tipe Transaksi - Alokasi",
    "Total Tipe Transaksi - Biaya",
    "Total Tipe Transaksi - Kuantitas",
]

OUTPUT_KEYS = [
    "tanggal", "batch_no", "kode", "bahan_biaya", "keterangan",
    "pengeluaran_alokasi", "pengeluaran_biaya", "pengeluaran_qty",
    "penyelesaian_alokasi", "penyelesaian_biaya", "penyelesaian_qty",
    "total_alokasi", "total_biaya", "total_qty",
]


def _norm(text) -> str:
    if text is None or (isinstance(text, float) and np.isnan(text)):
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


def _key(name: str) -> str:
    return (
        name.lower()
        .replace(" - ", " ")
        .replace("-", " ")
        .replace(" (%)", "")
        .replace("(", "")
        .replace(")", "")
        .replace(".", "")
    )


def _pick_sheet(xls: pd.ExcelFile) -> str:
    if MAIN_SHEET in xls.sheet_names:
        return MAIN_SHEET
    return xls.sheet_names[0]


def _flatten_columns(reader_columns) -> list:
    """Flatten header[0,1] yang berasal dari cell merged Accurate."""
    cols: list[str] = []
    for pair in reader_columns:
        a, b = str(pair[0]).strip(), str(pair[1]).strip()
        if b.startswith("Unnamed") or b == "":
            cols.append(a)
        elif a and a != b and not a.startswith("Unnamed"):
            cols.append(f"{a} - {b}")
        else:
            cols.append(b)
    return cols


def _map_columns(columns: list) -> tuple[dict, list]:
    """Petakan nama kolom mentah ke key normal; kembalikan (mapping, missing)."""
    mapping: dict[str, str] = {}
    lookup = {}
    for c in columns:
        k = _key(c)
        if k and k not in lookup:
            lookup[k] = c

    want = {
        "tanggal": "tanggal",
        "batch no": "batch_no",
        "kode": "kode",
        "bahan dan biaya": "bahan_biaya",
        "keterangan": "keterangan",
        "pengeluaran barang biaya": "pengeluaran_biaya",
        "pengeluaran barang kuantitas": "pengeluaran_qty",
        "pengeluaran barang alokasi": "pengeluaran_alokasi",
        "penyelesaian pesanan biaya": "penyelesaian_biaya",
        "penyelesaian pesanan kuantitas": "penyelesaian_qty",
        "penyelesaian pesanan alokasi": "penyelesaian_alokasi",
        "total tipe transaksi biaya": "total_biaya",
        "total tipe transaksi kuantitas": "total_qty",
        "total tipe transaksi alokasi": "total_alokasi",
    }
    for key, out in want.items():
        if key in lookup:
            mapping[out] = lookup[key]

    required_keys = ["tanggal", "batch no", "kode", "bahan dan biaya",
                     "pengeluaran barang biaya", "penyelesaian pesanan biaya",
                     "penyelesaian pesanan kuantitas"]
    missing = [c for c in required_keys if c not in lookup]
    return mapping, missing


def _read_sheet(content: bytes):
    xls = pd.ExcelFile(io.BytesIO(content))
    sheet = _pick_sheet(xls)

    # Coba dua tingkat header (export Accurate baru)
    df2 = pd.read_excel(xls, sheet_name=sheet, header=[0, 1])
    cols2 = _flatten_columns(df2.columns)
    df2.columns = cols2
    mapping, missing = _map_columns(cols2)
    if not missing:
        return df2, sheet, mapping

    # Fallback: header satu tingkat (format lama)
    df1 = pd.read_excel(xls, sheet_name=sheet, header=0)
    mapping, missing1 = _map_columns([str(c) for c in df1.columns])
    if not missing1:
        return df1, sheet, mapping
    raise ValueError(f"Kolom berikut tidak ditemukan: {', '.join(missing)}")


def parse_excel(content: bytes, filename: str) -> dict:
    df, sheet, mapping = _read_sheet(content)

    known = {v: k for k, v in mapping.items()}
    df = df.rename(columns=known)
    keep = [k for k in OUTPUT_KEYS if k in df.columns]
    df = df[keep].copy()

    numeric_cols = [
        "pengeluaran_alokasi", "pengeluaran_biaya", "pengeluaran_qty",
        "penyelesaian_alokasi", "penyelesaian_biaya", "penyelesaian_qty",
        "total_alokasi", "total_biaya", "total_qty",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = 0.0
    df[numeric_cols] = df[numeric_cols].fillna(0.0)

    # ===== Pembersihan baris subtotal / footer / grand-total =====
    # Kolom Batch No. & Tanggal ter-merge per batch/hari (pandas membaca NaN pada baris lanjutan).
    before = len(df)
    batch_orig = df["batch_no"].astype(str).str.strip().str.upper()

    # 1) Subtotal per batch: "Total Batch No." (teks TOTAL)
    df = df[~batch_orig.str.startswith("TOTAL")]
    # 2) Baris tanpa kode (baris judul/subtotal tak bernama)
    df = df[df["kode"].map(lambda v: _norm(v)) != ""]
    # 3) Footer harian: batch NaN + baris biaya nol (mis. "Biaya Potong" 0)
    footer = (
        df["batch_no"].isna()
        & df["bahan_biaya"].map(lambda v: _norm(v).upper()).str.contains("BIAYA", na=False)
        & (df["pengeluaran_biaya"] == 0)
        & (df["penyelesaian_biaya"] == 0)
    )
    df = df[~footer]

    # 4) Isi batch/tanggal/keterangan yang ter-merge (forward-fill)
    for col in ("batch_no", "tanggal", "keterangan"):
        s = df[col].astype(object)
        empty = s.map(
            lambda v: v is None
            or (isinstance(v, float) and np.isnan(v))
            or str(v).strip() == ""
        )
        df[col] = s.where(~empty, np.nan).ffill()

    invalid_rows = before - len(df)
    df = df[df["batch_no"].notna() & (df["batch_no"].astype(str).str.strip() != "")]

    df["tanggal"] = pd.to_datetime(df["tanggal"], errors="coerce")
    bad_date = df["tanggal"].isna()
    invalid_rows += int(bad_date.sum())
    df = df[~bad_date]

    # Hitung ulang total agar konsisten dengan sisi pengeluaran/penyelesaian
    df["total_biaya"] = df["pengeluaran_biaya"] + df["penyelesaian_biaya"]
    df["total_qty"] = df["pengeluaran_qty"] + df["penyelesaian_qty"]
    df["total_alokasi"] = df["pengeluaran_alokasi"] + df["penyelesaian_alokasi"]

    df["bahan_biaya"] = df["bahan_biaya"].map(_norm)
    df["keterangan"] = df["keterangan"].map(_norm)
    df["batch_no"] = df["batch_no"].map(_norm)
    df["kode"] = df["kode"].map(_norm)
    df["tanggal"] = df["tanggal"].dt.strftime("%Y-%m-%d")

    rows = df[OUTPUT_KEYS].copy()
    records = rows.to_dict(orient="records")
    for r in records:
        for key in numeric_cols:
            r[key] = round(float(r[key]), 2)

    summary = {
        "filename": filename,
        "sheet": sheet,
        "row_count": len(records),
        "batch_count": int(rows["batch_no"].nunique()),
        "kode_count": int(rows["kode"].nunique()),
        "date_min": rows["tanggal"].min() if len(rows) else "",
        "date_max": rows["tanggal"].max() if len(rows) else "",
        "total_biaya": round(float(rows["total_biaya"].sum()), 2),
    }
    return {
        "rows": records,
        "summary": summary,
        "missing_columns": [],
        "invalid_rows": invalid_rows,
    }