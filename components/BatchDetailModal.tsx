"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchDetail } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum, shortIDR } from "@/lib/format";
import { Panel, PTypeBadge, SkeletonRows, StatusBadge, Th, Td } from "./ui";

export default function BatchDetailModal({
  batchNo,
  onClose,
}: {
  batchNo: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesReady, setNotesReady] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const loadNotes = useCallback(async () => {
    setNotesReady(false);
    try {
      const res = await fetch(`/api/batch-notes?batch_no=${encodeURIComponent(batchNo)}`);
      const d = await res.json();
      setNotes(d.notes ?? "");
      setNotesSavedAt(d.updated_at ?? null);
    } catch {
      /* ignore */
    } finally {
      setNotesReady(true);
    }
  }, [batchNo]);

  const saveNotes = useCallback(async () => {
    setNotesSaving(true);
    setNotesError(null);
    try {
      const res = await fetch("/api/batch-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_no: batchNo, notes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal menyimpan catatan");
      setNotesSavedAt(d.updated_at ?? new Date().toISOString());
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : "Gagal menyimpan catatan");
    } finally {
      setNotesSaving(false);
    }
  }, [batchNo, notes]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const res = await fetch("/api/batch-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_no: batchNo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal memuat rincian");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    }
  }, [batchNo]);

  useEffect(() => {
    load();
    closeRef.current?.focus();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Rincian batch ${batchNo}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Rincian batch · analisis RTL
            </p>
            <h3 className="tnum mt-0.5 truncate font-mono text-lg font-bold text-ink">{batchNo}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              {data ? (
                <>
                  <span>{fmtDate(data.tanggal)}</span>
                  <StatusBadge severity={data.status} />
                  <span className="text-ink-3">{fmtNum(data.raw_rows.length, 0)} baris</span>
                </>
              ) : (
                <span className="text-ink-3">memuat…</span>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!data && !error && <SkeletonRows n={8} />}
          {data && (
            <div className="space-y-4">
              <SummaryStrip data={data} />
              <AnomalyCallout data={data} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <MainOutput data={data} />
                </div>
                <div className="lg:col-span-2">
                  <PerformancePanel data={data} />
                </div>
              </div>

              <NotesPanel
                needsInvestigation={data.status !== "NORMAL"}
                notes={notes}
                onNotes={setNotes}
                ready={notesReady}
                saving={notesSaving}
                savedAt={notesSavedAt}
                error={notesError}
                onSave={saveNotes}
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <InputPanel data={data} />
                <div className="space-y-4">
                  <ProcessCostPanel data={data} />
                  <PackagingPanel data={data} />
                </div>
              </div>

              <RawRows data={data} />
            </div>
          )}
        </div>

        <div className="tnum border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
          tekan Esc untuk menutup
        </div>
      </div>
    </div>
  );
}

/* ---------------- summary strip ---------------- */

function SummaryStrip({ data }: { data: BatchDetail }) {
  const items = [
    { label: "Output RTL", value: `${fmtNum(data.total_rtl_output_kg, 1)} KG`, tone: "text-out" },
    { label: "Input daging", value: `${fmtNum(data.meat_input_kg, 1)} KG`, tone: "text-in" },
    {
      label: "Yield",
      value: data.yield_pct != null ? `${fmtNum(data.yield_pct, 1)}%` : "-",
      tone: data.yield_pct != null && data.yield_pct < 85 ? "text-red-600" : "text-ink",
    },
    {
      label: "Biaya potong",
      value: shortIDR(data.cost_potong_total),
      tone: "text-total",
    },
    {
      label: "Biaya potong / KG",
      value: data.cost_potong_per_kg != null ? fmtIDR(data.cost_potong_per_kg) : "-",
      tone: "text-total",
    },
    {
      label: "KG / Karton",
      value: data.kg_per_karton != null ? fmtNum(data.kg_per_karton, 2) : "-",
      tone:
        data.kg_per_karton != null && (data.kg_per_karton < 10 || data.kg_per_karton > 15)
          ? "text-red-600"
          : "text-ink",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
            {it.label}
          </div>
          <div className={`tnum mt-1 text-base font-bold ${it.tone}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- anomaly callout ---------------- */

const INVESTIGATION_GUIDE: Record<string, string[]> = {
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

function AnomalyCallout({ data }: { data: BatchDetail }) {
  if (data.anomalies.length === 0) return null;
  const types = Array.from(new Set(data.anomalies.map((a) => a.type)));
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
        Temuan anomali · perlu investigasi
      </div>
      <div className="mt-2 space-y-1.5">
        {data.anomalies.map((a, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-100 bg-white/70 px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <StatusBadge severity={a.severity} />
              <span className="text-[13px] font-medium text-ink">{a.type}</span>
              {a.nama && (
                <span className="max-w-[220px] truncate text-[12px] text-ink-2" title={a.nama}>
                  {a.nama}
                </span>
              )}
            </div>
            <span className="tnum text-[12px] text-ink-2">
              aktual <b className="text-ink">{fmtNum(a.current, 1)}</b>
              {a.historical != null && (
                <>
                  {" "}
                  · historis {fmtNum(a.historical, 1)}
                  <Variance pct={a.variance_pct} severity={a.severity} />
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <details className="mt-2.5">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-red-700/80 hover:text-red-700">
          Apa yang perlu diinvestigasi?
        </summary>
        <div className="mt-2 space-y-2.5">
          {types.map((t) => (
            <div key={t} className="rounded-lg border border-red-100 bg-white/70 px-3 py-2">
              <div className="text-[11px] font-semibold text-ink">{t}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-ink-2">
                {(INVESTIGATION_GUIDE[t] ?? []).map((g, gi) => (
                  <li key={gi}>{g}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-ink-3">
            Isi hasil investigasi & jawaban pada panel &ldquo;Catatan investigasi&rdquo; di bawah.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ---------------- B. main output ---------------- */

function MainOutput({ data }: { data: BatchDetail }) {
  return (
    <Panel title="Main output" subtitle="SKU RTL di batch ini" accent="out">
      {data.main_output.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-3">
          Batch ini bukan batch RTL (tidak ada SKU RTL pada penyelesaian).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-2/95">
              <tr>
                <Th>SKU</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Biaya</Th>
                <Th align="right">HPP / KG</Th>
                <Th align="right">vs historis</Th>
              </tr>
            </thead>
            <tbody>
              {data.main_output.map((s) => (
                <tr key={s.kode} className="border-t border-line/60">
                  <td className="max-w-[240px] px-3 py-2">
                    <span className="tnum block font-mono text-[11px] text-ink-3">{s.kode}</span>
                    <span className="block truncate text-[13px] font-medium text-ink" title={s.nama}>
                      {s.nama}
                    </span>
                  </td>
                  <Td align="right">{fmtNum(s.qty, 1)} KG</Td>
                  <Td align="right">{shortIDR(s.biaya)}</Td>
                  <Td align="right" strong>
                    {fmtIDR(s.hpp)}
                  </Td>
                  <td className="px-3 py-2 text-right">
                    <Variance pct={s.variance_pct} severity={s.severity} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line-strong bg-surface-2/60">
                <Td strong>TOTAL RTL OUTPUT</Td>
                <Td align="right" strong>
                  {fmtNum(data.total_rtl_output_kg, 1)} KG
                </Td>
                <Td align="right" strong>
                  {shortIDR(data.main_output.reduce((s, x) => s + x.biaya, 0))}
                </Td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- C. inputs ---------------- */

function InputPanel({ data }: { data: BatchDetail }) {
  return (
    <Panel title="Input bahan & biaya" subtitle="seluruh baris pengeluaran" accent="in">
      {data.inputs.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-3">Tidak ada baris pengeluaran.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-2/95">
              <tr>
                <Th>Item</Th>
                <Th>Jenis</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Biaya</Th>
              </tr>
            </thead>
            <tbody>
              {data.inputs.map((i, idx) => (
                <tr key={idx} className="border-t border-line/60">
                  <td className="max-w-[200px] px-3 py-1.5">
                    <span className="tnum block font-mono text-[11px] text-ink-3">{i.kode}</span>
                    <span className="block truncate text-[13px] text-ink" title={i.nama}>
                      {i.nama}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <PTypeBadge product_type={i.product_type} />
                  </td>
                  <Td align="right">{i.qty > 0 ? fmtNum(i.qty, 1) : "-"}</Td>
                  <Td align="right" tone={i.product_type === "PROCESS_COST" ? "total" : undefined}>
                    {i.biaya > 0 ? shortIDR(i.biaya) : "-"}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2/60">
              <tr className="border-t border-line-strong">
                {data.input_summary.map((s) => (
                  <td key={s.product_type} className="px-2 py-2 text-center">
                    <div className="text-[10px] font-semibold uppercase text-ink-3">
                      {s.product_type.replace("_", " ")}
                    </div>
                    <div className="tnum text-[11px] text-ink-2">
                      {shortIDR(s.biaya)}
                      {s.qty > 0 ? ` · ${fmtNum(s.qty, 1)}` : ""}
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- D. process cost ---------------- */

function ProcessCostPanel({ data }: { data: BatchDetail }) {
  if (data.process_cost.length === 0) return null;
  return (
    <Panel title="Biaya proses" subtitle="baris berjenis PROCESS_COST" accent="total">
      <div className="divide-y divide-line/60">
        {data.process_cost.map((c, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-ink">{c.nama}</span>
            <span className="tnum text-sm font-semibold text-total">{fmtIDR(c.biaya)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- E. packaging ---------------- */

function PackagingPanel({ data }: { data: BatchDetail }) {
  if (data.packaging.length === 0) return null;
  const kartonRows = data.packaging.filter((p) => /karton/i.test(p.nama));
  return (
    <Panel title="Kemasan & packaging" subtitle={`${data.packaging.length} item`} accent="accent">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-surface-2/95">
            <tr>
              <Th>Item</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Biaya</Th>
            </tr>
          </thead>
          <tbody>
            {data.packaging.map((p, i) => (
              <tr key={i} className="border-t border-line/60">
                <td className="max-w-[200px] px-3 py-1.5">
                  <span className="tnum block font-mono text-[11px] text-ink-3">{p.kode}</span>
                  <span className="block truncate text-[13px] text-ink" title={p.nama}>
                    {p.nama}
                  </span>
                </td>
                <Td align="right">{p.qty > 0 ? fmtNum(p.qty, 0) : "-"}</Td>
                <Td align="right">{p.biaya > 0 ? shortIDR(p.biaya) : "-"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kartonRows.length >= 2 && (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-ink-2">
          Karton dipakai <b className="tnum">{fmtNum(data.karton_pcs, 0)}</b> kardus, plastik karton{" "}
          <b className="tnum">{fmtNum(data.plastik_karton_pcs, 0)}</b> (1 karton = 1 plastik karton).
          {data.karton_pcs !== data.plastik_karton_pcs && " Jumlah tidak seimbang — perlu dicek."}
        </p>
      )}
    </Panel>
  );
}

/* ---------------- H. performance vs historical ---------------- */

function PerformancePanel({ data }: { data: BatchDetail }) {
  const rows = [
    {
      label: "Biaya potong / KG",
      current: data.cost_potong_per_kg,
      avg: data.historical.cost_potong_kg.avg,
      var: data.historical.cost_potong_kg.variance_pct,
      fmt: (v: number | null) => (v != null ? fmtIDR(v) : "-"),
      worseIfUp: true,
    },
    {
      label: "Yield",
      current: data.yield_pct,
      avg: data.historical.yield_pct.avg,
      var: data.historical.yield_pct.variance_pct,
      fmt: (v: number | null) => (v != null ? `${fmtNum(v, 1)}%` : "-"),
      worseIfUp: false,
    },
    {
      label: "KG / Karton",
      current: data.kg_per_karton,
      avg: data.historical.kg_karton.avg,
      var: data.historical.kg_karton.variance_pct,
      fmt: (v: number | null) => (v != null ? fmtNum(v, 2) : "-"),
      worseIfUp: null,
    },
  ];
  return (
    <Panel title="Performa vs historis" subtitle="rata-rata batch RTL lain" accent="total">
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {r.label}
              </span>
              <Variance pct={r.var} severity={varSeverity(r.var, r.worseIfUp)} />
            </div>
            <div className="tnum mt-1 text-lg font-bold leading-tight text-ink">
              {r.fmt(r.current)}
            </div>
            <div className="tnum text-[11px] text-ink-3">historis {r.fmt(r.avg)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-ink-3">
        Historis hanya baseline penyimpangan, bukan penilaian benar/salah.
      </p>
    </Panel>
  );
}

function varSeverity(
  varPct: number | null,
  worseIfUp: boolean | null,
): "NORMAL" | "WATCH" | "ANOMALY" {
  if (varPct == null) return "NORMAL";
  const abs = Math.abs(varPct);
  if (worseIfUp === null) return "NORMAL";
  const bad = worseIfUp ? varPct > 0 : varPct < 0;
  if (!bad) return "NORMAL";
  if (abs >= 20) return "ANOMALY";
  if (abs >= 10) return "WATCH";
  return "NORMAL";
}

function Variance({
  pct,
  severity,
}: {
  pct: number | null;
  severity?: "NORMAL" | "WATCH" | "ANOMALY";
}) {
  if (pct == null) return <span className="text-[11px] text-ink-3">–</span>;
  const tone =
    severity === "ANOMALY"
      ? "text-red-600"
      : severity === "WATCH"
        ? "text-amber-600"
        : "text-ink-3";
  return (
    <span className={`tnum text-[12px] font-semibold ${tone}`}>
      {pct >= 0 ? "+" : ""}
      {fmtNum(pct, 1)}%
    </span>
  );
}

/* ---------------- investigation notes ---------------- */

function NotesPanel({
  needsInvestigation,
  notes,
  onNotes,
  ready,
  saving,
  savedAt,
  error,
  onSave,
}: {
  needsInvestigation: boolean;
  notes: string;
  onNotes: (v: string) => void;
  ready: boolean;
  saving: boolean;
  savedAt: string | null;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <Panel
      title="Catatan investigasi"
      subtitle={
        needsInvestigation
          ? "batch perlu diinvestigasi · isi alasan/jawaban untuk divisi terkait"
          : "catatan tambahan untuk divisi terkait"
      }
      accent={needsInvestigation ? "red" : "accent"}
    >
      {!ready ? (
        <p className="py-3 text-xs text-ink-3">memuat catatan…</p>
      ) : (
        <div className="space-y-2.5">
          <textarea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            rows={4}
            placeholder={
              needsInvestigation
                ? "Contoh: penyusutan tinggi karena bahan mentah beku tidak ditimbang ulang…"
                : "Tulis catatan di sini…"
            }
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-ink-3">
              {savedAt && (
                <span className="tnum">
                  Tersimpan {fmtDate(savedAt)} {new Date(savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {error && <span className="ml-2 text-red-600">{error}</span>}
            </div>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan catatan"}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- raw rows (traceability) ---------------- */

function RawRows({ data }: { data: BatchDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title="Baris sumber (raw data)"
      subtitle="trace ke data Accurate"
      accent="accent"
      right={
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-line-strong px-2 py-1 text-[11px] font-medium text-ink-2 hover:border-accent hover:text-accent"
        >
          {open ? "Sembunyikan" : `Tampilkan (${data.raw_rows.length})`}
        </button>
      }
    >
      {open && (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
              <tr>
                <Th>Kode</Th>
                <Th>Bahan & biaya</Th>
                <Th>Jenis</Th>
                <Th align="right">Input</Th>
                <Th align="right">Output</Th>
                <Th align="right">Qty</Th>
              </tr>
            </thead>
            <tbody>
              {data.raw_rows.map((r, i) => (
                <tr key={i} className="border-t border-line/60">
                  <Td mono muted>
                    {r.kode}
                  </Td>
                  <td className="max-w-[220px] px-3 py-1.5">
                    <span className="block truncate text-[13px] text-ink" title={r.bahan_biaya}>
                      {r.bahan_biaya}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {r.product_type ? <PTypeBadge product_type={r.product_type} /> : "-"}
                  </td>
                  <Td align="right" tone="in">
                    {r.pengeluaran_biaya > 0 ? shortIDR(r.pengeluaran_biaya) : "-"}
                  </Td>
                  <Td align="right" tone="out">
                    {r.penyelesaian_biaya > 0 ? shortIDR(r.penyelesaian_biaya) : "-"}
                  </Td>
                  <Td align="right" muted>
                    {fmtNum(r.pengeluaran_qty + r.penyelesaian_qty, 1)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}