/* eslint-disable @typescript-eslint/no-explicit-any */
// Port dari py-service/analysis.py — analisis biaya & yield per Batch No.

export type Row = Record<string, any>;

const KARTON_KODES = new Set(["100929", "100928", "100927"]);
const PLASTIK_KARTON_KODES = new Set(["R102252", "R102253", "R102253X"]);
const MEAT_TYPES = new Set(["RAW_MATERIAL", "BY_PRODUCT", "FINISHED_PRODUCT"]);
const SEVERITY_RANK: Record<string, number> = { NORMAL: 0, WATCH: 1, ANOMALY: 2 };

function _f(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function pyRound(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const abs = Math.abs(x);
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setFloat64(0, abs);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const exp = ((hi >>> 20) & 0x7ff) - 1023;
  const mantHi = BigInt(hi & 0xfffff);
  const mantLo = BigInt(lo);
  let mant = (mantHi << 32n) | mantLo;
  if (exp !== -1023) mant |= 1n << 52n;
  const e = BigInt(exp - 52);
  const N = 10n ** BigInt(digits);
  let q: bigint;
  if (e >= 0n) {
    q = mant * (2n ** e) * N;
  } else {
    const k = -e;
    const num = mant * N;
    const half = 1n << (k - 1n);
    q = num >> k;
    const r = num & ((1n << k) - 1n);
    if (r > half) q += 1n;
    else if (r === half && q % 2n !== 0n) q += 1n;
  }
  const res = Number(q) / Number(N);
  return neg ? -res : res;
}

function _fallbackProduct(kode: unknown, nama: unknown) {
  const n = String(nama ?? "").trim();
  const up = n.toUpperCase();
  const k = String(kode ?? "").trim();
  if (n.startsWith("Biaya")) return { product_type: "PROCESS_COST", is_rtl: false };
  if (
    (up.includes("KARTON") ||
      up.includes("PLASTIK") ||
      up.includes("LABEL") ||
      up.includes("ABSORBER")) &&
    !up.includes("BRISKET PE")
  ) {
    return { product_type: "PACKAGING", is_rtl: false };
  }
  if (n.startsWith("Sample -")) return { product_type: "OTHER", is_rtl: false };
  if (n.startsWith("RTL") || n.startsWith("RTLP")) {
    return { product_type: "FINISHED_PRODUCT", is_rtl: true };
  }
  if (k.startsWith("R") || k.startsWith("P") || k.startsWith("RAW")) {
    return { product_type: "FINISHED_PRODUCT", is_rtl: true };
  }
  return { product_type: "OTHER", is_rtl: false };
}

function _enrich(rows: Row[]): Row[] {
  return rows.map((r) => {
    const out: Row = { ...r };
    const ptype = r.product_type;
    if (ptype === null || ptype === undefined || ptype === "") {
      const fb = _fallbackProduct(r.kode, r.bahan_biaya);
      out.product_type = fb.product_type;
      out.is_rtl = Boolean(r.is_rtl) || fb.is_rtl;
    } else {
      out.product_type = String(ptype);
      out.is_rtl = Boolean(r.is_rtl);
    }
    if (out.is_by_product === undefined) out.is_by_product = out.product_type === "BY_PRODUCT";
    if (out.is_packaging === undefined) out.is_packaging = out.product_type === "PACKAGING";
    return out;
  });
}

function _settings(s: Record<string, any> | null | undefined): Record<string, number | string> {
  const d: Record<string, number | string> = {
    karton_min_kg: 10,
    karton_max_kg: 15,
    cost_var_watch: 10,
    cost_var_anomaly: 20,
    yield_var_watch: 10,
    yield_var_anomaly: 20,
    hpp_var_watch: 10,
    hpp_var_anomaly: 20,
    exclude_name_prefixes: "RTL CST",
  };
  if (s) {
    for (const k of Object.keys(d)) {
      const v = s[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "number") {
        d[k] = v;
      } else if (k === "exclude_name_prefixes") {
        d[k] = String(v);
      } else {
        const n = Number(v);
        if (!Number.isNaN(n)) d[k] = n;
      }
    }
  }
  return d;
}

function _excluded_prefixes(cfg: Record<string, any>): string[] {
  const raw = String(cfg.exclude_name_prefixes ?? "");
  return raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p);
}

