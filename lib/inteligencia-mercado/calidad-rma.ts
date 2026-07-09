/**
 * Panel dedicado "Calidad / RMA" — investigación interna sobre errores,
 * compatibilidad, instalación, reclamos y RMA (slug "calidad-postventa").
 *
 * A diferencia de aggregations.ts (genérico, dirigido por `etiqueta`), este
 * módulo referencia directamente los IDs de pregunta fijos de ESA
 * investigación — es un panel "a medida", no un motor reusable para
 * cualquier temática. Si el id de una pregunta no existe en las respuestas
 * (porque el cuestionario cambió, o la investigación cargada es otra), los
 * helpers devuelven valores neutros (0%, listas vacías) en vez de romper.
 *
 * Reglas de "acciones recomendadas": simples, explícitas y pensadas para
 * editarse a mano (ver REGLAS más abajo) — cada una es un %, un umbral y un
 * texto, sin heurística oculta.
 */
import type { Investigacion, Respuesta } from "@/lib/inteligencia-mercado/types";
import { contarMenciones, type Mencion } from "@/lib/inteligencia-mercado/aggregations";

// ── IDs de pregunta de la investigación "calidad-postventa" ─────────────────
// Deben coincidir con supabase/migrations/20260710_calidad_postventa.sql.

export const CALIDAD_PREGUNTAS = {
  areaRol: "area-rol",
  sucursal: "sucursal",
  compatFrecuencia: "compat-frecuencia",
  compatEtapa: "compat-etapa",
  infoFrecuencia: "info-frecuencia",
  infoFalta: "info-falta",
  rmaFotos: "rma-fotos",
  rmaCausa: "rma-causa",
  rmaSolucion: "rma-solucion",
  rmaCausaPrincipal: "rma-causa-principal",
  cotizInstalacion: "cotiz-instalacion",
  cotizPrecio: "cotiz-precio",
  cotizImpacto: "cotiz-impacto",
  retrabajoFrecuencia: "retrabajo-frecuencia",
  retrabajoEtapa: "retrabajo-etapa",
  reclamoMotivo: "reclamo-motivo",
  stockFrecuencia: "stock-frecuencia",
  stockTipo: "stock-tipo",
  comunicacionInterna: "comunicacion-interna",
  severidadGeneral: "severidad-general",
} as const;

/** Motivos de reclamo que cuentan para la regla F (excluye "Otro"/"No sé"). */
const MOTIVOS_RECLAMO_REGLA_F = ["Ruido", "Ajuste", "Filtración", "Expectativa mal comunicada"];

/** Valores de "No sé" a rastrear para la regla de trazabilidad (J). */
const PREGUNTAS_TRAZABILIDAD = [
  CALIDAD_PREGUNTAS.compatEtapa,
  CALIDAD_PREGUNTAS.rmaCausaPrincipal,
  CALIDAD_PREGUNTAS.cotizImpacto,
  CALIDAD_PREGUNTAS.retrabajoEtapa,
];

// ── Helpers de lectura de un valor de respuesta ──────────────────────────────

function valorNumerico(r: Respuesta, preguntaId: string): number | null {
  const v = r.respuestas[preguntaId];
  return typeof v === "number" ? v : null;
}

