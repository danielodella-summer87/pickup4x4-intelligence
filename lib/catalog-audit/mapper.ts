/**
 * Mapeo de una fila cruda de catálogo a `CatalogProduct`.
 * Orquesta: mapeo de columnas → normalización → validación estructural →
 * hallazgos de calidad. Cada paso vive en su propio módulo (column-map,
 * normalization, quality); este archivo solo los combina.
 */
import { pickRowValue } from "@/lib/excel/mappers";
import {
  isBlank,
  normalizeInteger,
  normalizeNumber,
  normalizeText,
} from "@/lib/excel/normalizers";
import { sanitizeExcelHeader } from "@/lib/excel/column-map";
import { CATALOG_COLUMNS } from "@/lib/catalog-audit/column-map";
import {
  resolveNormalizedValue,
} from "@/lib/catalog-audit/normalization";
import { buildCatalogQualityIssues } from "@/lib/catalog-audit/quality";
import type {
  CatalogMappedRow,
  CatalogProduct,
} from "@/lib/catalog-audit/types";

export type MapCatalogRowOptions = {
  source: string;
  importedAt: string;
};

let idCounter = 0;

function generateProductId(): string {
  idCounter += 1;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `catalog-${idCounter}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function buildRawRow(row: Record<string, unknown>): Record<string, string> {
  const rawRow: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    rawRow[sanitizeExcelHeader(header)] =
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  }
  return rawRow;
}

function textOrEmpty(value: unknown): string {
  return normalizeText(value) ?? "";
}

/**
 * Mapea una fila cruda a un producto. Devuelve `status: "error"` (sin
 * producto) cuando la fila no tiene nombre de producto identificable.
 */
export function mapCatalogRow(
  row: Record<string, unknown>,
  rowIndex: number,
  options: MapCatalogRowOptions,
): CatalogMappedRow {
  const productName = normalizeText(pickRowValue(row, CATALOG_COLUMNS.productName));

  if (isBlank(productName)) {
    return {
      rowIndex,
      status: "error",
      product: null,
      errorMessage:
        "Falta nombre de producto (columna Producto/Nombre no detectada o vacía).",
    };
  }

  const originalCategory = textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.category));
  const originalSubcategory = textOrEmpty(
    pickRowValue(row, CATALOG_COLUMNS.subcategory),
  );

  const base: Omit<CatalogProduct, "qualityIssues"> = {
    id: generateProductId(),
    sourceId: normalizeText(pickRowValue(row, CATALOG_COLUMNS.sourceId)),
    source: options.source,
    importedAt: options.importedAt,

    originalCategory,
    originalSubcategory,
    normalizedCategory: resolveNormalizedValue(originalCategory, "category"),
    normalizedSubcategory: resolveNormalizedValue(
      originalSubcategory,
      "subcategory",
    ),

    brand: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.brand)),
    manufacturer: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.manufacturer)),

    productName: productName as string,

    compatibleVehicleBrand: textOrEmpty(
      pickRowValue(row, CATALOG_COLUMNS.vehicleBrand),
    ),
    compatibleVehicleModel: textOrEmpty(
      pickRowValue(row, CATALOG_COLUMNS.vehicleModel),
    ),
    compatibleYearFrom: normalizeInteger(pickRowValue(row, CATALOG_COLUMNS.yearFrom)),
    compatibleYearTo: normalizeInteger(pickRowValue(row, CATALOG_COLUMNS.yearTo)),
    compatibilityText: textOrEmpty(
      pickRowValue(row, CATALOG_COLUMNS.compatibilityText),
    ),

    sku: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.sku)),

    price: normalizeNumber(pickRowValue(row, CATALOG_COLUMNS.price)),
    currency: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.currency)),

    stockStatus: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.stockStatus)),

    productUrl: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.productUrl)),
    mainImageUrl: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.mainImageUrl)),

    description: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.description)),
    specifications: textOrEmpty(
      pickRowValue(row, CATALOG_COLUMNS.specifications),
    ),

    seoTitle: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.seoTitle)),
    metaDescription: textOrEmpty(
      pickRowValue(row, CATALOG_COLUMNS.metaDescription),
    ),
    h1: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.h1)),
    imageAlt: textOrEmpty(pickRowValue(row, CATALOG_COLUMNS.imageAlt)),

    material: normalizeText(pickRowValue(row, CATALOG_COLUMNS.material)),
    color: normalizeText(pickRowValue(row, CATALOG_COLUMNS.color)),
    warranty: normalizeText(pickRowValue(row, CATALOG_COLUMNS.warranty)),

    sourceNotes: normalizeText(pickRowValue(row, CATALOG_COLUMNS.notes)),

    rawRow: buildRawRow(row),
  };

  const qualityIssues = buildCatalogQualityIssues(base);
  const product: CatalogProduct = { ...base, qualityIssues };

  return {
    rowIndex,
    status: qualityIssues.length > 0 ? "incomplete" : "valid",
    product,
  };
}

export function mapCatalogRows(
  rows: Record<string, unknown>[],
  options: MapCatalogRowOptions,
): CatalogMappedRow[] {
  return rows.map((row, index) => mapCatalogRow(row, index, options));
}
