import { KoreError } from "../kore/errors.ts";
import { canonicalJson, contentHash, sourceKey, sourceVariantKey } from "./hash.ts";
import { articuloEntity, familiaEntity, grupoEntity, normalizedRow, rawRow, subgrupoEntity } from "./rows.ts";
import type { EntityRows, RowOutcome } from "./rows.ts";
import type {
  ExistingRow,
  KoreArticulo,
  KoreCatalogSource,
  KoreEntityTable,
  KoreFamilia,
  LegacyCatalogReader,
  ShadowRow,
  ShadowStore,
  SyncRunStatus,
} from "./types.ts";

/**
 * Shadow sync del catálogo KORE (taxonomía + artículos) → Supabase.
 *
 * Estrategia (KORE-25): exactamente 4 requests, seriales, 0 reintentos.
 *   1. ListarFamilias   2. ListarGrupos   3. ListarSubgrupos
 *   4. ListarArticulos FULL SNAPSHOT (SYNC_ONLY_FULL_SNAPSHOT, sin filtros, tope 25 MB)
 *
 * Identidad de artículos (KORE-26): CODIGOUNICO NO es único en el contrato real.
 *   RAW         una fila por variante source (source_key + content_hash); los duplicados
 *               exactos colapsan en una variante con observed_occurrences.
 *   NORMALIZED  una fila por source_key:
 *                 1 variante  → identity_status = resolved (materializada)
 *                 >1 variante → identity_status = conflict (cuarentena: sin elegir
 *                               variante, sin mergear, contenido null)
 *   CONFLICTS   kore_article_identity_conflicts: solo nombres de fields que difieren.
 *               Un conflicto que deja de reproducirse queda open (no se infiere cuál
 *               variante era la correcta) y la clave sigue en cuarentena.
 *
 * Flujo:
 *   - crear sync run (running)
 *   - taxonomía (3 requests) → persistir RAW + NORMALIZED → snapshot completo → missing
 *   - snapshot de artículos (1 request) → verificar requests === 4
 *   - analizar identidad → RAW (variantes) → CONFLICTS → NORMALIZED → missing → reconciliación
 *
 * Estados:
 *   completed → 4 requests OK, snapshot persistido, 0 claves en cuarentena.
 *   partial   → 4 requests OK, snapshot RAW completo y persistido, pero ≥1 clave NORMALIZED
 *               en conflict (error_category KORE_IDENTITY_CONFLICT). NO apto para cutover
 *               de esas claves.
 *   failed    → falla de request, snapshot demasiado grande, datos inconsistentes, error de
 *               persistencia o conteo de requests inesperado. Nunca se marca missing de
 *               artículos si el snapshot no se persistió completo.
 *
 * Presencia ≠ resolución de identidad: una clave conflictiva PRESENTE no es missing.
 *
 * Nunca registra valores de negocio: solo conteos, categorías y nombres de fields.
 */

export const EXPECTED_REQUESTS = 4;
/** Alcance del request que observó una fila RAW de artículo (sin filtro de familia). */
export const KORE_FULL_SNAPSHOT_SCOPE = "*FULL_SNAPSHOT*";
export const KORE_IDENTITY_CONFLICT = "KORE_IDENTITY_CONFLICT";

/** Los 11 fields source de ListarArticulos (mismo contrato que lib/kore/articulos.ts). */
export const ARTICLE_SOURCE_FIELDS = [
  "CODIGOUNICO",
  "CODIGOFAMILIA",
  "CODIGOGRUPO",
  "CODIGOSUBGRUPO",
  "DESCRIPCION",
  "BASICO",
  "MINIMO",
  "EXENTO",
  "DESHABILITADO",
  "CONTROLASTOCK",
  "OBSERVACIONES",
] as const;
export type ArticleSourceField = (typeof ARTICLE_SOURCE_FIELDS)[number];

