"use client";

import { useMemo, useState } from "react";
import type { BahanStokSku, ItemSummary } from "@/lib/types";
import { fmtDate, fmtIDR, fmtNum } from "@/lib/format";
import { Panel, SkeletonRows, Th, Td } from "./ui";

type BahanRow = {
  kode: string;
  nama: string;
  n_batch: number;
  total_qty: number;
  total_biaya: number;
  last_date: string;
};

type StokItem = {
  nama: string;
  kode: string;
  total: number;
  gudang: Array<{ nama: string; qty: number }>;
};

export default function StokBahanView({ items }: { items: ItemSummary[] }) {
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [skus, setSkus] = useState<BahanStokSku[] | null>(null);
  const [stokAt, setStokAt] = useState<string | null>(null);
  const [stokError, setStokError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [withHistory, setWithHistory] = useState(true);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return items;
    return items.filter(
      (i) => i.kode.toLowerCase().includes(ql) || i.nama.toLowerCase().includes(ql),
    );
  }, [items, q]);

  const toggle = (kode: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const all = filtered.map((i) => i.kode);
    const semuaTerpilih = all.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      for (const k of all) {
        if (semuaTerpilih) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const load = async () => {
    if (checked.size === 0) return;
    setLoading(true);
    setSkus(null);
    setStokError(null);
    setStokAt(null);
    try {
      const chosen = items.filter((i) => checked.has(i.kode));
      const kodes = chosen.map((i) => i.kode);

      /* Dua request DIJALANKAN BERSAMAAN (stok sekali ambil semua, cache 12 jam) */
      const [rd, sd] = await Promise.all([
        fetch("/api/item-bahan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kodes }),
        }).then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? "Gagal memuat bahan");
          return d;
        }),
        fetch("/api/stok", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kode: [] }),
        })
          .then(async (r) => {
            const d = await r.json();
            if (!r.ok) throw new Error(d.error ?? "Gagal memuat stok");
            setStokAt(d.fetched_at ?? null);
            return d;
          })
          .catch(() => null),
      ]);
      const results = (rd.results ?? {}) as Record<
        string,
        {
          n_batches: number;
          latest: { batch_no: string; tanggal: string } | null;
          current: Array<{ kode: string; nama: string; qty: number; biaya: number }>;
          bahan: BahanRow[];
          history: BahanStokSku["history"];
        }
      >;
      const lists = chosen
        .filter((i) => results[i.kode])
        .map((i) => ({ sku: i, ...results[i.kode] }));
      const stokBahan = (sd?.items ?? {}) as Record<
        string,
        { nama: string; total: number; gudang: Array<{ nama: string; qty: number }> }
      >;
      const stokGpu = (sd?.gpu ?? {}) as Record<
        string,
        { nama: string; total: number; lokasi: Array<{ nama: string; qty: number }> }
      >;
      /* Kode di sheet tanpa awalan "R" (mis. R102045 -> 102045); cocokkan keduanya */
      const normKode = (k: string) => k.replace(/^R(?=\d)/i, "").trim();
      const getStokBahan = (kode: string) =>
        stokBahan[kode] ?? stokBahan[normKode(kode)];
      const getStokGpu = (kode: string) => stokGpu[kode] ?? stokGpu[normKode(kode)];

      const out: BahanStokSku[] = [];
      for (const l of lists) {
        const currentMap = new Map<string, number>();
        for (const c of l.current ?? []) currentMap.set(c.kode, Number(c.qty) || 0);
        const histMap = new Map<string, (typeof l.bahan)[number]>();
        for (const b of l.bahan ?? []) histMap.set(b.kode, b);

        const unionKodes = new Set<string>([...currentMap.keys(), ...histMap.keys()]);
        const rows: BahanStokSku["rows"] = [];
        for (const k of unionKodes) {
          const sBahan = getStokBahan(k);
          if (!sBahan) continue; // hanya bahan yang terdaftar di sheet stok
          const sGpu = getStokGpu(l.sku.kode);
          const h = histMap.get(k);
          rows.push({
            kode: k,
            nama: h?.nama ?? String(currentMap.get(k) ?? ""),
            qtyTerakhir: currentMap.has(k) ? currentMap.get(k)! : null,
            biayaTerakhir: currentMap.has(k)
              ? Number((l.current ?? []).find((c: { kode: string; biaya: number }) => c.kode === k)?.biaya) || 0
              : null,
            qtyHistoris: h ? Number(h.total_qty) || 0 : 0,
            biayaHistoris: h ? Number(h.total_biaya) || 0 : 0,
            nBatch: h?.n_batch ?? 0,
            lastDate: h?.last_date ?? "",
            stokGudang: sBahan.total,
            gudang: sBahan.gudang,
            stokGpu: sGpu ? sGpu.total : null,
          });
        }
        const dateOf = (r: BahanStokSku["rows"][number]) =>
          r.qtyTerakhir !== null ? l.latest?.tanggal ?? "" : r.lastDate;
        rows.sort(
          (a, b) =>
            dateOf(b).localeCompare(dateOf(a)) ||
            (b.qtyTerakhir ?? -1) - (a.qtyTerakhir ?? -1) ||
            b.qtyHistoris - a.qtyHistoris,
        );
        if (rows.length > 0) {
          out.push({
            skuKode: l.sku.kode,
            skuNama: l.sku.nama,
            nBatches: l.n_batches ?? 0,
            latestBatch: l.latest?.batch_no ?? null,
            latestTanggal: l.latest?.tanggal ?? null,
            history: (l.history ?? []) as BahanStokSku["history"],
            rows,
          });
        }
      }
      setSkus(out);
    } catch (e) {
      setStokError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    if (!skus || skus.length === 0) return;
    const { generateBahanStokPdf } = await import("@/lib/report");
    generateBahanStokPdf(skus, { fetchedAt: stokAt, includeHistory: withHistory });
  };

  const exportPdfDetail = async () => {
    if (!skus || skus.length === 0) return;
    const { generateBahanDetailPdf } = await import("@/lib/report");
    generateBahanDetailPdf(skus, { fetchedAt: stokAt });
  };

  const exportExcel = async () => {
    if (!skus || skus.length === 0) return;
    const { downloadBahanStokExcel } = await import("@/lib/excel");
    downloadBahanStokExcel(skus, { fetchedAt: stokAt, includeHistory: withHistory });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* daftar SKU multi-pilih */}
      <Panel
        title="Pilih SKU RTL"
        subtitle={`${checked.size} dipilih - ${fmtNum(filtered.length, 0)} item${q ? " (hasil cari)" : ""}`}
        accent="out"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode / nama SKU..."
          className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
          aria-label="Cari SKU"
        />
        {filtered.length > 0 && (
          <button
            onClick={toggleAllFiltered}
            className="mb-2 text-[11px] font-semibold text-accent hover:underline"
          >
            {filtered.every((i) => checked.has(i.kode))
              ? "Hapus semua pilihan"
              : "Pilih semua hasil cari"}
          </button>
        )}
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-3">
            Data SKU belum termuat - terapkan analisis terlebih dahulu.
          </p>
        ) : (
          <ul className="max-h-[520px] space-y-1 overflow-auto pr-1">
            {filtered.map((i) => (
              <li key={i.kode}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                    checked.has(i.kode)
                      ? "border-accent bg-accent-soft/50"
                      : "border-line bg-surface-2 hover:border-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(i.kode)}
                    onChange={() => toggle(i.kode)}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink" title={i.nama}>
                      {i.nama}
                    </span>
                    <span className="tnum block text-[10px] text-ink-3">
                      {i.kode} | {fmtNum(i.n_batch, 0)} batch | {fmtNum(i.total_qty, 0)} kg
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={load}
          disabled={checked.size === 0 || loading}
          className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Memuat..." : `Tampilkan bahan (${checked.size} SKU)`}
        </button>
      </Panel>

      {/* hasil per SKU */}
      <div className="lg:col-span-2">
        <Panel
          title="Bahan per SKU & stok"
          subtitle={
            skus
              ? `${skus.length} SKU, dipisah per SKU - hanya bahan yang terdaftar di sheet stok`
              : "hasil muncul di sini setelah SKU dipilih"
          }
          accent="in"
          right={
            <div className="flex flex-wrap items-center gap-2">
              {stokAt && (
                <span className="tnum text-[10px] text-ink-3">
                  Stok per {new Date(stokAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink">
                <input
                  type="checkbox"
                  checked={withHistory}
                  onChange={(e) => setWithHistory(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-accent"
                />
                Sertakan riwayat per batch
              </label>
              <button
                onClick={exportPdf}
                disabled={!skus || skus.length === 0}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unduh PDF
              </button>
              <button
                onClick={exportPdfDetail}
                disabled={!skus || skus.length === 0}
                title="Detail per SKU: bahan terakhir dipakai, frekuensi, biaya & biaya satuan"
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unduh PDF Detail
              </button>
              <button
                onClick={exportExcel}
                disabled={!skus || skus.length === 0}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unduh Excel
              </button>
            </div>
          }
        >
          {stokError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {stokError}
            </div>
          )}
          {loading && skus === null ? (
            <SkeletonRows n={8} h="h-9" />
          ) : !skus ? (
            <p className="py-8 text-center text-sm text-ink-3">
              Centang satu atau beberapa SKU di kiri, lalu klik &quot;Tampilkan bahan&quot;.
            </p>
          ) : skus.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-3">
              Tidak ada bahan SKU terpilih yang terdaftar di sheet stok.
            </p>
          ) : (
            <div className="max-h-[680px] space-y-4 overflow-auto pr-1">
              {skus.map((sku) => {
                const stokOf = new Map(sku.rows.map((r) => [r.kode, r.stokGudang]));
                const currentRows = sku.rows.filter((r) => r.qtyTerakhir !== null);
                const histRows = sku.rows.filter((r) => r.qtyTerakhir === null);
                return (
                  <div key={sku.skuKode} className="overflow-hidden rounded-xl border border-line">
                    <div className="border-b border-line bg-surface-2/95 px-3 py-2">
                      <span className="tnum font-mono text-[12px] font-semibold text-accent">
                        {sku.skuKode}
                      </span>
                      <span className="ml-2 text-[13px] font-bold text-ink">{sku.skuNama}</span>
                      <span className="tnum ml-2 text-[10px] text-ink-3">
                        {fmtNum(sku.nBatches, 0)} batch historis
                        {sku.latestBatch
                          ? ` - batch terakhir ${sku.latestBatch} (${fmtDate(sku.latestTanggal)})`
                          : ""}
                      </span>
                    </div>

                    <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-out">
                      1. Dipakai di batch terakhir (resep saat ini)
                      {sku.latestBatch ? ` - ${sku.latestBatch} (${fmtDate(sku.latestTanggal)})` : ""}
                    </div>
                    <div className="overflow-x-auto px-1 pb-1">
                      <table className="w-full border-collapse">
                        <thead className="bg-surface-2/60">
                        <tr>
                          <Th>Bahan</Th>
                          <Th>Kode</Th>
                          <Th align="right">Qty dipakai</Th>
                          <Th align="right">Biaya (Rp)</Th>
                                <Th align="right">Biaya satuan (Rp)</Th>
                                <Th align="right">Stok gudang (kg)</Th>
                                <Th>Letak gudang</Th>
                              </tr>
                        </thead>
                        <tbody>
                          {currentRows.map((r) => (
                            <tr key={r.kode} className="border-t border-line/60">
                              <td className="px-3 py-1.5">
                                <span className="block truncate text-[13px] text-ink" title={r.nama}>
                                  {r.nama}
                                </span>
                              </td>
                              <Td mono muted>
                                {r.kode}
                              </Td>
                              <td className="tnum px-3 py-1.5 text-right">
                                <span className="text-[13px] font-semibold text-ink">
                                  {fmtNum(r.qtyTerakhir ?? 0, 1)}
                                </span>
                              </td>
                              <td className="tnum px-3 py-1.5 text-right">
                                <span className="text-[13px] text-ink">
                                  {fmtIDR(r.biayaTerakhir ?? 0)}
                                </span>
                              </td>
                              <td className="tnum px-3 py-1.5 text-right text-[12px]">
                                {r.qtyTerakhir ? fmtIDR((r.biayaTerakhir ?? 0) / r.qtyTerakhir, true) : "-"}
                              </td>
                              <td className="tnum px-3 py-1.5 text-right">
                                <span
                                  className={`text-[13px] font-semibold ${
                                    r.stokGudang > 0 ? "text-out" : "text-red-600"
                                  }`}
                                >
                                  {fmtNum(r.stokGudang, 0)}
                                </span>
                              </td>
                              <td className="max-w-[220px] px-3 py-1.5">
                                {r.gudang.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {r.gudang.slice(0, 3).map((g) => (
                                      <span
                                        key={g.nama}
                                        className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                                        title={g.nama}
                                      >
                                        {g.nama}: {fmtNum(g.qty, 0)}
                                      </span>
                                    ))}
                                    {r.gudang.length > 3 && (
                                      <span
                                        className="text-[10px] text-ink-3"
                                        title={r.gudang
                                          .slice(3)
                                          .map((g) => `${g.nama}: ${g.qty}`)
                                          .join(", ")}
                                      >
                                        +{r.gudang.length - 3} gudang
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-red-600">kosong semua</span>
                                )}
                              </td>
                              <td className="tnum px-3 py-1.5 text-right">
                                {r.stokGpu !== null ? (
                                  <span
                                    className={`text-[13px] font-semibold ${
                                      r.stokGpu > 0 ? "text-in" : "text-red-600"
                                    }`}
                                  >
                                    {fmtNum(r.stokGpu, 0)}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-ink-3">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {currentRows.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-3 py-2 text-center text-[11px] text-ink-3">
                                Batch terakhir tidak tercatat memakai bahan.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {histRows.length > 0 && (
                      <>
                        <div className="border-t border-line px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                          2. Pernah dipakai di batch lain (historis) - {histRows.length} bahan
                        </div>
                        <div className="overflow-x-auto px-1 pb-1">
                          <table className="w-full border-collapse">
                            <thead className="bg-surface-2/60">
                              <tr>
                                <Th>Bahan</Th>
                                <Th>Kode</Th>
                                <Th align="right">Jml batch</Th>
                                <Th align="right">Total qty dipakai</Th>
                                <Th align="right">Total biaya (Rp)</Th>
                                <Th align="right">Biaya satuan (Rp)</Th>
                                <Th>Terakhir dipakai</Th>
                                <Th align="right">Stok gudang</Th>
                                <Th>Letak gudang</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {histRows.map((r) => (
                                <tr key={r.kode} className="border-t border-line/60">
                                  <td className="max-w-[220px] px-3 py-1.5">
                                    <span
                                      className="block truncate text-[13px] text-ink"
                                      title={r.nama}
                                    >
                                      {r.nama}
                                    </span>
                                  </td>
                                  <Td mono muted>
                                    {r.kode}
                                  </Td>
                                  <Td align="right">{fmtNum(r.nBatch, 0)}</Td>
                                  <Td align="right">{fmtNum(r.qtyHistoris, 1)}</Td>
                                  <td className="tnum px-3 py-1.5 text-right">
                                    {fmtIDR(r.biayaHistoris)}
                                  </td>
                                  <td className="tnum px-3 py-1.5 text-right text-[12px]">
                                    {r.qtyHistoris > 0 ? fmtIDR(r.biayaHistoris / r.qtyHistoris, true) : "-"}
                                  </td>
                                  <Td mono muted>
                                    {fmtDate(r.lastDate)}
                                  </Td>
                                  <td className="tnum px-3 py-1.5 text-right">
                                    <span
                                      className={`text-[13px] font-semibold ${
                                        r.stokGudang > 0 ? "text-out" : "text-red-600"
                                      }`}
                                    >
                                      {fmtNum(r.stokGudang, 0)}
                                    </span>
                                  </td>
                                  <td className="max-w-[220px] px-3 py-1.5">
                                    {r.gudang.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {r.gudang.slice(0, 3).map((g) => (
                                          <span
                                            key={g.nama}
                                            className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                                            title={g.nama}
                                          >
                                            {g.nama}: {fmtNum(g.qty, 0)}
                                          </span>
                                        ))}
                                        {r.gudang.length > 3 && (
                                          <span
                                            className="text-[10px] text-ink-3"
                                            title={r.gudang
                                              .slice(3)
                                              .map((g) => `${g.nama}: ${g.qty}`)
                                              .join(", ")}
                                          >
                                            +{r.gudang.length - 3} gudang
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-red-600">kosong semua</span>
                                    )}
                                  </td>
                                  <td className="tnum px-3 py-1.5 text-right">
                                    {r.stokGpu !== null ? (
                                      <span
                                        className={`text-[13px] font-semibold ${
                                          r.stokGpu > 0 ? "text-in" : "text-red-600"
                                        }`}
                                      >
                                        {fmtNum(r.stokGpu, 0)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-ink-3">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <details className="border-t border-line bg-surface-2/40 px-3 py-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-ink-2 hover:text-ink">
                        Riwayat pemakaian per batch ({sku.history.length} batch - terbaru dulu)
                      </summary>
                      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-line bg-white">
                        <table className="w-full border-collapse">
                          <thead className="sticky top-0 bg-surface-2">
                            <tr>
                              <Th>Tanggal produksi</Th>
                              <Th>Batch</Th>
                              <Th>Bahan</Th>
                              <Th align="right">Qty dipakai</Th>
                              <Th align="right">Biaya (Rp)</Th>
                              <Th align="right">Biaya satuan (Rp)</Th>
                              <Th align="right">Sisa stok (kg)</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {sku.history.flatMap((h) =>
                              h.items.map((it, idx) => {
                                const satuan = it.qty > 0 ? it.biaya / it.qty : null;
                                const sisa = stokOf.get(it.kode);
                                return (
                                  <tr
                                    key={`${h.batch_no}-${it.kode}-${idx}`}
                                    className="border-t border-line/60"
                                  >
                                    <Td mono muted>
                                      {idx === 0 ? fmtDate(h.tanggal) : ""}
                                    </Td>
                                    <Td mono muted>
                                      {idx === 0 ? h.batch_no : ""}
                                    </Td>
                                    <td className="px-3 py-1.5 text-[12px] text-ink">
                                      <span className="block truncate" title={`${it.nama} (${it.kode})`}>
                                        {it.nama}{" "}
                                        <span className="tnum text-[10px] text-ink-3">({it.kode})</span>
                                      </span>
                                    </td>
                                    <td className="tnum px-3 py-1.5 text-right text-[12px] text-ink">
                                      {String(Number(it.qty.toFixed(6)))}
                                    </td>
                                    <td className="tnum px-3 py-1.5 text-right text-[12px]">
                                      {fmtIDR(it.biaya)}
                                    </td>
                                    <td className="tnum px-3 py-1.5 text-right text-[12px]">
                                      {satuan != null ? fmtIDR(satuan, true) : "-"}
                                    </td>
                                    <td className="tnum px-3 py-1.5 text-right text-[12px]">
                                      {sisa != null ? fmtNum(sisa, 0) : "-"}
                                    </td>
                                  </tr>
                                );
                              }),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            Hanya bahan yang terdaftar di sheet stok yang ditampilkan (tanpa kemasan &amp; biaya
            proses). &quot;Qty dipakai batch terakhir&quot; = pemakaian bahan pada batch terakhir
            SKU tersebut. &quot;Total dipakai (semua batch)&quot; = akumulasi seluruh batch (bukan
            stok). Stok GPU = sisa produk jadi SKU itu yang tersebar di GPU. Stok disinkronkan 2x
            sehari.
          </p>
        </Panel>
      </div>
    </div>
  );
}