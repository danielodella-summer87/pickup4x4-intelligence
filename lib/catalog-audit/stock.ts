/**
 * Interpretación genérica del estado de stock de un catálogo externo.
 * Acepta texto libre ("En stock", "Agotado") o cantidades numéricas.
 */

export type StockFilterValue = "in_stock" | "out_of_stock" | "unknown";

const OUT_OF_STOCK_KEYWORDS = [
  "sin stock",
  "agotado",
  "sin existencia",
  "out of stock",
  "no disponible",
  "descontinuado",
  "unavailable",
];

const IN_STOCK_KEYWORDS = [
  "en stock",
  "disponible",
  "in stock",
  "con stock",
  "available",
];

export function classifyStockStatus(raw: string): StockFilterValue {
  const text = raw.trim().toLowerCase();
  if (!text) return "unknown";

  if (OUT_OF_STOCK_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "out_of_stock";
  }
  if (IN_STOCK_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "in_stock";
  }

  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric)) {
    return numeric > 0 ? "in_stock" : "out_of_stock";
  }

  return "unknown";
}

export const STOCK_FILTER_LABELS: Record<StockFilterValue, string> = {
  in_stock: "Con stock",
  out_of_stock: "Sin stock",
  unknown: "Sin información",
};
