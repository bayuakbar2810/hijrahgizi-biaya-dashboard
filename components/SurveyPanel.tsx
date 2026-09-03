"use client";

import { useCallback, useEffect, useState } from "react";
import type { SurveyEntry } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { Panel, SkeletonRows, Th, Td } from "./ui";

export default function SurveyPanel({
  role,
}: {
  role: "admin" | "viewer" | null;
}) {
  const isAdmin = role === "admin";
  const [entries, setEntries] = useState<SurveyEntry[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    kompetitor: "",
    produk: "",
    harga_kompetitor: "",
    harga_hijrah: "",
  });

  const load = useCallback(async (f: string, t: string) => {
    setEntries(null);
    try {
      const sp = new URLSearchParams();
      if (f) sp.set("from", f);
      if (t) sp.set("to", t);
      const res = await fetch(`/api/survey?${sp}`);
      const d = await res.json();
      setEntries(d.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      tanggal: new Date().toISOString().slice(0, 10),
      kompetitor: "",
      produk: "",
      harga_kompetitor: "",
      harga_hijrah: "",
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        id: editingId,
        tanggal: form.tanggal,
        kompetitor: form.kompetitor,
        produk: form.produk,
        harga_kompetitor: Number(form.harga_kompetitor),
        harga_hijrah: Number(form.harga_hijrah),
      };
      const res = await fetch("/api/survey", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal menyimpan survey");
      resetForm();
      await load(from, to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan survey");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s: SurveyEntry) => {
    setEditingId(s.id);
    setForm({
      tanggal: s.tanggal?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      kompetitor: s.kompetitor,
      produk: s.produk,
      harga_kompetitor: String(s.harga_kompetitor),
      harga_hijrah: String(s.harga_hijrah),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (s: SurveyEntry) => {
    if (!window.confirm(`Hapus survey ${s.kompetitor} — ${s.produk}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/survey", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Hapus gagal");
      await load(from, to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hapus gagal");
    } finally {
      setBusy(false);
    }
  };

  const gapPreview =
    Number(form.harga_kompetitor) > 0 && form.harga_hijrah !== ""
      ? Number(form.harga_kompetitor) - Number(form.harga_hijrah)
      : null;

  return (
    <div className="space-y-4">
      <Panel
        title={editingId ? "Edit survey harga" : "Tambah survey harga kompetitor"}
        subtitle="harga pasar dipantau tim untuk perbandingan dengan harga Hijrah"
        accent="accent"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-[11px] font-semibold uppercase text-ink-3">
            Tanggal
            <input
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] normal-case text-ink focus:border-accent"
            />
          </label>
          <label className="text-[11px] font-semibold uppercase text-ink-3">
            Nama kompetitor
            <input
              value={form.kompetitor}
              onChange={(e) => setForm({ ...form, kompetitor: e.target.value })}
              placeholder="mis. Competitor A"
              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] normal-case text-ink placeholder:text-ink-3 focus:border-accent"
            />
          </label>
          <label className="lg:col-span-2 text-[11px] font-semibold uppercase text-ink-3">
            Produk
            <input
              value={form.produk}
              onChange={(e) => setForm({ ...form, produk: e.target.value })}
              placeholder="mis. Daging Giling 1 kg"
              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] normal-case text-ink placeholder:text-ink-3 focus:border-accent"
            />
          </label>
          <label className="text-[11px] font-semibold uppercase text-ink-3">
            Harga kompetitor (Rp)
            <input
              type="number"
              value={form.harga_kompetitor}
              onChange={(e) => setForm({ ...form, harga_kompetitor: e.target.value })}
              placeholder="0"
              className="tnum mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] normal-case text-ink placeholder:text-ink-3 focus:border-accent"
            />
          </label>
          <label className="text-[11px] font-semibold uppercase text-ink-3">
            Harga Hijrah (Rp)
            <input
              type="number"
              value={form.harga_hijrah}
              onChange={(e) => setForm({ ...form, harga_hijrah: e.target.value })}
              placeholder="0"
              className="tnum mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] normal-case text-ink placeholder:text-ink-3 focus:border-accent"
            />
          </label>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="tnum text-[11px] text-ink-2">
            {gapPreview != null ? (
              <>
                Gap (kompetitor − Hijrah):{" "}
                <b className={gapPreview >= 0 ? "text-out" : "text-red-600"}>
                  {fmtIDR(gapPreview)} ({gapPreview >= 0 ? "+" : ""}
                  {fmtNum((gapPreview / Number(form.harga_kompetitor)) * 100, 1)}%)
                </b>{" "}
                {gapPreview >= 0 ? "— Hijrah lebih murah" : "— Hijrah lebih mahal"}
              </>
            ) : (
              "Isi kedua harga untuk melihat gap."
            )}
          </span>
          <div className="flex gap-2">
            {editingId && (
              <button
                onClick={resetForm}
                disabled={busy}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent"
              >
                Batal
              </button>
            )}
            <button
              onClick={submit}
              disabled={busy || !form.kompetitor || !form.produk || !form.harga_kompetitor || !form.harga_hijrah}
              className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Tambah survey"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </div>
        )}
      </Panel>

      <Panel
        title="Data survey harga"
        subtitle={`${entries?.length ?? 0} entri${from || to ? ` · filter ${from || "awal"} s/d ${to || "akhir"}` : " · semua periode"}`}
        accent="in"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                load(e.target.value, to);
              }}
              className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
              aria-label="Dari tanggal"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                load(from, e.target.value);
              }}
              className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
              aria-label="Sampai tanggal"
            />
          </div>
        }
      >
        {entries === null ? (
          <SkeletonRows n={5} h="h-9" />
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-3">
            Belum ada data survey{from || to ? " pada rentang tanggal ini" : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-surface-2/95">
                <tr>
                  <Th>Tanggal</Th>
                  <Th>Kompetitor</Th>
                  <Th>Produk</Th>
                  <Th align="right">Harga Kompetitor</Th>
                  <Th align="right">Harga Hijrah</Th>
                  <Th align="right">Gap (Rp)</Th>
                  <Th align="right">Gap (%)</Th>
                  <Th>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((s) => {
                  const gap = s.harga_kompetitor - s.harga_hijrah;
                  const pct = s.harga_kompetitor > 0 ? (gap / s.harga_kompetitor) * 100 : null;
                  return (
                    <tr key={s.id} className="border-t border-line/60">
                      <Td mono muted>
                        {fmtDate(s.tanggal)}
                      </Td>
                      <td className="px-3 py-1.5 text-[13px] font-medium text-ink">{s.kompetitor}</td>
                      <td className="max-w-[220px] px-3 py-1.5">
                        <span className="block truncate text-[13px] text-ink" title={s.produk}>
                          {s.produk}
                        </span>
                      </td>
                      <Td align="right">{fmtIDR(s.harga_kompetitor)}</Td>
                      <Td align="right">{fmtIDR(s.harga_hijrah)}</Td>
                      <td className="tnum px-3 py-1.5 text-right">
                        <span className={`text-[13px] font-semibold ${gap >= 0 ? "text-out" : "text-red-600"}`}>
                          {gap >= 0 ? "+" : "−"}
                          {fmtIDR(Math.abs(gap))}
                        </span>
                      </td>
                      <td className="tnum px-3 py-1.5 text-right">
                        <span className={`text-[12px] ${gap >= 0 ? "text-out" : "text-red-600"}`}>
                          {pct != null ? `${gap >= 0 ? "+" : "−"}${fmtNum(Math.abs(pct), 1)}%` : "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => startEdit(s)}
                            className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-medium text-ink-2 hover:border-accent hover:text-accent"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => remove(s)}
                              disabled={busy}
                              className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-medium text-ink-3 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-3">
          Gap = harga kompetitor − harga Hijrah. Positif (hijau) = Hijrah lebih murah dari
          kompetitor. Data mengikuti filter tanggal & ikut masuk laporan PDF/Excel.
        </p>
      </Panel>
    </div>
  );
}