/** Columna RAW → field source KORE (las formas raw y normalizada del mismo tag comparten field). */
const SOURCE_FIELD_BY_RAW_COLUMN: Record<string, ArticleSourceField> = {
  codigo_unico: "CODIGOUNICO",
  codigo_unico_raw: "CODIGOUNICO",
  codigo_familia: "CODIGOFAMILIA",
  codigo_familia_raw: "CODIGOFAMILIA",
  codigo_grupo: "CODIGOGRUPO",
  codigo_grupo_raw: "CODIGOGRUPO",
  codigo_subgrupo: "CODIGOSUBGRUPO",
  codigo_subgrupo_raw: "CODIGOSUBGRUPO",
  descripcion: "DESCRIPCION",
  basico: "BASICO",
  minimo: "MINIMO",
  exento: "EXENTO",
  deshabilitado: "DESHABILITADO",
  controla_stock: "CONTROLASTOCK",
  observaciones: "OBSERVACIONES",
};

export type CatalogSyncOptions = {
  source: KoreCatalogSource;
  store: ShadowStore;
  legacy?: LegacyCatalogReader;
  now?: () => string;
};

type Counts = { created: number; updated: number; unchanged: number };

export type CatalogSyncResult = {
  runId: string;
  status: Exclude<SyncRunStatus, "running">;
  errorCategory: string | null;
  metrics: CatalogSyncMetrics;
};

/** Resumen seguro de un conflicto: sin source_key ni valores. */
export type IdentityConflictSummary = { variantCount: number; differingFieldNames: ArticleSourceField[] };

export type CatalogSyncMetrics = {
  strategy: "full_snapshot";
  taxonomy: {
    familias: number;
    grupos: number;
    subgrupos: number;
    blankFamilies: number;
    duplicateFamilyKeys: number;
    orphanGrupos: number;
    orphanSubgrupos: number;
  };
  articles: {
    articleRowsReceived: number;
    distinctArticleKeys: number;
    duplicateArticleKeys: number;
    exactDuplicateRows: number;
    conflictingDuplicateKeys: number;
    rawVariantsPersisted: number;
    resolvedNormalizedKeys: number;
    conflictNormalizedKeys: number;
    blankFamilyArticles: number;
    articlesWithoutFamilyField: number;
    snapshotComplete: boolean;
  };
  identity: {
    /** Conflictos reproducidos en este snapshot (orden de aparición; sin claves). */
    conflicts: IdentityConflictSummary[];
    conflictsNew: number;
    conflictsRepeated: number;
    conflictsReopened: number;
    /** CONFLICT_NO_LONGER_REPRODUCED: conflictos open que este snapshot no reproduce (siguen open). */
    conflictNoLongerReproduced: number;
  };
  persistence: { raw: Counts; normalized: Counts; perTable: Record<string, Counts> };
  missing: { markedPerTable: Record<string, number>; articlesMissingEvaluated: boolean };
  relations: {
    matched: number;
    partial: number;
    unmatched: number;
    familyMatched: number;
    familyUnmatched: number;
    familyAbsent: number;
    groupMatched: number;
    groupUnmatched: number;
    groupAbsent: number;
    subgroupMatched: number;
    subgroupUnmatched: number;
    subgroupAbsent: number;
  };
  network: { expectedRequests: number; actualRequests: number; requestsSucceeded: number; requestsFailed: number };
  reconciliation: {
    available: boolean;
    comparisonMethod: string;
    koreArticles: number;
    legacyArticles: number;
    intersection: number;
    koreOnly: number;
    legacyOnly: number;
  } | null;
};

export class SyncAbort extends Error {
  readonly category: string;
  constructor(category: string, message: string) {
    super(message);
    this.name = "SyncAbort";
    this.category = category;
  }
}

function errorCategory(error: unknown): string {
  if (error instanceof SyncAbort) return error.category;
  if (error instanceof KoreError) return error.kind === "response_too_large" ? "KORE_SNAPSHOT_TOO_LARGE" : `KORE_${error.kind.toUpperCase()}`;
  return "UNEXPECTED_ERROR";
}

function emptyCounts(): Counts {
  return { created: 0, updated: 0, unchanged: 0 };
}

