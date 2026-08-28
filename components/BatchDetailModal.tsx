"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchDetail, BatchHistoryEntry } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum, shortIDR } from "@/lib/format";
import { INVESTIGATION_GUIDE } from "@/lib/investigation";
import { Panel, PTypeBadge, SkeletonRows, StatusBadge, NoteBadge, Th, Td } from "./ui";

export default function BatchDetailModal({
  batchNo,
  onClose,
  readOnly = false,
}: {
  batchNo: string;
  onClose: () => void;
  readOnly?: boolean;
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
                  {notes.trim() !== "" && <NoteBadge />}
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
                readOnly={readOnly}
              />

              <HistoryPanel batchNo={batchNo} />

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
  const totalBiaya = data.inputs.reduce((s, x) => s + x.biaya, 0);
  const totalQty = data.inputs.reduce((s, x) => s + x.qty, 0);
  const hppGabungan =
    data.total_rtl_output_kg > 0 ? totalBiaya / data.total_rtl_output_kg : null;
  return (
    <Panel title="Input bahan & biaya" subtitle="seluruh baris pengeluaran" accent="in">
      {data.inputs.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-3">Tidak ada baris pengeluaran.</p>
      ) : (
        <>
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
                  <td colSpan={4} className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[10px] font-semibold uppercase text-ink-3">
                        Subtotal per jenis:
                      </span>
                      {data.input_summary.map((s) => (
                        <span key={s.product_type} className="tnum text-[11px] text-ink-2">
                          {s.product_type.replace("_", " ")}
                          <b className="text-ink">{shortIDR(s.biaya)}</b>
                          {s.qty > 0 ? ` · ${fmtNum(s.qty, 1)}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
                <tr className="border-t border-line-strong">
                  <Td strong>TOTAL INPUT</Td>
                  <td className="px-3 py-2" />
                  <Td align="right" strong>
                    {fmtNum(totalQty, 1)}
                  </Td>
                  <Td align="right" strong>
                    {fmtIDR(totalBiaya)}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-2">
            Asal HPP: total biaya input{" "}
            <b className="tnum text-ink">{fmtIDR(totalBiaya)}</b> ÷ output RTL{" "}
            <b className="tnum text-ink">{fmtNum(data.total_rtl_output_kg, 1)} kg</b> ={" "}
            <b className="tnum text-total">
              {hppGabungan != null ? `${fmtIDR(hppGabungan)}/kg` : "-"}
            </b>{" "}
            (HPP gabungan seluruh SKU batch ini — rincian per SKU ada di tabel Main output).
          </p>
        </>
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
  readOnly = false,
}: {
  needsInvestigation: boolean;
  notes: string;
  onNotes: (v: string) => void;
  ready: boolean;
  saving: boolean;
  savedAt: string | null;
  error: string | null;
  onSave: () => void;
  readOnly?: boolean;
}) {
  return (
    <Panel
      title="Catatan investigasi"
      subtitle={
        readOnly
          ? "hanya admin yang dapat mengubah catatan"
          : needsInvestigation
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
            disabled={readOnly}
            placeholder={
              readOnly
                ? "Mode lihat saja — catatan hanya bisa diubah oleh admin."
                : needsInvestigation
                  ? "Contoh: penyusutan tinggi karena bahan mentah beku tidak ditimbang ulang…"
                  : "Tulis catatan di sini…"
            }
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-2"
          />
          {!readOnly && (
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
          )}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- riwayat perubahan data ---------------- */

const FIELD_LABEL: Record<string, string> = {
  tanggal: "Tanggal",
  kode: "Kode",
  bahan_biaya: "Bahan & biaya",
  keterangan: "Keterangan",
  pengeluaran_biaya: "Biaya pengeluaran",
  pengeluaran_qty: "Qty pengeluaran",
  penyelesaian_biaya: "Biaya penyelesaian",
  penyelesaian_qty: "Qty penyelesaian",
};

function fmtVal(f: string, v: unknown): string {
  if (f.includes("biaya")) return fmtIDR(Number(v) || 0);
  if (f.includes("qty")) return fmtNum(Number(v) || 0, 2);
  return String(v ?? "");
}

function HistoryPanel({ batchNo }: { batchNo: string }) {
  const [entries, setEntries] = useState<BatchHistoryEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/batch-history?batch_no=${encodeURIComponent(batchNo)}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => {
        if (live) setEntries(d.entries ?? []);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, [batchNo]);

  if (entries === null) return null;
  return (
    <Panel
      title="Riwayat perubahan data"
      subtitle={`${entries.length} kali update dari upload ulang`}
      accent="in"
    >
      {entries.length === 0 ? (
        <p className="py-2 text-center text-xs text-ink-3">
          Data batch ini belum pernah berubah dari upload ulang.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const dBiaya = e.total_biaya_new - e.total_biaya_old;
            const pct =
              e.total_biaya_old > 0 ? (dBiaya / e.total_biaya_old) * 100 : null;
            return (
              <details
                key={e.id}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[12px] font-semibold text-ink">
                      {fmtDate(e.changed_at)}{" "}
                      {new Date(e.changed_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · dari file <span className="font-mono text-[11px]">{e.source_filename}</span>
                    </span>
                    <span className="tnum text-[11px] text-ink-2">
                      baris {fmtNum(e.n_rows_old, 0)}→{fmtNum(e.n_rows_new, 0)} · total biaya{" "}
                      <b className={dBiaya > 0 ? "text-red-600" : dBiaya < 0 ? "text-out" : "text-ink"}>
                        {fmtIDR(e.total_biaya_old)} → {fmtIDR(e.total_biaya_new)}
                      </b>
                      {pct != null && (
                        <span className={dBiaya > 0 ? "text-red-600" : "text-out"}>
                          {" "}
                          ({dBiaya >= 0 ? "+" : ""}
                          {fmtNum(pct, 1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </summary>
                <div className="mt-2 space-y-1.5 text-[12px]">
                  {e.diff.changed.map((c, ci) => {
                    const nameF = c.fields.find((fl) => fl.f === "bahan_biaya");
                    const otherFields = c.fields.filter((fl) => fl.f !== "bahan_biaya");
                    return (
                      <div key={ci} className="rounded-md border border-line bg-white px-2.5 py-1.5">
                        <div className="text-[11px] font-medium text-ink-2">
                          Baris {c.i + 1} · {c.kode} —{" "}
                          {nameF ? (
                            <>
                              <span className="text-ink-3 line-through">{String(nameF.old ?? "") || "(kosong)"}</span>
                              <span className="mx-1 text-accent">→</span>
                              <b className="text-ink">{String(nameF.new ?? "")}</b>
                            </>
                          ) : (
                            c.bahan
                          )}
                        </div>
                        {otherFields.map((fl, fi) => (
                          <div key={fi} className="tnum mt-0.5 flex flex-wrap gap-1 text-[11px]">
                            <span className="text-ink-3">{FIELD_LABEL[fl.f] ?? fl.f}:</span>
                            <span className="text-ink-2 line-through">{fmtVal(fl.f, fl.old)}</span>
                            <span className="text-ink-3">→</span>
                            <span className="font-semibold text-ink">{fmtVal(fl.f, fl.new)}</span>
                          </div>
                        ))}
                        {otherFields.length === 0 && !nameF && (
                          <div className="mt-0.5 text-[10px] text-ink-3">—</div>
                        )}
                      </div>
                    );
                  })}
                  {e.diff.added.length > 0 && (
                    <div className="rounded-md border border-out/30 bg-out-soft px-2.5 py-1.5 text-[11px] text-out">
                      + {e.diff.added.length} baris baru:{" "}
                      {e.diff.added.map((a) => `${a.kode} ${a.bahan}`).join("; ")}
                    </div>
                  )}
                  {e.diff.removed.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                      − {e.diff.removed.length} baris dihapus:{" "}
                      {e.diff.removed.map((a) => `${a.kode} ${a.bahan}`).join("; ")}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
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