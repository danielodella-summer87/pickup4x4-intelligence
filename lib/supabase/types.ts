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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
