import { NextResponse } from "next/server";
import { readAuth } from "@/lib/auth";
import { deletePreview } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!readAuth(request)) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const body = (await request.json()) as { preview_id?: string };
  if (!body.preview_id) {
    return NextResponse.json({ error: "preview_id wajib diisi" }, { status: 400 });
  }
  await deletePreview(body.preview_id);
  return NextResponse.json({ ok: true });
}