function newMetrics(): CatalogSyncMetrics {
  return {
    strategy: "full_snapshot",
    taxonomy: { familias: 0, grupos: 0, subgrupos: 0, blankFamilies: 0, duplicateFamilyKeys: 0, orphanGrupos: 0, orphanSubgrupos: 0 },
    articles: {
      articleRowsReceived: 0,
      distinctArticleKeys: 0,
      duplicateArticleKeys: 0,
      exactDuplicateRows: 0,
      conflictingDuplicateKeys: 0,
      rawVariantsPersisted: 0,
      resolvedNormalizedKeys: 0,
      conflictNormalizedKeys: 0,
      blankFamilyArticles: 0,
      articlesWithoutFamilyField: 0,
      snapshotComplete: false,
    },
    identity: { conflicts: [], conflictsNew: 0, conflictsRepeated: 0, conflictsReopened: 0, conflictNoLongerReproduced: 0 },
    persistence: { raw: emptyCounts(), normalized: emptyCounts(), perTable: {} },
    missing: { markedPerTable: {}, articlesMissingEvaluated: false },
    relations: {
      matched: 0,
      partial: 0,
      unmatched: 0,
      familyMatched: 0,
      familyUnmatched: 0,
      familyAbsent: 0,
      groupMatched: 0,
      groupUnmatched: 0,
      groupAbsent: 0,
      subgroupMatched: 0,
      subgroupUnmatched: 0,
      subgroupAbsent: 0,
    },
    network: { expectedRequests: EXPECTED_REQUESTS, actualRequests: 0, requestsSucceeded: 0, requestsFailed: 0 },
    reconciliation: null,
  };
}

/** Familias: duplicados idénticos se cuentan; contenido distinto para la misma clave → FAIL. Blank se cuenta (no bloquea). */
export function analyzeFamilies(familias: readonly KoreFamilia[]): { blankFamilies: number; duplicateFamilyKeys: number } {
  const byKey = new Map<string, string>();
  let duplicateFamilyKeys = 0;
  let blankFamilies = 0;
  for (const familia of familias) {
    const content = canonicalJson(familia);
    const previous = byKey.get(familia.codigoFamilia);
    if (previous !== undefined) {
      if (previous !== content) throw new SyncAbort("CONFLICTING_DUPLICATE_FAMILY", "Familias con la misma clave natural y contenido distinto");
      duplicateFamilyKeys++;
      continue;
    }
    byKey.set(familia.codigoFamilia, content);
    if (familia.codigoFamilia === "") blankFamilies++;
  }
  return { blankFamilies, duplicateFamilyKeys };
}

/** Variante source de un artículo: mismo source_key + mismo content_hash (duplicados exactos colapsados). */
export type ArticleVariant = {
  articulo: KoreArticulo;
  entity: EntityRows;
  contentHash: string;
  variantKey: string;
  occurrences: number;
};

/** Identidad de una source_key del snapshot. */
export type ArticleKeyIdentity = {
  key: string;
  codigoUnico: string;
  /** En orden de primera aparición. */
  variants: ArticleVariant[];
  /** Vacío si hay una sola variante. Solo nombres de fields source. */
  differingFields: ArticleSourceField[];
};

export type ArticleIdentityAnalysis = {
  /** En orden de primera aparición. */
  keys: ArticleKeyIdentity[];
  distinctArticleKeys: number;
  duplicateArticleKeys: number;
  exactDuplicateRows: number;
  conflictingDuplicateKeys: number;
  rawVariants: number;
};

/** Nombres de los fields source que difieren entre variantes (sin valores). */
export function differingSourceFields(variants: readonly Pick<ArticleVariant, "entity">[]): ArticleSourceField[] {
  const fields = new Set<ArticleSourceField>();
  const columns = new Set(variants.flatMap((variant) => Object.keys(variant.entity.rawContent)));
  for (const column of columns) {
    const field = SOURCE_FIELD_BY_RAW_COLUMN[column];
    if (!field) throw new SyncAbort("UNMAPPED_ARTICLE_FIELD", "Columna RAW de artículo sin field source");
    const values = new Set(variants.map((variant) => canonicalJson(variant.entity.rawContent[column] ?? null)));
    if (values.size > 1) fields.add(field);
  }
  return ARTICLE_SOURCE_FIELDS.filter((field) => fields.has(field));
}

