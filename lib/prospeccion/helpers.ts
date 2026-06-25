// Helpers del módulo Prospección Empresas: etiquetas en español, semáforo
// comercial calculado, estado de próxima actividad, prioridad, filtros y KPIs.
//
// Funciones puras (salvo las de fecha, que leen "hoy"): se pueden testear y
// reutilizar tanto en el listado como en la ficha, la agenda y el dashboard.

import type {
  ActivityStatus,
  ActivityType,
  CompanyProspect,
  ProductOpportunityPotential,
  ProductOpportunityStatus,
  ProposalStatus,
  ProspectContactArea,
  ProspectContactStatus,
  ProspectNeedAvailability,
  ProspectOrgType,
  ProspectPriority,
  ProspectRubro,
  ProspectSource,
  ProspectStage,
  ProspectTrafficLight,
  TriState,
} from "@/lib/models/prospeccion";

// ───────────────────────────────────────────────────────────── Etiquetas

export const RUBRO_LABELS: Record<ProspectRubro, string> = {
  estado: "Estado uruguayo",
  forestal: "Forestales",
  constructora: "Constructoras",
  telecomunicaciones: "Telecom / Internet / Cable",
  climatizacion: "Aire acondicionado / climatización",
  fachadas_altura: "Fachadas / altura / seguridad",
  alquiladora: "Alquiladoras / flotas tercerizadas",
  otro: "Otro / revisar",
};

export const ORG_TYPE_LABELS: Record<ProspectOrgType, string> = {
  estado: "Estado",
  privada: "Privada",
  mixta: "Mixta",
  contratista: "Contratista",
  alquiladora: "Alquiladora",
  proveedor: "Proveedor",
};

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  excel_canales: "Excel Canales de Venta",
  excel_contactos: "Excel Contactos",
  manual: "Manual",
  sugerida: "Sugerida",
  otro: "Otro",
};

export const STAGE_LABELS: Record<ProspectStage, string> = {
  lead_detectado: "Lead detectado",
  llamada_inicial_pendiente: "Llamada inicial pendiente",
  datos_basicos_relevados: "Datos básicos relevados",
  referente_identificado: "Referente identificado",
  visita_coordinada: "Visita coordinada",
  presentacion_enviada: "Presentación enviada",
  necesidades_relevadas: "Necesidades relevadas",
  propuesta_preparacion: "Propuesta en preparación",
  propuesta_enviada: "Propuesta enviada",
  seguimiento_negociacion: "Seguimiento / negociación",
  ganada: "Ganada",
  perdida: "Perdida",
  sin_oportunidad: "Sin oportunidad actual",
};

/** Orden secuencial de las etapas para mostrar progreso. */
export const STAGE_ORDER: ProspectStage[] = [
  "lead_detectado",
  "llamada_inicial_pendiente",
  "datos_basicos_relevados",
  "referente_identificado",
  "visita_coordinada",
  "presentacion_enviada",
  "necesidades_relevadas",
  "propuesta_preparacion",
  "propuesta_enviada",
  "seguimiento_negociacion",
  "ganada",
  "perdida",
  "sin_oportunidad",
];

export const PRIORITY_LABELS: Record<ProspectPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const TRI_STATE_LABELS: Record<TriState, string> = {
  si: "Sí",
  no: "No",
  no_se_sabe: "No se sabe",
};

export const CONTACT_AREA_LABELS: Record<ProspectContactArea, string> = {
  compras: "Compras",
  flota: "Flota",
  mantenimiento: "Mantenimiento",
  logistica: "Logística",
  administracion: "Administración",
  obras: "Obras",
  servicios: "Servicios",
  otro: "Otro",
};

export const CONTACT_STATUS_LABELS: Record<ProspectContactStatus, string> = {
  no_contactado: "No contactado",
  contactado: "Contactado",
  respondio: "Respondió",
  no_respondio: "No respondió",
  pidio_llamar_luego: "Pidió llamar luego",
  derivo: "Derivó",
  no_aplica: "No aplica",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  reunion: "Reunión",
  visita: "Visita",
  enviar_propuesta: "Enviar propuesta",
  validar_propuesta: "Validar propuesta",
  seguimiento: "Seguimiento",
  pedir_contacto: "Pedir contacto",
  relevar_flota: "Relevar flota",
  revisar_proveedor: "Revisar proveedor",
  otro: "Otro",
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  pendiente: "Pendiente",
  realizada: "Realizada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export const NEED_AVAILABILITY_LABELS: Record<ProspectNeedAvailability, string> = {
  disponible: "Producto disponible",
  a_desarrollar: "A desarrollar",
  no_disponible: "No disponible",
  estrategica: "Oportunidad estratégica",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  no_iniciada: "No iniciada",
  en_preparacion: "En preparación",
  enviada: "Enviada",
  en_revision: "En revisión",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const PRODUCT_OPP_POTENTIAL_LABELS: Record<
  ProductOpportunityPotential,
  string
> = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
};

