"use client";

import { fmtDate } from "@/lib/format";

export type BatchNoteEntry = {
  batch_no: string;
  notes: string;
  updated_at: string;
  tanggal: string | null;
  n_rows: number;
};

export default function NotesView({
  notes,
  onOpenBatch,
}: {
  notes: BatchNoteEntry[];
  onOpenBatch: (batchNo: string) => void;
}) {
  if (notes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-3">
        Belum ada batch dengan catatan investigasi.
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="space-y-1.5 p-3">
        {notes.map((n) => (
          <button
            key={n.batch_no}
            onClick={() => onOpenBatch(n.batch_no)}
            className="block w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="tnum font-mono text-[12px] font-semibold text-accent">
                {n.batch_no}
              </span>
              <span className="tnum shrink-0 text-[10px] text-ink-3">
                {n.tanggal ? fmtDate(n.tanggal) : "-"} · update{" "}
                {fmtDate(n.updated_at)}{" "}
                {new Date(n.updated_at).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-snug text-ink">
              {n.notes}
            </p>
            <div className="tnum mt-1 text-[10px] text-ink-3">
              {fmtDate(n.tanggal) !== "-" && `${n.n_rows} baris data · `}klik untuk rincian batch
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}