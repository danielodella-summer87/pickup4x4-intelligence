import { createKoreClient } from "./client.ts";
import type { KoreFetch, KoreResponseMeta } from "./client.ts";
import { parseKoreConfig } from "./config.ts";
import type { KoreEnv } from "./config.ts";
import { fetchKoreVendedores } from "./vendedores.ts";
import type { KoreVendedor } from "./vendedores.ts";

/**
 * Casos de uso KORE para la aplicación: no exponen SOAP, DataSet ni diffgram.
 * La configuración se valida en cada llamada, antes de cualquier request.
 */

export type KoreServiceOptions = {
  /** Por defecto `process.env`. */
  env?: KoreEnv;
  fetchImpl?: KoreFetch;
  timeoutMs?: number;
  /** Metadatos de la respuesta (status, bytes, duración); nunca el body. */
  onResponse?: (meta: KoreResponseMeta) => void;
};

export async function listKoreVendedores(
  options: KoreServiceOptions = {},
): Promise<KoreVendedor[]> {
  const client = createKoreClient({
    config: parseKoreConfig(options.env ?? process.env),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    onResponse: options.onResponse,
  });
  return fetchKoreVendedores(client);
}
