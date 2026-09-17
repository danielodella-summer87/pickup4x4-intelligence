import type { PickupDataset } from "@/lib/excel/build-dataset";
import type { Articulo, CatalogTaxonomy } from "@/lib/models/articulo";
import type { KoreCatalogArticle, KoreCatalogCounts } from "../kore-catalog/repository.ts";
import type { CatalogSourceId, DataMode, DataSourceResolution, DomainSources } from "./sources.ts";

/**
 * Dataset activo con procedencia por dominio (KORE-28). Puro y testeable.
 *
 * legacy → dataset legacy tal cual.
 * mixed  → CATÁLOGO desde KORE normalizado (resolved + activo, taxonomía activa) +
 *          ventas / clientes / aplicaciones legacy. Los joins legacy → catálogo son
 *          explícitos y medidos; nada se borra, reasigna ni fabrica.
 *
 * Sin fallbacks: con catalog=kore, si KORE falla → error; si KORE está vacío → empty.
 * Nunca se usa el catálogo legacy ni mock en su lugar.
 */

export type CatalogStatus = "ready" | "empty" | "error";

export type ActiveDatasetStatus = "ready" | "empty" | "error";

export type ActiveDatasetErrorCode =
  | "SOURCE_CONFIG_INVALID"
  | "MOCK_SOURCE_HAS_NO_SERVER_DATASET"
  | "LEGACY_UNAVAILABLE"
  | "KORE_CATALOG_UNAVAILABLE"
  | "KORE_CATALOG_INCONSISTENT";

export type ActiveDatasetEmptyReason = "LEGACY_EMPTY" | "KORE_CATALOG_EMPTY";

/** Cobertura de joins de dominios legacy contra el catálogo activo (solo conteos). */
export type CatalogJoinMetrics = {
  catalogArticles: number;
  catalogArticlesWithSales: number;
  catalogArticlesWithApplications: number;
  /** Artículos del catálogo activo sin artículo equivalente en el catálogo legacy. */
  catalogOnlyArticles: number;
  /** Artículos del catálogo legacy que el catálogo activo no incluye (no se agregan). */
  legacyCatalogArticlesNotInCatalog: number;
  saleItemsTotal: number;
  saleItemsWithCatalogArticle: number;
  saleItemsWithoutCatalogArticle: number;
  applicationsTotal: number;
  applicationsWithCatalogArticle: number;
  applicationsWithoutCatalogArticle: number;
};

export type DatasetProvenance = {
  mode: DataMode;
  sources: DomainSources;
  catalog: {
    source: CatalogSourceId;
    status: CatalogStatus;
    articleCount: number;
    /** Claves KORE en cuarentena (conflicto) excluidas; null si el catálogo no es KORE. */
    quarantinedExcluded: number | null;
    taxonomy: { familias: number; grupos: number; subgrupos: number } | null;
  };
  joins: CatalogJoinMetrics | null;
};

export type ActiveDatasetLoad = {
  ok: boolean;
  status: ActiveDatasetStatus;
  errorCode: ActiveDatasetErrorCode | null;
  emptyReason: ActiveDatasetEmptyReason | null;
  errorMessage: string | null;
  dataset: PickupDataset | null;
  oportunidades: unknown[];
  generatedAt: string | null;
  importacionId: string | null;
  provenance: DatasetProvenance | null;
};

export type LegacyDatasetLoad = {
  ok: boolean;
  dataset: PickupDataset | null;
  oportunidades: unknown[];
  generatedAt: Date | null;
  importacionId?: string;
  errorMessage?: string;
};

/** Lo que el loader necesita del repository (server-only) de catálogo KORE. */
export type KoreCatalogPort = {
  listEligibleArticles(): Promise<KoreCatalogArticle[]>;
  listActiveTaxonomy(): Promise<CatalogTaxonomy>;
  countArticles(): Promise<KoreCatalogCounts>;
};

export type ActiveDatasetDeps = {
  resolution: DataSourceResolution;
  loadLegacy: () => Promise<LegacyDatasetLoad>;
  /** null si el repository no puede construirse (p. ej. service role ausente). */
  koreCatalog: () => KoreCatalogPort | null;
  emptyLegacyDataset: () => PickupDataset;
};

const blank = (value: string | null): string | undefined => (value === null || value.trim() === "" ? undefined : value);

