export type SupabaseServiceEnvCheck = {
  ok: boolean;
  missing: string[];
  message: string;
};

/** Valida variables requeridas en API routes (service role). */
export function validateSupabaseServiceEnv(): SupabaseServiceEnvCheck {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: `Faltan variables de entorno: ${missing.join(", ")}. Configuralas en .env.local o en Vercel.`,
    };
  }

  return { ok: true, missing: [], message: "Variables Supabase OK" };
}
