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

/**
 * Taxonomía del catálogo (familia → grupo → subgrupo) tal como la publica la fuente del
 * catálogo. Solo presente cuando el catálogo viene de KORE (KORE-28); legacy no la persiste.
 */
export type CatalogTaxonomy = {
  familias: { codigoFamilia: string; descripcion: string }[];
  grupos: { codigoFamilia: string; codigoGrupo: string; descripcion: string }[];
  subgrupos: { codigoFamilia: string; codigoGrupo: string; codigoSubgrupo: string; descripcion: string }[];
};

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
