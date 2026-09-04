import fs from "fs";
const base = "http://localhost:3100";
const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Admin", password: "Hijrah2026" }) });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const d = await (await fetch(`${base}/api/item-bahan?kode=R101749`, { headers: { Cookie: cookie } })).json();
const h = (d.history ?? []).find(x => x.batch_no === "PRO/06/2026/3726");
console.log("[riwayat 3726] biaya per bahan kini terisi?");
for (const it of (h?.items ?? [])) console.log(`   ${it.nama} | qty=${it.qty} | biaya=${it.biaya} | satuan=${(it.biaya/it.qty).toFixed(2)}`);
const analysis = await (await fetch(base + "/api/analysis", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" })).json();
const item = analysis.sku_hist.find(i => i.kode === "R101749");
const kodeSet = new Set(["R101749"]); for (const b of d.bahan ?? []) kodeSet.add(b.kode); for (const c of d.current ?? []) kodeSet.add(c.kode);
const sd = await (await fetch(base + "/api/stok", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ kode: [...kodeSet] }) })).json();
const cur = new Map((d.current ?? []).map(c => [c.kode, c]));
const rows = [];
for (const k of kodeSet) {
  const sB = sd.items[k]; if (!sB) continue;
  const hh = (d.bahan ?? []).find(x => x.kode === k);
  const cc = cur.get(k);
  rows.push({ skuKode: "R101749", skuNama: item.nama, kode: k, nama: hh?.nama ?? cc?.nama ?? "", qtyTerakhir: cc ? cc.qty : null, biayaTerakhir: cc ? cc.biaya : null, qtyHistoris: hh ? hh.total_qty : 0, biayaHistoris: hh ? hh.total_biaya : 0, nBatch: hh?.n_batch ?? 0, lastDate: hh?.last_date ?? "", stokGudang: sB.total, gudang: sB.gudang, stokGpu: sd.gpu[normKode(k)] ? sd.gpu[normKode(k)].total : null });
}
function normKode(k) { return k.replace(/^R(?=\d)/i, "").trim(); }
const skus = [{ skuKode: "R101749", skuNama: item.nama, nBatches: d.n_batches, latestBatch: d.latest?.batch_no ?? null, latestTanggal: d.latest?.tanggal ?? null, history: d.history ?? [], rows }];
const { generateBahanStokPdf, generateBahanDetailPdf } = await import("../lib/report.ts");
const jsPDF = (await import("jspdf")).jsPDF;
jsPDF.prototype.save = function (n) { fs.writeFileSync(n, Buffer.from(this.output("arraybuffer"))); };
generateBahanStokPdf(skus, { fetchedAt: sd.fetched_at, includeHistory: true });
generateBahanDetailPdf(skus, { fetchedAt: sd.fetched_at });
console.log("PDF dibuat");
