"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  UploadPreview,
  UploadLogEntry,
  BatchHistoryEntry,
  BatchHistoryDiff,
} from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";

/* Label satu baris perubahan: prioritas nama produk > biaya > qty > tanggal. */
function rowChangeLabel(c: BatchHistoryDiff["changed"][number]): string | null {
  const nameF = c.fields.find((f) => f.f === "bahan_biaya");
  if (nameF) {
    const o = String(nameF.old ?? "").trim() || "(kosong)";
    const n = String(nameF.new ?? "").trim() || "(kosong)";
    return `${o} → ${n}`;
  }
  const costF = c.fields.find((f) => f.f === "pengeluaran_biaya" || f.f === "penyelesaian_biaya");
  if (costF) {
    return `Biaya ${fmtIDR(Number(costF.old) || 0)} → ${fmtIDR(Number(costF.new) || 0)}`;
  }
  const qtyF = c.fields.find((f) => f.f === "pengeluaran_qty" || f.f === "penyelesaian_qty");
  if (qtyF) {
    return `Qty ${fmtNum(Number(qtyF.old) || 0, 1)} → ${fmtNum(Number(qtyF.new) || 0, 1)}`;
  }
  const tF = c.fields.find((f) => f.f === "tanggal");
  if (tF) return `Tanggal ${String(tF.old)} → ${String(tF.new)}`;
  const ketF = c.fields.find((f) => f.f === "keterangan");
  if (ketF) return `Ket. ${String(ketF.old).slice(0, 20)} → ${String(ketF.new).slice(0, 20)}`;
  return null;
}

