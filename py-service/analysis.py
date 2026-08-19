"""Analisis biaya & yield berbasis Batch No. sesuai PRD Hijrahfood.

READ -> CALCULATE -> COMPARE -> FLAG
Tidak melakukan allocation cost antar SKU berdasarkan proporsi quantity.
HPP SKU RTL diambil dari Penyelesaian Pesanan (Biaya / Kuantitas) pada baris yang sama.
"""

from collections import defaultdict

# Packaging karton: kardus (dihitung sebagai karton) + plastik karton (pembungkus kardus).
# 1 karton dipakai = 1 plastik karton dipakai; keduanya ditampilkan agar bisa dicek pasangannya.
KARTON_KODES = {"100929", "100928", "100927"}
PLASTIK_KARTON_KODES = {"R102252", "R102253", "R102253X"}

# Jenis yang dihitung sebagai "input daging" (penyebut yield).
# Termasuk item RTL yang dipakai sebagai bahan baku (mis. repack/rename RTL -> RTL).
MEAT_TYPES = {"RAW_MATERIAL", "BY_PRODUCT", "FINISHED_PRODUCT"}
SEVERITY_RANK = {"NORMAL": 0, "WATCH": 1, "ANOMALY": 2}


def _f(v):
    return 0.0 if v is None else float(v)


def _fallback_product(kode, nama):
    n = str(nama or "").strip()
    up = n.upper()
    k = str(kode or "").strip()
    if n.startswith("Biaya"):
        return {"product_type": "PROCESS_COST", "is_rtl": False}
    if ("KARTON" in up or "PLASTIK" in up or "LABEL" in up or "ABSORBER" in up) and "BRISKET PE" not in up:
        return {"product_type": "PACKAGING", "is_rtl": False}
    if n.startswith("Sample -"):
        return {"product_type": "OTHER", "is_rtl": False}
    if n.startswith("RTL") or n.startswith("RTLP"):
        return {"product_type": "FINISHED_PRODUCT", "is_rtl": True}
    if k.startswith("R") or k.startswith("P") or k.startswith("RAW"):
        return {"product_type": "FINISHED_PRODUCT", "is_rtl": True}
    return {"product_type": "OTHER", "is_rtl": False}


def _enrich(rows):
    out = []
    for r in rows:
        r = dict(r)
        ptype = r.get("product_type")
        if ptype in (None, ""):
            fb = _fallback_product(r.get("kode"), r.get("bahan_biaya"))
            r["product_type"] = fb["product_type"]
            r["is_rtl"] = bool(r.get("is_rtl") or fb["is_rtl"])
        else:
            r["product_type"] = str(ptype)
            r["is_rtl"] = bool(r.get("is_rtl"))
        r.setdefault("is_by_product", r.get("product_type") == "BY_PRODUCT")
        r.setdefault("is_packaging", r.get("product_type") == "PACKAGING")
        out.append(r)
    return out


def _settings(s):
    d = {
        "karton_min_kg": 10,
        "karton_max_kg": 15,
        "cost_var_watch": 10,
        "cost_var_anomaly": 20,
        "yield_var_watch": 10,
        "yield_var_anomaly": 20,
        "hpp_var_watch": 10,
        "hpp_var_anomaly": 20,
        "exclude_name_prefixes": "RTL CST",
    }
    if s:
        for k in d:
            v = s.get(k)
            if v is None:
                continue
            if isinstance(v, (int, float)):
                d[k] = float(v)
            elif k == "exclude_name_prefixes":
                d[k] = str(v)
            else:
                try:
                    d[k] = float(v)
                except (TypeError, ValueError):
                    pass
    return d


def _excluded_prefixes(s):
    raw = str((s or {}).get("exclude_name_prefixes") or "")
    return tuple(p.strip().upper() for p in raw.split(",") if p.strip())


