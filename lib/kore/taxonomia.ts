import type { KoreClient } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarFamilias / ListarGrupos / ListarSubgrupos → catálogos de taxonomía.
 *
 * Contrato observado en KORE-8: sin filtros (la llamada devuelve el catálogo
 * completo, forma documentada), una tabla por método, todos los campos minOccurs=0.
 *
 * Reglas:
 * - Códigos y descripción: `*Raw` exacto (padding de ancho fijo incluido) y
 *   normalizado = raw.trim(). Nunca se convierten a number.
 * - Códigos de identidad: el nodo es obligatorio (ausente → invalid_data). Presente
 *   con solo whitespace ES VÁLIDO: normalizado "" = blank KORE taxonomy record real.
 * - Claves naturales (normalizadas): Familia (codigoFamilia); Grupo
 *   (codigoFamilia, codigoGrupo); Subgrupo (codigoFamilia, codigoGrupo,
 *   codigoSubgrupo). CODIGOSUBGRUPO solo NO es único.
 * - DESCUENTOMAXIMO (xs:double): ausente → null; presente debe ser numérico finito.
 *   Sin semántica comercial ni rango.
 * - AUTONUMERADO (xs:int): ausente → null; presente entero xs:int. Único dentro de
 *   cada entidad; no es clave de dominio ni único entre entidades.
 *
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

export type KoreFamilia = {
  codigoFamilia: string;
  codigoFamiliaRaw: string;

  descripcion: string;
  descripcionRaw: string;

  descuentoMaximo: number | null;
  autonumerado: number | null;
};

export type KoreGrupo = {
  codigoFamilia: string;
  codigoFamiliaRaw: string;

  codigoGrupo: string;
  codigoGrupoRaw: string;

  descripcion: string;
  descripcionRaw: string;

  descuentoMaximo: number | null;
  autonumerado: number | null;
};

export type KoreSubgrupo = {
  codigoFamilia: string;
  codigoFamiliaRaw: string;

  codigoGrupo: string;
  codigoGrupoRaw: string;

  codigoSubgrupo: string;
  codigoSubgrupoRaw: string;

  descripcion: string;
  descripcionRaw: string;

  descuentoMaximo: number | null;
  autonumerado: number | null;
};

type CodeField = "CODIGOFAMILIA" | "CODIGOGRUPO" | "CODIGOSUBGRUPO";

type CatalogSpec = {
  operation: string;
  table: string;
  fields: readonly string[];
  keyFields: readonly CodeField[];
};

export const KORE_FAMILIA_FIELDS = ["CODIGOFAMILIA", "DESCRIPCION", "DESCUENTOMAXIMO", "AUTONUMERADO"] as const;
export const KORE_GRUPO_FIELDS = ["CODIGOFAMILIA", "CODIGOGRUPO", "DESCRIPCION", "DESCUENTOMAXIMO", "AUTONUMERADO"] as const;
export const KORE_SUBGRUPO_FIELDS = [
  "CODIGOFAMILIA",
  "CODIGOGRUPO",
  "CODIGOSUBGRUPO",
  "DESCRIPCION",
  "DESCUENTOMAXIMO",
  "AUTONUMERADO",
] as const;

const FAMILIAS: CatalogSpec = {
  operation: "ListarFamilias",
  table: "Familia",
  fields: KORE_FAMILIA_FIELDS,
  keyFields: ["CODIGOFAMILIA"],
};
const GRUPOS: CatalogSpec = {
  operation: "ListarGrupos",
  table: "Grupo",
  fields: KORE_GRUPO_FIELDS,
  keyFields: ["CODIGOFAMILIA", "CODIGOGRUPO"],
};
const SUBGRUPOS: CatalogSpec = {
  operation: "ListarSubgrupos",
  table: "Subgrupo",
  fields: KORE_SUBGRUPO_FIELDS,
  keyFields: ["CODIGOFAMILIA", "CODIGOGRUPO", "CODIGOSUBGRUPO"],
};

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
/** Forma léxica decimal de xs:double (sin INF/NaN ni hexadecimal). */
const DOUBLE_LEXICAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

function invalidData(spec: CatalogSpec, rowNumber: number, problem: string, field: string): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: spec.operation,
    message: `${spec.table} row ${rowNumber}: ${problem} ${field}`,
  });
}

/** Raw exacto (ausente → "") y normalizado = raw.trim(). Solo para DESCRIPCION. */
function rawAndTrimmed(row: DataSetRow, field: string): { raw: string; value: string } {
  const raw = row[field] ?? "";
  return { raw, value: raw.trim() };
}

/**
 * Código de identidad: el nodo DEBE estar presente (ausente → invalid_data).
 * Presente con solo whitespace es válido: normalizado "" = blank KORE taxonomy record.
 */
function requiredCode(
  row: DataSetRow,
  field: CodeField,
  spec: CatalogSpec,
  rowNumber: number,
): { raw: string; value: string } {
  const raw = row[field];
  if (raw === undefined) throw invalidData(spec, rowNumber, "missing", field);
  return { raw, value: raw.trim() };
}

function optionalDouble(row: DataSetRow, spec: CatalogSpec, rowNumber: number): number | null {
  const raw = row.DESCUENTOMAXIMO;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  const value = DOUBLE_LEXICAL.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isFinite(value)) throw invalidData(spec, rowNumber, "invalid", "DESCUENTOMAXIMO");
  return value;
}

function optionalInt32(row: DataSetRow, spec: CatalogSpec, rowNumber: number): number | null {
  const raw = row.AUTONUMERADO;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  const value = /^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < INT32_MIN || value > INT32_MAX) {
    throw invalidData(spec, rowNumber, "invalid", "AUTONUMERADO");
  }
  return value;
}

