/**
 * Estado de sesión de la request actual (solo servidor).
 *
 * Lo usa el layout raíz para decirle al DatasetProvider si hay sesión válida. Así una
 * transición no autenticado → autenticado (o logout) invalida el estado del dataset sin
 * recargas manuales, sin polling y sin una segunda capa de auth: se reutiliza la misma
 * cookie firmada que valida `proxy.ts`.
 */
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, getAdminCredentials, isValidSessionCookieValue } from "@/lib/auth/session";

export async function isRequestAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValidSessionCookieValue(store.get(SESSION_COOKIE_NAME)?.value, getAdminCredentials());
}
