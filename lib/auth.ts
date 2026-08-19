import crypto from "crypto";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "hfg-dev-secret-2026";
export const AUTH_USER = process.env.ADMIN_USERNAME ?? "Admin";
export const AUTH_PASSWORD = process.env.ADMIN_PASSWORD ?? "Hijrah2026";
export const AUTH_COOKIE = "hfg_auth";
const MAX_AGE_S = 7 * 24 * 3600;

export function signToken(username: string): string {
  const ts = String(Math.floor(Date.now() / 1000));
  const payload = `${username}.${ts}`;
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, ts, sig] = parts;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${username}.${ts}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const t = Number(ts);
  if (!Number.isFinite(t)) return null;
  if (Date.now() / 1000 - t > MAX_AGE_S) return null;
  return username;
}

export function checkCredentials(username: string, password: string): boolean {
  const a = Buffer.from(username);
  const b = Buffer.from(AUTH_USER);
  const c = Buffer.from(password);
  const d = Buffer.from(AUTH_PASSWORD);
  const u = a.length === b.length && crypto.timingSafeEqual(a, b);
  const p = c.length === d.length && crypto.timingSafeEqual(c, d);
  return u && p;
}

export function readAuth(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`));
  const token = match ? match.slice(AUTH_COOKIE.length + 1) : null;
  return verifyToken(token);
}

export function authCookieString(token: string, maxAge = MAX_AGE_S): string {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookieString(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}