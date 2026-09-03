export type ProductType =
  | "RAW_MATERIAL"
  | "PACKAGING"
  | "PROCESS_COST"
  | "BY_PRODUCT"
  | "FINISHED_PRODUCT"
  | "OTHER";

export type PrdRow = {
  id?: string;
  tanggal: string;
  batch_no: string;
  kode: string;
  bahan_biaya: string;
  keterangan: string;
  pengeluaran_biaya: number;
  pengeluaran_qty: number;
  penyelesaian_biaya: number;
  penyelesaian_qty: number;
  total_biaya: number;
  total_qty: number;
  product_type?: ProductType;
  is_rtl?: boolean;
  is_main_output?: boolean;
  is_by_product?: boolean;
  is_packaging?: boolean;
};

export type ProductMaster = {
  kode: string;
  nama_produk: string;
  product_type: ProductType;
  is_rtl: boolean;
  is_main_output: boolean;
  is_by_product: boolean;
  is_packaging: boolean;
  active: boolean;
};

export type SourceFile = {
  id: string;
  filename: string;
  uploaded_at: string;
  n_rows: number;
  n_batch: number;
  new_batch: number;
  updated_batch: number;
};

export type Severity = "NORMAL" | "WATCH" | "ANOMALY";

export type AnomalyType =
  | "HIGH_CUTTING_COST"
  | "LOW_YIELD"
  | "HIGH_HPP";

export type SkuHpp = {
  kode: string;
  nama: string;
  qty: number;
  biaya: number;
  hpp: number;
  hist_avg: number | null;
  variance_pct: number | null;
  severity: Severity;
};

export type BatchAnalytics = {
  batch_no: string;
  tanggal: string;
  n_rows: number;
  rtl_output_kg: number;
  meat_input_kg: number;
  yield_pct: number | null;
  cost_potong_total: number;
  cost_potong_per_kg: number | null;
  karton_pcs: number;
  plastik_karton_pcs: number;
  kg_per_karton: number | null;
  karton_status: Severity;
  sku_hpps: SkuHpp[];
  sku_hpp_min: number | null;
  sku_hpp_max: number | null;
  anomalies: BatchAnomaly[];
  status: Severity;
};

export type BatchAnomaly = {
  type: AnomalyType;
  sku: string | null;
  nama: string | null;
  current: number;
  historical: number | null;
  variance_pct: number | null;
  severity: Severity;
};

export type AnomalyRow = BatchAnomaly & {
  batch_no: string;
  tanggal: string;
};

export type ItemSummary = {
  kode: string;
  nama: string;
  n_batch: number;
  total_qty: number;
  total_biaya: number;
  avg_hpp: number | null;
  min_hpp: number | null;
  max_hpp: number | null;
  avg_yield_pct: number | null;
  min_yield_pct: number | null;
  max_yield_pct: number | null;
  mode_cost_potong_kg: number | null;
  avg_kg_karton: number | null;
  n_anomaly: number;
  last_date: string | null;
  severity: Severity;
};

export type AnalysisResult = {
  kpi: {
    n_rtl_batch: number;
    total_rtl_output_kg: number;
    avg_cost_potong_kg: number;
    avg_yield_pct: number;
    avg_kg_karton: number;
    avg_hpp: number;
    n_anomaly_batch: number;
    n_anomaly_sku: number;
  };
  batches: BatchAnalytics[];
  anomalies: AnomalyRow[];
  sku_hist: ItemSummary[];
  meta: {
    n_rtl_batch: number;
    n_batch_all: number;
    from: string | null;
    to: string | null;
  };
};

export type BatchDetail = {
  batch_no: string;
  tanggal: string;
  is_rtl_batch: boolean;
  main_output: SkuHpp[];
  total_rtl_output_kg: number;
  inputs: Array<{
    kode: string;
    nama: string;
    product_type: ProductType;
    biaya: number;
    qty: number;
  }>;
  input_summary: Array<{ product_type: ProductType; biaya: number; qty: number }>;
  process_cost: Array<{ nama: string; biaya: number }>;
  packaging: Array<{ kode: string; nama: string; qty: number; biaya: number }>;
  meat_input_kg: number;
  yield_pct: number | null;
  karton_pcs: number;
  plastik_karton_pcs: number;
  kg_per_karton: number | null;
  karton_status: Severity;
  cost_potong_total: number;
  cost_potong_per_kg: number | null;
  historical: {
    cost_potong_kg: { current: number | null; avg: number | null; variance_pct: number | null };
    yield_pct: { current: number | null; avg: number | null; variance_pct: number | null };
    kg_karton: { current: number | null; avg: number | null; variance_pct: number | null };
  };
  anomalies: BatchAnomaly[];
  status: Severity;
  raw_rows: PrdRow[];
};

export type AnalysisParams = {
  from?: string;
  to?: string;
  batch?: string;
  sku?: string;
  q?: string;
  anomaly_type?: string;
  severity?: string;
  category?: string;
  limit?: number;
};

export type UploadPreview = {
  preview_id: string;
  filename: string;
  sheet: string;
  row_count: number;
  batch_count: number;
  kode_count: number;
  date_min: string;
  date_max: string;
  total_biaya: number;
  new_batch: number;
  updated_batch: number;
  invalid_rows: number;
  missing_columns: string[];
};

export type BatchHistoryDiffField = { f: string; old: unknown; new: unknown };

export type BatchHistoryDiff = {
  changed: Array<{ i: number; kode: string; bahan: string; fields: BatchHistoryDiffField[] }>;
  added: Array<{ kode: string; bahan: string }>;
  removed: Array<{ kode: string; bahan: string }>;
};

export type BatchHistoryEntry = {
  id: string;
  batch_no: string;
  changed_at: string;
  source_filename: string;
  n_rows_old: number;
  n_rows_new: number;
  total_biaya_old: number;
  total_biaya_new: number;
  total_qty_old: number;
  total_qty_new: number;
  diff: BatchHistoryDiff;
};

export type UploadLogEntry = {
  id: string;
  filename: string;
  uploaded_at: string;
  n_rows: number;
  n_batch: number;
  new_batch: number;
  updated_batch: number;
};

export type SurveyEntry = {
  id: string;
  tanggal: string;
  kompetitor: string;
  produk: string;
  harga_kompetitor: number;
  harga_hijrah: number;
  created_by?: string;
  created_at: string;
};