type CatalogCommon = {
  descripcion: string;
  descripcionRaw: string;
  descuentoMaximo: number | null;
  autonumerado: number | null;
};

function commonFields(row: DataSetRow, spec: CatalogSpec, rowNumber: number): CatalogCommon {
  const descripcion = rawAndTrimmed(row, "DESCRIPCION");
  return {
    descripcion: descripcion.value,
    descripcionRaw: descripcion.raw,
    descuentoMaximo: optionalDouble(row, spec, rowNumber),
    autonumerado: optionalInt32(row, spec, rowNumber),
  };
}

/**
 * Lee un catálogo con contrato estricto y valida unicidad de la clave natural
 * normalizada (incluida la clave blank) y de AUTONUMERADO dentro de la entidad.
 */
function readCatalog<T extends { autonumerado: number | null }>(
  result: XmlElement,
  spec: CatalogSpec,
  map: (code: (field: CodeField) => { raw: string; value: string }, common: CatalogCommon) => T,
): T[] {
  const rows = readDataSetRows(result, spec.table, spec.operation, { expectedFields: spec.fields });
  const keys = new Set<string>();
  const autonumerados = new Set<number>();

  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const code = (field: CodeField) => requiredCode(row, field, spec, rowNumber);
    const item = map(code, commonFields(row, spec, rowNumber));

    const key = JSON.stringify(spec.keyFields.map((field) => code(field).value));
    if (keys.has(key)) throw invalidData(spec, rowNumber, "duplicate", spec.keyFields.join("+"));
    keys.add(key);

    if (item.autonumerado !== null) {
      if (autonumerados.has(item.autonumerado)) {
        throw invalidData(spec, rowNumber, "duplicate", "AUTONUMERADO");
      }
      autonumerados.add(item.autonumerado);
    }
    return item;
  });
}

export function parseListarFamiliasResult(result: XmlElement): KoreFamilia[] {
  return readCatalog(result, FAMILIAS, (code, common) => {
    const familia = code("CODIGOFAMILIA");
    return {
      codigoFamilia: familia.value,
      codigoFamiliaRaw: familia.raw,
      ...common,
    };
  });
}

export function parseListarGruposResult(result: XmlElement): KoreGrupo[] {
  return readCatalog(result, GRUPOS, (code, common) => {
    const familia = code("CODIGOFAMILIA");
    const grupo = code("CODIGOGRUPO");
    return {
      codigoFamilia: familia.value,
      codigoFamiliaRaw: familia.raw,
      codigoGrupo: grupo.value,
      codigoGrupoRaw: grupo.raw,
      ...common,
    };
  });
}

export function parseListarSubgruposResult(result: XmlElement): KoreSubgrupo[] {
  return readCatalog(result, SUBGRUPOS, (code, common) => {
    const familia = code("CODIGOFAMILIA");
    const grupo = code("CODIGOGRUPO");
    const subgrupo = code("CODIGOSUBGRUPO");
    return {
      codigoFamilia: familia.value,
      codigoFamiliaRaw: familia.raw,
      codigoGrupo: grupo.value,
      codigoGrupoRaw: grupo.raw,
      codigoSubgrupo: subgrupo.value,
      codigoSubgrupoRaw: subgrupo.raw,
      ...common,
    };
  });
}

/** Una llamada → un catálogo. Sin filtros: es el contrato documentado. */
export async function fetchKoreFamilias(client: KoreClient): Promise<KoreFamilia[]> {
  return parseListarFamiliasResult(await client.call(FAMILIAS.operation));
}

export async function fetchKoreGrupos(client: KoreClient): Promise<KoreGrupo[]> {
  return parseListarGruposResult(await client.call(GRUPOS.operation));
}

export async function fetchKoreSubgrupos(client: KoreClient): Promise<KoreSubgrupo[]> {
  return parseListarSubgruposResult(await client.call(SUBGRUPOS.operation));
}

// ── Helpers puros de jerarquía (internos; la integridad completa corresponde a la sync) ──

export function familiaKey(item: { codigoFamilia: string }): string {
  return JSON.stringify([item.codigoFamilia]);
}

export function grupoKey(item: { codigoFamilia: string; codigoGrupo: string }): string {
  return JSON.stringify([item.codigoFamilia, item.codigoGrupo]);
}

export function subgrupoKey(item: { codigoFamilia: string; codigoGrupo: string; codigoSubgrupo: string }): string {
  return JSON.stringify([item.codigoFamilia, item.codigoGrupo, item.codigoSubgrupo]);
}

/** Índices (base 0) de grupos cuya familia normalizada no existe. */
export function findOrphanGrupos(
  familias: readonly { codigoFamilia: string }[],
  grupos: readonly { codigoFamilia: string }[],
): number[] {
  const keys = new Set(familias.map(familiaKey));
  return grupos.flatMap((grupo, index) => (keys.has(familiaKey(grupo)) ? [] : [index]));
}

/** Índices (base 0) de subgrupos cuyo grupo (familia, grupo) normalizado no existe. */
export function findOrphanSubgrupos(
  grupos: readonly { codigoFamilia: string; codigoGrupo: string }[],
  subgrupos: readonly { codigoFamilia: string; codigoGrupo: string }[],
): number[] {
  const keys = new Set(grupos.map(grupoKey));
  return subgrupos.flatMap((subgrupo, index) => (keys.has(grupoKey(subgrupo)) ? [] : [index]));
}
