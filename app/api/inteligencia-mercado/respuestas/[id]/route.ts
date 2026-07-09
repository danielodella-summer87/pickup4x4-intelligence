import { NextResponse } from "next/server";
import {
  deleteRespuestaAdmin,
  updateRespuestaAdmin,
} from "@/lib/inteligencia-mercado/server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";
import type { RespuestaValor } from "@/lib/inteligencia-mercado/types";

// Herramienta interna del panel (editar/borrar una respuesta). No se llama
// desde la landing pública /encuesta/[slug].

export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceRespuestas(value: unknown): Record<string, RespuestaValor> {
  if (!isRecord(value)) return {};
  const out: Record<string, RespuestaValor> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean"
    ) {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      out[key] = raw.filter((v): v is string => typeof v === "string");
    } else if (isRecord(raw)) {
      const hijos: Record<string, string[]> = {};
      for (const [padre, valorHijos] of Object.entries(raw)) {
        if (Array.isArray(valorHijos)) {
          hijos[padre] = valorHijos.filter((v): v is string => typeof v === "string");
        }
      }
      out[key] = hijos;
    }
  }
  return out;
}

export async function PATCH(request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: envCheck.message },
      { status: 503 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errorMessage: "JSON inválido." },
      { status: 400 },
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { ok: false, errorMessage: "Cuerpo de la solicitud inválido." },
      { status: 400 },
    );
  }

  const patch: {
    distribuidorNombre?: string | null;
    departamento?: string | null;
    giro?: string | null;
    cargo?: string | null;
    respuestas?: Record<string, RespuestaValor>;
  } = {};
  if ("distribuidorNombre" in body) {
    patch.distribuidorNombre =
      typeof body.distribuidorNombre === "string" ? body.distribuidorNombre : null;
  }
  if ("departamento" in body) {
    patch.departamento = typeof body.departamento === "string" ? body.departamento : null;
  }
  if ("giro" in body) {
    patch.giro = typeof body.giro === "string" ? body.giro : null;
  }
  if ("cargo" in body) {
    patch.cargo = typeof body.cargo === "string" ? body.cargo : null;
  }
  if ("respuestas" in body) {
    patch.respuestas = coerceRespuestas(body.respuestas);
  }

  const result = await updateRespuestaAdmin(id, patch);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: result.errorMessage },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}

export async function DELETE(_request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: envCheck.message },
      { status: 503 },
    );
  }

  const { id } = await params;
  const result = await deleteRespuestaAdmin(id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: result.errorMessage },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}
