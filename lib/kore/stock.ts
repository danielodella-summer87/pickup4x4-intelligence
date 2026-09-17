import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarStock → KoreStock[] (stock de artículos por ubicación y estado).
 *
 * Contrato REAL observado en KORE-13/14 (SOAP 1.2): tabla única `Stock` con
 * CODIGOUNICO (xs:string), CANTIDAD (xs:double), CODIGOUBICACION (xs:string),
 * NROESTADO (xs:unsignedByte), UBICACION (xs:string); todos minOccurs=0. El XSD
 * del PDF oficial omite NROESTADO: manda el servicio real. Textos con padding a
 * derecha (observado: código 22, código de ubicación 10, ubicación 30; no se exige).
 *
 * Reglas:
 * - CODIGOUNICO: obligatorio para asociar la fila a un artículo; `codigoUnicoRaw`
 *   exacto y `codigoUnico` = raw.trim() no vacío. Nunca number.
 * - CANTIDAD: tag ausente → null; presente → double finito con signo (negativos,
 *   cero y decimales válidos). Sin redondear.
 * - NROESTADO: tag ausente → null; presente → entero 0..255 (xs:unsignedByte).
 * - CODIGOUBICACION / UBICACION: tag ausente → null (raw y normalizado); presente
 *   → raw exacto y normalizado = raw.trim() (puede ser "").
 * - Sin identidad ni agregación: se preservan todas las filas, en orden, sin
 *   deduplicar ni validar unicidad. (codigo, ubicacion) NO es única (KORE-14:
 *   misma ubicación con varios estados). No se suma CANTIDAD ni se interpreta
 *   NROESTADO. La relación con el Stock del Excel está sin resolver
 *   (docs/kore/KORE-stock-contract.md).
 *
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

export type KoreStock = {
  /** Valor exacto devuelto por KORE, incluido el padding. */
  codigoUnicoRaw: string;
  /** Identidad del artículo normalizada (codigoUnicoRaw.trim()). */
  codigoUnico: string;

  /** Cantidad tal cual la informa KORE (puede ser negativa o decimal). */
  cantidad: number | null;

  codigoUbicacionRaw: string | null;
  codigoUbicacion: string | null;

  /** Estado de stock de KORE (xs:unsignedByte). Sin semántica asignada. */
  nroEstado: number | null;

  ubicacionRaw: string | null;
  ubicacion: string | null;
};

/**
 * Filtros documentados: códigos Varchar(22) y NroEstado Integer. Se exige al
 * menos uno efectivo: sin filtros KORE devolvería todo el stock.
 */
export type KoreStockFilters = {
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
  nroEstado?: number;
};

const OPERATION = "ListarStock";
const TABLE = "Stock";
export const KORE_STOCK_CODIGO_MAX_LENGTH = 22;
const UNSIGNED_BYTE_MAX = 255;

/** Contrato observado en KORE-13/14: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_STOCK_FIELDS = ["CODIGOUNICO", "CANTIDAD", "CODIGOUBICACION", "NROESTADO", "UBICACION"] as const;

type KoreStockField = (typeof KORE_STOCK_FIELDS)[number];

/** Forma léxica decimal de xs:double (sin INF/NaN ni hexadecimal). */
const DOUBLE_LEXICAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const CODE_FILTER_TAGS = [
  ["codigoUnicoInicial", "CodigoUnicoInicial"],
  ["codigoUnicoFinal", "CodigoUnicoFinal"],
] as const satisfies readonly (readonly [keyof KoreStockFilters, string])[];

const KNOWN_FILTERS = new Set<string>([...CODE_FILTER_TAGS.map(([key]) => key), "nroEstado"]);

function invalidArgument(message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation: OPERATION, message });
}

function invalidData(rowNumber: number, problem: string, field: KoreStockField): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: OPERATION,
    message: `${TABLE} row ${rowNumber}: ${problem} ${field}`,
  });
}

