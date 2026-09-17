import type { KoreArticulo } from "../kore/articulos.ts";
import type { KoreFamilia, KoreGrupo, KoreSubgrupo } from "../kore/taxonomia.ts";

/**
 * Contratos internos del shadow sync KORE → Supabase.
 *
 * Separación de responsabilidades:
 * - lib/kore       → hablar con KORE (read-only, allowlist, parsers estrictos).
 * - lib/kore-sync  → orquestar sync + persistencia shadow.
 *
 * Nada de lib/kore-sync debe importarse desde app/, components/ ni contexts/.
 */

/** Únicas tablas en las que el shadow sync puede escribir. */
export const KORE_SHADOW_TABLES = [
  "kore_sync_runs",
  "kore_raw_familias",
  "kore_raw_grupos",
  "kore_raw_subgrupos",
  "kore_raw_articulos",
  "kore_familias",
  "kore_grupos",
  "kore_subgrupos",
  "kore_articulos",
  "kore_article_identity_conflicts",
] as const;

export type KoreShadowTable = (typeof KORE_SHADOW_TABLES)[number];
export type KoreEntityTable = Exclude<KoreShadowTable, "kore_sync_runs">;

export function isKoreShadowTable(table: string): table is KoreShadowTable {
  return (KORE_SHADOW_TABLES as readonly string[]).includes(table);
}

/** Fila existente, cargada para decidir created/updated/unchanged. */
export type ExistingRow = {
  id: string;
  /** null solo en kore_articulos con identity_status = conflict. */
  contentHash: string | null;
  firstSeenAt: string;
};

/** Variante RAW de artículo existente (identidad física = source_variant_key). */
export type ExistingArticleVariant = ExistingRow & { sourceKey: string; observedOccurrences: number };

export type ArticleIdentityStatus = "resolved" | "conflict";

/** Artículo NORMALIZED existente (una fila por source_key). */
export type ExistingNormalizedArticle = ExistingRow & { identityStatus: ArticleIdentityStatus; identityConflictSince: string | null };

export type IdentityConflictStatus = "open" | "resolved";

/** Conflicto de identidad existente (una fila por source_key). */
export type ExistingIdentityConflict = { id: string; firstSeenAt: string; status: IdentityConflictStatus };

/** Columna de conflicto del upsert. RAW de artículos usa la identidad de variante. */
export type UpsertConflictColumn = "source_key" | "source_variant_key";

export type SyncRunStatus = "running" | "completed" | "failed" | "partial";

export type NewSyncRun = {
  source: "kore";
  operation_group: string;
  sync_mode: string;
  status: "running";
  started_at: string;
};

export type SyncRunPatch = {
  status: Exclude<SyncRunStatus, "running">;
  completed_at: string;
  rows_received: number;
  rows_created: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_rejected: number;
  requests_attempted: number;
  requests_succeeded: number;
  requests_failed: number;
  error_category: string | null;
  metrics: Record<string, unknown>;
};

export type ShadowRow = Record<string, unknown> & { source_key: string };

/** Persistencia shadow. Implementaciones: Supabase (runner real) y memoria (tests). */
export interface ShadowStore {
  createRun(run: NewSyncRun): Promise<string>;
  finishRun(id: string, patch: SyncRunPatch): Promise<void>;
  /** source_key → fila existente de taxonomía (paginado; sin valores de negocio). */
  loadIndex(table: KoreEntityTable): Promise<Map<string, ExistingRow>>;
  /** source_variant_key → variante RAW de artículo existente. */
  loadArticleVariantIndex(): Promise<Map<string, ExistingArticleVariant>>;
  /** source_key → artículo NORMALIZED existente. */
  loadArticleIndex(): Promise<Map<string, ExistingNormalizedArticle>>;
  /** source_key → conflicto de identidad existente (open o resolved). */
  loadIdentityConflictIndex(): Promise<Map<string, ExistingIdentityConflict>>;
  /** Upsert por `onConflict` (default source_key). Devuelve valor de esa columna → id. */
  upsertRows(table: KoreEntityTable, rows: readonly ShadowRow[], onConflict?: UpsertConflictColumn): Promise<Map<string, string>>;
  /** Marca missing_since en filas no observadas por `runId` y aún no marcadas. Devuelve cantidad. */
  markMissing(table: KoreEntityTable, runColumn: "sync_run_id" | "last_sync_run_id", runId: string, at: string): Promise<number>;
}

/** Lectura read-only del catálogo legacy, solo para reconciliación por conteos. */
export interface LegacyCatalogReader {
  /** Códigos únicos del catálogo actual, o null si no está disponible. */
  loadLegacyArticleCodes(): Promise<string[] | null>;
}

/** Fuente KORE del catálogo. La implementación real usa lib/kore/service.ts. */
export interface KoreCatalogSource {
  listFamilias(): Promise<KoreFamilia[]>;
  listGrupos(): Promise<KoreGrupo[]>;
  listSubgrupos(): Promise<KoreSubgrupo[]>;
  /** SYNC_ONLY_FULL_SNAPSHOT: ListarArticulos sin filtros (1 request, catálogo completo). */
  listArticulosFullSnapshot(): Promise<KoreArticulo[]>;
  /** POST HTTP intentados hasta el momento. */
  requestsAttempted(): number;
}

export type { KoreArticulo, KoreFamilia, KoreGrupo, KoreSubgrupo };
