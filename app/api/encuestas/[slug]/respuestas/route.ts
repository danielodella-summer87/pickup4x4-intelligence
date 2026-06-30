import { NextResponse } from "next/server";
import { insertRespuesta } from "@/lib/inteligencia-mercado/server";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";
import type {
  RespuestaInput,
  RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

export const maxDuration = 30;

type Context = { params: Promise<{ slug: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
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
    }
  }
  return out;
}

export async function POST(request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: envCheck.message },
      { status: 503 },
    );
  }

  const { slug } = await params;

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

  const input: RespuestaInput = {
    distribuidorNombre: asString(body.distribuidorNombre),
    empresa: asString(body.empresa),
    departamento: asString(body.departamento),
    contacto: asString(body.contacto),
    respuestas: coerceRespuestas(body.respuestas),
    comentarioLibre: asString(body.comentarioLibre),
    meta: isRecord(body.meta) ? body.meta : {},
  };

  const result = await insertRespuesta(slug, input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errorMessage: result.errorMessage },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, id: result.data.id }, { status: 201 });
}
