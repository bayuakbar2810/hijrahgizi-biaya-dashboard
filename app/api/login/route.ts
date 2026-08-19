import { NextResponse } from "next/server";
import { AUTH_USER, authCookieString, checkCredentials, signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }
  const token = signToken(AUTH_USER);
  const res = NextResponse.json({ ok: true, username: AUTH_USER });
  res.headers.set("Set-Cookie", authCookieString(token));
  return res;
}