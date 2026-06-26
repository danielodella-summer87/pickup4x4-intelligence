// Modelo de datos del módulo "Prospección Empresas" (CRM B2B).
//
// Este módulo es independiente del dataset comercial (clientes/ventas/artículos):
// trabaja con su propia colección de oportunidades B2B, persistida localmente en
// esta fase y preparada para migrar a base de datos (Supabase) más adelante.
//
// Convenciones del proyecto:
//  - Interfaces en PascalCase.
//  - Union types en snake_case.
//  - Las fechas se guardan como ISO "YYYY-MM-DD".

// ───────────────────────────────────────────────────────────── Enums / unions

export type ProspectRubro =
  | "estado"
  | "forestal"
  | "constructora"
  | "telecomunicaciones"
  | "climatizacion"
  | "fachadas_altura"
  | "alquiladora"
  | "otro";

export type ProspectOrgType =
  | "estado"
  | "privada"
  | "mixta"
  | "contratista"
  | "alquiladora"
  | "proveedor";

export type ProspectSource =
  | "excel_canales"
  | "excel_contactos"
  | "manual"
  | "sugerida"
  | "otro";

/**
 * Etapas del proceso comercial. El orden del union refleja el avance esperado;
 * `ganada` / `perdida` / `sin_oportunidad` son estados de cierre.
 */
export type ProspectStage =
  | "lead_detectado"
  | "llamada_inicial_pendiente"
  | "datos_basicos_relevados"
  | "referente_identificado"
  | "visita_coordinada"
  | "presentacion_enviada"
  | "necesidades_relevadas"
  | "propuesta_preparacion"
  | "propuesta_enviada"
  | "seguimiento_negociacion"
  | "ganada"
  | "perdida"
  | "sin_oportunidad";

export type ProspectPriority = "alta" | "media" | "baja";

/** Semáforo comercial calculado (ver getProspectTrafficLight). */
export type ProspectTrafficLight = "verde" | "amarillo" | "rojo" | "gris";

/** Valor de tres estados usado en relevamiento (sí / no / no se sabe). */
export type TriState = "si" | "no" | "no_se_sabe";

// ──────────────────────────────────────────────────────────── B. Contacto

export type ProspectContactArea =
  | "compras"
  | "flota"
  | "mantenimiento"
  | "logistica"
  | "administracion"
  | "obras"
  | "servicios"
  | "otro";

export type ProspectContactStatus =
  | "no_contactado"
  | "contactado"
  | "respondio"
  | "no_respondio"
  | "pidio_llamar_luego"
  | "derivo"
  | "no_aplica";

export interface ProspectContact {
  id: string;
  nombre: string;
  cargo?: string;
  area?: ProspectContactArea;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  horarioRecomendado?: string;
  /** Quien deriva hacia el referente final. */
  esDerivador?: boolean;
  /** Referente final de compras/flota/mantenimiento/logística. */
  esReferenteFinal?: boolean;
  estado: ProspectContactStatus;
  /** Cantidad de intentos sin respuesta (alimenta el semáforo en rojo). */
  intentosSinRespuesta?: number;
}

// ──────────────────────────────────────────────────────────────── C. Flota

export type FleetVehicleType =
  | "pickups"
  | "camionetas"
  | "camiones"
  | "utilitarios"
  | "autos"
  | "vans"
  | "maquinaria"
  | "otros";

export interface FleetProfile {
  flotaPropia: TriState;
  flotaTercerizada: TriState;
  modeloMixto: TriState;
  /** Alquiladora o proveedor de flota actual. */
  proveedorFlotaActual?: string;
  cantidadVehiculos?: number;
  tiposVehiculo: FleetVehicleType[];
  marcasModelos?: string;
  /** Usos de la flota: traslado de herramientas, escaleras, cuadrillas, obra, etc. */
  usos: string[];
  proximaRenovacion: TriState;
  fechaEstimadaRenovacion?: string;
  observaciones?: string;
}

// ──────────────────────────────────────────── D. Proveedor actual / competencia

export interface ProviderProfile {
  tieneProveedorActual: TriState;
  proveedorActual?: string;
  competidores: string[];
  condicionesConocidas?: string;
  frecuenciaCompra?: string;
  quienDecide?: string;
  quienRecomienda?: string;
  quienUsa?: string;
  riesgosComerciales?: string;
  oportunidadesEntrada?: string;
}

// ─────────────────────────────────────────────────── E. Necesidades detectadas

/**
 * Clasificación de cada necesidad respecto al catálogo de Pickup 4x4.
 * Las que no son `disponible` alimentan el tablero de oportunidades de producto.
 */
export type ProspectNeedAvailability =
  | "disponible" // producto actual disponible
  | "a_desarrollar" // producto posible a desarrollar
  | "no_disponible" // producto no disponible
  | "estrategica"; // oportunidad estratégica futura

export interface ProspectNeed {
  id: string;
  descripcion: string;
  recomendadoPickup?: string;
  disponibilidad: ProspectNeedAvailability;
  comentario?: string;
}

// ──────────────────────────────────────────────────── F. Propuesta comercial

export type ProposalStatus =
  | "no_iniciada"
  | "en_preparacion"
  | "enviada"
  | "en_revision"
  | "aceptada"
  | "rechazada";

