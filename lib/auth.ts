import crypto from "crypto";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "hfg-dev-secret-2026";
export const AUTH_USER = process.env.ADMIN_USERNAME ?? "Admin";
export const AUTH_PASSWORD = process.env.ADMIN_PASSWORD ?? "Hijrah2026";
export const PROD_USER = process.env.PROD_USERNAME ?? "Produksi";
export const PROD_PASSWORD = process.env.PROD_PASSWORD ?? "ProduksiHijrah2026";
export const AUTH_COOKIE = "hfg_auth";
const MAX_AGE_S = 7 * 24 * 3600;

export type Role = "admin" | "viewer";

export type Session = {
  username: string;
  role: Role;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function signToken(username: string, role: Role): string {
  const ts = String(Math.floor(Date.now() / 1000));
  const payload = `${username}|${role}|${ts}`;
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  return `${payload}|${sig}`;
}

export function verifyToken(token: string | null | undefined): Session | null {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 4) return null;
  const [username, role, ts, sig] = parts;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${username}|${role}|${ts}`)
    .digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  const t = Number(ts);
  if (!Number.isFinite(t)) return null;
  if (Date.now() / 1000 - t > MAX_AGE_S) return null;
  if (role !== "admin" && role !== "viewer") return null;
  return { username, role };
}

/* Kredensial admin (akses penuh) atau tim produksi (hanya lihat). */
export function checkCredentials(username: string, password: string): Session | null {
  if (safeEqual(username, AUTH_USER) && safeEqual(password, AUTH_PASSWORD)) {
    return { username: AUTH_USER, role: "admin" };
  }
  if (safeEqual(username, PROD_USER) && safeEqual(password, PROD_PASSWORD)) {
    return { username: PROD_USER, role: "viewer" };
  }
  return null;
}

export function readAuth(request: Request): Session | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`));
  const token = match ? match.slice(AUTH_COOKIE.length + 1) : null;
  return verifyToken(token);
}

/* Hanya admin — dipakai route yang mengubah data (upload, hapus, catatan, master produk). */
export function readAdminAuth(request: Request): Session | null {
  const s = readAuth(request);
  return s && s.role === "admin" ? s : null;
}

export function authCookieString(token: string, maxAge = MAX_AGE_S): string {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookieString(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}