def _exclude_output_rows(rows, prefixes):
    """Sembunyikan output RTL yang namanya diawali prefix dikecualikan (mis. RTL CST)
    HANYA bila seluruh output RTL pada batch tsb berprefix dikecualikan.
    Bila batch mencampur item RTL normal + RTL CST, semua output dipertahankan
    agar yield batch tidak terdistorsi."""
    if not prefixes:
        return rows
    out = []
    for br in _group_rows(rows).values():
        rtl_out = [
            r for r in br
            if r.get("is_rtl") and _f(r.get("penyelesaian_qty")) > 0
        ]
        all_excluded = bool(rtl_out) and all(
            str(r.get("bahan_biaya") or "").upper().startswith(prefixes)
            for r in rtl_out
        )
        if all_excluded:
            br = [
                r for r in br
                if not (r.get("is_rtl") and _f(r.get("penyelesaian_qty")) > 0)
            ]
        out.extend(br)
    return out


def _variance_pct(current, hist):
    if hist is None or current is None or hist == 0:
        return None
    return (current - hist) / hist * 100.0


def _severity_var(var, watch, anomaly):
    if var is None:
        return None
    if abs(var) >= anomaly:
        return "ANOMALY"
    if abs(var) >= watch:
        return "WATCH"
    return "NORMAL"


def _worst(sev_list):
    return max(sev_list, key=lambda s: SEVERITY_RANK.get(s, 0), default="NORMAL")


def _hist_avg(values):
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _mode(values):
    """Nilai paling sering muncul (hanya nilai > 0). Dikelompokkan ke rupiah penuh;
    jika seri, ambil nilai terkecil."""
    vals = [v for v in values if v is not None and v > 0]
    if not vals:
        return None
    counts = {}
    for v in vals:
        counts[round(v)] = counts.get(round(v), 0) + 1
    best = None
    best_n = -1
    for r, n in counts.items():
        if n > best_n or (n == best_n and (best is None or r < best)):
            best_n = n
            best = r
    return best


def _group_rows(rows):
    batches = defaultdict(list)
    for r in rows:
        batches[str(r.get("batch_no") or "")].append(r)
    return batches


def _batch_is_rtl(batch_rows):
    return any(r.get("is_rtl") and _f(r.get("penyelesaian_qty")) > 0 for r in batch_rows)


def _sku_aggregate(batch_rows):
    agg = {}
    for r in batch_rows:
        if not r.get("is_rtl") or _f(r.get("penyelesaian_qty")) <= 0:
            continue
        kode = str(r.get("kode") or "")
        if not kode:
            continue
        e = agg.setdefault(kode, {
            "kode": kode,
            "nama": str(r.get("bahan_biaya") or ""),
            "qty": 0.0,
            "biaya": 0.0,
        })
        e["qty"] += _f(r.get("penyelesaian_qty"))
        e["biaya"] += _f(r.get("penyelesaian_biaya"))
    skus = []
    for e in agg.values():
        e["hpp"] = e["biaya"] / e["qty"] if e["qty"] > 0 else 0.0
        skus.append(e)
    return skus


def _metric_cost_per_kg(m):
    return m["cost_potong"] / m["rtl_output"] if m["rtl_output"] > 0 else None


def _metric_kg_karton(m):
    return m["rtl_output"] / m["karton"] if m["karton"] > 0 else None


def _metric_yield(m):
    return m["rtl_output"] / m["meat_input"] * 100.0 if m["meat_input"] > 0 else None


