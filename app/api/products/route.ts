import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAdminAuth } from "@/lib/auth";
import type { ProductMaster, ProductType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TYPES: ProductType[] = [
  "RAW_MATERIAL",
  "PACKAGING",
  "PROCESS_COST",
  "BY_PRODUCT",
  "FINISHED_PRODUCT",
  "OTHER",
];

export async function GET(request: NextRequest) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const ptype = sp.get("product_type")?.trim() ?? "";
  const limit = Math.min(Number(sp.get("limit") ?? 500), 2000);

  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (q) {
    params.push(`%${q}%`);
    parts.push(`(pm.kode ILIKE $${p} OR pm.nama_produk ILIKE $${p} OR t.bahan_biaya ILIKE $${p})`);
    p++;
  }
  if (ptype) {
    params.push(ptype);
    parts.push(`pm.product_type = $${p}`);
    p++;
  }
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";

  const db = await getDb();
  const { rows } = await db.query(
    `SELECT pm.kode, pm.nama_produk, pm.product_type, pm.is_rtl, pm.is_main_output,
            pm.is_by_product, pm.is_packaging, pm.active,
            COUNT(t.id) AS n_rows
     FROM product_master pm
     LEFT JOIN production_transactions t ON t.kode = pm.kode
     ${clause}
     GROUP BY pm.kode, pm.nama_produk, pm.product_type, pm.is_rtl, pm.is_main_output,
              pm.is_by_product, pm.is_packaging, pm.active
     ORDER BY n_rows DESC, pm.kode
     LIMIT $${p}`,
    [...params, limit],
  );

  const items: ProductMaster[] = (rows as Array<Record<string, unknown>>).map((r) => ({
    kode: String(r.kode),
    nama_produk: String(r.nama_produk),
    product_type: (r.product_type as ProductType) ?? "OTHER",
    is_rtl: Number(r.is_rtl) === 1,
    is_main_output: Number(r.is_main_output) === 1,
    is_by_product: Number(r.is_by_product) === 1,
    is_packaging: Number(r.is_packaging) === 1,
    active: Number(r.active) === 1,
  }));

  return NextResponse.json({ items, total: items.length });
}

export async function PUT(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as Partial<ProductMaster> & { kode: string };
  if (!body.kode) {
    return NextResponse.json({ error: "kode wajib diisi" }, { status: 400 });
  }
  const ptype = body.product_type;
  if (ptype && !TYPES.includes(ptype)) {
    return NextResponse.json({ error: "product_type tidak valid" }, { status: 400 });
  }
  const db = await getDb();
  await db.query(
    `UPDATE product_master SET
       product_type = COALESCE($1, product_type),
       is_rtl = COALESCE($2, is_rtl),
       is_main_output = COALESCE($3, is_main_output),
       is_by_product = COALESCE($4, is_by_product),
       is_packaging = COALESCE($5, is_packaging),
       active = COALESCE($6, active)
     WHERE kode = $7`,
    [
      ptype ?? null,
      body.is_rtl === undefined ? null : body.is_rtl ? 1 : 0,
      body.is_main_output === undefined ? null : body.is_main_output ? 1 : 0,
      body.is_by_product === undefined ? null : body.is_by_product ? 1 : 0,
      body.is_packaging === undefined ? null : body.is_packaging ? 1 : 0,
      body.active === undefined ? null : body.active ? 1 : 0,
      body.kode,
    ],
  );
  return NextResponse.json({ ok: true });
}