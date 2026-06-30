/** Filas alineadas al esquema Postgres / PostgREST del proyecto. */

export type DbCliente = {
  id: string;
  numero_cuenta: string | null;
  nombre: string;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  localidad: string | null;
  sector: string | null;
  created_at?: string;
};

export type DbVenta = {
  id: string;
  cliente_numero_cuenta: string | null;
  cliente_nombre: string | null;
  comprobante: string | null;
  fecha: string | null;
  codigo_unico: string | null;
  descripcion: string | null;
  cantidad: number | null;
  localidad: string | null;
  created_at?: string;
};

export type DbArticulo = {
  id: string;
  codigo_unico: string;
  descripcion: string;
  familia: string | null;
  grupo: string | null;
  subgrupo: string | null;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  rubro: string | null;
  confidence: number | null;
  validation_status: string | null;
  requires_review: boolean | null;
  review_reason: string | null;
  created_at?: string;
};

export type DbAplicacion = {
  id: string;
  codigo_unico: string;
  marca: string | null;
  modelo: string | null;
  marca_legible: string | null;
  modelo_legible: string | null;
  confidence: number | null;
  validation_status: string | null;
  requires_review: boolean | null;
  review_reason: string | null;
  created_at?: string;
};

export type DbImportacionObservaciones = {
  generatedAt?: string;
  stats?: Record<string, unknown>;
  warnings?: unknown[];
  dataQuality?: Record<string, unknown>;
  smartNormalization?: Record<string, unknown>;
  applicationAudit?: Record<string, unknown>;
  marcas?: { id: string; nombre: string }[];
  modelos?: { id: string; marcaId: string; nombre: string }[];
};

export type DbImportacion = {
  id: string;
  nombre: string;
  origen: string;
  clientes_count: number;
  ventas_count: number;
  articulos_count: number;
  aplicaciones_count: number;
  observaciones: DbImportacionObservaciones | null;
  created_at?: string;
};

export type DbSolicitud = {
  id: string;
  cliente_nombre: string;
  telefono: string | null;
  marca: string | null;
  modelo: string | null;
  estado: string;
  observaciones: string | null;
  articulos: unknown;
  created_at?: string;
};

export type DbOportunidad = {
  id: string;
  tipo: string;
  prioridad: string;
  titulo: string;
  descripcion: string;
  recomendacion: string;
  confianza: number | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
};

export type DbHelpdeskTicket = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  module: string;
  created_by: string | null;
  screenshot_url: string | null;
  created_at: string;
  updated_at: string;
};

export type DbCommercialCampaign = {
  id: string;
  name: string;
  type: string | null;
  preset: string | null;
  description: string | null;
  objective: string | null;
  status: string;
  filters_json: unknown | null;
  quality_summary_json: unknown | null;
  created_at: string;
  updated_at: string;
};

export type DbCommercialCampaignItem = {
  id: string;
  campaign_id: string;
  input_code: string | null;
  input_description: string | null;
  input_category: string | null;
  input_brand_model: string | null;
  observations: string | null;
  matched_article_code: string | null;
  matched_article_description: string | null;
  validation_status: string | null;
  match_confidence: string | null;
  source: string | null;
  raw_json: unknown | null;
  created_at: string;
  updated_at: string;
};

export type DbCommercialCampaignResult = {
  id: string;
  campaign_id: string;
  customer_number: string | null;
  customer_name: string | null;
  fantasy_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  locality: string | null;
  article_code: string | null;
  article_description: string | null;
  sale_date: string | null;
  sale_age_months: number | null;
  invoice_number: string | null;
  compatible_vehicle: string | null;
  match_confidence: string | null;
  suggested_action: string | null;
  observations: string | null;
  raw_json: unknown | null;
  created_at: string;
};

// ── Prospección Empresas (Fase 3) ──────────────────────────────────────────
// Modelo híbrido: columnas base + JSONB para los bloques anidados de CompanyProspect.

export type DbProspeccionEmpresa = {
  id: string;
  nombre: string;
  nombre_canonico: string | null;
  rubro: string | null;
  subrubro: string | null;
  tipo_organizacion: string | null;
  direccion: string | null;
  departamento: string | null;
  ciudad: string | null;
  localidad: string | null;
  web: string | null;
  fuente: string | null;
  etapa: string | null;
  prioridad: string | null;
  semaforo: string | null;
  es_sugerida: boolean;
  requiere_revision: boolean;
  flota: unknown;
  proveedor: unknown;
  necesidades: unknown;
  contactos: unknown;
  actividades: unknown;
  propuestas: unknown;
  observaciones: string | null;
  meta: unknown;
  created_at?: string;
  updated_at?: string;
};

export type DbProspeccionNecesidadProducto = {
  id: string;
  producto: string;
  rubro: string | null;
  menciones: number;
  potencial: string | null;
  estado: string | null;
  empresas: unknown;
  observaciones: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Forma común de los catálogos editables (rubros / etapas / tipos de actividad). */
export type DbProspeccionCatalogo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  meta: unknown;
  created_at?: string;
  updated_at?: string;
};

export type DbProspeccionDepartamento = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  created_at?: string;
};

// ── Inteligencia de Mercado ─────────────────────────────────────────────────
// Motor de investigaciones: definición (bloques/preguntas) en JSONB + respuestas.

