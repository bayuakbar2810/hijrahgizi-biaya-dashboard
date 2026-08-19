export type Filter = {
  from?: string;
  to?: string;
  batch?: string;
  batches?: string[];
  q?: string;
  sku?: string;
  product_type?: string;
};

export function buildFilterClause(f: Filter): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (f.from) {
    parts.push(`tanggal >= $${p++}`);
    params.push(f.from);
  }
  if (f.to) {
    parts.push(`tanggal <= $${p++}`);
    params.push(f.to);
  }
  if (f.batch) {
    parts.push(`batch_no = $${p++}`);
    params.push(f.batch);
  }
  if (f.batches && f.batches.length) {
    const list = f.batches;
    parts.push(`batch_no IN (${list.map((_, i) => `$${p + i}`).join(", ")})`);
    params.push(...list);
    p += list.length;
  }
  if (f.product_type) {
    parts.push(`pm.product_type = $${p++}`);
    params.push(f.product_type);
  }
  if (f.sku && f.sku.trim()) {
    parts.push(`pm.kode = $${p++}`);
    params.push(f.sku.trim());
  }
  if (f.q && f.q.trim()) {
    const q = `%${f.q.trim()}%`;
    parts.push(
      `(t.batch_no ILIKE $${p} OR t.bahan_biaya ILIKE $${p} OR t.kode ILIKE $${p} OR t.keterangan ILIKE $${p})`,
    );
    params.push(q);
    p++;
  }

  const clause = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

export function parseIds(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
}