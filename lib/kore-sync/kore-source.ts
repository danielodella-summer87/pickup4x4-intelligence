import type { KoreFetch } from "../kore/client.ts";
import type { KoreEnv } from "../kore/config.ts";
import { listKoreFamilias, listKoreGrupos, listKoreSubgrupos } from "../kore/service.ts";
import { listKoreArticulosFullSnapshotForSync } from "../kore/sync-only.ts";
import type { KoreCatalogSource } from "./types.ts";

/**
 * Fuente real del catálogo:
 * - Taxonomía: API permanente de lib/kore (sin filtros, contrato documentado).
 * - Artículos: SYNC_ONLY_FULL_SNAPSHOT (lib/kore/sync-only.ts), 1 request global
 *   con tope duro de 25 MB. La API interactiva listKoreArticulos no se usa ni se relaja.
 * Todas las llamadas: allowlist read-only, 0 reintentos, redirect manual.
 * Cuenta cada POST intentado para verificar el presupuesto exacto de 4 requests.
 */

/** Timeout del request global de artículos (catálogo completo). Taxonomía usa el default. */
export const ARTICULOS_SNAPSHOT_TIMEOUT_MS = 60_000;

export function createKoreCatalogSource(env: KoreEnv, fetchImpl: KoreFetch = fetch): KoreCatalogSource {
  let attempts = 0;
  const countingFetch: KoreFetch = (url, init) => {
    attempts++;
    return fetchImpl(url, init);
  };
  const options = { env, fetchImpl: countingFetch };

  return {
    listFamilias: () => listKoreFamilias(options),
    listGrupos: () => listKoreGrupos(options),
    listSubgrupos: () => listKoreSubgrupos(options),
    listArticulosFullSnapshot: () => listKoreArticulosFullSnapshotForSync({ ...options, timeoutMs: ARTICULOS_SNAPSHOT_TIMEOUT_MS }),
    requestsAttempted: () => attempts,
  };
}
