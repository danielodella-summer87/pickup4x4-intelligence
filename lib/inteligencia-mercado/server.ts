/**
 * Acceso server-side a Inteligencia de Mercado (service role).
 * Solo se importa desde Route Handlers (app/api/encuestas/*, app/api/inteligencia-mercado/*)
 * y desde el Server Component de la landing (app/encuesta/[slug]). NO importar en cliente.
 */
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { DbMercadoInvestigacion, DbMercadoRespuesta } from "@/lib/supabase/types";
import {
  dbRowToInvestigacion,
  investigacionToPublica,
  respuestaInputToDbInsert,
} from "@/lib/inteligencia-mercado/mappers";
import {
  esRespuestaVacia,
  todasLasPreguntas,
  type Investigacion,
  type InvestigacionPublica,
  type RespuestaInput,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errorMessage: string };

function friendly(message: string): string {
  if (
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return "Las tablas de Inteligencia de Mercado no existen en Supabase. Ejecutá la migración 20260629_inteligencia_mercado.sql en el SQL Editor.";
  }
  return message;
}

function missingServiceClient(): { ok: false; status: number; errorMessage: string } {
  return {
    ok: false,
    status: 503,
    errorMessage:
      "Supabase no está configurado (faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
  };
}

/** Investigación completa (uso interno del servidor). */
async function getInvestigacionBySlug(
  slug: string,
): Promise<ServerResult<Investigacion>> {
  const client = createSupabaseServiceClient();
  if (!client) return missingServiceClient();

  const { data, error } = await client
    .from("mercado_investigaciones")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, errorMessage: friendly(error.message) };
  }
  if (!data) {
    return { ok: false, status: 404, errorMessage: "Investigación no encontrada." };
  }
  return { ok: true, data: dbRowToInvestigacion(data as DbMercadoInvestigacion) };
}

/** Forma pública para la landing. Solo devuelve investigaciones activas. */
export async function getInvestigacionPublica(
  slug: string,
): Promise<ServerResult<InvestigacionPublica>> {
  const result = await getInvestigacionBySlug(slug);
  if (!result.ok) return result;
  if (result.data.estado !== "activa") {
    return {
      ok: false,
      status: 410,
      errorMessage: "Esta investigación no está disponible en este momento.",
    };
  }
  return { ok: true, data: investigacionToPublica(result.data) };
}

/**
 * Vista previa para el panel admin: igual forma que getInvestigacionPublica
 * pero SIN el filtro `estado === "activa"` (permite ver borrador/cerrada).
 * El caller (app/encuesta/[slug]/page.tsx) es responsable de validar la
 * sesión admin antes de llamar a esta función — nunca exponerla sin auth.
 */
export async function getInvestigacionParaPreview(
  slug: string,
): Promise<ServerResult<InvestigacionPublica>> {
  const result = await getInvestigacionBySlug(slug);
  if (!result.ok) return result;
  return { ok: true, data: investigacionToPublica(result.data) };
}

/** Inserta una respuesta validando contra la definición vigente. */
export async function insertRespuesta(
  slug: string,
  input: RespuestaInput,
): Promise<ServerResult<{ id: string }>> {
  const client = createSupabaseServiceClient();
  if (!client) return missingServiceClient();

  const invResult = await getInvestigacionBySlug(slug);
  if (!invResult.ok) return invResult;

  const investigacion = invResult.data;
  if (investigacion.estado !== "activa") {
    return {
      ok: false,
      status: 410,
      errorMessage: "Esta investigación ya no acepta respuestas.",
    };
  }

  // Validación server-side: preguntas requeridas + filtra ids desconocidos.
  const preguntas = todasLasPreguntas(investigacion);
  const idsValidos = new Set(preguntas.map((p) => p.id));
  const faltantes = preguntas
    .filter((p) => p.requerida && esRespuestaVacia(input.respuestas[p.id]))
    .map((p) => p.titulo);
  if (faltantes.length > 0) {
    return {
      ok: false,
      status: 400,
      errorMessage: `Faltan respuestas obligatorias: ${faltantes.join(", ")}.`,
    };
  }

  const respuestasLimpias = Object.fromEntries(
    Object.entries(input.respuestas).filter(([id]) => idsValidos.has(id)),
  );

  const id = `resp-${slug}-${crypto.randomUUID()}`;
  const row = respuestaInputToDbInsert(id, investigacion.id, investigacion.slug, {
    ...input,
    respuestas: respuestasLimpias,
  });

  const { error } = await client.from("mercado_respuestas").insert(row);
  if (error) {
    return { ok: false, status: 500, errorMessage: friendly(error.message) };
  }
  return { ok: true, data: { id } };
}

