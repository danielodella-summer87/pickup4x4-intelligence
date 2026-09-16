/**
 * Calidad de datos del catálogo — reglas deterministas, sin IA externa.
 * Función pura: recibe un producto ya mapeado/normalizado y devuelve la
 * lista de hallazgos. No muta el producto.
 */
import { PENDING_NORMALIZATION, type CatalogProduct, type CatalogQualityIssue } from "@/lib/catalog-audit/types";

let issueCounter = 0;

function nextIssueId(): string {
  issueCounter += 1;
  return `qi-${issueCounter}-${Date.now().toString(36)}`;
}

function issue(
  type: CatalogQualityIssue["type"],
  severity: CatalogQualityIssue["severity"],
  message: string,
  field?: string,
): CatalogQualityIssue {
  return { id: nextIssueId(), type, severity, field, message };
}

function isBlankText(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

/**
 * Evalúa un producto ya construido (originales + normalizados) contra las
 * reglas mínimas de calidad pedidas para esta etapa. No agrega/quita campos:
 * solo lee y reporta.
 */
export function buildCatalogQualityIssues(
  product: Omit<CatalogProduct, "qualityIssues">,
): CatalogQualityIssue[] {
  const issues: CatalogQualityIssue[] = [];

  if (isBlankText(product.originalCategory)) {
    issues.push(
      issue(
        "classification",
        "high",
        "Categoría original faltante en el archivo fuente.",
        "originalCategory",
      ),
    );
  }

  if (isBlankText(product.originalSubcategory)) {
    issues.push(
      issue(
        "classification",
        "high",
        "Subcategoría original faltante en el archivo fuente.",
        "originalSubcategory",
      ),
    );
  }

  if (product.normalizedCategory === PENDING_NORMALIZATION) {
    issues.push(
      issue(
        "classification",
        "medium",
        "Categoría pendiente de normalización: no hay un mapeo confiable todavía.",
        "normalizedCategory",
      ),
    );
  }

  if (product.normalizedSubcategory === PENDING_NORMALIZATION) {
    issues.push(
      issue(
        "classification",
        "medium",
        "Subcategoría pendiente de normalización: no hay un mapeo confiable todavía.",
        "normalizedSubcategory",
      ),
    );
  }

  if (isBlankText(product.sku)) {
    issues.push(issue("missing_field", "high", "SKU faltante.", "sku"));
  }

  if (product.price === undefined) {
    issues.push(
      issue("missing_field", "medium", "Precio faltante.", "price"),
    );
  } else if (isBlankText(product.currency)) {
    issues.push(
      issue("missing_field", "low", "Moneda faltante para un precio informado.", "currency"),
    );
  }

  if (isBlankText(product.productUrl)) {
    issues.push(
      issue("missing_field", "medium", "URL de producto faltante.", "productUrl"),
    );
  }

  if (isBlankText(product.description)) {
    issues.push(
      issue("content", "medium", "Descripción faltante.", "description"),
    );
  }

  const hasVehicleModel = !isBlankText(product.compatibleVehicleModel);
  const hasYearRange =
    product.compatibleYearFrom !== undefined ||
    product.compatibleYearTo !== undefined;
  if (hasVehicleModel && !hasYearRange) {
    issues.push(
      issue(
        "compatibility",
        "medium",
        "Vehículo compatible sin año desde/hasta informado.",
        "compatibleYearFrom",
      ),
    );
  }

  if (!isBlankText(product.sourceNotes)) {
    issues.push(
      issue(
        "inconsistency",
        "low",
        `Observación declarada en el archivo fuente: "${product.sourceNotes}".`,
        "sourceNotes",
      ),
    );
  }

  const seoFields = [
    product.seoTitle,
    product.metaDescription,
    product.h1,
    product.imageAlt,
  ];
  if (seoFields.every((value) => isBlankText(value))) {
    issues.push(
      issue(
        "seo",
        "low",
        "Sin datos SEO (título SEO, meta descripción, H1 o alt de imagen).",
        "seoTitle",
      ),
    );
  }

  return issues;
}

/**
 * Marca duplicados a nivel dataset (mismo SKU no vacío repetido). Se ejecuta
 * después de mapear todas las filas porque necesita ver el conjunto completo.
 */
export function markDuplicateSkus(products: CatalogProduct[]): void {
  const bySku = new Map<string, CatalogProduct[]>();

  for (const product of products) {
    const key = product.sku.trim().toLowerCase();
    if (!key) continue;
    const group = bySku.get(key) ?? [];
    group.push(product);
    bySku.set(key, group);
  }

  for (const group of bySku.values()) {
    if (group.length < 2) continue;
    for (const product of group) {
      product.qualityIssues.push(
        issue(
          "duplicate",
          "high",
          `SKU duplicado: aparece ${group.length} veces en el catálogo importado.`,
          "sku",
        ),
      );
    }
  }
}
