/**
 * Repository de catálogo KORE (shadow) — SOLO LECTURA, server-side (KORE-27).
 *
 * Lee `kore_articulos` y expone únicamente artículos APTOS:
 *   identity_status = 'resolved'  AND  missing_since IS NULL
 *
 * - Las claves en cuarentena (identity_status = 'conflict') quedan excluidas por el filtro
 *   de la query, no por la UI.
 * - Fail-closed: si una fila devuelta viola los invariantes (estado, missing, raw_id,
 *   contenido), se lanza KoreCatalogIntegrityError; nunca se descarta en silencio.
 * - No escribe, no llama KORE, no ejecuta sync. Solo lo consume el loader server-side del
 *   dataset activo (catalog=kore); nunca la UI directamente.
 *
 * Este archivo no depende de Next ni de Supabase (testeable con node --test). La entrada
 * de aplicación es `@/lib/kore-catalog` (server-only).
 */

export const KORE_CATALOG_TABLE = "kore_articulos";
export const KORE_TAXONOMY_TABLES = ["kore_familias", "kore_grupos", "kore_subgrupos"] as const;
export type KoreCatalogTable = typeof KORE_CATALOG_TABLE | (typeof KORE_TAXONOMY_TABLES)[number];
export const KORE_CATALOG_PAGE_SIZE = 1000;

/** Columnas expuestas (sin hashes, variantes RAW ni metadata interna de sync). */
export const KORE_CATALOG_COLUMNS = [
  "id",
  "codigo_unico",
  "descripcion",
  "observaciones",
  "codigo_familia",
  "codigo_grupo",
  "codigo_subgrupo",
  "familia_id",
  "grupo_id",
  "subgrupo_id",
  "basico",
  "minimo",
  "exento",
  "deshabilitado",
  "controla_stock",
  "raw_id",
  "identity_status",
  "missing_since",
  "last_seen_at",
] as const;

export type CatalogFilters = {
  eq: ReadonlyArray<readonly [column: string, value: string]>;
  isNull: readonly string[];
  notNull: readonly string[];
};

/** Filtro de elegibilidad: la ÚNICA definición de "artículo KORE apto". */
export const ELIGIBLE_ARTICLE_FILTERS: CatalogFilters = Object.freeze({
  eq: Object.freeze([Object.freeze(["identity_status", "resolved"] as const)]),
  isNull: Object.freeze(["missing_since"]),
  notNull: Object.freeze([]),
});

export type CatalogSelectQuery = {
  table: KoreCatalogTable;
  columns: readonly string[];
  filters: CatalogFilters;
  orderBy: string;
  from: number;
  to: number;
};

export type CatalogCountQuery = {
  table: KoreCatalogTable;
  filters: CatalogFilters;
};

/** Acceso mínimo de lectura. Implementación real: createSupabaseCatalogReader. */
export interface KoreCatalogReader {
  select(query: CatalogSelectQuery): Promise<Record<string, unknown>[]>;
  count(query: CatalogCountQuery): Promise<number>;
}

type Flag = 0 | 1 | null;

export type KoreCatalogArticle = {
  id: string;
  codigoUnico: string;
  descripcion: string;
  observaciones: string;
  codigoFamilia: string | null;
  codigoGrupo: string | null;
  codigoSubgrupo: string | null;
  familiaId: string | null;
  grupoId: string | null;
  subgrupoId: string | null;
  basico: Flag;
  minimo: Flag;
  exento: Flag;
  deshabilitado: Flag;
  controlaStock: Flag;
  lastSeenAt: string;
};

export type KoreCatalogCounts = {
  /** identity_status = resolved AND missing_since IS NULL */
  eligible: number;
  /** identity_status = conflict (presentes o no): nunca expuestos */
  quarantined: number;
  /** resolved pero ausentes del último snapshot completo */
  resolvedMissing: number;
  total: number;
};

export class KoreCatalogIntegrityError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`Catálogo KORE: fila no apta devuelta por la fuente (${field})`);
    this.name = "KoreCatalogIntegrityError";
    this.field = field;
  }
}

function text(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new KoreCatalogIntegrityError(field);
  return value;
}

function nullableText(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new KoreCatalogIntegrityError(field);
  return value;
}

function flag(row: Record<string, unknown>, field: string): Flag {
  const value = row[field];
  if (value === null || value === 0 || value === 1) return value;
  throw new KoreCatalogIntegrityError(field);
}

/** Valida invariantes de elegibilidad y proyecta la fila. Nunca devuelve una fila en conflicto. */
export function toEligibleArticle(row: Record<string, unknown>): KoreCatalogArticle {
  if (row.identity_status !== "resolved") throw new KoreCatalogIntegrityError("identity_status");
  if (row.missing_since !== null) throw new KoreCatalogIntegrityError("missing_since");
  text(row, "raw_id");
  return {
    id: text(row, "id"),
    codigoUnico: text(row, "codigo_unico"),
    descripcion: text(row, "descripcion"),
    observaciones: text(row, "observaciones"),
    codigoFamilia: nullableText(row, "codigo_familia"),
    codigoGrupo: nullableText(row, "codigo_grupo"),
    codigoSubgrupo: nullableText(row, "codigo_subgrupo"),
    familiaId: nullableText(row, "familia_id"),
    grupoId: nullableText(row, "grupo_id"),
    subgrupoId: nullableText(row, "subgrupo_id"),
    basico: flag(row, "basico"),
    minimo: flag(row, "minimo"),
    exento: flag(row, "exento"),
    deshabilitado: flag(row, "deshabilitado"),
    controlaStock: flag(row, "controla_stock"),
    lastSeenAt: text(row, "last_seen_at"),
  };
}