def _all_rtl_metrics(rows, exclude_batch=None):
    """Rata-rata historis metrik dari seluruh batch RTL (meng-exclude satu batch)."""
    batches = _group_rows(rows)
    rtl_batches = {b: br for b, br in batches.items() if _batch_is_rtl(br)}

    costs = []
    kartons = []
    yields_ = []
    sku_hist = defaultdict(list)
    for b, br in rtl_batches.items():
        if exclude_batch and b == exclude_batch:
            continue
        skus = _sku_aggregate(br)
        rtl_output = sum(e["qty"] for e in skus)
        for e in skus:
            sku_hist[e["kode"]].append(e["hpp"])
        meat_input = sum(
            _f(r.get("pengeluaran_qty"))
            for r in br if r.get("product_type") in MEAT_TYPES
        )
        cost_potong = sum(
            _f(r.get("pengeluaran_biaya"))
            for r in br if r.get("product_type") == "PROCESS_COST"
        )
        karton = sum(
            _f(r.get("pengeluaran_qty"))
            for r in br if str(r.get("kode") or "") in KARTON_KODES
        )
        if rtl_output > 0:
            if cost_potong > 0:
                costs.append(cost_potong / rtl_output)
            if karton > 0:
                kartons.append(rtl_output / karton)
            if meat_input > 0:
                yields_.append(rtl_output / meat_input * 100.0)

    return {
        "cost": _hist_avg(costs),
        "karton": _hist_avg(kartons),
        "yield": _hist_avg(yields_),
        "sku_hist": dict(sku_hist),
    }


def _item_summaries(results, q=None):
    """Rekap per item RTL dari daftar batch hasil filter."""
    ql = str(q).strip().lower() if q else None
    items = {}
    order = []
    for x in results:
        for s in x["sku_hpps"]:
            k = s["kode"]
            if ql and not (ql in str(k).lower() or ql in str(s.get("nama") or "").lower()):
                continue
            e = items.get(k)
            if e is None:
                e = {
                    "kode": k, "nama": s.get("nama") or "",
                    "n_batch": 0, "total_qty": 0.0, "total_biaya": 0.0,
                    "hpp_vals": [], "yields": [], "costs": [], "kartons": [],
                    "n_anomaly": 0, "last_date": None, "batch_sev": "NORMAL",
                }
                items[k] = e
                order.append(k)
            e["n_batch"] += 1
            e["total_qty"] += _f(s.get("qty"))
            e["total_biaya"] += _f(s.get("biaya"))
            if _f(s.get("hpp")) > 0:
                e["hpp_vals"].append(_f(s["hpp"]))
            if x.get("yield_pct") is not None:
                e["yields"].append(x["yield_pct"])
            if x.get("cost_potong_per_kg") is not None:
                e["costs"].append(x["cost_potong_per_kg"])
            if x.get("kg_per_karton") is not None:
                e["kartons"].append(x["kg_per_karton"])
            st = x.get("status") or "NORMAL"
            if st != "NORMAL":
                e["n_anomaly"] += 1
                if SEVERITY_RANK.get(st, 0) > SEVERITY_RANK.get(e["batch_sev"], 0):
                    e["batch_sev"] = st
            d = x.get("tanggal") or ""
            if d and (e["last_date"] is None or d > e["last_date"]):
                e["last_date"] = d

    out = []
    for k in order:
        e = items[k]
        out.append({
            "kode": k,
            "nama": e["nama"],
            "n_batch": e["n_batch"],
            "total_qty": round(e["total_qty"], 2),
            "total_biaya": round(e["total_biaya"], 2),
            "avg_hpp": round(sum(e["hpp_vals"]) / len(e["hpp_vals"]), 2) if e["hpp_vals"] else None,
            "min_hpp": round(min(e["hpp_vals"]), 2) if e["hpp_vals"] else None,
            "max_hpp": round(max(e["hpp_vals"]), 2) if e["hpp_vals"] else None,
            "avg_yield_pct": round(sum(e["yields"]) / len(e["yields"]), 2) if e["yields"] else None,
            "min_yield_pct": round(min(e["yields"]), 2) if e["yields"] else None,
            "max_yield_pct": round(max(e["yields"]), 2) if e["yields"] else None,
            "mode_cost_potong_kg": _mode(e["costs"]),
            "avg_kg_karton": round(sum(e["kartons"]) / len(e["kartons"]), 2) if e["kartons"] else None,
            "n_anomaly": e["n_anomaly"],
            "last_date": e["last_date"],
            "severity": e["batch_sev"],
        })
    out.sort(key=lambda x: (-x["total_qty"], x["kode"]))
    return out


