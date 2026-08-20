"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisParams, AnalysisResult } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { pythonHealth } from "@/lib/python";
import { EmptyState, SkeletonRows } from "./ui";
import KpiCards from "./KpiCards";
import ItemTable from "./ItemTable";
import ItemHistoryModal from "./ItemHistoryModal";
import BatchDetailModal from "./BatchDetailModal";
import AnomalyView from "./AnomalyView";
import RawDataView from "./RawDataView";
import ProductMaster from "./ProductMaster";
import UploadPanel from "./UploadPanel";

type Tab = "batches" | "anomalies" | "raw" | "products" | "upload";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("batches");
  const [pyOk, setPyOk] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [batch, setBatch] = useState("");
  const [q, setQ] = useState("");
  const [anomalyType, setAnomalyType] = useState("");
  const [severity, setSeverity] = useState("");
  const filtersRef = useRef({ from, to, batch, q, anomalyType, severity });

  const runAnalysis = useCallback(async (f: AnalysisParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Analisis gagal");
      setAnalysis(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan saat analisis");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = useCallback(async () => {
    const f = filtersRef.current;
    await runAnalysis({
      from: f.from || undefined,
      to: f.to || undefined,
      batch: f.batch || undefined,
      q: f.q || undefined,
      anomaly_type: f.anomalyType || undefined,
      severity: f.severity || undefined,
    });
  }, [runAnalysis]);

  useEffect(() => {
    filtersRef.current = { from, to, batch, q, anomalyType, severity };
  }, [from, to, batch, q, anomalyType, severity]);

  useEffect(() => {
    pythonHealth().then(setPyOk);
    runAnalysis({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = analysis?.meta;
  const hasData = analysis !== null;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-5 sm:px-6">
      <Header
        pyOk={pyOk}
        tab={tab}
        onTab={setTab}
        analysis={analysis}
      />

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!pyOk && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Service analisis Python (port 8000) tidak terdeteksi. Jalankan{" "}
          <code className="font-mono text-xs">py-service/start.bat</code> agar upload Excel &
          analisis berfungsi.
        </div>
      )}

      {tab === "batches" && (
        <>
          <FilterBar
            from={from}
            to={to}
            batch={batch}
            q={q}
            anomalyType={anomalyType}
            severity={severity}
            loading={loading}
            onFrom={setFrom}
            onTo={setTo}
            onBatch={setBatch}
            onQ={setQ}
            onAnomalyType={setAnomalyType}
            onSeverity={setSeverity}
            onApply={applyFilters}
          />
          {loading && !hasData && (
            <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-panel)]">
              <SkeletonRows n={8} h="h-10" />
            </div>
          )}
          {hasData && analysis.kpi && <KpiCards kpi={analysis.kpi} />}
          {hasData && (
            <div className="mt-4">
              <ItemTable
                items={analysis.sku_hist}
                onOpen={(kode) => setOpenItem(kode)}
              />
            </div>
          )}
          {!hasData && !loading && (
            <div className="mt-4">
              <EmptyState
                title="Belum ada hasil analisis"
                hint="Upload file Excel terlebih dahulu, atau pastikan Python service aktif."
              />
            </div>
          )}
        </>
      )}

      {tab === "anomalies" && (
        <div className="space-y-4">
          <FilterBar
            from={from}
            to={to}
            batch={batch}
            q={q}
            anomalyType={anomalyType}
            severity={severity}
            loading={loading}
            onFrom={setFrom}
            onTo={setTo}
            onBatch={setBatch}
            onQ={setQ}
            onAnomalyType={setAnomalyType}
            onSeverity={setSeverity}
            onApply={applyFilters}
          />
          {loading && !hasData && <SkeletonRows n={8} h="h-10" />}
          {hasData ? (
            <AnomalyView anomalies={analysis.anomalies} onOpenBatch={setOpenBatch} />
          ) : (
            <EmptyState title="Belum ada hasil analisis" hint="Upload file Excel terlebih dahulu." />
          )}
        </div>
      )}

      {tab === "raw" && <RawDataView onOpenBatch={setOpenBatch} />}

      {tab === "products" && <ProductMaster />}

      {tab === "upload" && (
        <div className="mx-auto w-full max-w-md">
          <UploadPanel onUploaded={applyFilters} />
        </div>
      )}

      {openItem &&
        (() => {
          const item = analysis?.sku_hist.find((i) => i.kode === openItem) ?? null;
          return item ? (
            <ItemHistoryModal
              item={item}
              onClose={() => setOpenItem(null)}
              onOpenBatch={(b) => setOpenBatch(b)}
            />
          ) : null;
        })()}

      {openBatch && <BatchDetailModal batchNo={openBatch} onClose={() => setOpenBatch(null)} />}

      {meta && (
        <p className="tnum mt-4 pb-4 text-center text-[11px] text-ink-3">
{fmtNum(meta.n_rtl_batch, 0)} batch RTL dari {fmtNum(meta.n_batch_all, 0)} batch
          {meta.from && meta.to ? ` · ${meta.from} s/d ${meta.to}` : ""}
        </p>
      )}
    </div>
  );
}