/** Taxonomía KORE activa (missing_since IS NULL), solo códigos y descripciones. */
export type KoreTaxonomy = {
  familias: { codigoFamilia: string; descripcion: string }[];
  grupos: { codigoFamilia: string; codigoGrupo: string; descripcion: string }[];
  subgrupos: { codigoFamilia: string; codigoGrupo: string; codigoSubgrupo: string; descripcion: string }[];
};

/** Filtro de taxonomía activa. */
export const ACTIVE_TAXONOMY_FILTERS: CatalogFilters = Object.freeze({
  eq: Object.freeze([]),
  isNull: Object.freeze(["missing_since"]),
  notNull: Object.freeze([]),
});

function activeTaxonomyRow(row: Record<string, unknown>): Record<string, unknown> {
  if (row.missing_since !== null) throw new KoreCatalogIntegrityError("missing_since");
  return row;
}

export type KoreCatalogRepository = {
  /** Taxonomía activa (familias, grupos, subgrupos con missing_since IS NULL). */
  listActiveTaxonomy(): Promise<KoreTaxonomy>;
  /** Todos los artículos aptos (paginado, orden estable por codigo_unico). */
  listEligibleArticles(): Promise<KoreCatalogArticle[]>;
  /** Un artículo apto por código normalizado; null si no existe o no es apto (p. ej. en conflicto). */
  findEligibleArticle(codigoUnico: string): Promise<KoreCatalogArticle | null>;
  /** Conteos de diagnóstico (sin contenido). */
  countArticles(): Promise<KoreCatalogCounts>;
};

export function createKoreCatalogRepository(reader: KoreCatalogReader, pageSize = KORE_CATALOG_PAGE_SIZE): KoreCatalogRepository {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > KORE_CATALOG_PAGE_SIZE) {
    throw new RangeError("pageSize inválido");
  }

  async function readAll(table: KoreCatalogTable, columns: readonly string[], filters: CatalogFilters, orderBy: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += pageSize) {
      const page = await reader.select({ table, columns, filters, orderBy, from, to: from + pageSize - 1 });
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  return {
    async listActiveTaxonomy() {
      const [familias, grupos, subgrupos] = await Promise.all([
        readAll("kore_familias", ["id", "codigo_familia", "descripcion", "missing_since"], ACTIVE_TAXONOMY_FILTERS, "codigo_familia"),
        readAll("kore_grupos", ["id", "codigo_familia", "codigo_grupo", "descripcion", "missing_since"], ACTIVE_TAXONOMY_FILTERS, "id"),
        readAll("kore_subgrupos", ["id", "codigo_familia", "codigo_grupo", "codigo_subgrupo", "descripcion", "missing_since"], ACTIVE_TAXONOMY_FILTERS, "id"),
      ]);
      return {
        familias: familias.map(activeTaxonomyRow).map((row) => ({ codigoFamilia: text(row, "codigo_familia"), descripcion: text(row, "descripcion") })),
        grupos: grupos.map(activeTaxonomyRow).map((row) => ({ codigoFamilia: text(row, "codigo_familia"), codigoGrupo: text(row, "codigo_grupo"), descripcion: text(row, "descripcion") })),
        subgrupos: subgrupos.map(activeTaxonomyRow).map((row) => ({
          codigoFamilia: text(row, "codigo_familia"),
          codigoGrupo: text(row, "codigo_grupo"),
          codigoSubgrupo: text(row, "codigo_subgrupo"),
          descripcion: text(row, "descripcion"),
        })),
      };
    },

    async listEligibleArticles() {
      const articles: KoreCatalogArticle[] = [];
      for (let from = 0; ; from += pageSize) {
        const rows = await reader.select({
          table: KORE_CATALOG_TABLE,
          columns: KORE_CATALOG_COLUMNS,
          filters: ELIGIBLE_ARTICLE_FILTERS,
          orderBy: "codigo_unico",
          from,
          to: from + pageSize - 1,
        });
        for (const row of rows) articles.push(toEligibleArticle(row));
        if (rows.length < pageSize) return articles;
      }
    },

    async findEligibleArticle(codigoUnico: string) {
      const code = codigoUnico.trim();
      if (code === "") return null;
      const rows = await reader.select({
        table: KORE_CATALOG_TABLE,
        columns: KORE_CATALOG_COLUMNS,
        filters: { ...ELIGIBLE_ARTICLE_FILTERS, eq: [...ELIGIBLE_ARTICLE_FILTERS.eq, ["codigo_unico", code]] },
        orderBy: "codigo_unico",
        from: 0,
        to: 1,
      });
      if (rows.length > 1) throw new KoreCatalogIntegrityError("codigo_unico");
      return rows.length === 1 ? toEligibleArticle(rows[0]) : null;
    },

    async countArticles() {
      const none: CatalogFilters = { eq: [], isNull: [], notNull: [] };
      const [eligible, quarantined, resolvedMissing, total] = await Promise.all([
        reader.count({ table: KORE_CATALOG_TABLE, filters: ELIGIBLE_ARTICLE_FILTERS }),
        reader.count({ table: KORE_CATALOG_TABLE, filters: { ...none, eq: [["identity_status", "conflict"]] } }),
        reader.count({ table: KORE_CATALOG_TABLE, filters: { ...none, eq: [["identity_status", "resolved"]], notNull: ["missing_since"] } }),
        reader.count({ table: KORE_CATALOG_TABLE, filters: none }),
      ]);
      return { eligible, quarantined, resolvedMissing, total };
    },
  };
}
