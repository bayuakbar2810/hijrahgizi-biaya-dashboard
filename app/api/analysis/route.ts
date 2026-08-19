import { NextResponse } from "next/server";
import { loadEnrichedRows, loadSettings } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { readAuth } from "@/lib/auth";
import { pythonAnalyze } from "@/lib/python";
import type { AnalysisParams } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAnalysisRows(body: Partial<AnalysisParams>) {
  if (body.sku && body.sku.trim()) {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT DISTINCT t.batch_no
       FROM production_transactions t
       JOIN product_master pm ON pm.kode = t.kode
       WHERE pm.kode = $1`,
      [body.sku.trim()],
    );
    const batches = (rows as Array<{ batch_no: string }>).map((r) => r.batch_no);
    return loadEnrichedRows({ batches });
  }
  return loadEnrichedRows({ from: body.from, to: body.to, batch: body.batch });
}

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as Partial<AnalysisParams>;

  const rows = await loadAnalysisRows(body);
  const settings = await loadSettings();
  const result = await pythonAnalyze({
    rows,
    params: {
      from: body.from,
      to: body.to,
      batch: body.batch,
      sku: body.sku,
      q: body.q,
      anomaly_type: body.anomaly_type,
      severity: body.severity,
    },
    settings,
  });
  return NextResponse.json(result);
}