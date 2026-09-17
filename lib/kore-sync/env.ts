import { parseKoreConfig } from "../kore/config.ts";
import type { KoreEnv } from "../kore/config.ts";

/**
 * Validación fail-closed del entorno del runner local. Los mensajes nombran
 * variables, nunca valores. La service role key es server-only: nunca
 * NEXT_PUBLIC_, nunca browser, nunca logueada.
 */

export type ShadowSyncEnv = {
  kore: KoreEnv;
  supabaseUrl: string;
  serviceRoleKey: string;
};

export class ShadowSyncEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShadowSyncEnvError";
  }
}

export function validateShadowSyncEnv(env: Readonly<Record<string, string | undefined>>): ShadowSyncEnv {
  if (typeof window !== "undefined") throw new ShadowSyncEnvError("El shadow sync solo corre en servidor");

  const missing = ["KORE_BASE_URL", "KORE_COMPANY_NUMBER", "KORE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (key) => !env[key]?.trim(),
  );
  if (missing.length > 0) throw new ShadowSyncEnvError(`Faltan variables de entorno: ${missing.join(", ")}`);

  // Valida KORE_* con el parser existente (fail-fast, sin exponer valores).
  parseKoreConfig(env);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new ShadowSyncEnvError("NEXT_PUBLIC_SUPABASE_URL no es una URL válida");
  }
  if (url.protocol !== "https:") throw new ShadowSyncEnvError("NEXT_PUBLIC_SUPABASE_URL debe usar https");

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  if (serviceRoleKey === env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || serviceRoleKey === env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    throw new ShadowSyncEnvError("SUPABASE_SERVICE_ROLE_KEY no puede ser la clave pública");
  }
  if (Object.keys(env).some((key) => key.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE/i.test(key))) {
    throw new ShadowSyncEnvError("La service role key no puede exponerse con prefijo NEXT_PUBLIC_");
  }

  return { kore: env, supabaseUrl, serviceRoleKey };
}
