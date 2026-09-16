import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarArticulos → KoreArticulo[].
 *
 * Contrato observado en KORE-6: tabla única `Articulo` con 11 campos, todos
 * minOccurs=0. KORE devuelve CODIGOUNICO con padding de whitespace.
 *
 * Reglas:
 * - codigoUnicoRaw: exactamente como llega. codigoUnico: raw.trim(), obligatorio,
 *   único (la unicidad se valida sobre el valor normalizado). Siempre string.
 * - Taxonomía (familia/grupo/subgrupo): tag ausente → raw y normalizado null (sin
 *   relación observable); presente → raw exacto y normalizado = raw.trim(), que puede
 *   ser "" (relaciona con el blank KORE taxonomy record). Nunca number. Relaciones
 *   (normalizadas): familia → Familia; (familia, grupo) → Grupo;
 *   (familia, grupo, subgrupo) → Subgrupo.
 * - Descripción/observaciones: ausente o solo whitespace → ""; con contenido
 *   visible se conserva exacto.
 * - Flags: tag ausente → null; "0"/"1" → 0/1; cualquier otro valor → invalid_data.
 *   BASICO/MINIMO/EXENTO no se validan como mutuamente excluyentes (no documentado).
 *
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

export type KoreArticulo = {
  /** Identidad operacional normalizada (codigoUnicoRaw.trim()). */
  codigoUnico: string;
  /** Valor exacto devuelto por KORE, incluido el padding. */
  codigoUnicoRaw: string;

  /**
   * Taxonomía normalizada (raw.trim()). null = KORE no envió el tag;
   * "" = KORE envió explícitamente el código blank (blank KORE taxonomy record).
   */
  codigoFamilia: string | null;
  /** Valor exacto devuelto por KORE (padding incluido); null si el tag no vino. */
  codigoFamiliaRaw: string | null;

  codigoGrupo: string | null;
  codigoGrupoRaw: string | null;

  codigoSubgrupo: string | null;
  codigoSubgrupoRaw: string | null;

  descripcion: string;

  basico: 0 | 1 | null;
  minimo: 0 | 1 | null;
  exento: 0 | 1 | null;

  deshabilitado: 0 | 1 | null;
  controlaStock: 0 | 1 | null;

  observaciones: string;
};

/**
 * Filtros de KORE (todos string). Se exige al menos uno con contenido visible:
 * sin filtros KORE devolvería el catálogo completo.
 */
export type KoreArticuloFilters = {
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
  descripcion?: string;
  codigoFamilia?: string;
  codigoGrupo?: string;
  codigoSubgrupo?: string;
};

const OPERATION = "ListarArticulos";
const TABLE = "Articulo";

/** Contrato observado en KORE-6: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_ARTICULO_FIELDS = [
  "CODIGOUNICO",
  "CODIGOFAMILIA",
  "CODIGOGRUPO",
  "CODIGOSUBGRUPO",
  "DESCRIPCION",
  "BASICO",
  "MINIMO",
  "EXENTO",
  "DESHABILITADO",
  "CONTROLASTOCK",
  "OBSERVACIONES",
] as const;

type KoreArticuloField = (typeof KORE_ARTICULO_FIELDS)[number];

/** Orden estable de los tags. Todos se tratan como sensibles (datos comerciales). */
const FILTER_TAGS = [
  ["codigoUnicoInicial", "CodigoUnicoInicial"],
  ["codigoUnicoFinal", "CodigoUnicoFinal"],
  ["descripcion", "Descripcion"],
  ["codigoFamilia", "CodigoFamilia"],
  ["codigoGrupo", "CodigoGrupo"],
  ["codigoSubgrupo", "CodigoSubgrupo"],
] as const satisfies readonly (readonly [keyof KoreArticuloFilters, string])[];

function invalidArgument(message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation: OPERATION, message });
}

function invalidData(rowNumber: number, problem: string, field: KoreArticuloField): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: OPERATION,
    message: `${TABLE} row ${rowNumber}: ${problem} ${field}`,
  });
}