def analyze(rows, params=None, settings=None, products=None):
    cfg = _settings(settings)
    rows = _enrich(rows)
    rows = _exclude_output_rows(rows, _excluded_prefixes(cfg))
    params = params or {}

    f_from = params.get("from")
    f_to = params.get("to")
    f_batch = params.get("batch")
    f_sku = params.get("sku")
    f_q = params.get("q")
    f_anom = params.get("anomaly_type")
    f_sev = params.get("severity")

    if f_from:
        rows = [r for r in rows if str(r.get("tanggal") or "") >= f_from]
    if f_to:
        rows = [r for r in rows if str(r.get("tanggal") or "") <= f_to]
    if f_batch:
        rows = [r for r in rows if str(r.get("batch_no") or "") == f_batch]

    batches = _group_rows(rows)
    rtl_batches = {b: br for b, br in batches.items() if _batch_is_rtl(br)}
    n_batch_all = len(batches)

    metrics = {}
    for b, br in rtl_batches.items():
        skus = _sku_aggregate(br)
        m = {
            "skus": skus,
            "rtl_output": sum(e["qty"] for e in skus),
            "meat_input": sum(
                _f(r.get("pengeluaran_qty"))
                for r in br if r.get("product_type") in MEAT_TYPES
            ),
            "cost_potong": sum(
                _f(r.get("pengeluaran_biaya"))
                for r in br if r.get("product_type") == "PROCESS_COST"
            ),
            "karton": sum(
                _f(r.get("pengeluaran_qty"))
                for r in br if str(r.get("kode") or "") in KARTON_KODES
            ),
            "plastik": sum(
                _f(r.get("pengeluaran_qty"))
                for r in br if str(r.get("kode") or "") in PLASTIK_KARTON_KODES
            ),
            "tanggal": min(str(r.get("tanggal") or "") for r in br),
            "n_rows": len(br),
        }
        metrics[b] = m

    def hist_metric(fn, b):
        vals = []
        for bb, m in metrics.items():
            if bb == b:
                continue
            v = fn(m)
            if v is not None:
                vals.append(v)
        return _hist_avg(vals)

    sku_hist_agg = defaultdict(list)
    for m in metrics.values():
        for e in m["skus"]:
            sku_hist_agg[e["kode"]].append(e["hpp"])

    results = []
    for b, m in metrics.items():
        rtl_output = m["rtl_output"]
        cost_per_kg = _metric_cost_per_kg(m)
        kg_per_karton = _metric_kg_karton(m)
        yield_pct = _metric_yield(m)

        hist_cost = hist_metric(_metric_cost_per_kg, b)
        hist_karton = hist_metric(_metric_kg_karton, b)
        hist_yield = hist_metric(_metric_yield, b)

        anomalies = []

        vc = _variance_pct(cost_per_kg, hist_cost)
        sc = _severity_var(vc, cfg["cost_var_watch"], cfg["cost_var_anomaly"])
        if sc and sc != "NORMAL" and m["cost_potong"] > 0 and (vc or 0) > 0:
            anomalies.append({
                "type": "HIGH_CUTTING_COST", "sku": None, "nama": None,
                "current": cost_per_kg, "historical": hist_cost,
                "variance_pct": vc, "severity": sc,
            })

        karton_status = "NORMAL"
        if kg_per_karton is not None:
            if kg_per_karton < cfg["karton_min_kg"] or kg_per_karton > cfg["karton_max_kg"]:
                karton_status = "ANOMALY"

        vy = _variance_pct(yield_pct, hist_yield)
        sy = _severity_var(vy, cfg["yield_var_watch"], cfg["yield_var_anomaly"])
        if sy and sy != "NORMAL" and yield_pct is not None and hist_yield is not None and yield_pct < hist_yield:
            anomalies.append({
                "type": "LOW_YIELD", "sku": None,
                "current": yield_pct, "historical": hist_yield,
                "variance_pct": vy, "severity": sy,
            })

        sku_hpps = []
        for e in m["skus"]:
            hist_hpp = _hist_avg(sku_hist_agg[e["kode"]])
            vh = _variance_pct(e["hpp"], hist_hpp)
            sh = _severity_var(vh, cfg["hpp_var_watch"], cfg["hpp_var_anomaly"])
            sku_hpps.append({
                "kode": e["kode"], "nama": e["nama"], "qty": e["qty"],
                "biaya": e["biaya"], "hpp": e["hpp"],
                "hist_avg": hist_hpp, "variance_pct": vh,
                "severity": sh or "NORMAL",
            })
            if sh and sh != "NORMAL" and (vh or 0) > 0:
                anomalies.append({
                    "type": "HIGH_HPP", "sku": e["kode"], "nama": e.get("nama") or "",
                    "current": e["hpp"], "historical": hist_hpp,
                    "variance_pct": vh, "severity": sh,
                })

        status = _worst([a["severity"] for a in anomalies])
        hpps = [s["hpp"] for s in sku_hpps if s["hpp"] > 0]
        results.append({
            "batch_no": b,
            "tanggal": m["tanggal"],
            "n_rows": m["n_rows"],
            "rtl_output_kg": rtl_output,
            "meat_input_kg": m["meat_input"],
            "yield_pct": yield_pct,
            "cost_potong_total": m["cost_potong"],
            "cost_potong_per_kg": cost_per_kg,
            "karton_pcs": m["karton"],
            "plastik_karton_pcs": m["plastik"],
            "kg_per_karton": kg_per_karton,
            "karton_status": karton_status,
            "sku_hpps": sku_hpps,
            "sku_hpp_min": min(hpps) if hpps else None,
            "sku_hpp_max": max(hpps) if hpps else None,
            "anomalies": anomalies,
            "status": status,
        })

    if f_sku:
        results = [x for x in results if any(s["kode"] == f_sku for s in x["sku_hpps"])]
    if f_q:
        ql = str(f_q).strip().lower()
        results = [
            x for x in results
            if any(
                ql in str(s["kode"]).lower() or ql in str(s.get("nama") or "").lower()
                for s in x["sku_hpps"]
            )
        ]
    if f_anom:
        results = [x for x in results if any(a["type"] == f_anom for a in x["anomalies"])]
    if f_sev:
        rank = SEVERITY_RANK.get(f_sev, 0)
        results = [x for x in results if SEVERITY_RANK.get(x["status"], 0) >= rank]

    results.sort(key=lambda x: (x["tanggal"], x["batch_no"]), reverse=True)

    all_anomalies = [
        {**a, "batch_no": x["batch_no"], "tanggal": x["tanggal"]}
        for x in results
        for a in x["anomalies"]
    ]
    if f_anom:
        all_anomalies = [a for a in all_anomalies if a["type"] == f_anom]
    if f_sev:
        all_anomalies = [a for a in all_anomalies if a["severity"] == f_sev]
    total_out = sum(x["rtl_output_kg"] for x in results)
    costs = [x["cost_potong_per_kg"] for x in results if x["cost_potong_per_kg"] is not None]
    yields = [x["yield_pct"] for x in results if x["yield_pct"] is not None]
    kartons = [x["kg_per_karton"] for x in results if x["kg_per_karton"] is not None]
    hpp_biaya = sum(s["biaya"] for x in results for s in x["sku_hpps"])
    hpp_qty = sum(s["qty"] for x in results for s in x["sku_hpps"])
    n_anom_sku = sum(1 for a in all_anomalies if a["type"] == "HIGH_HPP")

    dates = [str(r.get("tanggal") or "") for r in rows if r.get("tanggal")]
    sku_hist = _item_summaries(results, f_q)

    return {
        "kpi": {
            "n_rtl_batch": len(results),
            "total_rtl_output_kg": round(total_out, 2),
            "avg_cost_potong_kg": round(_hist_avg(costs), 2) if costs else None,
            "avg_yield_pct": round(_hist_avg(yields), 2) if yields else None,
            "avg_kg_karton": round(_hist_avg(kartons), 2) if kartons else None,
            "avg_hpp": round(hpp_biaya / hpp_qty, 2) if hpp_qty > 0 else None,
            "n_anomaly_batch": sum(1 for x in results if x["status"] != "NORMAL"),
            "n_anomaly_sku": n_anom_sku,
        },
        "batches": results,
        "anomalies": all_anomalies,
        "sku_hist": sku_hist,
        "meta": {
            "n_rtl_batch": len(results),
            "n_batch_all": n_batch_all,
            "from": min(dates) if dates else None,
            "to": max(dates) if dates else None,
        },
    }


