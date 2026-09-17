import { parseListarArticulosResult } from "./articulos.ts";
import type { KoreArticulo } from "./articulos.ts";
import { KORE_DEFAULT_MAX_RESPONSE_BYTES, createKoreClient } from "./client.ts";
import type { KoreFetch, KoreResponseMeta } from "./client.ts";
import { parseKoreConfig } from "./config.ts";
import type { KoreEnv } from "./config.ts";

/**
 * SYNC_ONLY_FULL_SNAPSHOT
 *
 * Operaciones BULK de lectura, exclusivas de la capa de sincronización
 * (lib/kore-sync). NO se exportan desde "@/lib/kore" y NO deben importarse desde
 * app/, components/, contexts/ ni API routes. La API interactiva
 * (`listKoreArticulos`) mantiene intactos sus límites de seguridad: exige filtros.
 *
 * Por qué existe (KORE-25): el snapshot por familia no puede cubrir artículos de la
 * familia blank (un filtro vacío no es consultable) y la documentación de
 * ListarArticulos devuelve todo el catálogo cuando no se envían filtros. Un único
 * request global da cobertura completa y verificable.
 *
 * Garantías: mismo cliente SOAP permanente (allowlist read-only, redirect manual,
 * 0 reintentos, respuesta en streaming, redacción), parser estricto de KoreArticulo
 * y tope duro de respuesta de 25 MB (nunca se permite subirlo).
 */

export const KORE_SYNC_SNAPSHOT_MAX_RESPONSE_BYTES = KORE_DEFAULT_MAX_RESPONSE_BYTES;

export type KoreSyncSnapshotOptions = {
  env: KoreEnv;
  fetchImpl?: KoreFetch;
  timeoutMs?: number;
  /** Solo puede BAJAR el tope (tests); nunca superar 25 MB. */
  maxResponseBytes?: number;
  onResponse?: (meta: KoreResponseMeta) => void;
};

/** SYNC_ONLY_FULL_SNAPSHOT: ListarArticulos sin filtros (catálogo completo). Sin inputs de filtro. */
export async function listKoreArticulosFullSnapshotForSync(options: KoreSyncSnapshotOptions): Promise<KoreArticulo[]> {
  if (typeof window !== "undefined") throw new Error("SYNC_ONLY_FULL_SNAPSHOT: solo servidor");
  const client = createKoreClient({
    config: parseKoreConfig(options.env),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: Math.min(options.maxResponseBytes ?? KORE_SYNC_SNAPSHOT_MAX_RESPONSE_BYTES, KORE_SYNC_SNAPSHOT_MAX_RESPONSE_BYTES),
    onResponse: options.onResponse,
  });
  // Sin docFields: request global documentado. Deliberadamente sin buildArticuloFilterFields.
  return parseListarArticulosResult(await client.call("ListarArticulos", []));
}
