import type { PickupDataset } from "@/lib/excel/build-dataset";

/**
 * Validación de conteos antes de persistir el dataset legacy (KORE-27).
 *
 * El catálogo (artículos + aplicaciones) y la cartera (clientes) son válidos aunque
 * ventas = 0: las ventas se pueden sumar después (Diario de Ventas) sin tocar el catálogo.
 * Ventas vacías es una advertencia, no un bloqueo.
 */

type DatasetCounts = Pick<PickupDataset, "clientes" | "ventas" | "ventaItems" | "articulos" | "aplicaciones">;

export type DatasetImportValidation =
  | { ok: true; warnings: string[] }
  | { ok: false; errorMessage: string; technicalDetail: string };

export function validateDatasetCountsForImport(dataset: DatasetCounts): DatasetImportValidation {
  const empty: string[] = [];
  if (dataset.clientes.length === 0) empty.push("clientes");
  if (dataset.articulos.length === 0) empty.push("artículos");
  if (dataset.aplicaciones.length === 0) empty.push("aplicaciones");

  if (empty.length > 0) {
    const detail = `Recibido: clientes=${dataset.clientes.length}, ventas=${dataset.ventas.length}, ventaItems=${dataset.ventaItems.length}, articulos=${dataset.articulos.length}, aplicaciones=${dataset.aplicaciones.length}`;
    return { ok: false, errorMessage: `Dataset vacío en: ${empty.join(", ")}`, technicalDetail: detail };
  }

  const warnings: string[] = [];
  if (dataset.ventas.length === 0 && dataset.ventaItems.length === 0) {
    warnings.push("SIN_VENTAS: catálogo y clientes válidos sin ventas; importá el Diario de Ventas por separado.");
  }
  return { ok: true, warnings };
}
