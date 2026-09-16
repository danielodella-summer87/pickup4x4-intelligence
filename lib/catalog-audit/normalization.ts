/**
 * Normalización de categoría/subcategoría de catálogo.
 *
 * Determinista y local (sin IA externa). Reutiliza `normalizeKey` y
 * `stringSimilarity` de lib/excel/normalization para no duplicar el
 * algoritmo de comparación difusa ya validado con marca/modelo/localidad.
 *
 * Regla dura: si no hay un match confiable, NO se inventa un valor. El
 * resultado queda como PENDING_NORMALIZATION y el llamador debe generar un
 * hallazgo de calidad "classification".
 */
import { normalizeKey, stringSimilarity } from "@/lib/excel/normalization";
import { PENDING_NORMALIZATION } from "@/lib/catalog-audit/types";

const SIMILARITY_THRESHOLD = 0.86;

/**
 * Taxonomía genérica de rubros de repuestos automotor (industria en general,
 * no específica de ProtecCar) usada como diccionario best-effort. Cualquier
 * valor que no matchee queda "Pendiente de normalización".
 */
const CATEGORY_CANONICAL: Record<string, string> = {
  suspension: "Suspensión",
  "suspension delantera": "Suspensión",
  "suspension trasera": "Suspensión",
  frenos: "Frenos",
  motor: "Motor",
  "repuestos de motor": "Motor",
  transmision: "Transmisión",
  direccion: "Dirección",
  electrico: "Eléctrico",
  electricidad: "Eléctrico",
  carroceria: "Carrocería",
  accesorios: "Accesorios",
  "lubricantes y filtros": "Lubricantes y Filtros",
  lubricantes: "Lubricantes y Filtros",
  filtros: "Lubricantes y Filtros",
  iluminacion: "Iluminación",
  climatizacion: "Climatización",
  "aire acondicionado": "Climatización",
  escape: "Escape",
  "sistema de escape": "Escape",
  neumaticos: "Neumáticos y Llantas",
  llantas: "Neumáticos y Llantas",
  "correas y tensores": "Correas y Tensores",
  correas: "Correas y Tensores",
  refrigeracion: "Refrigeración",
  "sistema de refrigeracion": "Refrigeración",
  embrague: "Embrague",
  amortiguacion: "Suspensión",
};

const SUBCATEGORY_CANONICAL: Record<string, string> = {
  amortiguadores: "Amortiguadores",
  rotulas: "Rótulas",
  "rotulas de direccion": "Rótulas de Dirección",
  "rotulas de suspension": "Rótulas de Suspensión",
  bujes: "Bujes",
  "terminales de direccion": "Terminales de Dirección",
  "discos de freno": "Discos de Freno",
  "pastillas de freno": "Pastillas de Freno",
  "cintas de freno": "Cintas de Freno",
  "cruces cardanicos": "Cruces Cardánicos",
  "kit de embrague": "Kit de Embrague",
  "filtros de aceite": "Filtros de Aceite",
  "filtros de aire": "Filtros de Aire",
  "filtros de combustible": "Filtros de Combustible",
  "bombas de agua": "Bombas de Agua",
  radiadores: "Radiadores",
  "correas de distribucion": "Correas de Distribución",
  "correas poly-v": "Correas Poly-V",
  "kit de distribucion": "Kit de Distribución",
  "bujias": "Bujías",
  baterias: "Baterías",
  alternadores: "Alternadores",
  "motores de arranque": "Motores de Arranque",
};

export type CatalogNormalizationField = "category" | "subcategory";

export type CatalogNormalizationResult = {
  canonical: string | null;
  method: "exact" | "similarity" | "rejected";
};

function matchDictionary(
  original: string,
  dictionary: Record<string, string>,
): CatalogNormalizationResult {
  const trimmed = original.trim();
  if (!trimmed) {
    return { canonical: null, method: "rejected" };
  }

  const key = normalizeKey(trimmed);
  const direct = dictionary[key];
  if (direct) {
    return { canonical: direct, method: "exact" };
  }

  const candidates = [...new Set(Object.values(dictionary))];
  let best: { canonical: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = stringSimilarity(trimmed, candidate);
    if (!best || score > best.score) {
      best = { canonical: candidate, score };
    }
  }

  if (best && best.score >= SIMILARITY_THRESHOLD) {
    return { canonical: best.canonical, method: "similarity" };
  }

  return { canonical: null, method: "rejected" };
}

export function normalizeCatalogCategory(
  original: string,
): CatalogNormalizationResult {
  return matchDictionary(original, CATEGORY_CANONICAL);
}

export function normalizeCatalogSubcategory(
  original: string,
): CatalogNormalizationResult {
  return matchDictionary(original, SUBCATEGORY_CANONICAL);
}

/** Aplica la normalización y devuelve el string final a persistir en el producto. */
export function resolveNormalizedValue(
  original: string,
  field: CatalogNormalizationField,
): string {
  const result =
    field === "category"
      ? normalizeCatalogCategory(original)
      : normalizeCatalogSubcategory(original);

  return result.canonical ?? PENDING_NORMALIZATION;
}
