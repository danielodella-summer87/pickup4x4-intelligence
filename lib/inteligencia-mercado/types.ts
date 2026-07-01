/**
 * Inteligencia de Mercado — modelo de dominio.
 *
 * El motor es agnóstico de temática: una "investigación" es un conjunto de
 * bloques, y cada bloque tiene preguntas tipadas. Agregar nuevas preguntas o
 * lanzar una investigación sobre cualquier tema NO requiere tocar el esquema
 * de base de datos ni rediseñar la landing: todo vive como datos (JSONB).
 */

// ── Preguntas ───────────────────────────────────────────────────────────────

export const TIPOS_PREGUNTA = [
  "texto_corto",
  "texto_largo",
  "opcion_unica",
  "opcion_multiple",
  "jerarquico",
  "escala",
  "numero",
  "si_no",
] as const;

export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];

export const tipoPreguntaLabel: Record<TipoPregunta, string> = {
  texto_corto: "Texto corto",
  texto_largo: "Texto largo / comentario",
  opcion_unica: "Opción única",
  opcion_multiple: "Opción múltiple",
  jerarquico: "Jerárquico (padre → hijo)",
  escala: "Escala",
  numero: "Número",
  si_no: "Sí / No",
};

/**
 * Etiqueta temática opcional. Es el mecanismo flexible que conecta cualquier
 * pregunta con la analítica del panel (Tendencias / Oportunidades) sin acoplar
 * el código a una temática concreta. Una investigación futura sobre otro tema
 * solo necesita etiquetar sus preguntas para que aparezcan en los buckets.
 */
export const ETIQUETAS_PREGUNTA = [
  "mercado",
  "marca",
  "producto",
  "tendencia",
  "competencia",
  "tecnologia",
  "oportunidad",
  "barrera",
  "necesidad",
  "importacion",
  "cliente",
  "idea",
  "empresa",
  "comentario",
] as const;

export type EtiquetaPregunta = (typeof ETIQUETAS_PREGUNTA)[number];

export const etiquetaLabel: Record<EtiquetaPregunta, string> = {
  mercado: "Estado del mercado",
  marca: "Marcas",
  producto: "Productos",
  tendencia: "Tendencias",
  competencia: "Competencia",
  tecnologia: "Tecnologías",
  oportunidad: "Oportunidades",
  barrera: "Barreras",
  necesidad: "Necesidades no cubiertas",
  importacion: "Importaciones",
  cliente: "Comportamiento del cliente",
  idea: "Ideas",
  empresa: "Empresas a visitar",
  comentario: "Comentarios",
};

/** Buckets que el panel de Oportunidades resalta para la dirección comercial. */
export const ETIQUETAS_OPORTUNIDAD: EtiquetaPregunta[] = [
  "oportunidad",
  "necesidad",
  "importacion",
  "idea",
  "empresa",
];

export type EscalaConfig = {
  min: number;
  max: number;
  etiquetaMin?: string;
  etiquetaMax?: string;
};

/** Opción de un padre en una pregunta jerárquica (ej. marca → modelos). */
export type OpcionJerarquica = {
  valor: string;
  hijos?: string[];
};

export type Pregunta = {
  id: string;
  tipo: TipoPregunta;
  titulo: string;
  descripcion?: string;
  requerida?: boolean;
  /** Para opcion_unica / opcion_multiple: lista plana. Para jerarquico: padres con hijos anidados. */
  opciones?: string[] | OpcionJerarquica[];
  /** Permite agregar una respuesta libre "Otro" en preguntas de opción. */
  permiteOtro?: boolean;
  /** Para tipo escala. */
  escala?: EscalaConfig;
  placeholder?: string;
  etiqueta?: EtiquetaPregunta;
};

export type Bloque = {
  id: string;
  titulo: string;
  descripcion?: string;
  preguntas: Pregunta[];
};

// ── Investigación ─────────────────────────────────────────────────────────-

export const ESTADOS_INVESTIGACION = ["borrador", "activa", "cerrada"] as const;
export type EstadoInvestigacion = (typeof ESTADOS_INVESTIGACION)[number];

export const estadoInvestigacionLabel: Record<EstadoInvestigacion, string> = {
  borrador: "Borrador",
  activa: "Activa",
  cerrada: "Cerrada",
};

export type Investigacion = {
  id: string;
  slug: string;
  titulo: string;
  descripcion: string;
  estado: EstadoInvestigacion;
  /** Texto de bienvenida mostrado al abrir la encuesta. */
  intro: string;
  /** Mensaje de cierre tras enviar. */
  agradecimiento: string;
  /** Si se piden datos del distribuidor (nombre, empresa, departamento). */
  capturaDistribuidor: boolean;
  /** Etiqueta del campo de comentario abierto final. */
  comentarioFinalTitulo: string;
  bloques: Bloque[];
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Forma pública (lo que ve la landing): sin metadatos internos. */
export type InvestigacionPublica = {
  id: string;
  slug: string;
  titulo: string;
  descripcion: string;
  intro: string;
  agradecimiento: string;
  capturaDistribuidor: boolean;
  comentarioFinalTitulo: string;
  bloques: Bloque[];
};

// ── Respuestas ───────────────────────────────────────────────────────────-

/** Para preguntas jerarquico: padre seleccionado → hijos seleccionados. */
export type RespuestaJerarquica = Record<string, string[]>;

export type RespuestaValor =
  | string
  | string[]
  | number
  | boolean
  | null
  | RespuestaJerarquica;

export type RespuestaInput = {
  distribuidorNombre: string | null;
  empresa: string | null;
  departamento: string | null;
  contacto: string | null;
  /** Keyed por pregunta.id. */
  respuestas: Record<string, RespuestaValor>;
  comentarioLibre: string | null;
  meta?: Record<string, unknown>;
};

export type Respuesta = RespuestaInput & {
  id: string;
  investigacionId: string;
  investigacionSlug: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

// ── Departamentos de Uruguay (constante, sin dependencia de DB en la landing) ─

export const DEPARTAMENTOS_URUGUAY = [
  "Artigas",
  "Canelones",
  "Cerro Largo",
  "Colonia",
  "Durazno",
  "Flores",
  "Florida",
  "Lavalleja",
  "Maldonado",
  "Montevideo",
  "Paysandú",
  "Río Negro",
  "Rivera",
  "Rocha",
  "Salto",
  "San José",
  "Soriano",
  "Tacuarembó",
  "Treinta y Tres",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function todasLasPreguntas(inv: {
  bloques: Bloque[];
}): Pregunta[] {
  return inv.bloques.flatMap((bloque) => bloque.preguntas);
}

export function esRespuestaVacia(valor: RespuestaValor | undefined): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === "string") return valor.trim().length === 0;
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === "object") return Object.keys(valor).length === 0;
  return false;
}

/** Texto legible de un valor de respuesta jerárquica: "Ford: Ranger, Maverick; Toyota: Hilux". */
export function respuestaJerarquicaLegible(valor: RespuestaJerarquica): string {
  return Object.entries(valor)
    .map(([padre, hijos]) =>
      Array.isArray(hijos) && hijos.length > 0 ? `${padre}: ${hijos.join(", ")}` : padre,
    )
    .join("; ");
}