export default function UploadPanel({
  onUploaded,
  onOpenBatch,
}: {
  onUploaded: () => void;
  onOpenBatch: (batchNo: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadLogEntry[] | null>(null);
  const [history, setHistory] = useState<BatchHistoryEntry[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUploads = useCallback(() => {
    fetch("/api/uploads")
      .then((r) => (r.ok ? r.json() : { uploads: [] }))
      .then((d) => setUploads(d.uploads ?? []))
      .catch(() => setUploads([]));
  }, []);

  const loadHistory = useCallback(() => {
    fetch("/api/batch-history")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => setHistory((d.entries ?? []).slice(0, 12)))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    loadUploads();
    loadHistory();
  }, [loadUploads, loadHistory]);

  const cancelPreview = () => {
    if (!preview) return;
    const pid = preview.preview_id;
    setPreview(null);
    setDone(null);
    if (inputRef.current) inputRef.current.value = "";
    fetch("/api/upload/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview_id: pid }),
    }).catch(() => {});
  };

  const deleteUpload = (u: UploadLogEntry) => {
    if (deletingId) return;
    const ok = window.confirm(
      `Hapus data dari file "${u.filename}"?\n\n${fmtNum(u.n_rows, 0)} baris dari file ini akan dihapus dari analisis. Riwayat upload juga dihapus.`,
    );
    if (!ok) return;
    setDeletingId(u.id);
    fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Hapus gagal");
        setDone(`Data file ${u.filename} dihapus (${fmtNum(d.rows_deleted, 0)} baris)`);
        loadUploads();
        onUploaded();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Hapus gagal"))
      .finally(() => setDeletingId(null));
  };

  const pick = (file: File | null) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setParsing(true);
    const fd = new FormData();
    fd.append("file", file);
    fetch("/api/upload", { method: "POST", body: fd })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Upload gagal");
        setPreview(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Upload gagal"))
      .finally(() => setParsing(false));
  };

  const confirm = () => {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    fetch("/api/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview_id: preview.preview_id }),
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Konfirmasi gagal");
        setDone(
          `${d.batches} batch diproses · ${d.rows} baris tersimpan` +
            (typeof d.changed_batches === "number" && d.changed_batches > 0
              ? ` · ${d.changed_batches} batch berubah (lihat log di bawah)`
              : ""),
        );
        setPreview(null);
        loadUploads();
        loadHistory();
        onUploaded();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Konfirmasi gagal"))
      .finally(() => setConfirming(false));
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-panel)]">
      <h2 className="text-sm font-semibold text-ink">Upload data Excel</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
        File histori pekerjaan pesanan dari Accurate (.xlsx). Batch yang sudah ada akan{" "}
        <b>diganti</b> dengan data terbaru — setiap perubahan nilai otomatis tercatat di log
        perubahan.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={parsing}
        className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {parsing ? "Membaca file…" : "Pilih file Excel"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <div className="truncate text-[12px] font-semibold text-ink">{preview.filename}</div>
            <div className="tnum mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-2">
              <span>
                Baris <b className="text-ink">{fmtNum(preview.row_count, 0)}</b>
              </span>
              <span>
                Batch <b className="text-ink">{fmtNum(preview.batch_count, 0)}</b>
              </span>
              <span className="text-out">
                Baru <b>{fmtNum(preview.new_batch, 0)}</b>
              </span>
              <span className="text-in">
                Diperbarui <b>{fmtNum(preview.updated_batch, 0)}</b>
              </span>
            </div>
            <div className="tnum mt-1 text-[11px] text-ink-3">
              {fmtDate(preview.date_min)} – {fmtDate(preview.date_max)} · total biaya{" "}
              {fmtIDR(preview.total_biaya)}
            </div>
            {preview.invalid_rows > 0 && (
              <div className="mt-1 text-[11px] text-amber-700">
                {fmtNum(preview.invalid_rows, 0)} baris subtotal/tidak valid dilewati
              </div>
            )}
          </div>
          <button
            onClick={confirm}
            disabled={confirming}
            className="w-full rounded-lg bg-ink py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? "Menyimpan…" : "Konfirmasi & simpan"}
          </button>
          <button
            onClick={cancelPreview}
            disabled={confirming}
            className="w-full rounded-lg border border-line-strong py-2 text-sm font-medium text-ink-2 hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Batalkan upload ini
          </button>
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-lg border border-out/30 bg-out-soft px-3 py-2 text-[12px] font-medium text-out">
          Upload berhasil · {done}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Log perubahan data (batch ter-update)
        </h3>
        {history === null ? (
          <p className="mt-2 text-[11px] text-ink-3">memuat…</p>
        ) : history.length === 0 ? (
          <p className="mt-2 text-[11px] text-ink-3">
            Belum ada perubahan data — batch yang diupload ulang masih sama nilainya.
          </p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-auto pr-1">
            {history.map((h) => {
              const dB = h.total_biaya_new - h.total_biaya_old;
              const pct = h.total_biaya_old > 0 ? (dB / h.total_biaya_old) * 100 : null;
              const labels = h.diff.changed
                .map(rowChangeLabel)
                .filter((x): x is string => x !== null);
              if (h.diff.added.length > 0) {
                labels.push(`+ Baris baru: ${h.diff.added[0].bahan || h.diff.added[0].kode}`);
              }
              if (h.diff.removed.length > 0) {
                labels.push(`− Baris dihapus: ${h.diff.removed[0].bahan || h.diff.removed[0].kode}`);
              }
              const extra = labels.length - 2;
              return (
                <li key={h.id}>
                  <button
                    onClick={() => onOpenBatch(h.batch_no)}
                    className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left hover:border-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum truncate font-mono text-[11px] font-semibold text-accent">
                        {h.batch_no}
                      </span>
                      <span className="tnum shrink-0 text-[10px] text-ink-3">
                        {fmtDate(h.changed_at)}{" "}
                        {new Date(h.changed_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {labels.slice(0, 2).map((l, i) => (
                      <div key={i} className="mt-1 truncate text-[10.5px] font-medium text-ink">
                        <span className="mr-1 text-ink-3" aria-hidden="true">
                          ↳
                        </span>
                        {l}
                      </div>
                    ))}
                    {extra > 0 && (
                      <div className="mt-0.5 text-[10px] text-ink-3">+{extra} perubahan lain…</div>
                    )}
                    <div className="tnum mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-ink-2">
                      <span>
                        baris {fmtNum(h.n_rows_old, 0)}→{fmtNum(h.n_rows_new, 0)}
                      </span>
                      <span>
                        biaya {fmtIDR(h.total_biaya_old)} →{" "}
                        <b className={dB > 0 ? "text-red-600" : "text-out"}>
                          {fmtIDR(h.total_biaya_new)}
                        </b>
                        {pct != null && (
                          <span className={dB > 0 ? "text-red-600" : "text-out"}>
                            {" "}
                            ({dB >= 0 ? "+" : ""}
                            {fmtNum(pct, 1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Riwayat upload
        </h3>
        {uploads === null ? (
          <p className="mt-2 text-[11px] text-ink-3">memuat…</p>
        ) : uploads.length === 0 ? (
          <p className="mt-2 text-[11px] text-ink-3">Belum ada file yang diunggah.</p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-auto pr-1">
            {uploads.map((u) => (
              <li key={u.id} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] font-semibold text-ink">
                    {u.filename}
                  </span>
                  <span className="tnum shrink-0 text-[10px] text-ink-3">
                    {fmtDate(u.uploaded_at)}{" "}
                    {new Date(u.uploaded_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="tnum flex flex-wrap gap-x-2.5 text-[10px] text-ink-2">
                    <span>{fmtNum(u.n_rows, 0)} baris</span>
                    <span>{fmtNum(u.n_batch, 0)} batch</span>
                    <span className="text-out">baru {fmtNum(u.new_batch, 0)}</span>
                    <span className="text-in">diperbarui {fmtNum(u.updated_batch, 0)}</span>
                  </div>
                  <button
                    onClick={() => deleteUpload(u)}
                    disabled={deletingId === u.id}
                    title="Hapus data dari file ini"
                    className="shrink-0 rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-semibold text-ink-3 hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === u.id ? "Menghapus…" : "Hapus"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] leading-snug text-ink-3">
          Upload ulang batch yang sama tidak mendouble data — versi lama diganti otomatis, dan
          bila nilainya berubah, perubahannya tercatat di &ldquo;Riwayat perubahan data&rdquo; pada
          rincian batch.
        </p>
      </div>
    </section>
  );
}