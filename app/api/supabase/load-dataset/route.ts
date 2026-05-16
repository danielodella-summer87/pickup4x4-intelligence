import { NextResponse } from "next/server";
import { loadDatasetFromSupabaseServer } from "@/lib/data/supabase-dataset-server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

export async function GET() {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        dataset: null,
        activeData: null,
        oportunidades: [],
        generatedAt: null,
        errorMessage: envCheck.message,
      },
      { status: 503 },
    );
  }

  try {
    const result = await loadDatasetFromSupabaseServer();

    return NextResponse.json({
      ok: result.ok,
      dataset: result.dataset,
      activeData: result.activeData,
      oportunidades: result.oportunidades,
      generatedAt: result.generatedAt?.toISOString() ?? null,
      importacionId: result.importacionId,
      errorMessage: result.errorMessage,
    });
  } catch (error) {
    console.error("[SupabaseLoad] Error en route", error);
    return NextResponse.json(
      {
        ok: false,
        dataset: null,
        activeData: null,
        oportunidades: [],
        generatedAt: null,
        errorMessage: error instanceof Error ? error.message : "Error interno al cargar",
      },
      { status: 500 },
    );
  }
}
