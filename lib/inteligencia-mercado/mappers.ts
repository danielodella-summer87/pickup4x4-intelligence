/** Conversión entre filas de Supabase y el modelo de dominio. */

import type {
  DbMercadoInvestigacion,
  DbMercadoRespuesta,
} from "@/lib/supabase/types";
import {
  ESTADOS_INVESTIGACION,
  type Bloque,
  type EstadoInvestigacion,
  type Investigacion,
  type InvestigacionPublica,
  type OpcionJerarquica,
  type Pregunta,
  type Respuesta,
  type RespuestaInput,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceEstado(value: string): EstadoInvestigacion {
  return (ESTADOS_INVESTIGACION as readonly string[]).includes(value)
    ? (value as EstadoInvestigacion)
    : "borrador";
}

function coercePregunta(value: unknown): Pregunta | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.tipo !== "string") return null;
  if (typeof value.titulo !== "string") return null;
  const pregunta: Pregunta = {
    id: value.id,
    tipo: value.tipo as Pregunta["tipo"],
    titulo: value.titulo,
  };
  if (typeof value.descripcion === "string") pregunta.descripcion = value.descripcion;
  if (typeof value.requerida === "boolean") pregunta.requerida = value.requerida;
  if (Array.isArray(value.opciones)) {
    if (pregunta.tipo === "jerarquico") {
      pregunta.opciones = value.opciones.reduce<OpcionJerarquica[]>((acc, o) => {
        if (isRecord(o) && typeof o.valor === "string") {
          acc.push({
            valor: o.valor,
            ...(Array.isArray(o.hijos)
              ? { hijos: o.hijos.filter((h): h is string => typeof h === "string") }
              : {}),
          });
        }
        return acc;
      }, []);
    } else {
      pregunta.opciones = value.opciones.filter((o): o is string => typeof o === "string");
    }
  }
  if (typeof value.permiteOtro === "boolean") pregunta.permiteOtro = value.permiteOtro;
  if (isRecord(value.escala)) {
    const e = value.escala;
    if (typeof e.min === "number" && typeof e.max === "number") {
      pregunta.escala = {
        min: e.min,
        max: e.max,
        ...(typeof e.etiquetaMin === "string" ? { etiquetaMin: e.etiquetaMin } : {}),
        ...(typeof e.etiquetaMax === "string" ? { etiquetaMax: e.etiquetaMax } : {}),
      };
    }
  }
  if (typeof value.placeholder === "string") pregunta.placeholder = value.placeholder;
  if (typeof value.etiqueta === "string") {
    pregunta.etiqueta = value.etiqueta as Pregunta["etiqueta"];
  }
  return pregunta;
}

export function coerceBloques(value: unknown): Bloque[] {
  if (!Array.isArray(value)) return [];
  const bloques: Bloque[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.titulo !== "string") continue;
    const preguntas = Array.isArray(raw.preguntas)
      ? raw.preguntas.map(coercePregunta).filter((p): p is Pregunta => p !== null)
      : [];
    bloques.push({
      id: raw.id,
      titulo: raw.titulo,
      ...(typeof raw.descripcion === "string" ? { descripcion: raw.descripcion } : {}),
      preguntas,
    });
  }
  return bloques;
}

function coerceRespuestasMap(value: unknown): Record<string, RespuestaValor> {
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

// ── Investigación ─────────────────────────────────────────────────────────-

export function dbRowToInvestigacion(row: DbMercadoInvestigacion): Investigacion {
  return {
    id: row.id,
    slug: row.slug,
    titulo: row.titulo,
    descripcion: row.descripcion ?? "",
    estado: coerceEstado(row.estado),
    intro: row.intro ?? "",
    agradecimiento: row.agradecimiento ?? "",
    capturaDistribuidor: row.captura_distribuidor,
    comentarioFinalTitulo: row.comentario_final_titulo ?? "",
    bloques: coerceBloques(row.bloques),
    meta: isRecord(row.meta) ? row.meta : {},
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function investigacionToPublica(inv: Investigacion): InvestigacionPublica {
  return {
    id: inv.id,
    slug: inv.slug,
    titulo: inv.titulo,
    descripcion: inv.descripcion,
    intro: inv.intro,
    agradecimiento: inv.agradecimiento,
    capturaDistribuidor: inv.capturaDistribuidor,
    comentarioFinalTitulo: inv.comentarioFinalTitulo,
    bloques: inv.bloques,
  };
}

export function investigacionToDbInsert(
  inv: Investigacion,
): DbMercadoInvestigacion {
  return {
    id: inv.id,
    slug: inv.slug,
    titulo: inv.titulo,
    descripcion: inv.descripcion,
    estado: inv.estado,
    intro: inv.intro,
    agradecimiento: inv.agradecimiento,
    captura_distribuidor: inv.capturaDistribuidor,
    comentario_final_titulo: inv.comentarioFinalTitulo,
    bloques: inv.bloques,
    meta: inv.meta,
  };
}

// ── Respuestas ───────────────────────────────────────────────────────────-

function coerceMetaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export function dbRowToRespuesta(row: DbMercadoRespuesta): Respuesta {
  const meta = isRecord(row.meta) ? row.meta : {};
  return {
    id: row.id,
    investigacionId: row.investigacion_id,
    investigacionSlug: row.investigacion_slug,
    distribuidorNombre: row.distribuidor_nombre,
    empresa: row.empresa,
    giro: coerceMetaString(meta, "giro"),
    departamento: row.departamento,
    contacto: row.contacto,
    cargo: coerceMetaString(meta, "cargo"),
    respuestas: coerceRespuestasMap(row.respuestas),
    comentarioLibre: row.comentario_libre,
    meta,
    createdAt: row.created_at ?? "",
  };
}

export function respuestaInputToDbInsert(
  id: string,
  investigacionId: string,
  investigacionSlug: string,
  input: RespuestaInput,
): DbMercadoRespuesta {
  const trim = (v: string | null) => {
    const t = v?.trim();
    return t ? t : null;
  };
  const giro = trim(input.giro);
  const cargo = trim(input.cargo);
  return {
    id,
    investigacion_id: investigacionId,
    investigacion_slug: investigacionSlug,
    distribuidor_nombre: trim(input.distribuidorNombre),
    empresa: trim(input.empresa),
    departamento: trim(input.departamento),
    contacto: trim(input.contacto),
    respuestas: input.respuestas,
    comentario_libre: trim(input.comentarioLibre),
    meta: { ...(input.meta ?? {}), ...(giro ? { giro } : {}), ...(cargo ? { cargo } : {}) },
  };
}