function valorTexto(r: Respuesta, preguntaId: string): string | null {
  const v = r.respuestas[preguntaId];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function valorLista(r: Respuesta, preguntaId: string): string[] {
  const v = r.respuestas[preguntaId];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/**
 * A partir de qué valor de escala (1-5) se considera que el problema
 * "aparece" en esa respuesta. Editable: subirlo a 4 endurece el criterio
 * (solo "frecuente"/"muy frecuente" cuentan).
 */
const UMBRAL_ESCALA_ALTA = 3;

function escalaAlta(r: Respuesta, preguntaId: string): boolean {
  const v = valorNumerico(r, preguntaId);
  return v !== null && v >= UMBRAL_ESCALA_ALTA;
}

function porcentaje(respuestas: Respuesta[], predicate: (r: Respuesta) => boolean): number {
  if (respuestas.length === 0) return 0;
  const n = respuestas.filter(predicate).length;
  return Math.round((n / respuestas.length) * 1000) / 10; // 1 decimal
}

// ── Acciones recomendadas (reglas A-J) ───────────────────────────────────────

export type AccionRecomendada = {
  id: string;
  titulo: string;
  /** Qué se detectó y con qué porcentaje — para que la recomendación sea auditable. */
  motivo: string;
  acciones: string[];
  /** "alerta" para riesgo operativo (regla I); el resto son "recomendacion". */
  tipo: "alerta" | "recomendacion";
  porcentaje: number;
  umbral: number;
};

type Regla = {
  id: string;
  titulo: string;
  umbral: number;
  tipo: "alerta" | "recomendacion";
  predicate: (r: Respuesta) => boolean;
  motivo: (pct: number, umbral: number) => string;
  acciones: string[];
};

const REGLAS: Regla[] = [
  {
    id: "compatibilidad",
    titulo: "Compatibilidad vehículo/producto",
    umbral: 25,
    tipo: "recomendacion",
    predicate: (r) => escalaAlta(r, CALIDAD_PREGUNTAS.compatFrecuencia),
    motivo: (pct, u) =>
      `Errores de compatibilidad reportados como frecuentes en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Checklist obligatorio de compatibilidad antes de confirmar la venta.",
      "Pedir vehículo exacto, año, versión, fotos y validación del accesorio.",
    ],
  },
  {
    id: "informacion_incompleta",
    titulo: "Información incompleta de ventas a instalación",
    umbral: 25,
    tipo: "recomendacion",
    predicate: (r) => escalaAlta(r, CALIDAD_PREGUNTAS.infoFrecuencia),
    motivo: (pct, u) =>
      `Información incompleta en el pase ventas → instalación en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Ficha obligatoria de pase a instalación.",
      "Incluir producto vendido, vehículo, condiciones prometidas, observaciones y riesgos.",
    ],
  },
  {
    id: "rma_evidencia",
    titulo: "RMA sin evidencia suficiente",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) =>
      escalaAlta(r, CALIDAD_PREGUNTAS.rmaFotos) ||
      escalaAlta(r, CALIDAD_PREGUNTAS.rmaCausa) ||
      escalaAlta(r, CALIDAD_PREGUNTAS.rmaSolucion),
    motivo: (pct, u) =>
      `RMA con fotos, causa probable o solución aplicada faltantes en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Formulario RMA obligatorio con fotos, causa probable, responsable, costo y solución aplicada.",
    ],
  },
  {
    id: "retrabajos",
    titulo: "Retrabajos por falta de control final",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) => escalaAlta(r, CALIDAD_PREGUNTAS.retrabajoFrecuencia),
    motivo: (pct, u) => `Retrabajos por falta de control final en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Checklist de control final antes de entregar el vehículo.",
      "Incluir prueba funcional, ajuste, ruido/movimiento, terminación estética y explicación al cliente.",
    ],
  },
  {
    id: "cotizacion",
    titulo: "Cotización incompleta o precio mal informado",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) =>
      escalaAlta(r, CALIDAD_PREGUNTAS.cotizInstalacion) ||
      escalaAlta(r, CALIDAD_PREGUNTAS.cotizPrecio),
    motivo: (pct, u) =>
      `Cotizaciones sin instalación contemplada o con precio mal informado en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Separar claramente producto, instalación, insumos y descuentos.",
      "Bloquear la confirmación comercial si falta precio final validado.",
    ],
  },
  {
    id: "reclamos",
    titulo: "Reclamos por ruido, ajuste, filtración o expectativa mal comunicada",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) =>
      valorLista(r, CALIDAD_PREGUNTAS.reclamoMotivo).some((v) =>
        MOTIVOS_RECLAMO_REGLA_F.includes(v),
      ),
    motivo: (pct, u) => `Reclamos de este tipo presentes en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Control post-instalación y explicación de uso/cuidado al cliente.",
      "Agregar fotos de entrega y validación final.",
    ],
  },
  {
    id: "stock",
    titulo: "Stock o piezas faltantes",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) => escalaAlta(r, CALIDAD_PREGUNTAS.stockFrecuencia),
    motivo: (pct, u) => `Falta de stock o piezas al instalar en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Validar el stock real antes de agendar la instalación.",
      "Checklist de piezas, tornillería, soportes e insumos antes de iniciar el trabajo.",
    ],
  },
  {
    id: "comunicacion",
    titulo: "Comunicación interna débil",
    umbral: 30,
    tipo: "recomendacion",
    predicate: (r) =>
      ["Regular", "Mala", "Muy mala"].includes(valorTexto(r, CALIDAD_PREGUNTAS.comunicacionInterna) ?? ""),
    motivo: (pct, u) =>
      `Comunicación interna calificada Regular o peor en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Tablero simple de seguimiento por caso: venta → instalación → entrega → postventa/RMA.",
    ],
  },
  {
    id: "severidad",
    titulo: "Severidad alta",
    umbral: 20,
    tipo: "alerta",
    predicate: (r) =>
      ["Grave", "Muy grave"].includes(valorTexto(r, CALIDAD_PREGUNTAS.severidadGeneral) ?? ""),
    motivo: (pct, u) => `Errores calificados Grave o Muy grave en ${pct}% de las respuestas (umbral ${u}%).`,
    acciones: [
      "Alerta de riesgo operativo.",
      "Revisión semanal de errores y responsables de mejora por proceso.",
    ],
  },
  {
    id: "trazabilidad",
    titulo: "Baja trazabilidad",
    umbral: 20,
    tipo: "recomendacion",
    predicate: (r) => PREGUNTAS_TRAZABILIDAD.some((id) => valorTexto(r, id) === "No sé"),
    motivo: (pct, u) =>
      `Respuestas con "No sé" en etapa, causa o impacto en ${pct}% de los casos (umbral ${u}%).`,
    acciones: [
      "Mejorar la trazabilidad interna.",
      "Registrar cada error con etapa, causa, área involucrada, impacto y acción correctiva.",
    ],
  },
];