/**
 * KoreArticulo → Articulo de la app. Solo campos con fuente KORE:
 * - codigoUnico, descripcion                  → CODIGOUNICO, DESCRIPCION
 * - rubro, categoria                          → CODIGOFAMILIA, CODIGOGRUPO (mismo código que el
 *   Excel legacy "Familia"/"Grupo": 100% igual en la reconciliación KORE-28)
 * - activo                                    → NOT DESHABILITADO (Excel legacy: "Activo"/"Habilitado")
 * NOT_AVAILABLE en KORE catálogo (no se fabrican): marcaArticulo, stock, precioLista, unidadMedida.
 */
export function koreArticleToArticulo(article: KoreCatalogArticle): Articulo {
  return {
    codigoUnico: article.codigoUnico,
    descripcion: article.descripcion,
    rubro: blank(article.codigoFamilia),
    categoria: blank(article.codigoGrupo),
    activo: article.deshabilitado !== 1,
  };
}

/** Métricas de join dominio legacy → catálogo activo (exacto por codigoUnico, igual que la app). */
export function computeCatalogJoinMetrics(
  catalog: readonly Pick<Articulo, "codigoUnico">[],
  legacy: Pick<PickupDataset, "ventaItems" | "aplicaciones">,
  legacyCatalogCodes: ReadonlySet<string>,
): CatalogJoinMetrics {
  const catalogCodes = new Set(catalog.map((article) => article.codigoUnico));
  const soldCodes = new Set<string>();
  let saleItemsWithCatalogArticle = 0;
  for (const item of legacy.ventaItems) {
    if (catalogCodes.has(item.codigoUnico)) {
      saleItemsWithCatalogArticle++;
      soldCodes.add(item.codigoUnico);
    }
  }
  const appliedCodes = new Set<string>();
  let applicationsWithCatalogArticle = 0;
  for (const application of legacy.aplicaciones) {
    if (catalogCodes.has(application.codigoUnico)) {
      applicationsWithCatalogArticle++;
      appliedCodes.add(application.codigoUnico);
    }
  }
  let catalogOnlyArticles = 0;
  for (const code of catalogCodes) if (!legacyCatalogCodes.has(code)) catalogOnlyArticles++;
  let legacyCatalogArticlesNotInCatalog = 0;
  for (const code of legacyCatalogCodes) if (!catalogCodes.has(code)) legacyCatalogArticlesNotInCatalog++;

  return {
    catalogArticles: catalogCodes.size,
    catalogArticlesWithSales: soldCodes.size,
    catalogArticlesWithApplications: appliedCodes.size,
    catalogOnlyArticles,
    legacyCatalogArticlesNotInCatalog,
    saleItemsTotal: legacy.ventaItems.length,
    saleItemsWithCatalogArticle,
    saleItemsWithoutCatalogArticle: legacy.ventaItems.length - saleItemsWithCatalogArticle,
    applicationsTotal: legacy.aplicaciones.length,
    applicationsWithCatalogArticle,
    applicationsWithoutCatalogArticle: legacy.aplicaciones.length - applicationsWithCatalogArticle,
  };
}

/**
 * Dataset mixto: catálogo KORE + dominios legacy sin modificar. Ventas/aplicaciones que no
 * matchean el catálogo se conservan tal cual (huérfanas medidas, sin artículo artificial).
 */
export function composeMixedDataset(legacy: PickupDataset, articles: readonly KoreCatalogArticle[], taxonomy: CatalogTaxonomy): PickupDataset {
  const articulos = articles.map(koreArticleToArticulo);
  return {
    ...legacy,
    articulos,
    catalogTaxonomy: taxonomy,
    stats: { ...legacy.stats, articulosUnicos: articulos.length },
  };
}

function failure(code: ActiveDatasetErrorCode, message: string, provenance: DatasetProvenance | null = null): ActiveDatasetLoad {
  return {
    ok: false,
    status: "error",
    errorCode: code,
    emptyReason: null,
    errorMessage: message,
    dataset: null,
    oportunidades: [],
    generatedAt: null,
    importacionId: null,
    provenance,
  };
}

function empty(reason: ActiveDatasetEmptyReason, provenance: DatasetProvenance | null): ActiveDatasetLoad {
  return {
    ok: true,
    status: "empty",
    errorCode: null,
    emptyReason: reason,
    errorMessage: null,
    dataset: null,
    oportunidades: [],
    generatedAt: null,
    importacionId: null,
    provenance,
  };
}

function baseProvenance(mode: DataMode, sources: DomainSources, status: CatalogStatus): DatasetProvenance {
  return {
    mode,
    sources,
    catalog: { source: sources.catalog, status, articleCount: 0, quarantinedExcluded: null, taxonomy: null },
    joins: null,
  };
}