/**
 * Identidad del snapshot por source_key (codigoUnico normalizado). Solo en lib/kore-sync:
 * lib/kore devuelve todas las filas del servidor, en orden y sin deduplicar.
 *
 * Por fila se calcula el content_hash canónico del contenido source (el mismo hash RAW
 * persistido; sin sync_run_id, timestamps ni metadata):
 * - mismo key + mismo hash → misma variante (occurrences++, duplicado exacto).
 * - mismo key + >1 hash    → conflicto de identidad: se preservan TODAS las variantes; no se
 *                            elige first/last ni se mezclan campos.
 */
export function analyzeArticleIdentity(articulos: readonly KoreArticulo[]): ArticleIdentityAnalysis {
  const byKey = new Map<string, { codigoUnico: string; variants: Map<string, ArticleVariant> }>();
  for (const articulo of articulos) {
    const entity = articuloEntity(articulo);
    const hash = contentHash(entity.rawContent);
    let group = byKey.get(entity.key);
    if (!group) byKey.set(entity.key, (group = { codigoUnico: articulo.codigoUnico, variants: new Map() }));
    const variant = group.variants.get(hash);
    if (variant) variant.occurrences++;
    else group.variants.set(hash, { articulo, entity, contentHash: hash, variantKey: sourceVariantKey(entity.key, hash), occurrences: 1 });
  }

  const keys: ArticleKeyIdentity[] = [];
  let duplicateArticleKeys = 0;
  let exactDuplicateRows = 0;
  let conflictingDuplicateKeys = 0;
  let rawVariants = 0;
  for (const [key, group] of byKey) {
    const variants = [...group.variants.values()];
    const rows = variants.reduce((sum, variant) => sum + variant.occurrences, 0);
    if (rows > 1) duplicateArticleKeys++;
    exactDuplicateRows += rows - variants.length;
    rawVariants += variants.length;
    const conflicting = variants.length > 1;
    if (conflicting) conflictingDuplicateKeys++;
    keys.push({ key, codigoUnico: group.codigoUnico, variants, differingFields: conflicting ? differingSourceFields(variants) : [] });
  }
  return { keys, distinctArticleKeys: keys.length, duplicateArticleKeys, exactDuplicateRows, conflictingDuplicateKeys, rawVariants };
}

function addCounts(target: Counts, outcome: RowOutcome): void {
  target[outcome]++;
}

/** Normalización REAL del importer legacy (lib/excel/normalizers.ts → normalizeText): colapsa whitespace y trim. */
export function legacyComparableCode(code: string): string {
  return code.replace(/\s+/g, " ").trim();
}

export const RECONCILIATION_METHOD = "legacy importer normalizeText (whitespace colapsado + trim), comparación exacta case-sensitive";