export function computeAccionesRecomendadas(respuestas: Respuesta[]): AccionRecomendada[] {
  const resultado: AccionRecomendada[] = [];
  for (const regla of REGLAS) {
    const pct = porcentaje(respuestas, regla.predicate);
    if (pct <= regla.umbral) continue;
    resultado.push({
      id: regla.id,
      titulo: regla.titulo,
      motivo: regla.motivo(pct, regla.umbral),
      acciones: regla.acciones,
      tipo: regla.tipo,
      porcentaje: pct,
      umbral: regla.umbral,
    });
  }
  // Alertas primero, y dentro de cada tipo, mayor desvío sobre el umbral primero.
  return resultado.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "alerta" ? -1 : 1;
    return b.porcentaje - b.umbral - (a.porcentaje - a.umbral);
  });
}

// ── Resumen ejecutivo ─────────────────────────────────────────────────────-

export type ResumenEjecutivoCalidad = {
  totalRespuestas: number;
  primeraRespuesta: string | null;
  ultimaRespuesta: string | null;
  porArea: Mencion[];
  alertas: number;
  recomendaciones: number;
};

export function computeResumenEjecutivo(respuestas: Respuesta[]): ResumenEjecutivoCalidad {
  let primera: string | null = null;
  let ultima: string | null = null;
  const areas: string[] = [];
  for (const r of respuestas) {
    if (r.createdAt && (!primera || r.createdAt < primera)) primera = r.createdAt;
    if (r.createdAt && (!ultima || r.createdAt > ultima)) ultima = r.createdAt;
    const area = valorTexto(r, CALIDAD_PREGUNTAS.areaRol);
    if (area) areas.push(area);
  }
  const acciones = computeAccionesRecomendadas(respuestas);
  return {
    totalRespuestas: respuestas.length,
    primeraRespuesta: primera,
    ultimaRespuesta: ultima,
    porArea: contarMenciones(areas),
    alertas: acciones.filter((a) => a.tipo === "alerta").length,
    recomendaciones: acciones.filter((a) => a.tipo === "recomendacion").length,
  };
}

