import { NextResponse } from "next/server";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const username = readAuth(request);
  if (!username) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username });
}