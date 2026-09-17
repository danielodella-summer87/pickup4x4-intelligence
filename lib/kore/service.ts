import { buildArticuloFilterFields, fetchKoreArticulos } from "./articulos.ts";
import type { KoreArticulo, KoreArticuloFilters } from "./articulos.ts";
import { createKoreClient } from "./client.ts";
import type { KoreClient, KoreFetch, KoreResponseMeta } from "./client.ts";
import { parseKoreConfig } from "./config.ts";
import type { KoreEnv } from "./config.ts";
import { buildCuentaFilterFields, fetchKoreCuentas } from "./cuentas.ts";
import type { KoreCuenta, KoreCuentaFilters } from "./cuentas.ts";
import { buildMarcaModeloFilterFields, fetchKoreMarcasModelos } from "./marcas-modelos.ts";
import type { KoreMarcaModelo, KoreMarcaModeloFilters } from "./marcas-modelos.ts";
import {
  buildPrecioFilterFields,
  buildPreciosxArticuloFields,
  fetchKorePrecios,
  fetchKorePreciosxArticulo,
} from "./precios.ts";
import type { KoreListaPrecioArticulo, KorePrecio, KorePrecioFilters } from "./precios.ts";
import { buildStockFilterFields, fetchKoreStock } from "./stock.ts";
import type { KoreStock, KoreStockFilters } from "./stock.ts";
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

/** Requiere al menos un filtro de código con contenido; sin filtros falla antes de salir a red. */
export async function listKoreMarcasModelos(
  filters: KoreMarcaModeloFilters,
  options: KoreServiceOptions = {},
): Promise<KoreMarcaModelo[]> {
  // Fail-fast: filtros inválidos o ausentes fallan antes de leer config o crear el cliente.
  buildMarcaModeloFilterFields(filters);
  return fetchKoreMarcasModelos(clientFrom(options), filters);
}

/**
 * Filas de stock tal cual las devuelve KORE (sin sumar ni interpretar estados).
 * Requiere al menos un filtro efectivo; sin filtros falla antes de salir a red.
 */
export async function listKoreStock(
  filters: KoreStockFilters,
  options: KoreServiceOptions = {},
): Promise<KoreStock[]> {
  // Fail-fast: filtros inválidos o ausentes fallan antes de leer config o crear el cliente.
  buildStockFilterFields(filters);
  return fetchKoreStock(clientFrom(options), filters);
}

/**
 * Precios de un artículo por lista (sin lista 1, según documentación), tal cual
 * los devuelve KORE. Código obligatorio; inválido falla antes de salir a red.
 */
export async function listKorePreciosxArticulo(
  codigoUnico: string,
  options: KoreServiceOptions = {},
): Promise<KoreListaPrecioArticulo[]> {
  // Fail-fast: código inválido falla antes de leer config o crear el cliente.
  buildPreciosxArticuloFields(codigoUnico);
  return fetchKorePreciosxArticulo(clientFrom(options), codigoUnico);
}

/**
 * Precios de una lista para un rango de códigos, tal cual los devuelve KORE.
 * Requiere nroListaPrecio y al menos un código; si no, falla antes de salir a red.
 */
export async function listKorePrecios(
  filters: KorePrecioFilters,
  options: KoreServiceOptions = {},
): Promise<KorePrecio[]> {
  // Fail-fast: filtros inválidos o incompletos fallan antes de leer config o crear el cliente.
  buildPrecioFilterFields(filters);
  return fetchKorePrecios(clientFrom(options), filters);
}