// ── Top 5 errores detectados ─────────────────────────────────────────────-

export type ErrorDetectado = { titulo: string; porcentaje: number };

/** Mismos problemas que alimentan las reglas A-G, rankeados por % sin filtrar por umbral. */
export function computeTop5Errores(respuestas: Respuesta[]): ErrorDetectado[] {
  const items: ErrorDetectado[] = [
    { titulo: "Compatibilidad vehículo/producto", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.compatFrecuencia)) },
    { titulo: "Información incompleta ventas → instalación", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.infoFrecuencia)) },
    {
      titulo: "RMA sin evidencia suficiente",
      porcentaje: porcentaje(
        respuestas,
        (r) =>
          escalaAlta(r, CALIDAD_PREGUNTAS.rmaFotos) ||
          escalaAlta(r, CALIDAD_PREGUNTAS.rmaCausa) ||
          escalaAlta(r, CALIDAD_PREGUNTAS.rmaSolucion),
      ),
    },
    { titulo: "Retrabajos por falta de control final", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.retrabajoFrecuencia)) },
    {
      titulo: "Cotización incompleta o precio mal informado",
      porcentaje: porcentaje(
        respuestas,
        (r) => escalaAlta(r, CALIDAD_PREGUNTAS.cotizInstalacion) || escalaAlta(r, CALIDAD_PREGUNTAS.cotizPrecio),
      ),
    },
    {
      titulo: "Reclamos (ruido, ajuste, filtración, expectativa)",
      porcentaje: porcentaje(respuestas, (r) => valorLista(r, CALIDAD_PREGUNTAS.reclamoMotivo).some((v) => MOTIVOS_RECLAMO_REGLA_F.includes(v))),
    },
    { titulo: "Stock o piezas faltantes", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.stockFrecuencia)) },
  ];
  return items
    .filter((i) => i.porcentaje > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje)
    .slice(0, 5);
}

// ── Origen probable del error (por área/rol) ─────────────────────────────-

export type OrigenArea = { area: string; totalRespuestas: number; porcentajeConProblema: number };

/** % de respuestas de cada área/rol que reportó al menos un problema (reglas A-G). */
export function computeOrigenProbable(respuestas: Respuesta[]): OrigenArea[] {
  const tieneProblema = (r: Respuesta) =>
    escalaAlta(r, CALIDAD_PREGUNTAS.compatFrecuencia) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.infoFrecuencia) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.rmaFotos) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.rmaCausa) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.rmaSolucion) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.retrabajoFrecuencia) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.cotizInstalacion) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.cotizPrecio) ||
    escalaAlta(r, CALIDAD_PREGUNTAS.stockFrecuencia);

  const porArea = new Map<string, Respuesta[]>();
  for (const r of respuestas) {
    const area = valorTexto(r, CALIDAD_PREGUNTAS.areaRol);
    if (!area) continue;
    const arr = porArea.get(area);
    if (arr) arr.push(r);
    else porArea.set(area, [r]);
  }

  return Array.from(porArea.entries())
    .map(([area, rs]) => ({
      area,
      totalRespuestas: rs.length,
      porcentajeConProblema: porcentaje(rs, tieneProblema),
    }))
    .sort((a, b) => b.porcentajeConProblema - a.porcentajeConProblema);
}

// ── Impacto comercial ────────────────────────────────────────────────────-

export function computeImpactoComercial(respuestas: Respuesta[]): Mencion[] {
  const valores = respuestas
    .map((r) => valorTexto(r, CALIDAD_PREGUNTAS.cotizImpacto))
    .filter((v): v is string => v !== null && v !== "No sé");
  return contarMenciones(valores);
}

// ── Causas de RMA ─────────────────────────────────────────────────────────-

