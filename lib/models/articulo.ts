/**
 * Artículo del catálogo (Excel KORE).
 * `codigoUnico` es el código original del Excel y no debe alterarse.
 */
export interface Articulo {
  codigoUnico: string;
  descripcion: string;
  rubro?: string;
  categoria?: string;
  marcaArticulo?: string;
  stock?: number;
  precioLista?: number;
  unidadMedida?: string;
  activo: boolean;
}

/** Confianza comercial del match marca/modelo (0–1). */
export type ApplicationValidationStatus = "valid" | "review" | "excluded";

/**
 * Aplicación de un artículo a un vehículo.
 * Cuando un mismo `codigoUnico` tiene varias aplicaciones, cada fila
 * recibe un `codigoAplicacion` auxiliar (ej. 1832-A, 1832-B).
 */
export interface ArticuloAplicacion {
  codigoAplicacion: string;
  codigoUnico: string;
  marcaId: string;
  modeloId: string;
  anioDesde: number;
  anioHasta: number;
  observaciones?: string;
  /** Confianza del match (mínimo entre marca y modelo). */
  confidence?: number;
  validationStatus?: ApplicationValidationStatus;
  requiresReview?: boolean;
  reviewReason?: string;
  /** Texto legible de marca (revisión sin canónico). */
  marcaLegible?: string;
  /** Texto legible de modelo (revisión sin canónico). */
  modeloLegible?: string;
}
