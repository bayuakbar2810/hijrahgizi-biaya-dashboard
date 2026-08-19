"use client";

import { useRef, useState } from "react";
import type { UploadPreview } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";

export default function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setDone(`${d.batches} batch diproses · ${d.rows} baris tersimpan`);
        setPreview(null);
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
        <b>diganti</b> dengan data terbaru.
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
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-lg border border-out/30 bg-out-soft px-3 py-2 text-[12px] font-medium text-out">
          Upload berhasil · {done}
        </div>
      )}
    </section>
  );
}