/**
 * Tags de filtro en orden estable. Omite `undefined`, vacíos y whitespace-only
 * (no cuentan como filtro ni se envían); el contenido visible se envía exacto
 * (el escape XML lo hace soap.ts). Claves desconocidas o valores no string fallan.
 * Se marcan `sensitive` para que un eco de KORE no reaparezca en errores.
 */
export function buildArticuloFilterFields(filters: KoreArticuloFilters = {}): KoreDocField[] {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument("Filtros de artículos inválidos");
  }
  const known = new Set<string>(FILTER_TAGS.map(([key]) => key));
  for (const key of Object.keys(filters)) {
    if (!known.has(key)) {
      throw invalidArgument(`Filtro de artículos desconocido: ${key.slice(0, 40)}`);
    }
  }

  const fields: KoreDocField[] = [];
  for (const [key, tag] of FILTER_TAGS) {
    const value: unknown = filters[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw invalidArgument(`Filtro ${key} debe ser texto`);
    if (value.trim() === "") continue;
    fields.push({ name: tag, value, sensitive: true });
  }

  // Sin filtros KORE devuelve TODO el catálogo: no permitido en esta etapa.
  if (fields.length === 0) {
    throw invalidArgument("ListarArticulos requires at least one filter");
  }
  return fields;
}

function text(row: DataSetRow, field: KoreArticuloField): string {
  const raw = row[field];
  if (raw === undefined || raw.trim() === "") return "";
  return raw;
}

function optionalFlag(row: DataSetRow, field: KoreArticuloField, rowNumber: number): 0 | 1 | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "0") return 0;
  if (trimmed === "1") return 1;
  throw invalidData(rowNumber, "invalid", field);
}

export function normalizeArticuloRow(row: DataSetRow, rowNumber: number): KoreArticulo {
  const codigoUnicoRaw = row.CODIGOUNICO;
  if (codigoUnicoRaw === undefined || codigoUnicoRaw.trim() === "") {
    throw invalidData(rowNumber, "missing", "CODIGOUNICO");
  }

  const codigoFamiliaRaw = row.CODIGOFAMILIA ?? null;
  const codigoGrupoRaw = row.CODIGOGRUPO ?? null;
  const codigoSubgrupoRaw = row.CODIGOSUBGRUPO ?? null;

  return {
    codigoUnico: codigoUnicoRaw.trim(),
    codigoUnicoRaw,
    codigoFamilia: codigoFamiliaRaw === null ? null : codigoFamiliaRaw.trim(),
    codigoFamiliaRaw,
    codigoGrupo: codigoGrupoRaw === null ? null : codigoGrupoRaw.trim(),
    codigoGrupoRaw,
    codigoSubgrupo: codigoSubgrupoRaw === null ? null : codigoSubgrupoRaw.trim(),
    codigoSubgrupoRaw,
    descripcion: text(row, "DESCRIPCION"),
    basico: optionalFlag(row, "BASICO", rowNumber),
    minimo: optionalFlag(row, "MINIMO", rowNumber),
    exento: optionalFlag(row, "EXENTO", rowNumber),
    deshabilitado: optionalFlag(row, "DESHABILITADO", rowNumber),
    controlaStock: optionalFlag(row, "CONTROLASTOCK", rowNumber),
    observaciones: text(row, "OBSERVACIONES"),
  };
}

export function parseListarArticulosResult(result: XmlElement): KoreArticulo[] {
  const rows = readDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_ARTICULO_FIELDS });
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const articulo = normalizeArticuloRow(row, index + 1);
    if (seen.has(articulo.codigoUnico)) throw invalidData(index + 1, "duplicate", "CODIGOUNICO");
    seen.add(articulo.codigoUnico);
    return articulo;
  });
}

export async function fetchKoreArticulos(
  client: KoreClient,
  filters: KoreArticuloFilters,
): Promise<KoreArticulo[]> {
  const docFields = buildArticuloFilterFields(filters);
  return parseListarArticulosResult(await client.call(OPERATION, docFields));
}
