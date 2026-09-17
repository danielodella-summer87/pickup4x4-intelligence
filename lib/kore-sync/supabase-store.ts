import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isKoreShadowTable } from "./types.ts";
import type {
  ExistingArticleVariant,
  ExistingIdentityConflict,
  ExistingNormalizedArticle,
  ExistingRow,
  KoreEntityTable,
  LegacyCatalogReader,
  NewSyncRun,
  ShadowRow,
  ShadowStore,
  SyncRunPatch,
  UpsertConflictColumn,
} from "./types.ts";

/**
 * Persistencia shadow en Supabase con service role (solo runner local server-side).
 *
 * - Escribe EXCLUSIVAMENTE en tablas kore_* (allowlist verificada en cada llamada).
 * - Upsert por source_key (RAW de artículos: por source_variant_key): sin delete-all, sin truncate, sin clearDataset.
 * - La lectura del catálogo legacy es read-only (solo codigo_unico, para conteos).
 * - Los errores de Supabase se re-lanzan sin mensaje de detalle (pueden contener valores).
 */

const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 500;

/** Tablas legacy observadas solo para verificar que no cambian (conteos). */
export const LEGACY_TABLES = [
  "clientes",
  "ventas",
  "articulos",
  "aplicaciones",
  "importaciones",
  "oportunidades",
  "solicitudes",
  "helpdesk_tickets",
  "commercial_campaigns",
  "commercial_campaign_items",
  "commercial_campaign_results",
  "prospeccion_empresas",
  "mercado_investigaciones",
  "mercado_respuestas",
] as const;

export class SupabaseShadowError extends Error {
  constructor(operation: string) {
    super(`Supabase shadow: fallo en ${operation}`);
    this.name = "SupabaseShadowError";
  }
}

function assertShadowTable(table: string): void {
  if (!isKoreShadowTable(table)) throw new SupabaseShadowError("tabla no permitida");
}

export function createShadowSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("El shadow sync solo corre en servidor");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createSupabaseShadowStore(client: SupabaseClient): ShadowStore {
  /** Lectura paginada (orden estable por id) de columnas técnicas de una tabla kore_*. */
  async function readAll(table: KoreEntityTable, columns: string, onRow: (row: Record<string, unknown>) => void): Promise<void> {
    assertShadowTable(table);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from(table)
        .select(columns)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new SupabaseShadowError(`read ${table}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) onRow(row);
      if (rows.length < PAGE_SIZE) return;
    }
  }

  const hashOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

  return {
    async createRun(run: NewSyncRun): Promise<string> {
      const { data, error } = await client.from("kore_sync_runs").insert(run).select("id").single();
      if (error || !data) throw new SupabaseShadowError("createRun");
      return String(data.id);
    },

    async finishRun(id: string, patch: SyncRunPatch): Promise<void> {
      const { error } = await client.from("kore_sync_runs").update(patch).eq("id", id);
      if (error) throw new SupabaseShadowError("finishRun");
    },

    async loadIndex(table: KoreEntityTable): Promise<Map<string, ExistingRow>> {
      const index = new Map<string, ExistingRow>();
      await readAll(table, "id, source_key, content_hash, first_seen_at", (row) => {
        index.set(String(row.source_key), { id: String(row.id), contentHash: hashOrNull(row.content_hash), firstSeenAt: String(row.first_seen_at) });
      });
      return index;
    },

    async loadArticleVariantIndex(): Promise<Map<string, ExistingArticleVariant>> {
      const index = new Map<string, ExistingArticleVariant>();
      await readAll("kore_raw_articulos", "id, source_key, content_hash, source_variant_key, first_seen_at, observed_occurrences", (row) => {
        index.set(String(row.source_variant_key), {
          id: String(row.id),
          sourceKey: String(row.source_key),
          contentHash: hashOrNull(row.content_hash),
          firstSeenAt: String(row.first_seen_at),
          observedOccurrences: Number(row.observed_occurrences),
        });
      });
      return index;
    },

    async loadArticleIndex(): Promise<Map<string, ExistingNormalizedArticle>> {
      const index = new Map<string, ExistingNormalizedArticle>();
      await readAll("kore_articulos", "id, source_key, content_hash, first_seen_at, identity_status, identity_conflict_since", (row) => {
        const identityStatus = row.identity_status;
        if (identityStatus !== "resolved" && identityStatus !== "conflict") throw new SupabaseShadowError("identity_status inesperado");
        index.set(String(row.source_key), {
          id: String(row.id),
          contentHash: hashOrNull(row.content_hash),
          firstSeenAt: String(row.first_seen_at),
          identityStatus,
          identityConflictSince: row.identity_conflict_since === null ? null : String(row.identity_conflict_since),
        });
      });
      return index;
    },

    async loadIdentityConflictIndex(): Promise<Map<string, ExistingIdentityConflict>> {
      const index = new Map<string, ExistingIdentityConflict>();
      await readAll("kore_article_identity_conflicts", "id, source_key, first_seen_at, status", (row) => {
        const status = row.status;
        if (status !== "open" && status !== "resolved") throw new SupabaseShadowError("status de conflicto inesperado");
        index.set(String(row.source_key), { id: String(row.id), firstSeenAt: String(row.first_seen_at), status });
      });
      return index;
    },

    async upsertRows(table: KoreEntityTable, rows: readonly ShadowRow[], onConflict: UpsertConflictColumn = "source_key"): Promise<Map<string, string>> {
      assertShadowTable(table);
      const ids = new Map<string, string>();
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK);
        const { data, error } = await client.from(table).upsert(chunk, { onConflict }).select(`id, ${onConflict}`);
        if (error) throw new SupabaseShadowError(`upsert ${table}`);
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) ids.set(String(row[onConflict]), String(row.id));
      }
      return ids;
    },

    async markMissing(table: KoreEntityTable, runColumn: "sync_run_id" | "last_sync_run_id", runId: string, at: string): Promise<number> {
      assertShadowTable(table);
      const { data, error } = await client
        .from(table)
        .update({ missing_since: at, updated_at: at })
        .neq(runColumn, runId)
        .is("missing_since", null)
        .select("id");
      if (error) throw new SupabaseShadowError(`markMissing ${table}`);
      return data?.length ?? 0;
    },
  };
}

/** Lectura read-only de códigos del catálogo legacy (tabla `articulos`). */
export function createLegacyCatalogReader(client: SupabaseClient): LegacyCatalogReader {
  return {
    async loadLegacyArticleCodes(): Promise<string[] | null> {
      const codes: string[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client.from("articulos").select("codigo_unico").order("id").range(from, from + PAGE_SIZE - 1);
        if (error) return null;
        for (const row of data ?? []) if (typeof row.codigo_unico === "string") codes.push(row.codigo_unico);
        if (!data || data.length < PAGE_SIZE) return codes;
      }
    },
  };
}

/** Conteos exactos de tablas legacy (read-only). null = tabla no disponible. */
export async function countLegacyTables(client: SupabaseClient): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {};
  for (const table of LEGACY_TABLES) {
    // GET (no HEAD): una tabla inexistente devuelve error explícito en vez de count null silencioso.
    const { count, error } = await client.from(table).select("id", { count: "exact" }).range(0, 0);
    counts[table] = error ? null : (count ?? 0);
  }
  return counts;
}
