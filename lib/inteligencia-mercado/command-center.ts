/**
 * Selectores derivados para el Command Center (tab Resumen).
 *
 * Son funciones PURAS sobre la data ya cargada en el panel
 * (`investigaciones`, `respuestas`). No tocan loaders, esquema, ni la lógica
 * existente de `aggregations.ts`; sólo la reutilizan para componer el dashboard
 * ejecutivo. Pensadas para correr en el cliente (usan `new Date()` para el
 * "ahora", lo que es seguro porque el panel renderiza post-mount).
 */
import {
  computeComentarios,
  computeDashboard,
  computeOportunidades,
  computeTendencias,
  type ComentarioEntrada,
  type Mencion,
} from "@/lib/inteligencia-mercado/aggregations";
import {
  esRespuestaVacia,
  todasLasPreguntas,
  type Investigacion,
  type Respuesta,
} from "@/lib/inteligencia-mercado/types";

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - day);
  return x;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function labelDia(d: Date): string {
  try {
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
  } catch {
    return ymd(d);
  }
}

function parseFecha(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Tipos de salida ──────────────────────────────────────────────────────────

export type SeriePunto = { iso: string; label: string; valor: number };

export type KpiDeltaData = { valor: number; pct: number | null };

export type OportunidadResumen = {
  etiqueta: string;
  label: string;
  total: number;
  repetidos: Mencion[];
};

export type ActividadItem = {
  id: string;
  distribuidor: string;
  investigacion: string;
  departamento: string | null;
  fecha: string;
};

/** Resumen por tarjeta de la vista de entrada (lista de investigaciones). */
export type ResumenInvestigacion = {
  respuestas: number;
  distribuidores: number;
  departamentos: number;
  ultima: string | null;
};

/** Completitud: promedio de preguntas respondidas por respuesta. */
export type Completitud = {
  promedio: number;
  totalPreguntas: number;
  pct: number;
};

/** Distribución de una pregunta clave (escala / opción única / sí-no). */
export type PreguntaClave = {
  titulo: string;
  tipo: string;
  distribucion: { label: string; valor: number }[];
} | null;

export type CommandCenterData = {
  kpis: {
    totalRespuestas: number;
    distribuidoresUnicos: number;
    investigacionesActivas: number;
    totalInvestigaciones: number;
    departamentosCubiertos: number;
    ultimaRespuesta: string | null;
    respuestas7d: number;
    deltaRespuestas: KpiDeltaData;
    sparkRespuestas: number[];
  };
  evolucion: { puntos: SeriePunto[]; bucket: "dia" | "semana" };
  porInvestigacion: { label: string; valor: number }[];
  porDepartamento: { label: string; valor: number; pct: number }[];
  tendencias: Mencion[];
  oportunidades: OportunidadResumen[];
  comentarios: ComentarioEntrada[];
  actividad: ActividadItem[];
  /** Solo en scope "investigacion": completitud de la encuesta seleccionada. */
  completitud: Completitud | null;
  /** Solo en scope "investigacion": pregunta clave para el donut de sentimiento. */
  preguntaClave: PreguntaClave;
};

// ── Series temporales ─────────────────────────────────────────────────────────

function serieDiaria(respuestas: Respuesta[], dias: number, ahora: Date): SeriePunto[] {
  const base = startOfDay(ahora);
  const out: SeriePunto[] = [];
  const idx = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const iso = ymd(d);
    idx.set(iso, out.length);
    out.push({ iso, label: labelDia(d), valor: 0 });
  }
  for (const r of respuestas) {
    const d = parseFecha(r.createdAt);
    if (!d) continue;
    const pos = idx.get(ymd(startOfDay(d)));
    if (pos !== undefined) out[pos]!.valor += 1;
  }
  return out;
}

function serieSemanal(respuestas: Respuesta[], semanas: number, ahora: Date): SeriePunto[] {
  const base = startOfWeek(ahora);
  const out: SeriePunto[] = [];
  const idx = new Map<string, number>();
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    const iso = ymd(d);
    idx.set(iso, out.length);
    out.push({ iso, label: labelDia(d), valor: 0 });
  }
  for (const r of respuestas) {
    const d = parseFecha(r.createdAt);
    if (!d) continue;
    const pos = idx.get(ymd(startOfWeek(d)));
    if (pos !== undefined) out[pos]!.valor += 1;
  }
  return out;
}

