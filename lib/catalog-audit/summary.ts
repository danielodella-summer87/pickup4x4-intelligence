/**
 * Resumen agregado para la pantalla principal de Auditoría de Catálogo.
 * Función pura y determinista sobre el dataset ya persistido/importado.
 */
import { classifyStockStatus } from "@/lib/catalog-audit/stock";
import { PENDING_NORMALIZATION, type CatalogProduct } from "@/lib/catalog-audit/types";

export type CatalogSummary = {
  totalProducts: number;
  normalizedCategoriesCount: number;
  normalizedSubcategoriesCount: number;
  brandsCount: number;
  vehiclesCount: number;
  productsWithoutPrice: number;
  productsWithoutStock: number;
  productsWithQualityIssues: number;
  lastImportedAt: string | null;
};

export function buildCatalogSummary(products: CatalogProduct[]): CatalogSummary {
  const normalizedCategories = new Set(
    products
      .map((p) => p.normalizedCategory)
      .filter((value) => value !== PENDING_NORMALIZATION),
  );
  const normalizedSubcategories = new Set(
    products
      .map((p) => p.normalizedSubcategory)
      .filter((value) => value !== PENDING_NORMALIZATION),
  );
  const brands = new Set(products.map((p) => p.brand).filter(Boolean));
  const vehicles = new Set(
    products
      .filter((p) => p.compatibleVehicleBrand || p.compatibleVehicleModel)
      .map((p) => `${p.compatibleVehicleBrand}::${p.compatibleVehicleModel}`),
  );

  const productsWithoutPrice = products.filter((p) => p.price === undefined).length;
  const productsWithoutStock = products.filter(
    (p) => classifyStockStatus(p.stockStatus) === "out_of_stock",
  ).length;
  const productsWithQualityIssues = products.filter(
    (p) => p.qualityIssues.length > 0,
  ).length;

  const lastImportedAt = products.reduce<string | null>((latest, p) => {
    if (!latest || p.importedAt > latest) return p.importedAt;
    return latest;
  }, null);

  return {
    totalProducts: products.length,
    normalizedCategoriesCount: normalizedCategories.size,
    normalizedSubcategoriesCount: normalizedSubcategories.size,
    brandsCount: brands.size,
    vehiclesCount: vehicles.size,
    productsWithoutPrice,
    productsWithoutStock,
    productsWithQualityIssues,
    lastImportedAt,
  };
}
