/**
 * Analítica del panel. Todo es genérico respecto de la temática: se apoya en
 * el tipo de pregunta y en su `etiqueta`, de modo que una investigación futura
 * sobre cualquier tema alimenta automáticamente Tendencias y Oportunidades.
 */
import {
  ETIQUETAS_OPORTUNIDAD,
  etiquetaLabel,
  esRespuestaVacia,
  respuestaJerarquicaLegible,
  todasLasPreguntas,
  type EtiquetaPregunta,
  type Investigacion,
  type Pregunta,
  type Respuesta,
  type RespuestaJerarquica,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

function esRespuestaJerarquica(valor: unknown): valor is RespuestaJerarquica {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardKpis = {
  totalInvestigaciones: number;
  investigacionesActivas: number;
  totalRespuestas: number;
  distribuidoresUnicos: number;
  departamentosCubiertos: number;
  ultimaRespuesta: string | null;
};

export function computeDashboard(
  investigaciones: Investigacion[],
  respuestas: Respuesta[],
): DashboardKpis {
  const distribuidores = new Set<string>();
  const departamentos = new Set<string>();
  let ultima: string | null = null;

  for (const r of respuestas) {
    const ident = (r.distribuidorNombre || r.empresa || "").trim().toLowerCase();
    if (ident) distribuidores.add(ident);
    const depto = r.departamento?.trim();
    if (depto) departamentos.add(depto);
    if (r.createdAt && (!ultima || r.createdAt > ultima)) ultima = r.createdAt;
  }

  return {
    totalInvestigaciones: investigaciones.length,
    investigacionesActivas: investigaciones.filter((i) => i.estado === "activa")
      .length,
    totalRespuestas: respuestas.length,
    distribuidoresUnicos: distribuidores.size,
    departamentosCubiertos: departamentos.size,
    ultimaRespuesta: ultima,
  };
}

// ── Extracción de menciones desde un valor de respuesta ──────────────────────

const SEPARADORES = /[,;\n]|(?:\s+[yY]\s+)|·|•|\//;

function valorAMenciones(valor: RespuestaValor | undefined, pregunta: Pregunta): string[] {
  if (esRespuestaVacia(valor)) return [];
  if (typeof valor === "boolean") return [valor ? "Sí" : "No"];
  if (typeof valor === "number") return [String(valor)];
  if (Array.isArray(valor)) return valor.map((v) => v.trim()).filter(Boolean);
  if (esRespuestaJerarquica(valor)) {
    const menciones: string[] = [];
    for (const [padre, hijos] of Object.entries(valor)) {
      if (Array.isArray(hijos) && hijos.length > 0) {
        for (const hijo of hijos) menciones.push(`${padre} - ${hijo}`);
      } else {
        menciones.push(padre);
      }
    }
    return menciones;
  }

  const texto = String(valor).trim();
  if (pregunta.tipo === "opcion_unica" || pregunta.tipo === "si_no") {
    return [texto];
  }
  // Texto libre: se interpreta como lista separada por comas / "y" / saltos.
  return texto
    .split(SEPARADORES)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes/diacríticos combinantes
    .replace(/\s+/g, " ")
    .trim();
}

export type Mencion = { termino: string; conteo: number };

export function contarMenciones(valores: string[]): Mencion[] {
  const grupos = new Map<string, { conteo: number; variantes: Map<string, number> }>();
  for (const raw of valores) {
    const clave = normalizar(raw);
    if (!clave) continue;
    let g = grupos.get(clave);
    if (!g) {
      g = { conteo: 0, variantes: new Map() };
      grupos.set(clave, g);
    }
    g.conteo += 1;
    g.variantes.set(raw, (g.variantes.get(raw) ?? 0) + 1);
  }

  const menciones: Mencion[] = [];
  for (const g of grupos.values()) {
    let display = "";
    let max = -1;
    for (const [variante, n] of g.variantes) {
      if (n > max) {
        max = n;
        display = variante;
      }
    }
    menciones.push({ termino: display, conteo: g.conteo });
  }
  return menciones.sort((a, b) => b.conteo - a.conteo || a.termino.localeCompare(b.termino));
}

// ── Tendencias (agrupadas por etiqueta) ──────────────────────────────────────

export type TendenciaPregunta = {
  preguntaId: string;
  preguntaTitulo: string;
  menciones: Mencion[];
};

export type GrupoTendencia = {
  etiqueta: string;
  label: string;
  preguntas: TendenciaPregunta[];
};

function etiquetaToLabel(etiqueta: string): string {
  return etiquetaLabel[etiqueta as EtiquetaPregunta] ?? etiqueta;
}

export function computeTendencias(
  investigacion: Investigacion,
  respuestas: Respuesta[],
): GrupoTendencia[] {
  const preguntas = todasLasPreguntas(investigacion);
  const grupos = new Map<string, GrupoTendencia>();

  for (const pregunta of preguntas) {
    const valores: string[] = [];
    for (const r of respuestas) {
      valores.push(...valorAMenciones(r.respuestas[pregunta.id], pregunta));
    }
    const menciones = contarMenciones(valores);
    if (menciones.length === 0) continue;

    const etiqueta = pregunta.etiqueta ?? "otros";
    let grupo = grupos.get(etiqueta);
    if (!grupo) {
      grupo = { etiqueta, label: etiquetaToLabel(etiqueta), preguntas: [] };
      grupos.set(etiqueta, grupo);
    }
    grupo.preguntas.push({
      preguntaId: pregunta.id,
      preguntaTitulo: pregunta.titulo,
      menciones,
    });
  }

  return Array.from(grupos.values());
}

// ── Oportunidades (menciones individuales con contexto) ──────────────────────

export type EntradaOportunidad = {
  texto: string;
  distribuidor: string | null;
  departamento: string | null;
  fecha: string;
  preguntaTitulo: string;
};

export type GrupoOportunidad = {
  etiqueta: string;
  label: string;
  entradas: EntradaOportunidad[];
  /** Términos repetidos dentro del grupo (señal de demanda agregada). */
  repetidos: Mencion[];
};

export function computeOportunidades(
  investigacion: Investigacion,
  respuestas: Respuesta[],
): GrupoOportunidad[] {
  const preguntas = todasLasPreguntas(investigacion).filter(
    (p) => p.etiqueta && ETIQUETAS_OPORTUNIDAD.includes(p.etiqueta),
  );

  const grupos = new Map<string, GrupoOportunidad>();
  for (const pregunta of preguntas) {
    const etiqueta = pregunta.etiqueta as EtiquetaPregunta;
    let grupo = grupos.get(etiqueta);
    if (!grupo) {
      grupo = {
        etiqueta,
        label: etiquetaToLabel(etiqueta),
        entradas: [],
        repetidos: [],
      };
      grupos.set(etiqueta, grupo);
    }

    const menciones: string[] = [];
    for (const r of respuestas) {
      const valor = r.respuestas[pregunta.id];
      if (esRespuestaVacia(valor)) continue;
      const texto = Array.isArray(valor)
        ? valor.join(", ")
        : esRespuestaJerarquica(valor)
          ? respuestaJerarquicaLegible(valor)
          : String(valor).trim();
      if (!texto) continue;
      grupo.entradas.push({
        texto,
        distribuidor: r.distribuidorNombre || r.empresa,
        departamento: r.departamento,
        fecha: r.createdAt,
        preguntaTitulo: pregunta.titulo,
      });
      menciones.push(...valorAMenciones(valor, pregunta));
    }
    grupo.repetidos = contarMenciones(menciones).filter((m) => m.conteo > 1);
  }

  return Array.from(grupos.values()).filter((g) => g.entradas.length > 0);
}

// ── Comentarios abiertos ─────────────────────────────────────────────────────

export type ComentarioEntrada = {
  id: string;
  texto: string;
  origen: string;
  distribuidor: string | null;
  departamento: string | null;
  fecha: string;
};

export function computeComentarios(
  investigacion: Investigacion,
  respuestas: Respuesta[],
): ComentarioEntrada[] {
  const comentarios: ComentarioEntrada[] = [];
  const preguntasComentario = todasLasPreguntas(investigacion).filter(
    (p) => p.etiqueta === "comentario",
  );

  for (const r of respuestas) {
    const base = {
      distribuidor: r.distribuidorNombre || r.empresa,
      departamento: r.departamento,
      fecha: r.createdAt,
    };
    if (r.comentarioLibre && r.comentarioLibre.trim()) {
      comentarios.push({
        id: `${r.id}-libre`,
        texto: r.comentarioLibre.trim(),
        origen: investigacion.comentarioFinalTitulo || "Comentario libre",
        ...base,
      });
    }
    for (const pregunta of preguntasComentario) {
      const valor = r.respuestas[pregunta.id];
      if (esRespuestaVacia(valor)) continue;
      comentarios.push({
        id: `${r.id}-${pregunta.id}`,
        texto: Array.isArray(valor)
          ? valor.join(", ")
          : esRespuestaJerarquica(valor)
            ? respuestaJerarquicaLegible(valor)
            : String(valor).trim(),
        origen: pregunta.titulo,
        ...base,
      });
    }
  }

  return comentarios.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
