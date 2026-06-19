import { NextResponse } from "next/server";
import { appendVentasToSupabaseServer } from "@/lib/data/supabase-dataset-server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

type ImportVentasBody = {
  ventasRows?: Record<string, unknown>[];
};

export async function POST(request: Request) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  let body: ImportVentasBody;
  try {
    body = (await request.json()) as ImportVentasBody;
  } catch {
    return NextResponse.json({ ok: false, errorMessage: "JSON inválido." }, { status: 400 });
  }

  const rows = body.ventasRows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { ok: false, errorMessage: "No se recibieron filas del Diario de Ventas." },
      { status: 400 },
    );
  }

  try {
    const result = await appendVentasToSupabaseServer(rows);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, errorMessage: result.errorMessage ?? "No se pudieron sumar las ventas." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, diagnostico: result.diagnostico });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Error interno al importar ventas.",
      },
      { status: 500 },
    );
  }
}
