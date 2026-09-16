/**
 * Resumen de una importación de catálogo: filas leídas / válidas /
 * incompletas / con error. Función pura sobre el resultado de mapCatalogRows.
 */
import { markDuplicateSkus } from "@/lib/catalog-audit/quality";
import type { CatalogMappedRow, CatalogProduct } from "@/lib/catalog-audit/types";

export type CatalogImportRowError = {
  rowIndex: number;
  message: string;
};

export type CatalogImportPreview = {
  rowsRead: number;
  validRows: number;
  incompleteRows: number;
  errorRows: number;
  products: CatalogProduct[];
  errors: CatalogImportRowError[];
};

export function buildCatalogImportPreview(
  mappedRows: CatalogMappedRow[],
): CatalogImportPreview {
  const products: CatalogProduct[] = [];
  const errors: CatalogImportRowError[] = [];

  for (const row of mappedRows) {
    if (row.status === "error" || !row.product) {
      errors.push({
        rowIndex: row.rowIndex,
        message: row.errorMessage ?? "Fila no válida.",
      });
      continue;
    }
    products.push(row.product);
  }

  // Los duplicados solo se detectan con el conjunto completo de productos.
  markDuplicateSkus(products);

  const validRows = products.filter((p) => p.qualityIssues.length === 0).length;
  const incompleteRows = products.length - validRows;

  return {
    rowsRead: mappedRows.length,
    validRows,
    incompleteRows,
    errorRows: errors.length,
    products,
    errors,
  };
}