export async function runCatalogShadowSync(options: CatalogSyncOptions): Promise<CatalogSyncResult> {
  const { source, store, legacy } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const metrics = newMetrics();

  const runId = await store.createRun({
    source: "kore",
    operation_group: "catalog",
    sync_mode: "shadow_snapshot",
    status: "running",
    started_at: now(),
  });

  let status: Exclude<SyncRunStatus, "running"> = "failed";
  let category: string | null = null;
  const koreArticleCodes = new Set<string>();

  const tableCounts = (table: KoreEntityTable): Counts => (metrics.persistence.perTable[table] ??= emptyCounts());

  async function guardedStore<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SyncAbort) throw error;
      throw new SyncAbort("PERSISTENCE_ERROR", "Error de persistencia shadow");
    }
  }

  async function sourceCall<T>(action: () => Promise<T>): Promise<T> {
    try {
      const value = await action();
      metrics.network.requestsSucceeded++;
      return value;
    } catch (error) {
      metrics.network.requestsFailed++;
      throw error;
    }
  }

  function assertIds(ids: Map<string, string>, keys: readonly string[], layer: string): void {
    for (const key of keys) if (!ids.get(key)) throw new SyncAbort("PERSISTENCE_ERROR", `Upsert ${layer} sin id devuelto`);
  }

  /** Persiste entidades de taxonomía RAW + NORMALIZED. Devuelve clave natural → id normalizado. */
  async function persistEntities(
    rawTable: KoreEntityTable,
    normalizedTable: KoreEntityTable,
    entities: readonly EntityRows[],
    relations: (entity: EntityRows) => Record<string, string | null>,
  ): Promise<Map<string, string>> {
    const rawIndex: Map<string, ExistingRow> = await guardedStore(() => store.loadIndex(rawTable));
    const normalizedIndex: Map<string, ExistingRow> = await guardedStore(() => store.loadIndex(normalizedTable));
    const at = now();

    const rawRows: ShadowRow[] = [];
    for (const entity of entities) {
      const built = rawRow(entity.rawContent, entity.key, { runId, now: at, existing: rawIndex.get(entity.key) });
      addCounts(metrics.persistence.raw, built.outcome);
      addCounts(tableCounts(rawTable), built.outcome);
      rawRows.push(built.row);
    }
    const rawIds = await guardedStore(() => store.upsertRows(rawTable, rawRows));
    assertIds(rawIds, rawRows.map((row) => row.source_key), "RAW");

    const normalizedRows: ShadowRow[] = [];
    for (const entity of entities) {
      const built = normalizedRow(entity.normalizedContent, entity.key, rawIds.get(entity.key)!, { runId, now: at, existing: normalizedIndex.get(entity.key) }, relations(entity));
      addCounts(metrics.persistence.normalized, built.outcome);
      addCounts(tableCounts(normalizedTable), built.outcome);
      normalizedRows.push(built.row);
    }
    const normalizedIds = await guardedStore(() => store.upsertRows(normalizedTable, normalizedRows));
    assertIds(normalizedIds, normalizedRows.map((row) => row.source_key), "NORMALIZED");
    return normalizedIds;
  }

  /** Persiste el snapshot de artículos: RAW (variantes) → CONFLICTS → NORMALIZED (resolved | conflict). */
  async function persistArticles(
    identity: ArticleIdentityAnalysis,
    familiaIds: Map<string, string>,
    grupoIds: Map<string, string>,
    subgrupoIds: Map<string, string>,
  ): Promise<void> {
    const at = now();

    // ── RAW: una fila por variante; nunca se elige ni se descarta una variante ──
    const variantIndex = await guardedStore(() => store.loadArticleVariantIndex());
    const rawRows: ShadowRow[] = [];
    for (const keyIdentity of identity.keys) {
      for (const variant of keyIdentity.variants) {
        const existing = variantIndex.get(variant.variantKey);
        const outcome: RowOutcome = !existing ? "created" : existing.observedOccurrences !== variant.occurrences ? "updated" : "unchanged";
        addCounts(metrics.persistence.raw, outcome);
        addCounts(tableCounts("kore_raw_articulos"), outcome);
        rawRows.push({
          ...variant.entity.rawContent,
          request_codigo_familia: KORE_FULL_SNAPSHOT_SCOPE,
          source_key: keyIdentity.key,
          content_hash: variant.contentHash,
          source_variant_key: variant.variantKey,
          observed_occurrences: variant.occurrences,
          sync_run_id: runId,
          first_seen_at: existing?.firstSeenAt ?? at,
          last_seen_at: at,
          missing_since: null,
          updated_at: at,
        });
      }
    }
    const rawIds = await guardedStore(() => store.upsertRows("kore_raw_articulos", rawRows, "source_variant_key"));
    assertIds(rawIds, rawRows.map((row) => String(row.source_variant_key)), "RAW");
    metrics.articles.rawVariantsPersisted = rawRows.length;

    // ── CONFLICTS: registrar/actualizar sin duplicar; nunca resolver automáticamente ──
    const conflictIndex = await guardedStore(() => store.loadIdentityConflictIndex());
    const normalizedIndex = await guardedStore(() => store.loadArticleIndex());
    const snapshotKeys = new Set(identity.keys.map((keyIdentity) => keyIdentity.key));
    const conflictRows: ShadowRow[] = [];
    const quarantined = new Set<string>();
    for (const keyIdentity of identity.keys) {
      const existingConflict = conflictIndex.get(keyIdentity.key);
      if (keyIdentity.variants.length > 1) {
        quarantined.add(keyIdentity.key);
        metrics.identity.conflicts.push({ variantCount: keyIdentity.variants.length, differingFieldNames: keyIdentity.differingFields });
        let outcome: RowOutcome = "updated";
        if (!existingConflict) {
          metrics.identity.conflictsNew++;
          outcome = "created";
        } else if (existingConflict.status === "resolved") {
          metrics.identity.conflictsReopened++;
        } else {
          metrics.identity.conflictsRepeated++;
        }
        addCounts(tableCounts("kore_article_identity_conflicts"), outcome);
        conflictRows.push({
          source_key: keyIdentity.key,
          first_seen_at: existingConflict?.firstSeenAt ?? at,
          last_seen_at: at,
          last_sync_run_id: runId,
          variant_count: keyIdentity.variants.length,
          differing_fields: keyIdentity.differingFields,
          status: "open",
          resolved_at: null,
          updated_at: at,
        });
      } else if (existingConflict?.status === "open") {
        // CONFLICT_NO_LONGER_REPRODUCED: sigue open y en cuarentena; no se infiere la variante correcta.
        metrics.identity.conflictNoLongerReproduced++;
        quarantined.add(keyIdentity.key);
      }
    }
    for (const [key, conflict] of conflictIndex) {
      if (conflict.status === "open" && !snapshotKeys.has(key)) metrics.identity.conflictNoLongerReproduced++;
    }
    if (conflictRows.length > 0) {
      const conflictIds = await guardedStore(() => store.upsertRows("kore_article_identity_conflicts", conflictRows));
      assertIds(conflictIds, conflictRows.map((row) => row.source_key), "CONFLICTS");
    }

    // ── NORMALIZED: resolved materializa la única variante; conflict no elige ninguna ──
    const normalizedRows: ShadowRow[] = [];
    for (const keyIdentity of identity.keys) {
      const existing = normalizedIndex.get(keyIdentity.key);
      if (quarantined.has(keyIdentity.key)) {
        metrics.articles.conflictNormalizedKeys++;
        const outcome: RowOutcome = !existing ? "created" : existing.identityStatus === "conflict" ? "unchanged" : "updated";
        addCounts(metrics.persistence.normalized, outcome);
        addCounts(tableCounts("kore_articulos"), outcome);
        normalizedRows.push({
          codigo_unico: keyIdentity.codigoUnico,
          codigo_familia: null,
          codigo_grupo: null,
          codigo_subgrupo: null,
          descripcion: null,
          observaciones: null,
          basico: null,
          minimo: null,
          exento: null,
          deshabilitado: null,
          controla_stock: null,
          familia_id: null,
          grupo_id: null,
          subgrupo_id: null,
          source_key: keyIdentity.key,
          content_hash: null,
          raw_id: null,
          identity_status: "conflict",
          identity_conflict_since: existing?.identityStatus === "conflict" && existing.identityConflictSince ? existing.identityConflictSince : at,
          last_sync_run_id: runId,
          first_seen_at: existing?.firstSeenAt ?? at,
          last_seen_at: at,
          missing_since: null,
          updated_at: at,
        });
        continue;
      }

      const [variant] = keyIdentity.variants;
      metrics.articles.resolvedNormalizedKeys++;
      if (variant.articulo.codigoFamilia === null) metrics.articles.articlesWithoutFamilyField++;
      else if (variant.articulo.codigoFamilia === "") metrics.articles.blankFamilyArticles++;
      const built = normalizedRow(
        variant.entity.normalizedContent,
        keyIdentity.key,
        rawIds.get(variant.variantKey)!,
        { runId, now: at, existing },
        resolveArticleRelations(variant.entity, familiaIds, grupoIds, subgrupoIds, metrics),
      );
      const outcome: RowOutcome = existing?.identityStatus === "conflict" ? "updated" : built.outcome;
      addCounts(metrics.persistence.normalized, outcome);
      addCounts(tableCounts("kore_articulos"), outcome);
      normalizedRows.push({ ...built.row, identity_status: "resolved", identity_conflict_since: null });
    }
    const normalizedIds = await guardedStore(() => store.upsertRows("kore_articulos", normalizedRows));
    assertIds(normalizedIds, normalizedRows.map((row) => row.source_key), "NORMALIZED");
  }

  async function markMissing(table: KoreEntityTable, runColumn: "sync_run_id" | "last_sync_run_id"): Promise<void> {
    metrics.missing.markedPerTable[table] = await guardedStore(() => store.markMissing(table, runColumn, runId, now()));
  }

  let taxonomyPersisted = false;
  try {
    // ── Taxonomía: 3 requests, serial ──
    const familias = await sourceCall(() => source.listFamilias());
    const grupos = await sourceCall(() => source.listGrupos());
    const subgrupos = await sourceCall(() => source.listSubgrupos());
    metrics.taxonomy.familias = familias.length;
    metrics.taxonomy.grupos = grupos.length;
    metrics.taxonomy.subgrupos = subgrupos.length;

    const familyAnalysis = analyzeFamilies(familias);
    metrics.taxonomy.blankFamilies = familyAnalysis.blankFamilies;
    metrics.taxonomy.duplicateFamilyKeys = familyAnalysis.duplicateFamilyKeys;

    const familiaIds = await persistEntities("kore_raw_familias", "kore_familias", dedupeByKey(familias.map(familiaEntity)), () => ({}));
    const grupoIds = await persistEntities("kore_raw_grupos", "kore_grupos", grupos.map(grupoEntity), (entity) => {
      const familiaId = familiaIds.get(sourceKey([String(entity.normalizedContent.codigo_familia)])) ?? null;
      if (familiaId === null) metrics.taxonomy.orphanGrupos++;
      return { familia_id: familiaId };
    });
    const subgrupoIds = await persistEntities("kore_raw_subgrupos", "kore_subgrupos", subgrupos.map(subgrupoEntity), (entity) => {
      const grupoId = grupoIds.get(sourceKey([String(entity.normalizedContent.codigo_familia), String(entity.normalizedContent.codigo_grupo)])) ?? null;
      if (grupoId === null) metrics.taxonomy.orphanSubgrupos++;
      return { grupo_id: grupoId };
    });

    // Snapshot de taxonomía completo y persistido → ausencias explícitas (sin borrado físico).
    await markMissing("kore_raw_familias", "sync_run_id");
    await markMissing("kore_raw_grupos", "sync_run_id");
    await markMissing("kore_raw_subgrupos", "sync_run_id");
    await markMissing("kore_familias", "last_sync_run_id");
    await markMissing("kore_grupos", "last_sync_run_id");
    await markMissing("kore_subgrupos", "last_sync_run_id");
    taxonomyPersisted = true;

    // ── Artículos: 1 request global (SYNC_ONLY_FULL_SNAPSHOT) ──
    const articulos = await sourceCall(() => source.listArticulosFullSnapshot());
    metrics.articles.articleRowsReceived = articulos.length;

    metrics.network.actualRequests = source.requestsAttempted();
    if (metrics.network.actualRequests !== EXPECTED_REQUESTS) {
      throw new SyncAbort("REQUEST_COUNT_MISMATCH", "Requests reales distintas de 4");
    }

    const identity = analyzeArticleIdentity(articulos);
    metrics.articles.distinctArticleKeys = identity.distinctArticleKeys;
    metrics.articles.duplicateArticleKeys = identity.duplicateArticleKeys;
    metrics.articles.exactDuplicateRows = identity.exactDuplicateRows;
    metrics.articles.conflictingDuplicateKeys = identity.conflictingDuplicateKeys;

    await persistArticles(identity, familiaIds, grupoIds, subgrupoIds);
    for (const keyIdentity of identity.keys) koreArticleCodes.add(keyIdentity.codigoUnico);
    metrics.articles.snapshotComplete = true;

    // Snapshot global completo y persistido → la ausencia de una source_key es evidencia.
    // Una clave en conflicto PRESENTE fue observada (last_sync_run_id = run) → no es missing.
    metrics.missing.articlesMissingEvaluated = true;
    await markMissing("kore_raw_articulos", "sync_run_id");
    await markMissing("kore_articulos", "last_sync_run_id");

    if (metrics.articles.conflictNormalizedKeys > 0) {
      status = "partial";
      category = KORE_IDENTITY_CONFLICT;
    } else {
      status = "completed";
    }
  } catch (error) {
    category = errorCategory(error);
    status = "failed";
  }

  metrics.network.actualRequests = source.requestsAttempted();

  if (legacy && taxonomyPersisted && metrics.articles.snapshotComplete) {
    metrics.reconciliation = await reconcile(legacy, koreArticleCodes);
  }

  const raw = metrics.persistence.raw;
  await store.finishRun(runId, {
    status,
    completed_at: now(),
    rows_received: metrics.taxonomy.familias + metrics.taxonomy.grupos + metrics.taxonomy.subgrupos + metrics.articles.articleRowsReceived,
    rows_created: raw.created,
    rows_updated: raw.updated,
    rows_unchanged: raw.unchanged,
    rows_rejected: 0,
    requests_attempted: metrics.network.actualRequests,
    requests_succeeded: metrics.network.requestsSucceeded,
    requests_failed: metrics.network.requestsFailed,
    error_category: category,
    metrics: metrics as unknown as Record<string, unknown>,
  });

  return { runId, status, errorCategory: category, metrics };
}

