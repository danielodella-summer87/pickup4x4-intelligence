import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarMarcasModelos → KoreMarcaModelo[] (aplicaciones de vehículo por artículo).
 *
 * Contrato observado en KORE-11 (SOAP 1.2): tabla única `MarcaYModelo` con
 * CODIGOUNICO (xs:string), NROMARCA (xs:int), MARCA (xs:string),
 * NROMODELO (xs:int), MODELO (xs:string); todos minOccurs=0. Textos con padding
 * a derecha de ancho fijo (código 22, marca/modelo 100). Un artículo produce N filas.
 *
 * Reglas:
 * - CODIGOUNICO: obligatorio para asociar la fila a un artículo; `codigoUnicoRaw`
 *   exacto y `codigoUnico` = raw.trim() no vacío. Nunca number.
 * - MARCA / MODELO: tag ausente → null (raw y normalizado); presente → raw exacto
 *   y normalizado = raw.trim() (puede ser "").
 * - NROMARCA / NROMODELO: tag ausente → null; presente → entero seguro (sin exigir
 *   signo: xs:int no lo restringe; > 0 solo fue observado).
 * - Sin supuestos de identidad: se preservan todas las filas, en orden, sin
 *   deduplicar ni validar unicidad. Candidato futuro (no invariante):
 *   (codigoUnico, nroMarca, nroModelo).
 *
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

export type KoreMarcaModelo = {
  /** Identidad del artículo normalizada (codigoUnicoRaw.trim()). */
  codigoUnico: string;
  /** Valor exacto devuelto por KORE, incluido el padding. */
  codigoUnicoRaw: string;

  nroMarca: number | null;
  marca: string | null;
  marcaRaw: string | null;

  nroModelo: number | null;
  modelo: string | null;
  modeloRaw: string | null;
};

/**
 * Filtros documentados (Varchar(22)). Se exige al menos uno con contenido
 * visible: sin filtros KORE devolvería todas las aplicaciones.
 */
export type KoreMarcaModeloFilters = {
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
};

const OPERATION = "ListarMarcasModelos";
const TABLE = "MarcaYModelo";
export const KORE_MARCA_MODELO_CODIGO_MAX_LENGTH = 22;

/** Contrato observado en KORE-11: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_MARCA_MODELO_FIELDS = ["CODIGOUNICO", "NROMARCA", "MARCA", "NROMODELO", "MODELO"] as const;

type KoreMarcaModeloField = (typeof KORE_MARCA_MODELO_FIELDS)[number];

const FILTER_TAGS = [
  ["codigoUnicoInicial", "CodigoUnicoInicial"],
  ["codigoUnicoFinal", "CodigoUnicoFinal"],
] as const satisfies readonly (readonly [keyof KoreMarcaModeloFilters, string])[];

function invalidArgument(message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation: OPERATION, message });
}

function invalidData(rowNumber: number, problem: string, field: KoreMarcaModeloField): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: OPERATION,
    message: `${TABLE} row ${rowNumber}: ${problem} ${field}`,
  });
}

/**
 * Tags de filtro en orden estable. Valida tipo y largo máximo (22), omite
 * `undefined`, vacíos y whitespace-only, y envía el contenido exacto (escape XML
 * en soap.ts). Claves desconocidas fallan. Los códigos son datos comerciales:
 * se marcan `sensitive` para que un eco de KORE no reaparezca en errores.
 */
export function buildMarcaModeloFilterFields(filters: KoreMarcaModeloFilters = {}): KoreDocField[] {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument("Filtros de marcas/modelos inválidos");
  }
  const known = new Set<string>(FILTER_TAGS.map(([key]) => key));
  for (const key of Object.keys(filters)) {
    if (!known.has(key)) {
      throw invalidArgument(`Filtro de marcas/modelos desconocido: ${key.slice(0, 40)}`);
    }
  }

  const fields: KoreDocField[] = [];
  for (const [key, tag] of FILTER_TAGS) {
    const value: unknown = filters[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw invalidArgument(`Filtro ${key} debe ser texto`);
    if (value.length > KORE_MARCA_MODELO_CODIGO_MAX_LENGTH) {
      throw invalidArgument(`Filtro ${key} excede ${KORE_MARCA_MODELO_CODIGO_MAX_LENGTH} caracteres`);
    }
    if (value.trim() === "") continue;
    fields.push({ name: tag, value, sensitive: true });
  }

  // Sin filtros KORE devolvería todas las aplicaciones: no permitido.
  if (fields.length === 0) {
    throw invalidArgument("ListarMarcasModelos requires at least one filter");
  }
  return fields;
}

function optionalText(row: DataSetRow, field: KoreMarcaModeloField): { raw: string | null; value: string | null } {
  const raw = row[field];
  if (raw === undefined) return { raw: null, value: null };
  return { raw, value: raw.trim() };
}

function optionalSafeInteger(row: DataSetRow, field: KoreMarcaModeloField, rowNumber: number): number | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  const value = /^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(value)) throw invalidData(rowNumber, "invalid", field);
  return value;
}

export function normalizeMarcaModeloRow(row: DataSetRow, rowNumber: number): KoreMarcaModelo {
  const codigoUnicoRaw = row.CODIGOUNICO;
  if (codigoUnicoRaw === undefined || codigoUnicoRaw.trim() === "") {
    throw invalidData(rowNumber, "missing", "CODIGOUNICO");
  }
  const marca = optionalText(row, "MARCA");
  const modelo = optionalText(row, "MODELO");

  return {
    codigoUnico: codigoUnicoRaw.trim(),
    codigoUnicoRaw,
    nroMarca: optionalSafeInteger(row, "NROMARCA", rowNumber),
    marca: marca.value,
    marcaRaw: marca.raw,
    nroModelo: optionalSafeInteger(row, "NROMODELO", rowNumber),
    modelo: modelo.value,
    modeloRaw: modelo.raw,
  };
}

/** Preserva todas las filas en orden: sin deduplicar ni validar unicidad. */
export function parseListarMarcasModelosResult(result: XmlElement): KoreMarcaModelo[] {
  return readDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_MARCA_MODELO_FIELDS }).map(
    (row, index) => normalizeMarcaModeloRow(row, index + 1),
  );
}

/** Una llamada SOAP 1.2 (binding validado en KORE-11). */
export async function fetchKoreMarcasModelos(
  client: KoreClient,
  filters: KoreMarcaModeloFilters,
): Promise<KoreMarcaModelo[]> {
  const docFields = buildMarcaModeloFilterFields(filters);
  return parseListarMarcasModelosResult(await client.call(OPERATION, docFields, { soapVersion: "1.2" }));
}
