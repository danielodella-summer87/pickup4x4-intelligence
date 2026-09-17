import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import { parseFiniteXsDouble, parseSafeIntegerLexical, parseXsDecimal } from "./lexical.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Precios KORE (READ-ONLY): dos métodos con contratos públicos SEPARADOS.
 *
 * ListarPreciosxArticulo → KoreListaPrecioArticulo[] (KORE-16/18, SOAP 1.2)
 *   Tabla `ListaPrecio`: NroListaPrecio (xs:int), Moneda (xs:string),
 *   Precio (xs:decimal), PrecioIVA (xs:decimal), NombreListaPrecio (xs:string).
 *   Documentado: excluye la lista 1. No devuelve CODIGOUNICO.
 *
 * ListarPrecios → KorePrecio[] (KORE-17/18, SOAP 1.2)
 *   Tabla `Precio`: AUTONUMERADO (xs:int), NROLISTAPRECIO (xs:int),
 *   CODIGOUNICO, CODIGOFAMILIA, CODIGOGRUPO, CODIGOSUBGRUPO, SIMBOLO (xs:string),
 *   PRECIO (xs:double). NroListaPrecio es obligatorio en el request.
 *
 * Todos los campos son minOccurs=0 en el XSD real (que difiere del PDF en tipos).
 *
 * Reglas comunes:
 * - Enteros (xs:int): tag ausente → null; presente → entero seguro, sin rango ni signo.
 * - Textos: tag ausente → null (raw y normalizado); presente → raw exacto y
 *   normalizado = trim (puede quedar ""). Monedas/símbolos sin mapear a ISO.
 * - Precios: el raw es la fuente fiel; el number es solo de conveniencia
 *   (sin redondear). xs:decimal no admite exponente; xs:double se acepta
 *   finito (INF/NaN se rechazan). Sin imponer signo.
 * - Sin identidad ni selección: se preservan todas las filas en orden, sin
 *   deduplicar. No se define precio de referencia, lista, moneda ISO ni IVA
 *   (docs/kore/KORE-pricing-contract.md).
 *
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

// ---------------------------------------------------------------------------
// Capa común interna (no exportada desde @/lib/kore)
// ---------------------------------------------------------------------------

export const KORE_PRECIO_CODIGO_MAX_LENGTH = 22;

type TextValue = { raw: string | null; value: string | null };

function invalidArgument(operation: string, message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation, message });
}

function invalidData(operation: string, table: string, rowNumber: number, problem: string, field: string): KoreError {
  return new KoreError({ kind: "invalid_data", operation, message: `${table} row ${rowNumber}: ${problem} ${field}` });
}

function optionalText(row: DataSetRow, field: string): TextValue {
  const raw = row[field];
  if (raw === undefined) return { raw: null, value: null };
  return { raw, value: raw.trim() };
}

type RowReader = { operation: string; table: string; row: DataSetRow; rowNumber: number };

function optionalSafeInteger({ operation, table, row, rowNumber }: RowReader, field: string): number | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const value = parseSafeIntegerLexical(raw);
  if (value === null) throw invalidData(operation, table, rowNumber, "invalid", field);
  return value;
}

function optionalPrice(
  reader: RowReader,
  field: string,
  parse: (raw: string) => number | null,
): { raw: string | null; value: number | null } {
  const raw = reader.row[field];
  if (raw === undefined) return { raw: null, value: null };
  const value = parse(raw);
  if (value === null) throw invalidData(reader.operation, reader.table, reader.rowNumber, "invalid", field);
  return { raw, value };
}

