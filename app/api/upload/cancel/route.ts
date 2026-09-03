import { NextResponse } from "next/server";
import { readAdminAuth } from "@/lib/auth";
import { deletePreview } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!readAdminAuth(request)) {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan aksi ini" }, { status: 403 });
  }
  const body = (await request.json()) as { preview_id?: string };
  if (!body.preview_id) {
    return NextResponse.json({ error: "preview_id wajib diisi" }, { status: 400 });
  }
  await deletePreview(body.preview_id);
  return NextResponse.json({ ok: true });
}