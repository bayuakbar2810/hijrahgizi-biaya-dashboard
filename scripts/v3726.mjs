const base = "https://analisabiaya.vercel.app";
const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Admin", password: "Hijrah2026" }) });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const B = "PRO/06/2026/3726";

for (const kode of ["R101749", "R101750"]) {
  const d = await (await fetch(`${base}/api/item-bahan?kode=${kode}`, { headers: { Cookie: cookie } })).json();
  // cari batch 3726 di riwayat
  const h3726 = (d.history ?? []).find(h => h.batch_no === B);
  console.log(`\n=== ${kode} (${d.bahan.length} bahan historis dari ${d.n_batches} batch) ===`);
  console.log(`batch terakhir: ${d.latest?.batch_no} (${d.latest?.tanggal})`);
  console.log(`batch 3726 ada di riwayat?`, h3726 ? "YA" : "TIDAK");
  if (h3726) {
    console.log(`  tanggal: ${h3726.tanggal} | bahan dipakai: ${h3726.items.length} (sesuai Accurate)`);
    for (const it of h3726.items) console.log(`    - ${it.nama} (${it.kode}) = ${it.qty}`);
  }
  // resep batch terakhir (kolom "Dipakai di batch terakhir")
  console.log(`  resep batch terakhir (${d.latest?.batch_no}): ${(d.current ?? []).length} bahan`);
  for (const c of (d.current ?? [])) console.log(`    - ${c.nama} (${c.kode}) = ${c.qty}`);
}