function computeEvolucion(
  respuestas: Respuesta[],
  ahora: Date,
): { puntos: SeriePunto[]; bucket: "dia" | "semana" } {
  if (respuestas.length === 0) return { puntos: [], bucket: "dia" };

  let minTime = Infinity;
  for (const r of respuestas) {
    const d = parseFecha(r.createdAt);
    if (d) minTime = Math.min(minTime, d.getTime());
  }
  if (!Number.isFinite(minTime)) return { puntos: [], bucket: "dia" };

  const spanDias = Math.floor((startOfDay(ahora).getTime() - startOfDay(new Date(minTime)).getTime()) / 86_400_000);

  if (spanDias <= 45) {
    const dias = Math.min(60, Math.max(14, spanDias + 1));
    return { puntos: serieDiaria(respuestas, dias, ahora), bucket: "dia" };
  }
  const semanas = Math.min(16, Math.max(8, Math.ceil(spanDias / 7) + 1));
  return { puntos: serieSemanal(respuestas, semanas, ahora), bucket: "semana" };
}

// ── Deltas ────────────────────────────────────────────────────────────────────

function contarEnRango(respuestas: Respuesta[], desde: Date, hasta: Date): number {
  let n = 0;
  const a = desde.getTime();
  const b = hasta.getTime();
  for (const r of respuestas) {
    const d = parseFecha(r.createdAt);
    if (!d) continue;
    const t = d.getTime();
    if (t >= a && t < b) n += 1;
  }
  return n;
}

function deltaSemanal(respuestas: Respuesta[], ahora: Date): { actual: number; delta: KpiDeltaData } {
  const finActual = new Date(ahora);
  const inicioActual = new Date(ahora);
  inicioActual.setDate(inicioActual.getDate() - 7);
  const inicioPrevio = new Date(ahora);
  inicioPrevio.setDate(inicioPrevio.getDate() - 14);

  const actual = contarEnRango(respuestas, inicioActual, finActual);
  const previo = contarEnRango(respuestas, inicioPrevio, inicioActual);
  const valor = actual - previo;
  const pct = previo > 0 ? Math.round((valor / previo) * 100) : null;
  return { actual, delta: { valor, pct } };
}

// ── Agregaciones por dimensión ─────────────────────────────────────────────────

function porInvestigacion(
  investigaciones: Investigacion[],
  respuestas: Respuesta[],
): { label: string; valor: number }[] {
  const conteo = new Map<string, number>();
  for (const r of respuestas) {
    conteo.set(r.investigacionId, (conteo.get(r.investigacionId) ?? 0) + 1);
  }
  const titulo = new Map(investigaciones.map((i) => [i.id, i.titulo]));
  const filas = Array.from(conteo.entries())
    .map(([id, valor]) => ({ label: titulo.get(id) ?? "—", valor }))
    .sort((a, b) => b.valor - a.valor);

  // Top 6 + "Otras".
  if (filas.length <= 6) return filas;
  const top = filas.slice(0, 6);
  const resto = filas.slice(6).reduce((s, f) => s + f.valor, 0);
  return [...top, { label: "Otras", valor: resto }];
}