export type ProposalChannel =
  | "email"
  | "whatsapp"
  | "reunion"
  | "impresa"
  | "otro";

export interface ProspectProposal {
  id: string;
  fechaCreacion: string;
  estado: ProposalStatus;
  version: number;
  productos: string[];
  notas?: string;
  montoEstimado?: number;
  fechaEnvio?: string;
  medioEnvio?: ProposalChannel;
  /** Reservado para PDF/archivo asociado en fase de persistencia real. */
  archivoUrl?: string;
  resultado?: string;
}

// ────────────────────────────────────────── G + H. Actividades e historial

export type ActivityType =
  | "llamada"
  | "whatsapp"
  | "email"
  | "reunion"
  | "visita"
  | "enviar_propuesta"
  | "validar_propuesta"
  | "seguimiento"
  | "pedir_contacto"
  | "relevar_flota"
  | "revisar_proveedor"
  | "otro";

export type ActivityStatus = "pendiente" | "realizada" | "vencida" | "cancelada";

export interface ProspectActivity {
  id: string;
  tipo: ActivityType;
  fecha: string;
  hora?: string;
  /** Lugar de la actividad (reunión/visita). */
  lugar?: string;
  /** Participantes / personas que se suman (texto libre). */
  participantes?: string;
  responsable?: string;
  estado: ActivityStatus;
  resultadoEsperado?: string;
  resultadoObtenido?: string;
  notas?: string;
  /** Contacto vinculado (para el historial). */
  contactoNombre?: string;
}

// ────────────────────────────── Oportunidades de producto (registro estratégico)

export type ProductOpportunityPotential = "bajo" | "medio" | "alto";

export type ProductOpportunityStatus =
  | "idea"
  | "evaluar"
  | "buscar_proveedor"
  | "desarrollar"
  | "descartado";

/**
 * Necesidad de producto que Pickup 4x4 todavía no tiene resuelta.
 * Registro estratégico editable (independiente de las necesidades por ficha,
 * que se agregan automáticamente vía getProductOpportunityStats).
 */
export interface ProductOpportunity {
  id: string;
  producto: string;
  rubro?: ProspectRubro;
  empresaSolicitante?: string;
  prospectId?: string;
  menciones: number;
  potencial: ProductOpportunityPotential;
  comentario?: string;
  estado: ProductOpportunityStatus;
}

// ──────────────────────────────────────────────────── A + raíz: CompanyProspect

export interface CompanyProspect {
  id: string;

  // A. Datos de empresa
  nombre: string;
  rubro: ProspectRubro;
  subrubro?: string;
  tipoOrganizacion: ProspectOrgType;
  direccion?: string;
  localidad?: string;
  ciudad?: string;
  departamento?: string;
  web?: string;
  observaciones?: string;
  fuente: ProspectSource;
  /** Empresa sugerida por estrategia (no proviene de los Excel iniciales). */
  esSugerida?: boolean;
  categoriaSugerida?: string;
  /**
   * Oportunidad importada con baja confianza o datos incompletos/ambiguos:
   * el operador debe validarla y corregirla desde la ficha.
   */
  revisar?: boolean;

  // Proceso comercial
  etapa: ProspectStage;
  prioridad: ProspectPriority;

  // Bloques relacionados
  contactos: ProspectContact[];
  flota: FleetProfile;
  proveedor: ProviderProfile;
  necesidades: ProspectNeed[];
  propuestas: ProspectProposal[];
  actividades: ProspectActivity[];

  // Metadatos
  creadoEn: string;
  actualizadoEn: string;
  ultimoContacto?: string;
}

// ───────────────────────────────────────── Catálogos editables (Fase 3)

/** Item de catálogo editable (rubros / etapas / tipos de actividad). */
export interface ProspectCatalogItem {
  id: string;
  nombre: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
}

export type ProspectCatalogKind = "rubros" | "etapas" | "tipos_actividad";

export interface ProspectDepartamento {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface ProspectCatalogos {
  rubros: ProspectCatalogItem[];
  etapas: ProspectCatalogItem[];
  tiposActividad: ProspectCatalogItem[];
  departamentos: ProspectDepartamento[];
}

// ───────────────────────────────────────────────────────── Inputs de creación

export interface CreateProspectInput {
  nombre: string;
  rubro: ProspectRubro;
  subrubro?: string;
  tipoOrganizacion: ProspectOrgType;
  localidad?: string;
  ciudad?: string;
  departamento?: string;
  direccion?: string;
  web?: string;
  observaciones?: string;
  fuente?: ProspectSource;
  esSugerida?: boolean;
  categoriaSugerida?: string;
  etapa?: ProspectStage;
  prioridad?: ProspectPriority;
}

// ─────────────────────────────────────────────────────────────── Fábricas

/** Perfil de flota vacío (todo "no se sabe"). */
export function emptyFleetProfile(): FleetProfile {
  return {
    flotaPropia: "no_se_sabe",
    flotaTercerizada: "no_se_sabe",
    modeloMixto: "no_se_sabe",
    tiposVehiculo: [],
    usos: [],
    proximaRenovacion: "no_se_sabe",
  };
}

/** Perfil de proveedor/competencia vacío. */
export function emptyProviderProfile(): ProviderProfile {
  return {
    tieneProveedorActual: "no_se_sabe",
    competidores: [],
  };
}