function dedupeByKey(entities: readonly EntityRows[]): EntityRows[] {
  const seen = new Set<string>();
  return entities.filter((entity) => (seen.has(entity.key) ? false : (seen.add(entity.key), true)));
}

/**
 * Relaciones de artículo por código normalizado (sin inventar taxonomía):
 * MATCHED = familia, grupo y subgrupo presentes y existentes; UNMATCHED = ningún nivel
 * existente; PARTIAL = el resto. Un código blank ("") relaciona con el blank taxonomy record.
 */
function resolveArticleRelations(
  entity: EntityRows,
  familiaIds: Map<string, string>,
  grupoIds: Map<string, string>,
  subgrupoIds: Map<string, string>,
  metrics: CatalogSyncMetrics,
): Record<string, string | null> {
  const familia = entity.normalizedContent.codigo_familia as string | null;
  const grupo = entity.normalizedContent.codigo_grupo as string | null;
  const subgrupo = entity.normalizedContent.codigo_subgrupo as string | null;
  const r = metrics.relations;

  let familiaId: string | null = null;
  if (familia === null) r.familyAbsent++;
  else if ((familiaId = familiaIds.get(sourceKey([familia])) ?? null)) r.familyMatched++;
  else r.familyUnmatched++;

  let grupoId: string | null = null;
  if (familia === null || grupo === null) r.groupAbsent++;
  else if ((grupoId = grupoIds.get(sourceKey([familia, grupo])) ?? null)) r.groupMatched++;
  else r.groupUnmatched++;

  let subgrupoId: string | null = null;
  if (familia === null || grupo === null || subgrupo === null) r.subgroupAbsent++;
  else if ((subgrupoId = subgrupoIds.get(sourceKey([familia, grupo, subgrupo])) ?? null)) r.subgroupMatched++;
  else r.subgroupUnmatched++;

  const matchedLevels = [familiaId, grupoId, subgrupoId].filter((id) => id !== null).length;
  if (matchedLevels === 3) r.matched++;
  else if (matchedLevels === 0) r.unmatched++;
  else r.partial++;

  return { familia_id: familiaId, grupo_id: grupoId, subgrupo_id: subgrupoId };
}

async function reconcile(legacy: LegacyCatalogReader, koreCodes: ReadonlySet<string>): Promise<CatalogSyncMetrics["reconciliation"]> {
  let legacyCodes: string[] | null;
  try {
    legacyCodes = await legacy.loadLegacyArticleCodes();
  } catch {
    legacyCodes = null;
  }
  const kore = new Set([...koreCodes].map(legacyComparableCode).filter((code) => code !== ""));
  if (legacyCodes === null) {
    return { available: false, comparisonMethod: RECONCILIATION_METHOD, koreArticles: kore.size, legacyArticles: 0, intersection: 0, koreOnly: kore.size, legacyOnly: 0 };
  }
  const legacySet = new Set(legacyCodes.map(legacyComparableCode).filter((code) => code !== ""));
  let intersection = 0;
  for (const code of kore) if (legacySet.has(code)) intersection++;
  return {
    available: true,
    comparisonMethod: RECONCILIATION_METHOD,
    koreArticles: kore.size,
    legacyArticles: legacySet.size,
    intersection,
    koreOnly: kore.size - intersection,
    legacyOnly: legacySet.size - intersection,
  };
}