function _exclude_output_rows(rows: Row[], prefixes: string[]): Row[] {
  if (prefixes.length === 0) return rows;
  const out: Row[] = [];
  for (const br of _groupRows(rows).values()) {
    let batchRows = br;
    const rtlOut = br.filter((r) => r.is_rtl && _f(r.penyelesaian_qty) > 0);
    const allExcluded =
      rtlOut.length > 0 &&
      rtlOut.every((r) =>
        prefixes.some((p) => String(r.bahan_biaya ?? "").toUpperCase().startsWith(p)),
      );
    if (allExcluded) {
      batchRows = br.filter((r) => !(r.is_rtl && _f(r.penyelesaian_qty) > 0));
    }
    out.push(...batchRows);
  }
  return out;
}

function _variancePct(current: number | null | undefined, hist: number | null | undefined): number | null {
  if (hist === null || hist === undefined || current === null || current === undefined || hist === 0) {
    return null;
  }
  return ((current - hist) / hist) * 100.0;
}

function _severityVar(var_: number | null, watch: number, anomaly: number): string | null {
  if (var_ === null) return null;
  if (Math.abs(var_) >= anomaly) return "ANOMALY";
  if (Math.abs(var_) >= watch) return "WATCH";
  return "NORMAL";
}

function _worst(sevs: Array<string | null>): string {
  let best = "NORMAL";
  for (const s of sevs) {
    if (s && (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[best] ?? 0)) best = s;
  }
  return best;
}

