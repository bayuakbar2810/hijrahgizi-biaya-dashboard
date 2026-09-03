const base = "https://analisabiaya.vercel.app";
const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Admin", password: "Hijrah2026" }) });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const B = "PRO/06/2026/3726";

// 1. isi batch 3726
const raw = await (await fetch(base + "/api/raw?batch=" + encodeURIComponent(B), { headers: { Cookie: cookie } })).json();
const rows = raw.rows ?? [];
console.log("Batch", B, ":", rows.length, "baris");
const inputs = rows.filter(r => Number(r.pengeluaran_qty) > 0 || Number(r.pengeluaran_biaya) > 0);
const outputs = rows.filter(r => Number(r.penyelesaian_qty) > 0);
console.log("  INPUT (" + inputs.length + "):");
for (const i of inputs) console.log(`    ${i.kode} | ${String(i.bahan_biaya).slice(0,35)} | qty=${i.pengeluaran_qty}`);
console.log("  OUTPUT (" + outputs.length + "):");
for (const o of outputs) console.log(`    ${o.kode} | ${String(o.bahan_biaya).slice(0,40)}`);

// 2. SKU Giling Ekonomis: berapa batch & berapa bahan unik historis
const bahan = await (await fetch(base + "/api/item-bahan?kode=" + encodeURIComponent(outputs[0]?.kode ?? ""), { headers: { Cookie: cookie } })).json();
console.log("\nSKU", outputs[0]?.kode, "-", outputs[0]?.bahan_biaya);
console.log("  total batch produksi:", bahan.n_batches, "| total bahan unik historis:", bahan.bahan.length);
console.log("  daftar bahan unik historis:");
for (const x of bahan.bahan) console.log(`    ${x.kode} | ${String(x.nama).slice(0,40)} | dipakai di ${x.n_batch} batch | terakhir ${x.last_date}`);
