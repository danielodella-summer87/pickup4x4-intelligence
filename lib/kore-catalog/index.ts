/**
 * Catálogo KORE (shadow) — API pública, SOLO SERVIDOR, SOLO LECTURA (KORE-27).
 *
 * Expone solo artículos aptos: identity_status = 'resolved' AND missing_since IS NULL.
 * Las claves en cuarentena por conflicto de identidad nunca salen de aquí.
 *
 * Único consumidor: el loader server-side del dataset activo (lib/data/active-dataset-server.ts)
 * cuando la app se construye con catalog=kore (default: legacy). `server-only`
 * hace fallar el build si este módulo llega a un Client Component.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createKoreCatalogRepository, type KoreCatalogRepository } from "./repository.ts";
import { createSupabaseCatalogReader } from "./supabase-reader.ts";

export type { KoreCatalogArticle, KoreCatalogCounts, KoreCatalogRepository, KoreTaxonomy } from "./repository.ts";
export { ELIGIBLE_ARTICLE_FILTERS, KoreCatalogIntegrityError } from "./repository.ts";
export { KoreCatalogReadError } from "./supabase-reader.ts";

/** null si el service role no está configurado en el servidor. */
export function createServerKoreCatalogRepository(): KoreCatalogRepository | null {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return createKoreCatalogRepository(createSupabaseCatalogReader(client));
}