function porDepartamento(
  respuestas: Respuesta[],
): { label: string; valor: number; pct: number }[] {
  const conteo = new Map<string, number>();
  let conDepto = 0;
  for (const r of respuestas) {
    const depto = r.departamento?.trim();
    if (!depto) continue;
    conDepto += 1;
    conteo.set(depto, (conteo.get(depto) ?? 0) + 1);
  }
  return Array.from(conteo.entries())
    .map(([label, valor]) => ({
      label,
      valor,
      pct: conDepto > 0 ? Math.round((valor / conDepto) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);
}

// ── Tendencias globales (merge de menciones de todas las investigaciones) ───────

const TERMINOS_OMITIDOS = new Set(["si", "no", "ninguno", "ninguna", "n/a", "na"]);

function tendenciasGlobales(
  investigaciones: Investigacion[],
  respuestasPorInv: Map<string, Respuesta[]>,
): Mencion[] {
  const merge = new Map<string, { termino: string; conteo: number }>();
  for (const inv of investigaciones) {
    const resp = respuestasPorInv.get(inv.id) ?? [];
    if (resp.length === 0) continue;
    for (const grupo of computeTendencias(inv, resp)) {
      for (const p of grupo.preguntas) {
        for (const m of p.menciones) {
          const clave = normalizar(m.termino);
          if (!clave || TERMINOS_OMITIDOS.has(clave)) continue;
          const prev = merge.get(clave);
          if (prev) prev.conteo += m.conteo;
          else merge.set(clave, { termino: m.termino, conteo: m.conteo });
        }
      }
    }
  }
  return Array.from(merge.values())
    .sort((a, b) => b.conteo - a.conteo || a.termino.localeCompare(b.termino))
    .slice(0, 10);
}

// ── Oportunidades resumidas (merge de buckets por etiqueta) ─────────────────────

function oportunidadesResumen(
  investigaciones: Investigacion[],
  respuestasPorInv: Map<string, Respuesta[]>,
): OportunidadResumen[] {
  const buckets = new Map<
    string,
    { etiqueta: string; label: string; total: number; repetidos: Map<string, { termino: string; conteo: number }> }
  >();

  for (const inv of investigaciones) {
    const resp = respuestasPorInv.get(inv.id) ?? [];
    if (resp.length === 0) continue;
    for (const grupo of computeOportunidades(inv, resp)) {
      let b = buckets.get(grupo.etiqueta);
      if (!b) {
        b = { etiqueta: grupo.etiqueta, label: grupo.label, total: 0, repetidos: new Map() };
        buckets.set(grupo.etiqueta, b);
      }
      b.total += grupo.entradas.length;
      for (const m of grupo.repetidos) {
        const clave = normalizar(m.termino);
        if (!clave) continue;
        const prev = b.repetidos.get(clave);
        if (prev) prev.conteo += m.conteo;
        else b.repetidos.set(clave, { termino: m.termino, conteo: m.conteo });
      }
    }
  }

  return Array.from(buckets.values())
    .map((b) => ({
      etiqueta: b.etiqueta,
      label: b.label,
      total: b.total,
      repetidos: Array.from(b.repetidos.values())
        .sort((a, c) => c.conteo - a.conteo)
        .slice(0, 6),
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Comentarios y actividad ─────────────────────────────────────────────────────

function comentariosRecientes(
  investigaciones: Investigacion[],
  respuestasPorInv: Map<string, Respuesta[]>,
  limite: number,
): ComentarioEntrada[] {
  const todos: ComentarioEntrada[] = [];
  for (const inv of investigaciones) {
    const resp = respuestasPorInv.get(inv.id) ?? [];
    if (resp.length === 0) continue;
    todos.push(...computeComentarios(inv, resp));
  }
  return todos
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, limite);
}

function actividadReciente(
  investigaciones: Investigacion[],
  respuestas: Respuesta[],
  limite: number,
): ActividadItem[] {
  const titulo = new Map(investigaciones.map((i) => [i.id, i.titulo]));
  return [...respuestas]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limite)
    .map((r) => ({
      id: r.id,
      distribuidor: r.distribuidorNombre || r.empresa || "Anónimo",
      investigacion: titulo.get(r.investigacionId) ?? r.investigacionSlug,
      departamento: r.departamento,
      fecha: r.createdAt,
    }));
}

// ── Resumen por investigación (tarjetas de la vista de entrada) ─────────────────

export function computeResumenInvestigacion(
  inv: Investigacion,
  respuestas: Respuesta[],
): ResumenInvestigacion {
  const propias = respuestas.filter((r) => r.investigacionId === inv.id);
  const distribuidores = new Set<string>();
  const departamentos = new Set<string>();
  let ultima: string | null = null;
  for (const r of propias) {
    const ident = (r.distribuidorNombre || r.empresa || "").trim().toLowerCase();
    if (ident) distribuidores.add(ident);
    const depto = r.departamento?.trim();
    if (depto) departamentos.add(depto);
    if (r.createdAt && (!ultima || r.createdAt > ultima)) ultima = r.createdAt;
  }
  return {
    respuestas: propias.length,
    distribuidores: distribuidores.size,
    departamentos: departamentos.size,
    ultima,
  };
}

// ── Completitud (calidad de la participación) ───────────────────────────────────

export function computeCompletitud(
  inv: Investigacion,
  respuestas: Respuesta[],
): Completitud {
  const preguntas = todasLasPreguntas(inv);
  const totalPreguntas = preguntas.length;
  if (respuestas.length === 0 || totalPreguntas === 0) {
    return { promedio: 0, totalPreguntas, pct: 0 };
  }
  let suma = 0;
  for (const r of respuestas) {
    let respondidas = 0;
    for (const p of preguntas) {
      if (!esRespuestaVacia(r.respuestas[p.id])) respondidas += 1;
    }
    suma += respondidas;
  }
  const promedio = suma / respuestas.length;
  return {
    promedio: Math.round(promedio * 10) / 10,
    totalPreguntas,
    pct: Math.round((promedio / totalPreguntas) * 100),
  };
}

// ── Pregunta clave (distribución para el donut de sentimiento) ──────────────────

export function computePreguntaClave(
  inv: Investigacion,
  respuestas: Respuesta[],
): PreguntaClave {
  const preguntas = todasLasPreguntas(inv);
  const pick =
    preguntas.find((p) => p.tipo === "escala") ??
    preguntas.find((p) => p.tipo === "opcion_unica") ??
    preguntas.find((p) => p.tipo === "si_no");
  if (!pick) return null;

  const conteo = new Map<string, number>();
  for (const r of respuestas) {
    const v = r.respuestas[pick.id];
    if (esRespuestaVacia(v)) continue;
    if (typeof v === "boolean") {
      const label = v ? "Sí" : "No";
      conteo.set(label, (conteo.get(label) ?? 0) + 1);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        const label = String(item).trim();
        if (label) conteo.set(label, (conteo.get(label) ?? 0) + 1);
      }
    } else {
      const label = String(v).trim();
      if (label) conteo.set(label, (conteo.get(label) ?? 0) + 1);
    }
  }

  const distribucion = Array.from(conteo.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);
  if (distribucion.length === 0) return null;

  return { titulo: pick.titulo, tipo: pick.tipo, distribucion };
}

// ── Selector principal ──────────────────────────────────────────────────────────

export function computeCommandCenter(
  investigaciones: Investigacion[],
  respuestas: Respuesta[],
  scope: "global" | "investigacion" = "global",
): CommandCenterData {
  const ahora = new Date();
  const base = computeDashboard(investigaciones, respuestas);

  const respuestasPorInv = new Map<string, Respuesta[]>();
  for (const r of respuestas) {
    const arr = respuestasPorInv.get(r.investigacionId);
    if (arr) arr.push(r);
    else respuestasPorInv.set(r.investigacionId, [r]);
  }

  const { actual: respuestas7d, delta: deltaRespuestas } = deltaSemanal(respuestas, ahora);
  const sparkRespuestas = serieDiaria(respuestas, 14, ahora).map((p) => p.valor);

  const invSel =
    scope === "investigacion" && investigaciones.length > 0
      ? investigaciones[0]!
      : null;
  const completitud = invSel ? computeCompletitud(invSel, respuestas) : null;
  const preguntaClave = invSel ? computePreguntaClave(invSel, respuestas) : null;

  return {
    kpis: {
      totalRespuestas: base.totalRespuestas,
      distribuidoresUnicos: base.distribuidoresUnicos,
      investigacionesActivas: base.investigacionesActivas,
      totalInvestigaciones: base.totalInvestigaciones,
      departamentosCubiertos: base.departamentosCubiertos,
      ultimaRespuesta: base.ultimaRespuesta,
      respuestas7d,
      deltaRespuestas,
      sparkRespuestas,
    },
    evolucion: computeEvolucion(respuestas, ahora),
    porInvestigacion: porInvestigacion(investigaciones, respuestas),
    porDepartamento: porDepartamento(respuestas),
    tendencias: tendenciasGlobales(investigaciones, respuestasPorInv),
    oportunidades: oportunidadesResumen(investigaciones, respuestasPorInv),
    comentarios: comentariosRecientes(investigaciones, respuestasPorInv, 5),
    actividad: actividadReciente(investigaciones, respuestas, 8),
    completitud,
    preguntaClave,
  };
}
