/**
 * Filtros de la pantalla de productos. Funciones puras: reciben el dataset
 * completo y devuelven opciones/resultados, sin tocar el DOM ni estado React.
 */
import { classifyStockStatus, type StockFilterValue } from "@/lib/catalog-audit/stock";
import { PENDING_NORMALIZATION, type CatalogProduct } from "@/lib/catalog-audit/types";

export type CatalogQualityFilter = "" | "con" | "sin";

export type CatalogProductFilters = {
  search: string;
  category: string;
  subcategory: string;
  brand: string;
  vehicle: string;
  stock: StockFilterValue | "";
  quality: CatalogQualityFilter;
};

export const EMPTY_CATALOG_FILTERS: CatalogProductFilters = {
  search: "",
  category: "",
  subcategory: "",
  brand: "",
  vehicle: "",
  stock: "",
  quality: "",
};

export type CatalogFilterOptions = {
  categories: string[];
  subcategories: string[];
  brands: string[];
  vehicles: string[];
};

function vehicleLabel(product: CatalogProduct): string {
  return [product.compatibleVehicleBrand, product.compatibleVehicleModel]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function getCatalogFilterOptions(
  products: CatalogProduct[],
): CatalogFilterOptions {
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const brands = new Set<string>();
  const vehicles = new Set<string>();

  for (const product of products) {
    categories.add(product.normalizedCategory);
    subcategories.add(product.normalizedSubcategory);
    if (product.brand) brands.add(product.brand);
    const vehicle = vehicleLabel(product);
    if (vehicle) vehicles.add(vehicle);
  }

  const sortWithPendingLast = (values: Set<string>) =>
    [...values].sort((a, b) => {
      if (a === PENDING_NORMALIZATION) return 1;
      if (b === PENDING_NORMALIZATION) return -1;
      return a.localeCompare(b, "es");
    });

  return {
    categories: sortWithPendingLast(categories),
    subcategories: sortWithPendingLast(subcategories),
    brands: [...brands].sort((a, b) => a.localeCompare(b, "es")),
    vehicles: [...vehicles].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export function filterCatalogProducts(
  products: CatalogProduct[],
  filters: CatalogProductFilters,
): CatalogProduct[] {
  const search = filters.search.trim().toLowerCase();

  return products.filter((product) => {
    if (search) {
      const haystack = `${product.productName} ${product.sku}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (filters.category && product.normalizedCategory !== filters.category) {
      return false;
    }

    if (
      filters.subcategory &&
      product.normalizedSubcategory !== filters.subcategory
    ) {
      return false;
    }

    if (filters.brand && product.brand !== filters.brand) {
      return false;
    }

    if (filters.vehicle && vehicleLabel(product) !== filters.vehicle) {
      return false;
    }

    if (filters.stock && classifyStockStatus(product.stockStatus) !== filters.stock) {
      return false;
    }

    if (filters.quality === "con" && product.qualityIssues.length === 0) {
      return false;
    }
    if (filters.quality === "sin" && product.qualityIssues.length > 0) {
      return false;
    }

    return true;
  });
}