def detail_batch(rows, batch_no, settings=None):
    cfg = _settings(settings)
    rows = _enrich(rows)
    rows = _exclude_output_rows(rows, _excluded_prefixes(cfg))
    batch_rows = [r for r in rows if str(r.get("batch_no") or "") == batch_no]
    if not batch_rows:
        return {"error": f"Batch {batch_no} tidak ditemukan"}

    skus = _sku_aggregate(batch_rows)
    rtl_output = sum(e["qty"] for e in skus)
    is_rtl_batch = _batch_is_rtl(batch_rows)

    meat_input = sum(
        _f(r.get("pengeluaran_qty"))
        for r in batch_rows if r.get("product_type") in MEAT_TYPES
    )
    cost_potong = sum(
        _f(r.get("pengeluaran_biaya"))
        for r in batch_rows if r.get("product_type") == "PROCESS_COST"
    )
    karton = sum(
        _f(r.get("pengeluaran_qty"))
        for r in batch_rows if str(r.get("kode") or "") in KARTON_KODES
    )
    plastik = sum(
        _f(r.get("pengeluaran_qty"))
        for r in batch_rows if str(r.get("kode") or "") in PLASTIK_KARTON_KODES
    )
    cost_per_kg = cost_potong / rtl_output if rtl_output > 0 else None
    kg_per_karton = rtl_output / karton if karton > 0 else None
    yield_pct = rtl_output / meat_input * 100.0 if meat_input > 0 else None

    inputs = []
    for r in batch_rows:
        if _f(r.get("pengeluaran_qty")) > 0 or _f(r.get("pengeluaran_biaya")) > 0:
            inputs.append({
                "kode": str(r.get("kode") or ""),
                "nama": str(r.get("bahan_biaya") or ""),
                "product_type": r.get("product_type"),
                "biaya": _f(r.get("pengeluaran_biaya")),
                "qty": _f(r.get("pengeluaran_qty")),
            })

    input_summary = defaultdict(lambda: {"biaya": 0.0, "qty": 0.0})
    for i in inputs:
        input_summary[i["product_type"]]["biaya"] += i["biaya"]
        input_summary[i["product_type"]]["qty"] += i["qty"]

    process_cost = [
        {"nama": str(r.get("bahan_biaya") or ""), "biaya": _f(r.get("pengeluaran_biaya"))}
        for r in batch_rows if r.get("product_type") == "PROCESS_COST"
    ]

    packaging = []
    for r in batch_rows:
        if r.get("product_type") == "PACKAGING" and (_f(r.get("pengeluaran_qty")) > 0 or _f(r.get("pengeluaran_biaya")) > 0):
            packaging.append({
                "kode": str(r.get("kode") or ""),
                "nama": str(r.get("bahan_biaya") or ""),
                "qty": _f(r.get("pengeluaran_qty")),
                "biaya": _f(r.get("pengeluaran_biaya")),
            })

    # Historical dari batch lain (hanya batch RTL)
    all_m = _all_rtl_metrics(rows, batch_no)
    hist_cost = all_m["cost"]
    hist_karton = all_m["karton"]
    hist_yield = all_m["yield"]
    sku_hist = all_m["sku_hist"]

    sku_hpps = []
    for e in skus:
        hist_hpp = _hist_avg(sku_hist.get(e["kode"], []))
        vh = _variance_pct(e["hpp"], hist_hpp)
        sh = _severity_var(vh, cfg["hpp_var_watch"], cfg["hpp_var_anomaly"])
        sku_hpps.append({
            "kode": e["kode"], "nama": e["nama"], "qty": e["qty"],
            "biaya": e["biaya"], "hpp": e["hpp"],
            "hist_avg": hist_hpp, "variance_pct": vh, "severity": sh or "NORMAL",
        })

    anomalies = []
    vc = _variance_pct(cost_per_kg, hist_cost)
    sc = _severity_var(vc, cfg["cost_var_watch"], cfg["cost_var_anomaly"])
    if sc and sc != "NORMAL" and cost_potong > 0 and (vc or 0) > 0:
        anomalies.append({"type": "HIGH_CUTTING_COST", "sku": None, "nama": None,
                          "current": cost_per_kg, "historical": hist_cost,
                          "variance_pct": vc, "severity": sc})

    karton_status = "NORMAL"
    if kg_per_karton is not None:
        if kg_per_karton < cfg["karton_min_kg"] or kg_per_karton > cfg["karton_max_kg"]:
            karton_status = "ANOMALY"

    vy = _variance_pct(yield_pct, hist_yield)
    sy = _severity_var(vy, cfg["yield_var_watch"], cfg["yield_var_anomaly"])
    if sy and sy != "NORMAL" and yield_pct is not None and hist_yield is not None and yield_pct < hist_yield:
        anomalies.append({"type": "LOW_YIELD", "sku": None, "current": yield_pct,
                          "historical": hist_yield, "variance_pct": vy, "severity": sy})

    for s in sku_hpps:
        if s["severity"] != "NORMAL" and (s.get("variance_pct") or 0) > 0:
            anomalies.append({"type": "HIGH_HPP", "sku": s["kode"], "nama": s.get("nama") or "",
                              "current": s["hpp"], "historical": s["hist_avg"],
                              "variance_pct": s["variance_pct"], "severity": s["severity"]})

    status = _worst([a["severity"] for a in anomalies])
    tanggal = min(str(r.get("tanggal") or "") for r in batch_rows)

    return {
        "batch_no": batch_no,
        "tanggal": tanggal,
        "is_rtl_batch": is_rtl_batch,
        "main_output": sku_hpps,
        "total_rtl_output_kg": rtl_output,
        "inputs": sorted(inputs, key=lambda i: -i["biaya"]),
        "input_summary": [
            {"product_type": k, "biaya": v["biaya"], "qty": v["qty"]}
            for k, v in input_summary.items()
        ],
        "process_cost": process_cost,
        "packaging": packaging,
        "meat_input_kg": meat_input,
        "yield_pct": yield_pct,
        "karton_pcs": karton,
        "plastik_karton_pcs": plastik,
        "kg_per_karton": kg_per_karton,
        "karton_status": karton_status,
        "cost_potong_total": cost_potong,
        "cost_potong_per_kg": cost_per_kg,
        "historical": {
            "cost_potong_kg": {"current": cost_per_kg, "avg": hist_cost, "variance_pct": vc},
            "yield_pct": {"current": yield_pct, "avg": hist_yield, "variance_pct": vy},
            "kg_karton": {"current": kg_per_karton, "avg": hist_karton,
                          "variance_pct": _variance_pct(kg_per_karton, hist_karton)},
        },
        "anomalies": anomalies,
        "status": status,
        "raw_rows": batch_rows,
    }