/* ---------------- header ---------------- */

function Header({
  pyOk,
  tab,
  onTab,
  analysis,
}: {
  pyOk: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
analysis: AnalysisResult | null;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "batches", label: "Item RTL" },
    { id: "anomalies", label: "Anomali", count: analysis?.anomalies.length ?? 0 },
    { id: "raw", label: "Data mentah" },
    { id: "products", label: "Master produk" },
    { id: "upload", label: "Upload" },
  ];
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
<div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.jpg"
          alt="Logo Hijrah Gizihew"
          className="h-11 w-11 rounded-xl object-cover shadow-[var(--shadow-panel)]"
        />
        <div>
          <h1 className="text-lg font-bold leading-tight text-ink">
            Analisis Biaya & Yield Produksi
          </h1>
          <p className="text-xs text-ink-2">
            Hijrah Gizihew · RTL batches · biaya potong · karton · HPP per SKU
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            pyOk
              ? "border-out/30 bg-out-soft text-out"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${pyOk ? "bg-out" : "bg-red-500"}`}
            aria-hidden="true"
          />
{pyOk ? "Service analisis aktif" : "Service analisis offline"}
        </span>
        <button
          onClick={async () => {
            if (!analysis) return;
            setPdfBusy(true);
            try {
              const { generateReportPdf } = await import("@/lib/report");
              generateReportPdf(analysis);
            } catch {
              alert("Gagal membuat laporan PDF. Coba lagi.");
            } finally {
              setPdfBusy(false);
            }
          }}
          disabled={!analysis || pdfBusy}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pdfBusy ? "Menyiapkan…" : "Unduh Laporan PDF"}
        </button>
        <button
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.href = "/";
          }}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent"
        >
          Keluar
        </button>
        <div
          className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-sm"
          role="tablist"
          aria-label="Mode tampilan"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === t.id
                  ? "bg-accent text-white shadow-sm"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                    tab === t.id ? "bg-white/20" : "bg-red-100 text-red-700"
                  }`}
                >
                  {fmtNum(t.count, 0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/* ---------------- filter bar ---------------- */

function FilterBar({
  from,
  to,
batch,
  q,
  anomalyType,
  severity,
  loading,
  onFrom,
  onTo,
  onBatch,
  onQ,
  onAnomalyType,
  onSeverity,
  onApply,
}: {
from: string;
  to: string;
  batch: string;
  q: string;
  anomalyType: string;
  severity: string;
  loading: boolean;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onBatch: (v: string) => void;
  onQ: (v: string) => void;
  onAnomalyType: (v: string) => void;
  onSeverity: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] font-semibold uppercase text-ink-3">Dari</label>
          <input
            type="date"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
            className="mt-1 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-ink-3">Sampai</label>
          <input
            type="date"
            value={to}
            onChange={(e) => onTo(e.target.value)}
            className="mt-1 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-ink-3">Batch</label>
          <input
            value={batch}
            onChange={(e) => onBatch(e.target.value)}
            placeholder="mis. PRO/06/2026"
            className="mt-1 w-44 rounded-lg border border-line-strong bg-surface px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-ink-3 focus:border-accent"
          />
        </div>
        <div>
<label className="block text-[10px] font-semibold uppercase text-ink-3">
            Nama / SKU
          </label>
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="kode atau nama produk RTL"
            className="mt-1 w-48 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-3 focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-ink-3">
            Jenis anomali
          </label>
          <select
            value={anomalyType}
            onChange={(e) => onAnomalyType(e.target.value)}
            className="mt-1 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
          >
            <option value="">Semua</option>
            <option value="HIGH_CUTTING_COST">Biaya potong tinggi</option>
            <option value="LOW_YIELD">Yield rendah</option>
            <option value="HIGH_HPP">HPP tinggi</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-ink-3">Severity</label>
          <select
            value={severity}
            onChange={(e) => onSeverity(e.target.value)}
            className="mt-1 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
          >
            <option value="">Semua</option>
            <option value="ANOMALY">Anomali</option>
            <option value="WATCH">Perlu dicermati</option>
            <option value="NORMAL">Normal</option>
          </select>
        </div>
        <button
          onClick={onApply}
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Menganalisis…" : "Terapkan & analisis"}
        </button>
      </div>
    </section>
  );
}
