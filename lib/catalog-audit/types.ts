/**
 * Auditoría de Catálogo — modelo de dominio.
 *
 * Agnóstico de la fuente: un mismo `CatalogProduct` puede provenir de
 * ProtecCar, otro competidor, un distribuidor o un proveedor. `source` es un
 * identificador libre (no un enum cerrado) para no acoplar el modelo a un
 * catálogo puntual.
 */

export type CatalogQualityIssueType =
  | "missing_field"
  | "classification"
  | "inconsistency"
  | "duplicate"
  | "seo"
  | "compatibility"
  | "content";

export type CatalogQualitySeverity = "low" | "medium" | "high";

export type CatalogQualityIssue = {
  id: string;
  type: CatalogQualityIssueType;
  severity: CatalogQualitySeverity;
  field?: string;
  message: string;
};

/** Valor de categoría/subcategoría normalizada aún no resuelta (no se inventa). */
export const PENDING_NORMALIZATION = "Pendiente de normalización" as const;

export type CatalogStockStatus =
  | "in_stock"
  | "out_of_stock"
  | "low_stock"
  | "unknown";

export type CatalogProduct = {
  id: string;
  sourceId?: string;

  /** Identificador libre de la fuente: "proteccar", "competidor", "proveedor", "otro"… */
  source: string;
  importedAt: string;

  originalCategory: string;
  originalSubcategory: string;

  /** Igual a PENDING_NORMALIZATION cuando todavía no hay mapeo confiable. */
  normalizedCategory: string;
  normalizedSubcategory: string;

  brand: string;
  manufacturer: string;

  productName: string;

  compatibleVehicleBrand: string;
  compatibleVehicleModel: string;
  compatibleYearFrom?: number;
  compatibleYearTo?: number;
  compatibilityText: string;

  sku: string;

  price?: number;
  currency: string;

  stockStatus: string;

  productUrl: string;
  mainImageUrl: string;

  description: string;
  specifications: string;

  seoTitle: string;
  metaDescription: string;
  h1: string;
  imageAlt: string;

  material?: string;
  color?: string;
  warranty?: string;

  /** Texto original de una columna de observaciones/notas del archivo fuente, si existe. */
  sourceNotes?: string;

  /** Fila original tal como llegó del archivo (headers crudos → valor), para trazabilidad. */
  rawRow: Record<string, string>;

  qualityIssues: CatalogQualityIssue[];
};

export type CatalogRowStatus = "valid" | "incomplete" | "error";

/** Resultado de mapear una fila cruda: producto + estado de esa fila en la importación. */
export type CatalogMappedRow = {
  rowIndex: number;
  status: CatalogRowStatus;
  product: CatalogProduct | null;
  errorMessage?: string;
};