function _histAvg(values: Array<number | null | undefined>): number | null {
  const vals = values.filter((v): v is number => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function _mode(values: Array<number | null | undefined>): number | null {
  const vals = values.filter((v): v is number => v !== null && v !== undefined && v > 0);
  if (vals.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of vals) {
    const r = pyRound(v, 0);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = -1;
  for (const [r, n] of counts) {
    if (n > bestN || (n === bestN && (best === null || r < best))) {
      bestN = n;
      best = r;
    }
  }
  return best;
}

function _groupRows(rows: Row[]): Map<string, Row[]> {
  const batches = new Map<string, Row[]>();
  for (const r of rows) {
    const b = String(r.batch_no ?? "");
    if (!batches.has(b)) batches.set(b, []);
    batches.get(b)!.push(r);
  }
  return batches;
}

function _batchIsRtl(batchRows: Row[]): boolean {
  return batchRows.some((r) => r.is_rtl && _f(r.penyelesaian_qty) > 0);
}

function _skuAggregate(batchRows: Row[]): Array<{ kode: string; nama: string; qty: number; biaya: number; hpp: number }> {
  const agg = new Map<
    string,
    { kode: string; nama: string; qty: number; biaya: number }
  >();
  for (const r of batchRows) {
    if (!r.is_rtl || _f(r.penyelesaian_qty) <= 0) continue;
    const kode = String(r.kode ?? "");
    if (!kode) continue;
    let e = agg.get(kode);
    if (!e) {
      e = { kode, nama: String(r.bahan_biaya ?? ""), qty: 0, biaya: 0 };
      agg.set(kode, e);
    }
    e.qty += _f(r.penyelesaian_qty);
    e.biaya += _f(r.penyelesaian_biaya);
  }
  const skus: Array<{ kode: string; nama: string; qty: number; biaya: number; hpp: number }> = [];
  for (const e of agg.values()) {
    skus.push({ ...e, hpp: e.qty > 0 ? e.biaya / e.qty : 0 });
  }
  return skus;
}

function _mainOutputSku(
  skus: Array<{ kode: string; nama: string; qty: number }>,
): { kode: string; nama: string } | null {
  if (skus.length === 0) return null;
  let best = skus[0];
  for (const e of skus) if (e.qty > best.qty) best = e;
  return { kode: best.kode, nama: best.nama };
}

function _metricCostPerKg(m: { cost_potong: number; rtl_output: number }): number | null {
  return m.rtl_output > 0 ? m.cost_potong / m.rtl_output : null;
}

function _metricKgKarton(m: { rtl_output: number; karton: number }): number | null {
  return m.karton > 0 ? m.rtl_output / m.karton : null;
}

function _metricYield(m: { rtl_output: number; meat_input: number }): number | null {
  return m.meat_input > 0 ? (m.rtl_output / m.meat_input) * 100.0 : null;
}

function _allRtlMetrics(
  rows: Row[],
  excludeBatch: string | null = null,
): { cost: number | null; karton: number | null; yield: number | null; sku_hist: Record<string, number[]> } {
  const batches = _groupRows(rows);
  const rtlBatches: Record<string, Row[]> = {};
  for (const [b, br] of batches) {
    if (_batchIsRtl(br)) rtlBatches[b] = br;
  }

  const costs: number[] = [];
  const kartons: number[] = [];
  const yields: number[] = [];
  const skuHist: Record<string, number[]> = {};
  for (const [b, br] of Object.entries(rtlBatches)) {
    if (excludeBatch && b === excludeBatch) continue;
    const skus = _skuAggregate(br);
    const rtlOutput = skus.reduce((a, e) => a + e.qty, 0);
    for (const e of skus) {
      if (!skuHist[e.kode]) skuHist[e.kode] = [];
      skuHist[e.kode].push(e.hpp);
    }
    const meatInput = br
      .filter((r) => MEAT_TYPES.has(String(r.product_type ?? "")))
      .reduce((a, r) => a + _f(r.pengeluaran_qty), 0);
    const costPotong = br
      .filter((r) => r.product_type === "PROCESS_COST")
      .reduce((a, r) => a + _f(r.pengeluaran_biaya), 0);
    const karton = br
      .filter((r) => KARTON_KODES.has(String(r.kode ?? "")))
      .reduce((a, r) => a + _f(r.pengeluaran_qty), 0);
    if (rtlOutput > 0) {
      if (costPotong > 0) costs.push(costPotong / rtlOutput);
      if (karton > 0) kartons.push(rtlOutput / karton);
      if (meatInput > 0) yields.push((rtlOutput / meatInput) * 100.0);
    }
  }

  return {
    cost: _histAvg(costs),
    karton: _histAvg(kartons),
    yield: _histAvg(yields),
    sku_hist: skuHist,
  };
}

type ItemSummary = Record<string, any>;

function _itemSummaries(results: Array<Record<string, any>>, q: string | null): ItemSummary[] {
  const ql = q ? String(q).trim().toLowerCase() : null;
  const items = new Map<string, any>();
  const order: string[] = [];
  for (const x of results) {
    for (const s of x.sku_hpps) {
      const k = s.kode;
      if (ql && !(String(k).toLowerCase().includes(ql) || String(s.nama ?? "").toLowerCase().includes(ql))) {
        continue;
      }
      let e = items.get(k);
      if (e === undefined) {
        e = {
          kode: k,
          nama: s.nama ?? "",
          n_batch: 0,
          total_qty: 0,
          total_biaya: 0,
          hpp_vals: [],
          yields: [],
          costs: [],
          kartons: [],
          n_anomaly: 0,
          last_date: null,
          batch_sev: "NORMAL",
        };
        items.set(k, e);
        order.push(k);
      }
      e.n_batch += 1;
      e.total_qty += _f(s.qty);
      e.total_biaya += _f(s.biaya);
      if (_f(s.hpp) > 0) e.hpp_vals.push(_f(s.hpp));
      if (x.yield_pct !== null && x.yield_pct !== undefined) e.yields.push(x.yield_pct);
      if (x.cost_potong_per_kg !== null && x.cost_potong_per_kg !== undefined) e.costs.push(x.cost_potong_per_kg);
      if (x.kg_per_karton !== null && x.kg_per_karton !== undefined) e.kartons.push(x.kg_per_karton);
      const st = x.status ?? "NORMAL";
      if (st !== "NORMAL") {
        e.n_anomaly += 1;
        if ((SEVERITY_RANK[st] ?? 0) > (SEVERITY_RANK[e.batch_sev] ?? 0)) e.batch_sev = st;
      }
      const dd = x.tanggal ?? "";
      if (dd && (e.last_date === null || dd > e.last_date)) e.last_date = dd;
    }
  }

  const out: ItemSummary[] = [];
  for (const k of order) {
    const e = items.get(k)!;
    out.push({
      kode: k,
      nama: e.nama,
      n_batch: e.n_batch,
      total_qty: pyRound(e.total_qty, 2),
      total_biaya: pyRound(e.total_biaya, 2),
      avg_hpp: e.hpp_vals.length ? pyRound(e.hpp_vals.reduce((a: number, b: number) => a + b, 0) / e.hpp_vals.length, 2) : null,
      min_hpp: e.hpp_vals.length ? pyRound(Math.min(...e.hpp_vals), 2) : null,
      max_hpp: e.hpp_vals.length ? pyRound(Math.max(...e.hpp_vals), 2) : null,
      avg_yield_pct: e.yields.length ? pyRound(e.yields.reduce((a: number, b: number) => a + b, 0) / e.yields.length, 2) : null,
      min_yield_pct: e.yields.length ? pyRound(Math.min(...e.yields), 2) : null,
      max_yield_pct: e.yields.length ? pyRound(Math.max(...e.yields), 2) : null,
      mode_cost_potong_kg: _mode(e.costs),
      avg_kg_karton: e.kartons.length ? pyRound(e.kartons.reduce((a: number, b: number) => a + b, 0) / e.kartons.length, 2) : null,
      n_anomaly: e.n_anomaly,
      last_date: e.last_date,
      severity: e.batch_sev,
    });
  }
  out.sort((a, b) => b.total_qty - a.total_qty || (a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0));
  return out;
}

type Metric = {
  skus: ReturnType<typeof _skuAggregate>;
  rtl_output: number;
  meat_input: number;
  cost_potong: number;
  karton: number;
  plastik: number;
  tanggal: string;
  n_rows: number;
};

export function analyze(
  rows: Row[],
  params: Record<string, any> = {},
  settings: Record<string, any> | null = null,
  _products: unknown = null,
) {
  const cfg = _settings(settings);
  rows = _enrich(rows);
  rows = _exclude_output_rows(rows, _excluded_prefixes(cfg));

  const fFrom = params.from;
  const fTo = params.to;
  const fBatch = params.batch;
  const fSku = params.sku;
  const fQ = params.q;
  const fAnom = params.anomaly_type;
  const fSev = params.severity;

  if (fFrom) rows = rows.filter((r) => String(r.tanggal ?? "") >= fFrom);
  if (fTo) rows = rows.filter((r) => String(r.tanggal ?? "") <= fTo);
  if (fBatch) rows = rows.filter((r) => String(r.batch_no ?? "") === fBatch);

  // Filter kategori produk output: RTL = produk daging (non-RTLP), RTLP = bumbu/lainnya.
  // Baris input tetap; batch tanpa output kategori terpilih otomatis keluar dari analisis.
  const fCat = String(params.category ?? "");
  if (fCat === "RTL" || fCat === "RTLP") {
    rows = rows.filter((r) => {
      const isOutput = r.is_rtl && _f(r.penyelesaian_qty) > 0;
      if (!isOutput) return true;
      const nama = String(r.bahan_biaya ?? "").trim().toUpperCase();
      const isRtlp = nama.startsWith("RTLP");
      return fCat === "RTLP" ? isRtlp : !isRtlp;
    });
  }

  const batches = _groupRows(rows);
  const rtlBatches = new Map<string, Row[]>();
  for (const [b, br] of batches) {
    if (_batchIsRtl(br)) rtlBatches.set(b, br);
  }
  const nBatchAll = batches.size;

  const metrics = new Map<string, Metric>();
  for (const [b, br] of rtlBatches) {
    const skus = _skuAggregate(br);
    metrics.set(b, {
      skus,
      rtl_output: skus.reduce((a, e) => a + e.qty, 0),
      meat_input: br
        .filter((r) => MEAT_TYPES.has(String(r.product_type ?? "")))
        .reduce((a, r) => a + _f(r.pengeluaran_qty), 0),
      cost_potong: br
        .filter((r) => r.product_type === "PROCESS_COST")
        .reduce((a, r) => a + _f(r.pengeluaran_biaya), 0),
      karton: br
        .filter((r) => KARTON_KODES.has(String(r.kode ?? "")))
        .reduce((a, r) => a + _f(r.pengeluaran_qty), 0),
      plastik: br
        .filter((r) => PLASTIK_KARTON_KODES.has(String(r.kode ?? "")))
        .reduce((a, r) => a + _f(r.pengeluaran_qty), 0),
      tanggal: br.map((r) => String(r.tanggal ?? "")).reduce((a, b) => (a < b ? a : b), String(br[0]?.tanggal ?? "")),
      n_rows: br.length,
    });
  }

  function histMetric(fn: (m: Metric) => number | null, b: string): number | null {
    const vals: number[] = [];
    for (const [bb, m] of metrics) {
      if (bb === b) continue;
      const v = fn(m);
      if (v !== null && v !== undefined) vals.push(v);
    }
    return _histAvg(vals);
  }

  const skuHistAgg = new Map<string, number[]>();
  for (const m of metrics.values()) {
    for (const e of m.skus) {
      if (!skuHistAgg.has(e.kode)) skuHistAgg.set(e.kode, []);
      skuHistAgg.get(e.kode)!.push(e.hpp);
    }
  }

  const results: Array<Record<string, any>> = [];
  for (const [b, m] of metrics) {
    const rtlOutput = m.rtl_output;
    const costPerKg = _metricCostPerKg(m);
    const kgPerKarton = _metricKgKarton(m);
    const yieldPct = _metricYield(m);

    const histCost = histMetric(_metricCostPerKg, b);
    const histKarton = histMetric(_metricKgKarton, b);
    const histYield = histMetric(_metricYield, b);

    const anomalies: Array<Record<string, any>> = [];
    const mo = _mainOutputSku(m.skus);

    const vc = _variancePct(costPerKg, histCost);
    const sc = _severityVar(vc, Number(cfg.cost_var_watch), Number(cfg.cost_var_anomaly));
    if (sc && sc !== "NORMAL" && m.cost_potong > 0 && (vc ?? 0) > 0) {
      anomalies.push({
        type: "HIGH_CUTTING_COST",
        sku: mo?.kode ?? null,
        nama: mo?.nama ?? null,
        current: costPerKg,
        historical: histCost,
        variance_pct: vc,
        severity: sc,
      });
    }

    let kartonStatus = "NORMAL";
    if (kgPerKarton !== null && kgPerKarton !== undefined) {
      if (kgPerKarton < Number(cfg.karton_min_kg) || kgPerKarton > Number(cfg.karton_max_kg)) {
        kartonStatus = "ANOMALY";
      }
    }

    const vy = _variancePct(yieldPct, histYield);
    const sy = _severityVar(vy, Number(cfg.yield_var_watch), Number(cfg.yield_var_anomaly));
    if (
      sy &&
      sy !== "NORMAL" &&
      yieldPct !== null &&
      yieldPct !== undefined &&
      histYield !== null &&
      histYield !== undefined &&
      yieldPct < histYield
    ) {
      anomalies.push({
        type: "LOW_YIELD",
        sku: mo?.kode ?? null,
        nama: mo?.nama ?? null,
        current: yieldPct,
        historical: histYield,
        variance_pct: vy,
        severity: sy,
      });
    }

    const skuHpps: Array<Record<string, any>> = [];
    for (const e of m.skus) {
      const histHpp = _histAvg(skuHistAgg.get(e.kode) ?? []);
      const vh = _variancePct(e.hpp, histHpp);
      // HPP lebih mahal dari biasanya = buruk; lebih murah = kabar baik (tidak di-flag).
      const sh = (vh ?? 0) > 0 ? _severityVar(vh, Number(cfg.hpp_var_watch), Number(cfg.hpp_var_anomaly)) : null;
      skuHpps.push({
        kode: e.kode,
        nama: e.nama,
        qty: e.qty,
        biaya: e.biaya,
        hpp: e.hpp,
        hist_avg: histHpp,
        variance_pct: vh,
        severity: sh ?? "NORMAL",
      });
      if (sh && sh !== "NORMAL" && (vh ?? 0) > 0) {
        anomalies.push({
          type: "HIGH_HPP",
          sku: e.kode,
          nama: e.nama ?? "",
          current: e.hpp,
          historical: histHpp,
          variance_pct: vh,
          severity: sh,
        });
      }
    }

    const status = _worst(anomalies.map((a) => a.severity));
    const hpps = skuHpps.filter((s) => s.hpp > 0).map((s) => s.hpp);
    results.push({
      batch_no: b,
      tanggal: m.tanggal,
      n_rows: m.n_rows,
      rtl_output_kg: rtlOutput,
      meat_input_kg: m.meat_input,
      yield_pct: yieldPct,
      cost_potong_total: m.cost_potong,
      cost_potong_per_kg: costPerKg,
      karton_pcs: m.karton,
      plastik_karton_pcs: m.plastik,
      kg_per_karton: kgPerKarton,
      karton_status: kartonStatus,
      sku_hpps: skuHpps,
      sku_hpp_min: hpps.length ? Math.min(...hpps) : null,
      sku_hpp_max: hpps.length ? Math.max(...hpps) : null,
      anomalies,
      status,
    });
  }

  let resultsFiltered = results;
  if (fSku) {
    resultsFiltered = resultsFiltered.filter((x) => x.sku_hpps.some((s: any) => s.kode === fSku));
  }
  if (fQ) {
    const ql = String(fQ).trim().toLowerCase();
    resultsFiltered = resultsFiltered.filter((x) =>
      x.sku_hpps.some(
        (s: any) => String(s.kode).toLowerCase().includes(ql) || String(s.nama ?? "").toLowerCase().includes(ql),
      ),
    );
  }
  const anomTypes = fAnom
    ? String(fAnom)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (anomTypes.length > 0) {
    resultsFiltered = resultsFiltered.filter((x) => x.anomalies.some((a: any) => anomTypes.includes(a.type)));
  }
  if (fSev) {
    const rank = SEVERITY_RANK[fSev] ?? 0;
    resultsFiltered = resultsFiltered.filter((x) => (SEVERITY_RANK[x.status] ?? 0) >= rank);
  }

  resultsFiltered.sort(
    (a, b) => b.tanggal.localeCompare(a.tanggal) || b.batch_no.localeCompare(a.batch_no),
  );

  let allAnomalies: Array<Record<string, any>> = [];
  for (const x of resultsFiltered) {
    for (const a of x.anomalies) {
      allAnomalies.push({ ...a, batch_no: x.batch_no, tanggal: x.tanggal });
    }
  }
  if (anomTypes.length > 0) allAnomalies = allAnomalies.filter((a) => anomTypes.includes(a.type));
  if (fSev) allAnomalies = allAnomalies.filter((a) => a.severity === fSev);

  const totalOut = resultsFiltered.reduce((a, x) => a + x.rtl_output_kg, 0);
  const costs = resultsFiltered.filter((x) => x.cost_potong_per_kg !== null).map((x) => x.cost_potong_per_kg);
  const yields = resultsFiltered.filter((x) => x.yield_pct !== null).map((x) => x.yield_pct);
  const kartons = resultsFiltered.filter((x) => x.kg_per_karton !== null).map((x) => x.kg_per_karton);
  const hppBiaya = resultsFiltered.reduce((a, x) => a + x.sku_hpps.reduce((b: number, s: any) => b + _f(s.biaya), 0), 0);
  const hppQty = resultsFiltered.reduce((a, x) => a + x.sku_hpps.reduce((b: number, s: any) => b + _f(s.qty), 0), 0);
  const nAnomSku = allAnomalies.filter((a) => a.type === "HIGH_HPP").length;

  const dates = rows.filter((r) => r.tanggal).map((r) => String(r.tanggal));
  const skuHist = _itemSummaries(resultsFiltered, fQ);

  return {
    kpi: {
      n_rtl_batch: resultsFiltered.length,
      total_rtl_output_kg: pyRound(totalOut, 2),
      avg_cost_potong_kg: costs.length ? pyRound(_histAvg(costs)!, 2) : null,
      avg_yield_pct: yields.length ? pyRound(_histAvg(yields)!, 2) : null,
      avg_kg_karton: kartons.length ? pyRound(_histAvg(kartons)!, 2) : null,
      avg_hpp: hppQty > 0 ? pyRound(hppBiaya / hppQty, 2) : null,
      n_anomaly_batch: resultsFiltered.filter((x) => x.status !== "NORMAL").length,
      n_anomaly_sku: nAnomSku,
    },
    batches: resultsFiltered,
    anomalies: allAnomalies,
    sku_hist: skuHist,
    meta: {
      n_rtl_batch: resultsFiltered.length,
      n_batch_all: nBatchAll,
      from: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
      to: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    },
  };
}

export function detailBatch(rows: Row[], batchNo: string, settings: Record<string, any> | null = null) {
  const cfg = _settings(settings);
  rows = _enrich(rows);
  rows = _exclude_output_rows(rows, _excluded_prefixes(cfg));
  const batchRows = rows.filter((r) => String(r.batch_no ?? "") === batchNo);
  if (batchRows.length === 0) return { error: `Batch ${batchNo} tidak ditemukan` };

  const skus = _skuAggregate(batchRows);
  const mo = _mainOutputSku(skus);
  const rtlOutput = skus.reduce((a, e) => a + e.qty, 0);
  const isRtlBatch = _batchIsRtl(batchRows);

  const meatInput = batchRows
    .filter((r) => MEAT_TYPES.has(String(r.product_type ?? "")))
    .reduce((a, r) => a + _f(r.pengeluaran_qty), 0);
  const costPotong = batchRows
    .filter((r) => r.product_type === "PROCESS_COST")
    .reduce((a, r) => a + _f(r.pengeluaran_biaya), 0);
  const karton = batchRows
    .filter((r) => KARTON_KODES.has(String(r.kode ?? "")))
    .reduce((a, r) => a + _f(r.pengeluaran_qty), 0);
  const plastik = batchRows
    .filter((r) => PLASTIK_KARTON_KODES.has(String(r.kode ?? "")))
    .reduce((a, r) => a + _f(r.pengeluaran_qty), 0);
  const costPerKg = rtlOutput > 0 ? costPotong / rtlOutput : null;
  const kgPerKarton = karton > 0 ? rtlOutput / karton : null;
  const yieldPct = meatInput > 0 ? (rtlOutput / meatInput) * 100.0 : null;

  const inputs: Array<Record<string, any>> = [];
  for (const r of batchRows) {
    if (_f(r.pengeluaran_qty) > 0 || _f(r.pengeluaran_biaya) > 0) {
      inputs.push({
        kode: String(r.kode ?? ""),
        nama: String(r.bahan_biaya ?? ""),
        product_type: r.product_type,
        biaya: _f(r.pengeluaran_biaya),
        qty: _f(r.pengeluaran_qty),
      });
    }
  }

  const inputSummary = new Map<string, { biaya: number; qty: number }>();
  for (const i of inputs) {
    const k = String(i.product_type ?? "");
    const e = inputSummary.get(k) ?? { biaya: 0, qty: 0 };
    e.biaya += i.biaya;
    e.qty += i.qty;
    inputSummary.set(k, e);
  }

  const processCost = batchRows
    .filter((r) => r.product_type === "PROCESS_COST")
    .map((r) => ({ nama: String(r.bahan_biaya ?? ""), biaya: _f(r.pengeluaran_biaya) }));

  const packaging: Array<Record<string, any>> = [];
  for (const r of batchRows) {
    if (r.product_type === "PACKAGING" && (_f(r.pengeluaran_qty) > 0 || _f(r.pengeluaran_biaya) > 0)) {
      packaging.push({
        kode: String(r.kode ?? ""),
        nama: String(r.bahan_biaya ?? ""),
        qty: _f(r.pengeluaran_qty),
        biaya: _f(r.pengeluaran_biaya),
      });
    }
  }

  const allM = _allRtlMetrics(rows, batchNo);
  const histCost = allM.cost;
  const histKarton = allM.karton;
  const histYield = allM.yield;
  const skuHist = allM.sku_hist;

  const skuHpps: Array<Record<string, any>> = [];
  for (const e of skus) {
    const histHpp = _histAvg(skuHist[e.kode] ?? []);
    const vh = _variancePct(e.hpp, histHpp);
    // HPP lebih mahal dari biasanya = buruk; lebih murah = kabar baik (tidak di-flag).
    const sh = (vh ?? 0) > 0 ? _severityVar(vh, Number(cfg.hpp_var_watch), Number(cfg.hpp_var_anomaly)) : null;
    skuHpps.push({
      kode: e.kode,
      nama: e.nama,
      qty: e.qty,
      biaya: e.biaya,
      hpp: e.hpp,
      hist_avg: histHpp,
      variance_pct: vh,
      severity: sh ?? "NORMAL",
    });
  }

  const anomalies: Array<Record<string, any>> = [];
  const vc = _variancePct(costPerKg, histCost);
  const sc = _severityVar(vc, Number(cfg.cost_var_watch), Number(cfg.cost_var_anomaly));
  if (sc && sc !== "NORMAL" && costPotong > 0 && (vc ?? 0) > 0) {
    anomalies.push({
      type: "HIGH_CUTTING_COST",
      sku: mo?.kode ?? null,
      nama: mo?.nama ?? null,
      current: costPerKg,
      historical: histCost,
      variance_pct: vc,
      severity: sc,
    });
  }

  let kartonStatus = "NORMAL";
  if (kgPerKarton !== null && kgPerKarton !== undefined) {
    if (kgPerKarton < Number(cfg.karton_min_kg) || kgPerKarton > Number(cfg.karton_max_kg)) {
      kartonStatus = "ANOMALY";
    }
  }

  const vy = _variancePct(yieldPct, histYield);
  const sy = _severityVar(vy, Number(cfg.yield_var_watch), Number(cfg.yield_var_anomaly));
  if (
    sy &&
    sy !== "NORMAL" &&
    yieldPct !== null &&
    yieldPct !== undefined &&
    histYield !== null &&
    histYield !== undefined &&
    yieldPct < histYield
  ) {
    anomalies.push({
      type: "LOW_YIELD",
      sku: mo?.kode ?? null,
      nama: mo?.nama ?? null,
      current: yieldPct,
      historical: histYield,
      variance_pct: vy,
      severity: sy,
    });
  }

  for (const s of skuHpps) {
    if (s.severity !== "NORMAL" && (s.variance_pct ?? 0) > 0) {
      anomalies.push({
        type: "HIGH_HPP",
        sku: s.kode,
        nama: s.nama ?? "",
        current: s.hpp,
        historical: s.hist_avg,
        variance_pct: s.variance_pct,
        severity: s.severity,
      });
    }
  }

  const status = _worst(anomalies.map((a) => a.severity));
  const tanggal = batchRows
    .map((r) => String(r.tanggal ?? ""))
    .reduce((a, b) => (a < b ? a : b), String(batchRows[0]?.tanggal ?? ""));

  return {
    batch_no: batchNo,
    tanggal,
    is_rtl_batch: isRtlBatch,
    main_output: skuHpps,
    total_rtl_output_kg: rtlOutput,
    inputs: [...inputs].sort((a, b) => b.biaya - a.biaya),
    input_summary: Array.from(inputSummary.entries()).map(([k, v]) => ({
      product_type: k,
      biaya: v.biaya,
      qty: v.qty,
    })),
    process_cost: processCost,
    packaging,
    meat_input_kg: meatInput,
    yield_pct: yieldPct,
    karton_pcs: karton,
    plastik_karton_pcs: plastik,
    kg_per_karton: kgPerKarton,
    karton_status: kartonStatus,
    cost_potong_total: costPotong,
    cost_potong_per_kg: costPerKg,
    historical: {
      cost_potong_kg: { current: costPerKg, avg: histCost, variance_pct: vc },
      yield_pct: { current: yieldPct, avg: histYield, variance_pct: vy },
      kg_karton: { current: kgPerKarton, avg: histKarton, variance_pct: _variancePct(kgPerKarton, histKarton) },
    },
    anomalies,
    status,
    raw_rows: batchRows,
  };
}