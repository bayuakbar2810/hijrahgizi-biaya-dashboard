"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductMaster, ProductType } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { EmptyState, PTypeBadge, PTYPE_LABEL, SkeletonRows, Th, Td } from "./ui";

const TYPES: ProductType[] = [
  "RAW_MATERIAL",
  "PACKAGING",
  "PROCESS_COST",
  "BY_PRODUCT",
  "FINISHED_PRODUCT",
  "OTHER",
];

export default function ProductMaster() {
  const [items, setItems] = useState<ProductMaster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ptype, setPtype] = useState("");
  const [editing, setEditing] = useState<ProductMaster | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (query: string, pt: string) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: "2000" });
      if (query.trim()) sp.set("q", query.trim());
      if (pt) sp.set("product_type", pt);
      const res = await fetch(`/api/products?${sp}`);
      const d = await res.json();
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(q, ptype);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = () => load(q, ptype);

  const save = async () => {
    if (!editing) return;
    await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    setEditing(null);
    load(q, ptype);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Master produk & item</h2>
          <p className="tnum mt-0.5 text-[11px] text-ink-3">
            {fmtNum(total, 0)} item · klasifikasi dipakai untuk identifikasi RTL, yield &
            kemasan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Cari kode / nama…"
            className="w-48 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
            aria-label="Cari item"
          />
          <select
            value={ptype}
            onChange={(e) => {
              setPtype(e.target.value);
              load(q, e.target.value);
            }}
            className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink focus:border-accent"
          >
            <option value="">Semua jenis</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {PTYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            onClick={search}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Cari
          </button>
        </div>
      </div>

      <div className="max-h-[600px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
            <tr>
              <Th>Kode</Th>
              <Th>Nama</Th>
              <Th>Jenis</Th>
              <Th align="right">RTL</Th>
              <Th align="right">Digunakan</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>
                  <SkeletonRows n={6} h="h-8" />
                </td>
              </tr>
            )}
            {!loading &&
              items.map((it) => (
                <tr
                  key={it.kode}
                  className="cursor-pointer border-t border-line/60 hover:bg-accent-soft/40"
                  onClick={() => setEditing({ ...it })}
                >
                  <Td mono muted>
                    {it.kode}
                  </Td>
                  <td className="max-w-[320px] px-3 py-1.5">
                    <span className="block truncate text-[13px] text-ink" title={it.nama_produk}>
                      {it.nama_produk}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <PTypeBadge product_type={it.product_type} />
                  </td>
                  <Td align="right">
                    {it.is_rtl ? <span className="text-[12px] font-semibold text-out">RTL</span> : "-"}
                  </Td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="text-[11px] font-medium text-accent" title="Klik untuk ubah klasifikasi">
                      Ubah ▸
                    </span>
                  </td>
                </tr>
              ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="px-3 py-10 text-center text-sm text-ink-3">
                    Tidak ada item yang cocok
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Ubah klasifikasi item"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-float)]">
            <h3 className="text-sm font-bold text-ink">Ubah klasifikasi item</h3>
            <p className="tnum mt-1 font-mono text-xs text-ink-3">
              {editing.kode} · {editing.nama_produk}
            </p>
            <label className="mt-4 block text-xs font-medium text-ink-2">
              Jenis item
              <select
                value={editing.product_type}
                onChange={(e) => setEditing({ ...editing, product_type: e.target.value as ProductType })}
                className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-[13px] text-ink focus:border-accent"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PTYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={editing.is_rtl}
                onChange={(e) => setEditing({ ...editing, is_rtl: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Produk RTL (output utama)
            </label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={editing.is_packaging}
                onChange={(e) => setEditing({ ...editing, is_packaging: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Kemasan (packaging)
            </label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={editing.is_by_product}
                onChange={(e) => setEditing({ ...editing, is_by_product: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              By-product (masuk hitungan input daging)
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent"
              >
                Batal
              </button>
              <button
                onClick={save}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                Simpan
              </button>
            </div>
            {saved && <p className="mt-2 text-right text-xs font-medium text-out">Tersimpan ✓</p>}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && total === 0 && (
        <div className="p-4">
          <EmptyState title="Belum ada master produk" hint="Upload file Excel untuk mengisi klasifikasi item." />
        </div>
      )}
    </section>
  );
}