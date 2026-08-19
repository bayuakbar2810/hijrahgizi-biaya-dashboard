import { NextResponse } from "next/server";
import { clearCookieString } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookieString());
  return res;
}