import { NextResponse } from "next/server";
import { loadEnrichedRows, loadSettings } from "@/lib/analytics";
import { readAuth } from "@/lib/auth";
import { pythonBatchDetail } from "@/lib/python";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as { batch_no?: string };
  if (!body.batch_no) {
    return NextResponse.json({ error: "batch_no wajib diisi" }, { status: 400 });
  }
  const rows = await loadEnrichedRows({});
  const settings = await loadSettings();
  const result = await pythonBatchDetail(rows, body.batch_no, settings);
  return NextResponse.json(result);
}