/** Orquesta la carga server-side según la configuración resuelta. Sin fallbacks entre fuentes. */
export async function loadActiveDataset(deps: ActiveDatasetDeps): Promise<ActiveDatasetLoad> {
  const { resolution } = deps;
  if (!resolution.ok) return failure("SOURCE_CONFIG_INVALID", `Configuración de fuentes inválida (${resolution.code}).`);
  if (resolution.mode === "mock") {
    return failure("MOCK_SOURCE_HAS_NO_SERVER_DATASET", "La fuente mock explícita no se carga desde el servidor.");
  }

  const { mode, sources } = resolution;

  if (mode === "legacy") {
    const legacy = await deps.loadLegacy();
    if (!legacy.ok) return failure("LEGACY_UNAVAILABLE", legacy.errorMessage ?? "No se pudo cargar la fuente legacy.", baseProvenance(mode, sources, "error"));
    if (!legacy.dataset) return empty("LEGACY_EMPTY", baseProvenance(mode, sources, "empty"));
    const legacyCodes = new Set(legacy.dataset.articulos.map((article) => article.codigoUnico));
    const provenance = baseProvenance(mode, sources, legacy.dataset.articulos.length > 0 ? "ready" : "empty");
    provenance.catalog.articleCount = legacy.dataset.articulos.length;
    provenance.joins = computeCatalogJoinMetrics(legacy.dataset.articulos, legacy.dataset, legacyCodes);
    return {
      ok: true,
      status: "ready",
      errorCode: null,
      emptyReason: null,
      errorMessage: null,
      dataset: legacy.dataset,
      oportunidades: legacy.oportunidades,
      generatedAt: legacy.generatedAt?.toISOString() ?? null,
      importacionId: legacy.importacionId ?? null,
      provenance,
    };
  }

  // ── mixed: catálogo KORE normalizado + resto legacy ──
  const kore = deps.koreCatalog();
  if (!kore) return failure("KORE_CATALOG_UNAVAILABLE", "Catálogo KORE no disponible en el servidor.", baseProvenance(mode, sources, "error"));

  const [legacyResult, articlesResult, taxonomyResult, countsResult] = await Promise.allSettled([
    deps.loadLegacy(),
    kore.listEligibleArticles(),
    kore.listActiveTaxonomy(),
    kore.countArticles(),
  ]);

  if (articlesResult.status === "rejected" || taxonomyResult.status === "rejected" || countsResult.status === "rejected") {
    return failure("KORE_CATALOG_UNAVAILABLE", "No se pudo leer el catálogo KORE.", baseProvenance(mode, sources, "error"));
  }
  const articles = articlesResult.value;
  const taxonomy = taxonomyResult.value;
  const counts = countsResult.value;
  if (counts.eligible !== articles.length) {
    return failure("KORE_CATALOG_INCONSISTENT", "El conteo del catálogo KORE no coincide con los artículos leídos.", baseProvenance(mode, sources, "error"));
  }

  if (legacyResult.status === "rejected" || !legacyResult.value.ok) {
    const message = legacyResult.status === "fulfilled" ? legacyResult.value.errorMessage : undefined;
    return failure("LEGACY_UNAVAILABLE", message ?? "No se pudieron cargar ventas/clientes/aplicaciones legacy.", baseProvenance(mode, sources, "ready"));
  }
  const legacy = legacyResult.value;

  const taxonomyCounts = { familias: taxonomy.familias.length, grupos: taxonomy.grupos.length, subgrupos: taxonomy.subgrupos.length };
  if (articles.length === 0) {
    const provenance = baseProvenance(mode, sources, "empty");
    provenance.catalog.quarantinedExcluded = counts.quarantined;
    provenance.catalog.taxonomy = taxonomyCounts;
    return empty("KORE_CATALOG_EMPTY", provenance);
  }

  const base = legacy.dataset ?? deps.emptyLegacyDataset();
  const dataset = composeMixedDataset(base, articles, taxonomy);
  const legacyCodes = new Set((legacy.dataset?.articulos ?? []).map((article) => article.codigoUnico));

  const provenance = baseProvenance(mode, sources, "ready");
  provenance.catalog.articleCount = dataset.articulos.length;
  provenance.catalog.quarantinedExcluded = counts.quarantined;
  provenance.catalog.taxonomy = taxonomyCounts;
  provenance.joins = computeCatalogJoinMetrics(dataset.articulos, dataset, legacyCodes);

  return {
    ok: true,
    status: "ready",
    errorCode: null,
    emptyReason: null,
    errorMessage: null,
    dataset,
    oportunidades: legacy.oportunidades,
    generatedAt: legacy.generatedAt?.toISOString() ?? null,
    importacionId: legacy.importacionId ?? null,
    provenance,
  };
}
