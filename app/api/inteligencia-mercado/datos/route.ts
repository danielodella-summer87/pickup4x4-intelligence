import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getAdminCredentials,
  isValidSessionCookieValue,
} from "@/lib/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";
import { dbRowToInvestigacion, dbRowToRespuesta } from "@/lib/inteligencia-mercado/mappers";
import type { DbMercadoInvestigacion, DbMercadoRespuesta } from "@/lib/supabase/types";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  if (!isValidSessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    getAdminCredentials(),
  )) {
    return json({ ok: false, errorMessage: "No autenticado. Volvé a iniciar sesión." }, 401);
  }

  const tipo = request.nextUrl.searchParams.get("tipo");
  if (tipo !== "investigaciones" && tipo !== "respuestas") {
    return json({ ok: false, errorMessage: "Tipo de consulta inválido." }, 400);
  }

  const env = validateSupabaseServiceEnv();
  if (!env.ok) return json({ ok: false, errorMessage: env.message }, 503);
  const client = createSupabaseServiceClient();
  if (!client) return json({ ok: false, errorMessage: "No se pudo conectar con Supabase." }, 503);

  try {
    if (tipo === "investigaciones") {
      const { data, error } = await client.from("mercado_investigaciones")
        .select("*").order("updated_at", { ascending: false });
      if (error) return json({ ok: false, errorMessage: error.message }, 500);
      return json({ ok: true, investigaciones: (data ?? []).map(
        row => dbRowToInvestigacion(row as DbMercadoInvestigacion),
      ) });
    }
    let query = client.from("mercado_respuestas")
      .select("*").order("created_at", { ascending: false });
    const investigacionId = request.nextUrl.searchParams.get("investigacionId");
    if (investigacionId) query = query.eq("investigacion_id", investigacionId);
    const { data, error } = await query;
    if (error) return json({ ok: false, errorMessage: error.message }, 500);
    return json({ ok: true, respuestas: (data ?? []).map(
      row => dbRowToRespuesta(row as DbMercadoRespuesta),
    ) });
  } catch {
    return json({ ok: false, errorMessage: "No se pudo conectar con Supabase." }, 502);
  }
}
