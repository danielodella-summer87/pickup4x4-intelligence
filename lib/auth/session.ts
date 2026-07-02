/**
 * Auth interno mínimo para proteger la app admin (todo excepto /encuesta/*,
 * /login y /api/auth/*). Un solo usuario/contraseña compartido por variables
 * de entorno, sesión stateless firmada con HMAC (sin DB, sin dependencias
 * nuevas). Usado tanto por proxy.ts como por las route handlers de auth.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "pickup_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

export type AdminCredentials = { user: string; password: string };

// Solo para desarrollo local cuando no se configuraron las variables de
// entorno. En producción, si faltan, el acceso interno queda bloqueado
// (ver getAdminCredentials).
const DEV_FALLBACK_CREDENTIALS: AdminCredentials = {
  user: "admin",
  password: "pickup4x4-dev",
};

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Lee PICKUP_ADMIN_USER + (PICKUP_ADMIN_PASSWORD o PICKUP_ADMIN_PIN) del
 * entorno. Si faltan: en desarrollo usa credenciales fallback fijas; en
 * producción devuelve null (bloquea todo acceso interno).
 */
export function getAdminCredentials(): AdminCredentials | null {
  const user = process.env.PICKUP_ADMIN_USER?.trim();
  const password = (
    process.env.PICKUP_ADMIN_PASSWORD ?? process.env.PICKUP_ADMIN_PIN
  )?.trim();

  if (user && password) return { user, password };
  if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_CREDENTIALS;
  return null;
}

export function credentialsMatch(
  inputUser: string,
  inputPassword: string,
  creds: AdminCredentials,
): boolean {
  return (
    timingSafeEqualStr(inputUser, creds.user) &&
    timingSafeEqualStr(inputPassword, creds.password)
  );
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Token stateless: usuario + expiración + firma HMAC con la contraseña como clave. */
export function createSessionCookieValue(creds: AdminCredentials): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${creds.user}.${expiresAt}`;
  return `${payload}.${sign(payload, creds.password)}`;
}

export function isValidSessionCookieValue(
  value: string | undefined,
  creds: AdminCredentials | null,
): boolean {
  if (!value || !creds) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [user, expiresAtRaw, sig] = parts;
  if (user !== creds.user) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = sign(`${user}.${expiresAtRaw}`, creds.password);
  return timingSafeEqualStr(sig, expected);
}
