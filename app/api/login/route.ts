import { NextResponse } from "next/server";
import { authCookieString, checkCredentials, signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  const session = checkCredentials(username, password);
  if (!session) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }
  const token = signToken(session.username, session.role);
  const res = NextResponse.json({
    ok: true,
    username: session.username,
    role: session.role,
  });
  res.headers.set("Set-Cookie", authCookieString(token));
  return res;
}