/**
 * Tags de filtro en orden estable. Códigos: texto de hasta 22 caracteres, se
 * omiten vacíos/whitespace-only y se envía el contenido exacto. NroEstado: el
 * input está documentado como Integer, así que solo se exige entero seguro (el
 * rango 0..255 es del OUTPUT, no se infiere para el request). Claves desconocidas
 * fallan. Todos los filtros son datos comerciales: se marcan `sensitive`.
 */
export function buildStockFilterFields(filters: KoreStockFilters = {}): KoreDocField[] {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument("Filtros de stock inválidos");
  }
  for (const key of Object.keys(filters)) {
    if (!KNOWN_FILTERS.has(key)) {
      throw invalidArgument(`Filtro de stock desconocido: ${key.slice(0, 40)}`);
    }
  }

  const fields: KoreDocField[] = [];
  for (const [key, tag] of CODE_FILTER_TAGS) {
    const value: unknown = filters[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw invalidArgument(`Filtro ${key} debe ser texto`);
    if (value.length > KORE_STOCK_CODIGO_MAX_LENGTH) {
      throw invalidArgument(`Filtro ${key} excede ${KORE_STOCK_CODIGO_MAX_LENGTH} caracteres`);
    }
    if (value.trim() === "") continue;
    fields.push({ name: tag, value, sensitive: true });
  }

  const nroEstado: unknown = filters.nroEstado;
  if (nroEstado !== undefined) {
    if (typeof nroEstado !== "number" || !Number.isSafeInteger(nroEstado)) {
      throw invalidArgument("Filtro nroEstado debe ser un entero seguro");
    }
    fields.push({ name: "NroEstado", value: String(nroEstado), sensitive: true });
  }

  // Sin filtros KORE devolvería todo el stock: no permitido.
  if (fields.length === 0) {
    throw invalidArgument("ListarStock requires at least one filter");
  }
  return fields;
}

function optionalText(row: DataSetRow, field: KoreStockField): { raw: string | null; value: string | null } {
  const raw = row[field];
  if (raw === undefined) return { raw: null, value: null };
  return { raw, value: raw.trim() };
}

function optionalDouble(row: DataSetRow, field: KoreStockField, rowNumber: number): number | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  const value = DOUBLE_LEXICAL.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isFinite(value)) throw invalidData(rowNumber, "invalid", field);
  return value;
}

function optionalUnsignedByte(row: DataSetRow, field: KoreStockField, rowNumber: number): number | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  const value = /^\+?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(value) || value > UNSIGNED_BYTE_MAX) {
    throw invalidData(rowNumber, "invalid", field);
  }
  return value;
}

export function normalizeStockRow(row: DataSetRow, rowNumber: number): KoreStock {
  const codigoUnicoRaw = row.CODIGOUNICO;
  if (codigoUnicoRaw === undefined || codigoUnicoRaw.trim() === "") {
    throw invalidData(rowNumber, "missing", "CODIGOUNICO");
  }
  const codigoUbicacion = optionalText(row, "CODIGOUBICACION");
  const ubicacion = optionalText(row, "UBICACION");

  return {
    codigoUnicoRaw,
    codigoUnico: codigoUnicoRaw.trim(),
    cantidad: optionalDouble(row, "CANTIDAD", rowNumber),
    codigoUbicacionRaw: codigoUbicacion.raw,
    codigoUbicacion: codigoUbicacion.value,
    nroEstado: optionalUnsignedByte(row, "NROESTADO", rowNumber),
    ubicacionRaw: ubicacion.raw,
    ubicacion: ubicacion.value,
  };
}

/** Preserva todas las filas en orden: sin deduplicar, sin unicidad y sin agregar cantidades. */
export function parseListarStockResult(result: XmlElement): KoreStock[] {
  return readDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_STOCK_FIELDS }).map((row, index) =>
    normalizeStockRow(row, index + 1),
  );
}

/** Una llamada SOAP 1.2 (binding validado en KORE-13/14). */
export async function fetchKoreStock(client: KoreClient, filters: KoreStockFilters): Promise<KoreStock[]> {
  const docFields = buildStockFilterFields(filters);
  return parseListarStockResult(await client.call(OPERATION, docFields, { soapVersion: "1.2" }));
}