export const PRODUCT_OPP_STATUS_LABELS: Record<ProductOpportunityStatus, string> = {
  idea: "Idea",
  evaluar: "Evaluar",
  buscar_proveedor: "Buscar proveedor",
  desarrollar: "Desarrollar",
  descartado: "Descartado",
};

export const TRAFFIC_LIGHT_LABELS: Record<ProspectTrafficLight, string> = {
  verde: "En marcha",
  amarillo: "Faltan datos",
  rojo: "Riesgo comercial",
  gris: "Sin oportunidad",
};

// ───────────────────────────────────────────────────────────── Fechas

/** "Hoy" en formato ISO YYYY-MM-DD (zona horaria local). */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Diferencia en días entre dos fechas ISO (positivo = `iso` en el futuro). */
export function diffInDays(iso: string, fromISO: string = todayISO()): number {
  const a = Date.parse(`${iso}T00:00:00`);
  const b = Date.parse(`${fromISO}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

/** Formatea una fecha ISO YYYY-MM-DD a DD/MM/YYYY (vacío si no hay fecha). */
export function formatProspectDate(iso?: string): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

// ─────────────────────────────────────────────── Próxima actividad

export type NextActivityState =
  | "sin_actividad"
  | "vencida"
  | "hoy"
  | "proxima_7"
  | "futura";

export interface NextActivityInfo {
  activity: CompanyProspect["actividades"][number] | null;
  state: NextActivityState;
  /** Días hasta la actividad (negativo si está vencida). */
  daysUntil: number | null;
}

/**
 * Devuelve la próxima actividad gestionable (pendiente o vencida) más cercana
 * en el tiempo, junto con su estado relativo a "hoy". Las actividades marcadas
 * como `realizada` o `cancelada` se ignoran.
 */
export function getNextActivityStatus(
  prospect: CompanyProspect,
  today: string = todayISO(),
): NextActivityInfo {
  const abiertas = prospect.actividades
    .filter((a) => a.estado === "pendiente" || a.estado === "vencida")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const next = abiertas[0] ?? null;
  if (!next) {
    return { activity: null, state: "sin_actividad", daysUntil: null };
  }

  const days = diffInDays(next.fecha, today);
  let state: NextActivityState;
  if (days < 0) state = "vencida";
  else if (days === 0) state = "hoy";
  else if (days <= 7) state = "proxima_7";
  else state = "futura";

  return { activity: next, state, daysUntil: days };
}

// ─────────────────────────────────────────────────────── Semáforo

/** ¿La etapa es de cierre (sin gestión activa posible)? */
export function isClosedStage(etapa: ProspectStage): boolean {
  return etapa === "perdida" || etapa === "sin_oportunidad";
}

export function hasReferente(prospect: CompanyProspect): boolean {
  return prospect.contactos.some((c) => c.esReferenteFinal);
}

export function isFleetKnown(prospect: CompanyProspect): boolean {
  const { flotaPropia, flotaTercerizada } = prospect.flota;
  return flotaPropia !== "no_se_sabe" || flotaTercerizada !== "no_se_sabe";
}

export function hasNeeds(prospect: CompanyProspect): boolean {
  return prospect.necesidades.length > 0;
}

/** ¿Algún contacto acumuló varios intentos sin respuesta? */
export function hasUnresponsiveContact(prospect: CompanyProspect): boolean {
  return prospect.contactos.some(
    (c) => c.estado === "no_respondio" && (c.intentosSinRespuesta ?? 0) >= 2,
  );
}

/**
 * Semáforo comercial calculado.
 *  - gris: oportunidad cerrada (perdida / sin oportunidad / no aplica).
 *  - rojo: sin próxima actividad, actividad vencida, o contacto que no responde.
 *  - verde: referente + flota conocida + necesidad detectada + actividad futura.
 *  - amarillo: hay gestión iniciada pero faltan datos críticos.
 */
export function getProspectTrafficLight(
  prospect: CompanyProspect,
  today: string = todayISO(),
): ProspectTrafficLight {
  if (isClosedStage(prospect.etapa)) return "gris";

  const next = getNextActivityStatus(prospect, today);
  if (next.state === "sin_actividad" || next.state === "vencida") return "rojo";
  if (hasUnresponsiveContact(prospect)) return "rojo";

  if (prospect.etapa === "ganada") return "verde";

  if (hasReferente(prospect) && isFleetKnown(prospect) && hasNeeds(prospect)) {
    return "verde";
  }

  return "amarillo";
}

// ─────────────────────────────────────────────────────── Prioridad

/**
 * Prioridad efectiva de la oportunidad. Hoy devuelve la prioridad cargada
 * (editable desde la ficha); centralizada aquí para incorporar señales
 * automáticas (tamaño de flota, renovación próxima) en el futuro.
 */
export function getProspectPriority(prospect: CompanyProspect): ProspectPriority {
  return prospect.prioridad;
}

/**
 * Prioridad sugerida a partir de señales objetivas. Se ofrece como ayuda en la
 * ficha; no sobreescribe la prioridad cargada manualmente.
 */
export function suggestProspectPriority(
  prospect: CompanyProspect,
  today: string = todayISO(),
): ProspectPriority {
  let score = 0;
  if (isFleetKnown(prospect)) score += 1;
  if ((prospect.flota.cantidadVehiculos ?? 0) >= 20) score += 1;
  if (hasReferente(prospect)) score += 1;
  if (prospect.necesidades.some((n) => n.disponibilidad === "disponible")) score += 1;
  if (prospect.flota.proximaRenovacion === "si") {
    const fecha = prospect.flota.fechaEstimadaRenovacion;
    if (fecha && diffInDays(fecha, today) <= 180) score += 1;
  }
  if (score >= 4) return "alta";
  if (score >= 2) return "media";
  return "baja";
}

// ─────────────────────────────────────────────────────── Filtros

export interface ProspectFilters {
  busqueda: string;
  rubro: ProspectRubro | "";
  subrubro: string;
  tipoOrganizacion: ProspectOrgType | "";
  departamento: string;
  localidad: string;
  etapa: ProspectStage | "";
  semaforo: ProspectTrafficLight | "";
  prioridad: ProspectPriority | "";
  flotaPropia: TriState | "";
  flotaTercerizada: TriState | "";
  proveedorActual: string;
  competidor: string;
  fuente: ProspectSource | "";
  /** Solo con actividad vencida. */
  actividadVencida: boolean;
  /** Solo sin próxima actividad. */
  sinProximaActividad: boolean;
  /** Solo con propuesta enviada (o estado posterior). */
  propuestaEnviada: boolean;
  /** Solo con necesidad estratégica futura. */
  oportunidadEstrategica: boolean;
  /** Solo empresas sugeridas. */
  soloSugeridas: boolean;
  /** Solo oportunidades marcadas para revisar. */
  soloRevisar: boolean;
}

export const emptyProspectFilters: ProspectFilters = {
  busqueda: "",
  rubro: "",
  subrubro: "",
  tipoOrganizacion: "",
  departamento: "",
  localidad: "",
  etapa: "",
  semaforo: "",
  prioridad: "",
  flotaPropia: "",
  flotaTercerizada: "",
  proveedorActual: "",
  competidor: "",
  fuente: "",
  actividadVencida: false,
  sinProximaActividad: false,
  propuestaEnviada: false,
  oportunidadEstrategica: false,
  soloSugeridas: false,
  soloRevisar: false,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Texto concatenado y normalizado de una oportunidad para búsqueda full-text. */
export function prospectSearchText(prospect: CompanyProspect): string {
  const partes: string[] = [
    prospect.nombre,
    prospect.subrubro ?? "",
    prospect.localidad ?? "",
    prospect.departamento ?? "",
    prospect.observaciones ?? "",
    prospect.proveedor.proveedorActual ?? "",
    prospect.proveedor.competidores.join(" "),
    RUBRO_LABELS[prospect.rubro],
  ];
  for (const c of prospect.contactos) {
    partes.push(c.nombre, c.cargo ?? "", c.telefono ?? "", c.whatsapp ?? "", c.email ?? "");
  }
  for (const n of prospect.necesidades) {
    partes.push(n.descripcion);
  }
  return normalize(partes.join(" "));
}

const PROPOSAL_SENT_STATES: ProposalStatus[] = [
  "enviada",
  "en_revision",
  "aceptada",
  "rechazada",
];

export function hasSentProposal(prospect: CompanyProspect): boolean {
  return prospect.propuestas.some((p) => PROPOSAL_SENT_STATES.includes(p.estado));
}

export function hasStrategicNeed(prospect: CompanyProspect): boolean {
  return prospect.necesidades.some((n) => n.disponibilidad === "estrategica");
}

/** Aplica búsqueda + filtros sobre una colección de oportunidades. */
export function filterProspects(
  prospects: CompanyProspect[],
  filters: ProspectFilters,
  today: string = todayISO(),
): CompanyProspect[] {
  const term = normalize(filters.busqueda);

  return prospects.filter((p) => {
    if (term && !prospectSearchText(p).includes(term)) return false;
    if (filters.rubro && p.rubro !== filters.rubro) return false;
    if (filters.subrubro && p.subrubro !== filters.subrubro) return false;
    if (filters.tipoOrganizacion && p.tipoOrganizacion !== filters.tipoOrganizacion) {
      return false;
    }
    if (filters.departamento && p.departamento !== filters.departamento) return false;
    if (filters.localidad && p.localidad !== filters.localidad) return false;
    if (filters.etapa && p.etapa !== filters.etapa) return false;
    if (filters.prioridad && p.prioridad !== filters.prioridad) return false;
    if (filters.flotaPropia && p.flota.flotaPropia !== filters.flotaPropia) return false;
    if (
      filters.flotaTercerizada &&
      p.flota.flotaTercerizada !== filters.flotaTercerizada
    ) {
      return false;
    }
    if (filters.fuente && p.fuente !== filters.fuente) return false;

    if (filters.semaforo && getProspectTrafficLight(p, today) !== filters.semaforo) {
      return false;
    }

    if (filters.proveedorActual) {
      const prov = normalize(p.proveedor.proveedorActual ?? "");
      if (!prov.includes(normalize(filters.proveedorActual))) return false;
    }
    if (filters.competidor) {
      const comps = normalize(p.proveedor.competidores.join(" "));
      if (!comps.includes(normalize(filters.competidor))) return false;
    }

    if (filters.actividadVencida || filters.sinProximaActividad) {
      const next = getNextActivityStatus(p, today);
      if (filters.actividadVencida && next.state !== "vencida") return false;
      if (filters.sinProximaActividad && next.state !== "sin_actividad") return false;
    }

    if (filters.propuestaEnviada && !hasSentProposal(p)) return false;
    if (filters.oportunidadEstrategica && !hasStrategicNeed(p)) return false;
    if (filters.soloSugeridas && !p.esSugerida) return false;
    if (filters.soloRevisar && !p.revisar) return false;

    return true;
  });
}

/** Opciones únicas para los selects de filtro, derivadas de los datos. */
export function getProspectFilterOptions(prospects: CompanyProspect[]) {
  const subrubros = new Set<string>();
  const departamentos = new Set<string>();
  const localidades = new Set<string>();

  for (const p of prospects) {
    if (p.subrubro) subrubros.add(p.subrubro);
    if (p.departamento) departamentos.add(p.departamento);
    if (p.localidad) localidades.add(p.localidad);
  }

  const sort = (a: string, b: string) => a.localeCompare(b, "es");
  return {
    subrubros: [...subrubros].sort(sort),
    departamentos: [...departamentos].sort(sort),
    localidades: [...localidades].sort(sort),
  };
}

export function hayFiltrosActivos(filters: ProspectFilters): boolean {
  return (
    JSON.stringify(filters) !== JSON.stringify(emptyProspectFilters)
  );
}

// ─────────────────────────────────────────────────────── KPIs

export interface ProspectionKpis {
  total: number;
  actividadesVencidas: number;
  calientes: number;
  sinProximaActividad: number;
  propuestasEnviadas: number;
  necesidadesNoCubiertas: number;
}

/** KPIs del encabezado del dashboard. */
export function getProspectionKpis(
  prospects: CompanyProspect[],
  today: string = todayISO(),
): ProspectionKpis {
  let actividadesVencidas = 0;
  let calientes = 0;
  let sinProximaActividad = 0;
  let propuestasEnviadas = 0;
  let necesidadesNoCubiertas = 0;

  for (const p of prospects) {
    const next = getNextActivityStatus(p, today);
    if (next.state === "vencida") actividadesVencidas += 1;
    if (next.state === "sin_actividad" && !isClosedStage(p.etapa)) {
      sinProximaActividad += 1;
    }
    if (getProspectTrafficLight(p, today) === "verde") calientes += 1;
    if (hasSentProposal(p)) propuestasEnviadas += 1;
    necesidadesNoCubiertas += p.necesidades.filter(
      (n) => n.disponibilidad !== "disponible",
    ).length;
  }

  return {
    total: prospects.length,
    actividadesVencidas,
    calientes,
    sinProximaActividad,
    propuestasEnviadas,
    necesidadesNoCubiertas,
  };
}

// ───────────────────────────── Estadísticas de oportunidades de producto

export interface ProductOpportunityStat {
  producto: string;
  menciones: number;
  rubros: ProspectRubro[];
  empresas: string[];
  /** Potencial estimado: alto si hay necesidades estratégicas. */
  potencial: ProductOpportunityPotential;
}

/**
 * Agrega las necesidades NO cubiertas (a desarrollar / no disponible /
 * estratégica) detectadas en las fichas y las agrupa por producto, para
 * alimentar el tablero de oportunidades de producto.
 */
export function getProductOpportunityStats(
  prospects: CompanyProspect[],
): ProductOpportunityStat[] {
  const mapa = new Map<
    string,
    {
      producto: string;
      menciones: number;
      rubros: Set<ProspectRubro>;
      empresas: Set<string>;
      estrategica: boolean;
    }
  >();

  for (const p of prospects) {
    for (const n of p.necesidades) {
      if (n.disponibilidad === "disponible") continue;
      const key = normalize(n.descripcion);
      const entry = mapa.get(key) ?? {
        producto: n.descripcion,
        menciones: 0,
        rubros: new Set<ProspectRubro>(),
        empresas: new Set<string>(),
        estrategica: false,
      };
      entry.menciones += 1;
      entry.rubros.add(p.rubro);
      entry.empresas.add(p.nombre);
      if (n.disponibilidad === "estrategica") entry.estrategica = true;
      mapa.set(key, entry);
    }
  }

  return [...mapa.values()]
    .map((e) => ({
      producto: e.producto,
      menciones: e.menciones,
      rubros: [...e.rubros],
      empresas: [...e.empresas],
      potencial: (e.estrategica || e.menciones >= 3
        ? "alto"
        : e.menciones >= 2
          ? "medio"
          : "bajo") as ProductOpportunityPotential,
    }))
    .sort((a, b) => b.menciones - a.menciones);
}

// ─────────────────────────────────────────────── Etiquetas auxiliares

export function fleetSummary(prospect: CompanyProspect): string {
  const { flotaPropia, flotaTercerizada } = prospect.flota;
  const partes: string[] = [];
  if (flotaPropia === "si") partes.push("Propia");
  if (flotaTercerizada === "si") partes.push("Tercerizada");
  if (partes.length === 0) {
    if (flotaPropia === "no" && flotaTercerizada === "no") return "Sin flota";
    return "No se sabe";
  }
  const cant = prospect.flota.cantidadVehiculos;
  return cant ? `${partes.join(" + ")} · ${cant}` : partes.join(" + ");
}

export function referenteNombre(prospect: CompanyProspect): string | null {
  return prospect.contactos.find((c) => c.esReferenteFinal)?.nombre ?? null;
}

// ───────────────────────── Clave canónica y merge de seed (Fase 2)

// Espeja la canonicalización de scripts/build-prospeccion.cjs para deduplicar
// empresas por identidad (sin acentos, sin alias entre paréntesis, sin sufijos).
const CANON_STOP = new Set([
  "sa", "srl", "ltda", "rent", "a", "car", "the", "rental",
  "de", "del", "la", "el", "y", "e",
  "ingenieria", "construccion", "constrccion", "construcciones", "constructora",
]);
const CANON_FIX: Record<string, string> = {
  guiterrez: "gutierrez",
  serdecon: "sertecon",
  terciarizan: "",
};
const CANON_ALIAS: Record<string, string> = {
  "upm oriental": "upm forestal oriental",
};

/** Clave canónica de empresa (igual criterio que el script de importación). */
export function canonicalProspectKey(nombre: string): string {
  let s = (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const toks = s
    .split(/\s+/)
    .map((t) => (t in CANON_FIX ? CANON_FIX[t] : t))
    .filter((t) => t && !CANON_STOP.has(t));
  s = toks.join(" ");
  return CANON_ALIAS[s] ?? s;
}

/**
 * Merge controlado y NO destructivo de un seed sobre los datos existentes:
 * agrega solo empresas nuevas (por id o clave canónica) y conserva intactas las
 * ya cargadas/editadas. Nunca pisa una ficha existente.
 */
export function mergeProspectionSeed(
  existing: CompanyProspect[],
  seed: CompanyProspect[],
): CompanyProspect[] {
  const ids = new Set(existing.map((p) => p.id));
  const keys = new Set(existing.map((p) => canonicalProspectKey(p.nombre)));
  const nuevas = seed.filter(
    (s) => !ids.has(s.id) && !keys.has(canonicalProspectKey(s.nombre)),
  );
  return [...existing, ...nuevas];
}