export type RespuestaAdminPatch = {
  distribuidorNombre?: string | null;
  departamento?: string | null;
  giro?: string | null;
  cargo?: string | null;
  respuestas?: Record<string, RespuestaValor>;
};

/**
 * Edición administrativa desde el panel (corregir un dato mal escrito, etc).
 * Solo usable por herramientas internas (Route Handler de admin) — nunca desde
 * la landing pública.
 */
export async function updateRespuestaAdmin(
  id: string,
  patch: RespuestaAdminPatch,
): Promise<ServerResult<{ id: string }>> {
  const client = createSupabaseServiceClient();
  if (!client) return missingServiceClient();

  const { data: fila, error: fetchErr } = await client
    .from("mercado_respuestas")
    .select("investigacion_id, meta")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    return { ok: false, status: 500, errorMessage: friendly(fetchErr.message) };
  }
  if (!fila) {
    return { ok: false, status: 404, errorMessage: "Respuesta no encontrada." };
  }

  const update: Partial<DbMercadoRespuesta> = {};
  if (patch.distribuidorNombre !== undefined) {
    const v = patch.distribuidorNombre?.trim();
    update.distribuidor_nombre = v ? v : null;
  }
  if (patch.departamento !== undefined) {
    const v = patch.departamento?.trim();
    update.departamento = v ? v : null;
  }
  if (patch.giro !== undefined || patch.cargo !== undefined) {
    const metaActual =
      typeof fila.meta === "object" && fila.meta !== null && !Array.isArray(fila.meta)
        ? (fila.meta as Record<string, unknown>)
        : {};
    const metaNuevo = { ...metaActual };
    if (patch.giro !== undefined) {
      const v = patch.giro?.trim();
      if (v) metaNuevo.giro = v;
      else delete metaNuevo.giro;
    }
    if (patch.cargo !== undefined) {
      const v = patch.cargo?.trim();
      if (v) metaNuevo.cargo = v;
      else delete metaNuevo.cargo;
    }
    update.meta = metaNuevo;
  }
  if (patch.respuestas !== undefined) {
    const invResult = await getInvestigacionById(fila.investigacion_id);
    if (!invResult.ok) return invResult;
    const idsValidos = new Set(todasLasPreguntas(invResult.data).map((p) => p.id));
    update.respuestas = Object.fromEntries(
      Object.entries(patch.respuestas).filter(([qid]) => idsValidos.has(qid)),
    );
  }

  const { error: updErr } = await client
    .from("mercado_respuestas")
    .update(update)
    .eq("id", id);
  if (updErr) {
    return { ok: false, status: 500, errorMessage: friendly(updErr.message) };
  }
  return { ok: true, data: { id } };
}

/** Borra UNA fila de mercado_respuestas. No toca mercado_investigaciones. */
export async function deleteRespuestaAdmin(
  id: string,
): Promise<ServerResult<{ id: string }>> {
  const client = createSupabaseServiceClient();
  if (!client) return missingServiceClient();

  const { data, error } = await client
    .from("mercado_respuestas")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, errorMessage: friendly(error.message) };
  }
  if (!data) {
    return { ok: false, status: 404, errorMessage: "Respuesta no encontrada." };
  }
  return { ok: true, data: { id } };
}

async function getInvestigacionById(id: string): Promise<ServerResult<Investigacion>> {
  const client = createSupabaseServiceClient();
  if (!client) return missingServiceClient();

  const { data, error } = await client
    .from("mercado_investigaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, errorMessage: friendly(error.message) };
  }
  if (!data) {
    return { ok: false, status: 404, errorMessage: "Investigación no encontrada." };
  }
  return { ok: true, data: dbRowToInvestigacion(data as DbMercadoInvestigacion) };
}
