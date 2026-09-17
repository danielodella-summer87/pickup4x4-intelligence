import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogCountQuery, CatalogFilters, CatalogSelectQuery, KoreCatalogReader } from "./repository.ts";

/**
 * Adaptador Supabase de SOLO LECTURA para el repository de catálogo KORE.
 * Solo usa select/eq/is/not/order/range. Los errores se relanzan sin detalle (pueden
 * contener valores).
 */

export class KoreCatalogReadError extends Error {
  constructor(operation: string) {
    super(`Catálogo KORE: fallo de lectura (${operation})`);
    this.name = "KoreCatalogReadError";
  }
}

/** Subconjunto encadenable del query builder de supabase-js usado aquí (solo lectura). */
type FilterChain = {
  eq(column: string, value: string): FilterChain;
  is(column: string, value: null): FilterChain;
  not(column: string, operator: "is", value: null): FilterChain;
  order(column: string, options: { ascending: boolean }): FilterChain;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown; count?: number | null }>;
} & PromiseLike<{ data: unknown[] | null; error: unknown; count?: number | null }>;

function applyFilters(chain: FilterChain, filters: CatalogFilters): FilterChain {
  let next = chain;
  for (const [column, value] of filters.eq) next = next.eq(column, value);
  for (const column of filters.isNull) next = next.is(column, null);
  for (const column of filters.notNull) next = next.not(column, "is", null);
  return next;
}

export function createSupabaseCatalogReader(client: SupabaseClient): KoreCatalogReader {
  const table = (name: string) => client.from(name) as unknown as { select(columns: string, options?: { count: "exact"; head: boolean }): FilterChain };

  return {
    async select(query: CatalogSelectQuery) {
      const chain = applyFilters(table(query.table).select(query.columns.join(", ")), query.filters);
      const { data, error } = await chain.order(query.orderBy, { ascending: true }).range(query.from, query.to);
      if (error) throw new KoreCatalogReadError("select");
      return (data ?? []) as Record<string, unknown>[];
    },

    async count(query: CatalogCountQuery) {
      const chain = applyFilters(table(query.table).select("id", { count: "exact", head: true }), query.filters);
      const { error, count } = await chain;
      if (error || typeof count !== "number") throw new KoreCatalogReadError("count");
      return count;
    },
  };
}
