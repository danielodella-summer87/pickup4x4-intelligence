import { buildArticuloFilterFields, fetchKoreArticulos } from "./articulos.ts";
import type { KoreArticulo, KoreArticuloFilters } from "./articulos.ts";
import { createKoreClient } from "./client.ts";
import type { KoreClient, KoreFetch, KoreResponseMeta } from "./client.ts";
import { parseKoreConfig } from "./config.ts";
import type { KoreEnv } from "./config.ts";
import { buildCuentaFilterFields, fetchKoreCuentas } from "./cuentas.ts";
import type { KoreCuenta, KoreCuentaFilters } from "./cuentas.ts";
import { fetchKoreFamilias, fetchKoreGrupos, fetchKoreSubgrupos } from "./taxonomia.ts";
import type { KoreFamilia, KoreGrupo, KoreSubgrupo } from "./taxonomia.ts";
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

function clientFrom(options: KoreServiceOptions): KoreClient {
  return createKoreClient({
    config: parseKoreConfig(options.env ?? process.env),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    onResponse: options.onResponse,
  });
}

export async function listKoreVendedores(
  options: KoreServiceOptions = {},
): Promise<KoreVendedor[]> {
  return fetchKoreVendedores(clientFrom(options));
}

/** Requiere al menos un filtro efectivo; sin filtros falla antes de salir a red. */
export async function listKoreCuentas(
  filters: KoreCuentaFilters = {},
  options: KoreServiceOptions = {},
): Promise<KoreCuenta[]> {
  // Fail-fast: filtros inválidos o ausentes fallan antes de leer config o crear el cliente.
  buildCuentaFilterFields(filters);
  return fetchKoreCuentas(clientFrom(options), filters);
}

/** Requiere al menos un filtro con contenido; sin filtros falla antes de salir a red. */
export async function listKoreArticulos(
  filters: KoreArticuloFilters,
  options: KoreServiceOptions = {},
): Promise<KoreArticulo[]> {
  // Fail-fast: filtros inválidos o ausentes fallan antes de leer config o crear el cliente.
  buildArticuloFilterFields(filters);
  return fetchKoreArticulos(clientFrom(options), filters);
}

/** Catálogo completo sin filtros: es el contrato documentado de ListarFamilias. */
export async function listKoreFamilias(options: KoreServiceOptions = {}): Promise<KoreFamilia[]> {
  return fetchKoreFamilias(clientFrom(options));
}

/** Catálogo completo sin filtros; no dispara ListarFamilias. */
export async function listKoreGrupos(options: KoreServiceOptions = {}): Promise<KoreGrupo[]> {
  return fetchKoreGrupos(clientFrom(options));
}

/** Catálogo completo sin filtros; no dispara requests adicionales. */
export async function listKoreSubgrupos(options: KoreServiceOptions = {}): Promise<KoreSubgrupo[]> {
  return fetchKoreSubgrupos(clientFrom(options));
}
