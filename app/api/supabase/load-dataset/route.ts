import { NextResponse } from "next/server";
import { loadActiveDatasetServer } from "@/lib/data/active-dataset-server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

/** Datos leídos con service role: nunca cacheables por intermediarios. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Dataset activo según la configuración de fuentes de la app (no según la request).
 * Respuesta con estado explícito (ready | empty | error) y procedencia por dominio.
 */
export async function GET() {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        errorCode: "SUPABASE_NOT_CONFIGURED",
        dataset: null,
        oportunidades: [],
        generatedAt: null,
        provenance: null,
        errorMessage: envCheck.message,
      },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    const result = await loadActiveDatasetServer();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error("[SupabaseLoad] Error en route", error instanceof Error ? error.name : "Error");
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        errorCode: "LOAD_FAILED",
        dataset: null,
        oportunidades: [],
        generatedAt: null,
        provenance: null,
        errorMessage: "Error interno al cargar",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