export type DbMercadoInvestigacion = {
  id: string;
  slug: string;
  titulo: string;
  descripcion: string;
  estado: string;
  intro: string;
  agradecimiento: string;
  captura_distribuidor: boolean;
  comentario_final_titulo: string;
  bloques: unknown;
  meta: unknown;
  created_at?: string;
  updated_at?: string;
};

export type DbMercadoRespuesta = {
  id: string;
  investigacion_id: string;
  investigacion_slug: string;
  distribuidor_nombre: string | null;
  empresa: string | null;
  departamento: string | null;
  contacto: string | null;
  respuestas: unknown;
  comentario_libre: string | null;
  meta: unknown;
  created_at?: string;
};

export type Database = {
  public: {
    Tables: {
      clientes: {
        Row: DbCliente;
        Insert: DbCliente;
        Update: Partial<DbCliente>;
        Relationships: [];
      };
      ventas: {
        Row: DbVenta;
        Insert: DbVenta;
        Update: Partial<DbVenta>;
        Relationships: [];
      };
      articulos: {
        Row: DbArticulo;
        Insert: DbArticulo;
        Update: Partial<DbArticulo>;
        Relationships: [];
      };
      aplicaciones: {
        Row: DbAplicacion;
        Insert: DbAplicacion;
        Update: Partial<DbAplicacion>;
        Relationships: [];
      };
      importaciones: {
        Row: DbImportacion;
        Insert: DbImportacion;
        Update: Partial<DbImportacion>;
        Relationships: [];
      };
      solicitudes: {
        Row: DbSolicitud;
        Insert: DbSolicitud;
        Update: Partial<DbSolicitud>;
        Relationships: [];
      };
      oportunidades: {
        Row: DbOportunidad;
        Insert: DbOportunidad;
        Update: Partial<DbOportunidad>;
        Relationships: [];
      };
      helpdesk_tickets: {
        Row: DbHelpdeskTicket;
        Insert: Omit<DbHelpdeskTicket, "id" | "created_at" | "updated_at"> &
          Partial<Pick<DbHelpdeskTicket, "id" | "created_at" | "updated_at">>;
        Update: Partial<DbHelpdeskTicket>;
        Relationships: [];
      };
      commercial_campaigns: {
        Row: DbCommercialCampaign;
        Insert: Omit<DbCommercialCampaign, "id" | "created_at" | "updated_at"> &
          Partial<Pick<DbCommercialCampaign, "id" | "created_at" | "updated_at">>;
        Update: Partial<DbCommercialCampaign>;
        Relationships: [];
      };
      commercial_campaign_items: {
        Row: DbCommercialCampaignItem;
        Insert: Omit<DbCommercialCampaignItem, "id" | "created_at" | "updated_at"> &
          Partial<Pick<DbCommercialCampaignItem, "id" | "created_at" | "updated_at">>;
        Update: Partial<DbCommercialCampaignItem>;
        Relationships: [];
      };
      commercial_campaign_results: {
        Row: DbCommercialCampaignResult;
        Insert: Omit<DbCommercialCampaignResult, "id" | "created_at"> &
          Partial<Pick<DbCommercialCampaignResult, "id" | "created_at">>;
        Update: Partial<DbCommercialCampaignResult>;
        Relationships: [];
      };
      prospeccion_empresas: {
        Row: DbProspeccionEmpresa;
        Insert: DbProspeccionEmpresa;
        Update: Partial<DbProspeccionEmpresa>;
        Relationships: [];
      };
      prospeccion_necesidades_producto: {
        Row: DbProspeccionNecesidadProducto;
        Insert: DbProspeccionNecesidadProducto;
        Update: Partial<DbProspeccionNecesidadProducto>;
        Relationships: [];
      };
      prospeccion_rubros: {
        Row: DbProspeccionCatalogo;
        Insert: DbProspeccionCatalogo;
        Update: Partial<DbProspeccionCatalogo>;
        Relationships: [];
      };
      prospeccion_etapas: {
        Row: DbProspeccionCatalogo;
        Insert: DbProspeccionCatalogo;
        Update: Partial<DbProspeccionCatalogo>;
        Relationships: [];
      };
      prospeccion_tipos_actividad: {
        Row: DbProspeccionCatalogo;
        Insert: DbProspeccionCatalogo;
        Update: Partial<DbProspeccionCatalogo>;
        Relationships: [];
      };
      prospeccion_departamentos: {
        Row: DbProspeccionDepartamento;
        Insert: DbProspeccionDepartamento;
        Update: Partial<DbProspeccionDepartamento>;
        Relationships: [];
      };
      mercado_investigaciones: {
        Row: DbMercadoInvestigacion;
        Insert: Omit<DbMercadoInvestigacion, "created_at" | "updated_at"> &
          Partial<Pick<DbMercadoInvestigacion, "created_at" | "updated_at">>;
        Update: Partial<DbMercadoInvestigacion>;
        Relationships: [];
      };
      mercado_respuestas: {
        Row: DbMercadoRespuesta;
        Insert: Omit<DbMercadoRespuesta, "created_at"> &
          Partial<Pick<DbMercadoRespuesta, "created_at">>;
        Update: Partial<DbMercadoRespuesta>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