export function computeCausasRma(respuestas: Respuesta[]): Mencion[] {
  const valores = respuestas
    .map((r) => valorTexto(r, CALIDAD_PREGUNTAS.rmaCausaPrincipal))
    .filter((v): v is string => v !== null && v !== "No sé");
  return contarMenciones(valores);
}

// ── Problemas de instalación (compatibilidad + retrabajo + info incompleta) ─

export type ProblemaInstalacion = { titulo: string; porcentaje: number };

export function computeProblemasInstalacion(respuestas: Respuesta[]): ProblemaInstalacion[] {
  return [
    { titulo: "Errores de compatibilidad", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.compatFrecuencia)) },
    { titulo: "Información incompleta al recibir el trabajo", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.infoFrecuencia)) },
    { titulo: "Retrabajos por falta de control final", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.retrabajoFrecuencia)) },
    { titulo: "Stock o piezas faltantes al instalar", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.stockFrecuencia)) },
  ].sort((a, b) => b.porcentaje - a.porcentaje);
}

// ── Cortes de comunicación interna ───────────────────────────────────────-

export type ComunicacionInterna = {
  distribucion: Mencion[];
  porcentajeRegularOPeor: number;
};

export function computeComunicacionInterna(respuestas: Respuesta[]): ComunicacionInterna {
  const valores = respuestas
    .map((r) => valorTexto(r, CALIDAD_PREGUNTAS.comunicacionInterna))
    .filter((v): v is string => v !== null);
  return {
    distribucion: contarMenciones(valores),
    porcentajeRegularOPeor: porcentaje(respuestas, (r) =>
      ["Regular", "Mala", "Muy mala"].includes(valorTexto(r, CALIDAD_PREGUNTAS.comunicacionInterna) ?? ""),
    ),
  };
}

// ── Puntos críticos del proceso (info incompleta + retrabajo + stock) ────-

export type PuntoCritico = { titulo: string; porcentaje: number };

export function computePuntosCriticos(respuestas: Respuesta[]): PuntoCritico[] {
  return [
    { titulo: "Pase de información ventas → instalación", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.infoFrecuencia)) },
    { titulo: "Control final antes de entrega", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.retrabajoFrecuencia)) },
    { titulo: "Disponibilidad de stock/piezas al instalar", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.stockFrecuencia)) },
    { titulo: "Cotización sin instalación o precio contemplado", porcentaje: porcentaje(respuestas, (r) => escalaAlta(r, CALIDAD_PREGUNTAS.cotizInstalacion) || escalaAlta(r, CALIDAD_PREGUNTAS.cotizPrecio)) },
  ].sort((a, b) => b.porcentaje - a.porcentaje);
}

// ── Selector principal ───────────────────────────────────────────────────-

export type CalidadRmaData = {
  resumen: ResumenEjecutivoCalidad;
  top5Errores: ErrorDetectado[];
  origenProbable: OrigenArea[];
  impactoComercial: Mencion[];
  causasRma: Mencion[];
  problemasInstalacion: ProblemaInstalacion[];
  comunicacionInterna: ComunicacionInterna;
  puntosCriticos: PuntoCritico[];
  accionesRecomendadas: AccionRecomendada[];
};

export function computeCalidadRma(
  // No se usa para el cálculo (los IDs de pregunta son fijos): se recibe por
  // consistencia con el resto de aggregations.ts (mismo shape de props que
  // TendenciasView/OportunidadesView/ComentariosView en page.tsx).
  _investigacion: Investigacion,
  respuestas: Respuesta[],
): CalidadRmaData {
  return {
    resumen: computeResumenEjecutivo(respuestas),
    top5Errores: computeTop5Errores(respuestas),
    origenProbable: computeOrigenProbable(respuestas),
    impactoComercial: computeImpactoComercial(respuestas),
    causasRma: computeCausasRma(respuestas),
    problemasInstalacion: computeProblemasInstalacion(respuestas),
    comunicacionInterna: computeComunicacionInterna(respuestas),
    puntosCriticos: computePuntosCriticos(respuestas),
    accionesRecomendadas: computeAccionesRecomendadas(respuestas),
  };
}