/** Código de artículo: texto de hasta 22 caracteres; se envía exacto (escape XML en soap.ts). */
function validateCodigo(operation: string, key: string, value: unknown): string {
  if (typeof value !== "string") throw invalidArgument(operation, `Filtro ${key} debe ser texto`);
  if (value.length > KORE_PRECIO_CODIGO_MAX_LENGTH) {
    throw invalidArgument(operation, `Filtro ${key} excede ${KORE_PRECIO_CODIGO_MAX_LENGTH} caracteres`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// ListarPreciosxArticulo
// ---------------------------------------------------------------------------

export type KoreListaPrecioArticulo = {
  nroListaPrecio: number | null;

  /** Símbolo de moneda tal cual KORE (sin mapear a ISO). */
  monedaRaw: string | null;
  moneda: string | null;

  /** xs:decimal exacto: fuente fiel del precio. */
  precioRaw: string | null;
  /** Valor de conveniencia; no usar para igualdad exacta ni persistencia exacta. */
  precio: number | null;

  /** xs:decimal exacto: fuente fiel del precio con IVA. */
  precioIvaRaw: string | null;
  /** Valor de conveniencia; no usar para igualdad exacta ni persistencia exacta. */
  precioIva: number | null;

  nombreListaPrecioRaw: string | null;
  nombreListaPrecio: string | null;
};

const ARTICULO_OPERATION = "ListarPreciosxArticulo";
const ARTICULO_TABLE = "ListaPrecio";

/** Contrato observado en KORE-16/18: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_LISTA_PRECIO_FIELDS = ["NroListaPrecio", "Moneda", "Precio", "PrecioIVA", "NombreListaPrecio"] as const;

/** `CodigoUnico` obligatorio: texto no vacío de hasta 22 caracteres, enviado exacto y marcado sensible. */
export function buildPreciosxArticuloFields(codigoUnico: string): KoreDocField[] {
  const value = validateCodigo(ARTICULO_OPERATION, "codigoUnico", codigoUnico);
  if (value.trim() === "") throw invalidArgument(ARTICULO_OPERATION, "ListarPreciosxArticulo requires codigoUnico");
  return [{ name: "CodigoUnico", value, sensitive: true }];
}

export function normalizeListaPrecioRow(row: DataSetRow, rowNumber: number): KoreListaPrecioArticulo {
  const reader: RowReader = { operation: ARTICULO_OPERATION, table: ARTICULO_TABLE, row, rowNumber };
  const moneda = optionalText(row, "Moneda");
  const precio = optionalPrice(reader, "Precio", parseXsDecimal);
  const precioIva = optionalPrice(reader, "PrecioIVA", parseXsDecimal);
  const nombre = optionalText(row, "NombreListaPrecio");
  return {
    nroListaPrecio: optionalSafeInteger(reader, "NroListaPrecio"),
    monedaRaw: moneda.raw,
    moneda: moneda.value,
    precioRaw: precio.raw,
    precio: precio.value,
    precioIvaRaw: precioIva.raw,
    precioIva: precioIva.value,
    nombreListaPrecioRaw: nombre.raw,
    nombreListaPrecio: nombre.value,
  };
}

/** Preserva todas las filas en orden: sin deduplicar ni validar unicidad de listas. */
export function parseListarPreciosxArticuloResult(result: XmlElement): KoreListaPrecioArticulo[] {
  return readDataSetRows(result, ARTICULO_TABLE, ARTICULO_OPERATION, { expectedFields: KORE_LISTA_PRECIO_FIELDS }).map(
    (row, index) => normalizeListaPrecioRow(row, index + 1),
  );
}

/** Una llamada SOAP 1.2 (binding validado en KORE-16/18). */
export async function fetchKorePreciosxArticulo(
  client: KoreClient,
  codigoUnico: string,
): Promise<KoreListaPrecioArticulo[]> {
  const docFields = buildPreciosxArticuloFields(codigoUnico);
  return parseListarPreciosxArticuloResult(await client.call(ARTICULO_OPERATION, docFields, { soapVersion: "1.2" }));
}

// ---------------------------------------------------------------------------
// ListarPrecios
// ---------------------------------------------------------------------------

export type KorePrecio = {
  /** Identificador técnico de KORE; no se asume unicidad ni PK. */
  autonumerado: number | null;
  nroListaPrecio: number | null;

  codigoUnicoRaw: string;
  codigoUnico: string;

  codigoFamiliaRaw: string | null;
  codigoFamilia: string | null;

  codigoGrupoRaw: string | null;
  codigoGrupo: string | null;

  codigoSubgrupoRaw: string | null;
  codigoSubgrupo: string | null;

  /** Símbolo de moneda tal cual KORE (sin mapear a ISO). */
  simboloRaw: string | null;
  simbolo: string | null;

  /** Texto exacto de KORE (xs:double): fuente fiel del precio. */
  precioRaw: string | null;
  /** Valor de conveniencia finito; no usar para igualdad exacta ni persistencia exacta. */
  precio: number | null;
};

/**
 * `nroListaPrecio` es obligatorio (documentado `**`; sin él KORE responde ERROR).
 * Además, por seguridad local, se exige al menos un código: una lista completa
 * puede ser muy grande y requerirá un diseño explícito con paginado.
 */
export type KorePrecioFilters = {
  nroListaPrecio: number;
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
};

const PRECIO_OPERATION = "ListarPrecios";
const PRECIO_TABLE = "Precio";

/** Contrato observado en KORE-18: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_PRECIO_FIELDS = [
  "AUTONUMERADO",
  "NROLISTAPRECIO",
  "CODIGOUNICO",
  "CODIGOFAMILIA",
  "CODIGOGRUPO",
  "CODIGOSUBGRUPO",
  "SIMBOLO",
  "PRECIO",
] as const;

const PRECIO_CODE_FILTER_TAGS = [
  ["codigoUnicoInicial", "CodigoUnicoInicial"],
  ["codigoUnicoFinal", "CodigoUnicoFinal"],
] as const satisfies readonly (readonly [keyof KorePrecioFilters, string])[];

const PRECIO_KNOWN_FILTERS = new Set<string>(["nroListaPrecio", ...PRECIO_CODE_FILTER_TAGS.map(([key]) => key)]);

/**
 * Tags en el orden del ejemplo oficial: NroListaPrecio, CodigoUnicoInicial,
 * CodigoUnicoFinal. NroListaPrecio: entero seguro (Integer documentado; sin
 * rango ni signo). Códigos: texto ≤ 22, vacíos/whitespace no cuentan. Todos
 * los filtros son sensibles.
 */
export function buildPrecioFilterFields(filters: KorePrecioFilters): KoreDocField[] {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument(PRECIO_OPERATION, "Filtros de precios inválidos");
  }
  for (const key of Object.keys(filters)) {
    if (!PRECIO_KNOWN_FILTERS.has(key)) {
      throw invalidArgument(PRECIO_OPERATION, `Filtro de precios desconocido: ${key.slice(0, 40)}`);
    }
  }

  const nroListaPrecio: unknown = filters.nroListaPrecio;
  if (nroListaPrecio === undefined) {
    throw invalidArgument(PRECIO_OPERATION, "ListarPrecios requires nroListaPrecio");
  }
  if (typeof nroListaPrecio !== "number" || !Number.isSafeInteger(nroListaPrecio)) {
    throw invalidArgument(PRECIO_OPERATION, "Filtro nroListaPrecio debe ser un entero seguro");
  }
  const fields: KoreDocField[] = [{ name: "NroListaPrecio", value: String(nroListaPrecio), sensitive: true }];

  for (const [key, tag] of PRECIO_CODE_FILTER_TAGS) {
    const value: unknown = filters[key];
    if (value === undefined) continue;
    const codigo = validateCodigo(PRECIO_OPERATION, key, value);
    if (codigo.trim() === "") continue;
    fields.push({ name: tag, value: codigo, sensitive: true });
  }

  // Restricción local de seguridad: sin rango de códigos traería la lista completa.
  if (fields.length === 1) {
    throw invalidArgument(PRECIO_OPERATION, "ListarPrecios requires codigoUnicoInicial or codigoUnicoFinal");
  }
  return fields;
}

export function normalizePrecioRow(row: DataSetRow, rowNumber: number): KorePrecio {
  const reader: RowReader = { operation: PRECIO_OPERATION, table: PRECIO_TABLE, row, rowNumber };
  const codigoUnicoRaw = row.CODIGOUNICO;
  if (codigoUnicoRaw === undefined || codigoUnicoRaw.trim() === "") {
    throw invalidData(PRECIO_OPERATION, PRECIO_TABLE, rowNumber, "missing", "CODIGOUNICO");
  }
  const familia = optionalText(row, "CODIGOFAMILIA");
  const grupo = optionalText(row, "CODIGOGRUPO");
  const subgrupo = optionalText(row, "CODIGOSUBGRUPO");
  const simbolo = optionalText(row, "SIMBOLO");
  const autonumerado = optionalSafeInteger(reader, "AUTONUMERADO");
  const nroListaPrecio = optionalSafeInteger(reader, "NROLISTAPRECIO");
  const precio = optionalPrice(reader, "PRECIO", parseFiniteXsDouble);
  return {
    autonumerado,
    nroListaPrecio,
    codigoUnicoRaw,
    codigoUnico: codigoUnicoRaw.trim(),
    codigoFamiliaRaw: familia.raw,
    codigoFamilia: familia.value,
    codigoGrupoRaw: grupo.raw,
    codigoGrupo: grupo.value,
    codigoSubgrupoRaw: subgrupo.raw,
    codigoSubgrupo: subgrupo.value,
    simboloRaw: simbolo.raw,
    simbolo: simbolo.value,
    precioRaw: precio.raw,
    precio: precio.value,
  };
}

/** Preserva todas las filas en orden: sin deduplicar ni validar unicidad (tampoco de AUTONUMERADO). */
export function parseListarPreciosResult(result: XmlElement): KorePrecio[] {
  return readDataSetRows(result, PRECIO_TABLE, PRECIO_OPERATION, { expectedFields: KORE_PRECIO_FIELDS }).map(
    (row, index) => normalizePrecioRow(row, index + 1),
  );
}

/**
 * Una llamada SOAP 1.2 (binding validado en KORE-18). Post-condición: toda fila
 * debe pertenecer a la lista pedida; una fila de otra lista o sin lista falla.
 */
export async function fetchKorePrecios(client: KoreClient, filters: KorePrecioFilters): Promise<KorePrecio[]> {
  const docFields = buildPrecioFilterFields(filters);
  const precios = parseListarPreciosResult(await client.call(PRECIO_OPERATION, docFields, { soapVersion: "1.2" }));
  precios.forEach((precio, index) => {
    if (precio.nroListaPrecio !== filters.nroListaPrecio) {
      throw invalidData(PRECIO_OPERATION, PRECIO_TABLE, index + 1, "unexpected", "NROLISTAPRECIO");
    }
  });
  return precios;
}
