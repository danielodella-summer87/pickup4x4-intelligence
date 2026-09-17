import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import {
  KORE_CODIGO_UNICO_MAX_LENGTH,
  assertFilterObject,
  finiteDoubleField,
  invalidArgument,
  optionalTextFilter,
  requiredSafeIntegerFilter,
  requiredTextField,
  safeIntegerField,
  textField,
} from "./row-fields.ts";
import type { RowContext } from "./row-fields.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Descuentos KORE (READ-ONLY), dos métodos con contratos SEPARADOS (KORE-20, SOAP 1.2).
 *
 * ListarDescuentosXCantidad → KoreDescuentoXCantidad[]
 *   Tabla `DescuentoXCantidad`: NROLISTAPRECIO (xs:int), CODIGOUNICO (xs:string),
 *   CANTIDADAPARTIRDE (xs:double), PORCDESCUENTO (xs:double).
 *
 * ListarCuentasGruposDescuentos → KoreCuentaGrupoDescuento[]
 *   Tabla `DescuentoXCantidad` (mismo nombre, otros campos): AUTONUMERICO (xs:int),
 *   CODIGOFAMILIA, CODIGOGRUPO, CODIGOSUBGRUPO (xs:string), NROCUENTA (xs:int),
 *   CODIGOUNICOINICIAL, CODIGOUNICOFINAL (xs:string), DESCUENTO3, DESCUENTO2,
 *   DESCUENTO1 (xs:double), SIMBOLO (xs:string), NROLISTA (xs:double).
 *
 * XSD reales iguales a la documentación; todos minOccurs=0. La inspección del
 * artículo de prueba devolvió 0 filas en ambos: el formato de filas reales
 * (padding, escalas) no está observado.
 *
 * Reglas: textos raw + trim; enteros seguros; doubles finitos con raw exacto.
 * Sin deduplicar, sin PK, sin prioridad entre reglas, sin interpretar descuentos.
 */

// ---------------------------------------------------------------------------
// ListarDescuentosXCantidad
// ---------------------------------------------------------------------------

export type KoreDescuentoXCantidad = {
  nroListaPrecio: number | null;
  codigoUnicoRaw: string;
  codigoUnico: string;
  cantidadAPartirDeRaw: string | null;
  cantidadAPartirDe: number | null;
  porcDescuentoRaw: string | null;
  porcDescuento: number | null;
};

/**
 * `nroListaPrecio` obligatorio (documentado `**`). Seguridad local: además al
 * menos un código. `cantidad` (Float documentado) es opcional.
 */
export type KoreDescuentoXCantidadFilters = {
  nroListaPrecio: number;
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
  cantidad?: number;
};

const CANTIDAD_OPERATION = "ListarDescuentosXCantidad";
const CANTIDAD_TABLE = "DescuentoXCantidad";

export const KORE_DESCUENTO_X_CANTIDAD_FIELDS = ["NROLISTAPRECIO", "CODIGOUNICO", "CANTIDADAPARTIRDE", "PORCDESCUENTO"] as const;

export function buildDescuentoXCantidadFilterFields(filters: KoreDescuentoXCantidadFilters): KoreDocField[] {
  assertFilterObject(CANTIDAD_OPERATION, filters, ["nroListaPrecio", "codigoUnicoInicial", "codigoUnicoFinal", "cantidad"]);
  const lista = requiredSafeIntegerFilter(CANTIDAD_OPERATION, "nroListaPrecio", "NroListaPrecio", filters.nroListaPrecio);
  const codigos = [
    optionalTextFilter(CANTIDAD_OPERATION, "codigoUnicoInicial", "CodigoUnicoInicial", filters.codigoUnicoInicial, KORE_CODIGO_UNICO_MAX_LENGTH),
    optionalTextFilter(CANTIDAD_OPERATION, "codigoUnicoFinal", "CodigoUnicoFinal", filters.codigoUnicoFinal, KORE_CODIGO_UNICO_MAX_LENGTH),
  ].filter((field): field is KoreDocField => field !== null);
  // Restricción local de seguridad: sin rango traería todos los descuentos de la lista.
  if (codigos.length === 0) {
    throw invalidArgument(CANTIDAD_OPERATION, "ListarDescuentosXCantidad requires codigoUnicoInicial or codigoUnicoFinal");
  }
  const fields = [lista, ...codigos];
  const cantidad: unknown = filters.cantidad;
  if (cantidad !== undefined) {
    // Forma decimal simple: sin exponente (no documentado para el request).
    if (typeof cantidad !== "number" || !Number.isFinite(cantidad) || /e/i.test(String(cantidad))) {
      throw invalidArgument(CANTIDAD_OPERATION, "Filtro cantidad debe ser un número finito en forma decimal");
    }
    fields.push({ name: "Cantidad", value: String(cantidad), sensitive: true });
  }
  return fields;
}

export function normalizeDescuentoXCantidadRow(row: DataSetRow, rowNumber: number): KoreDescuentoXCantidad {
  const ctx: RowContext = { operation: CANTIDAD_OPERATION, table: CANTIDAD_TABLE, row, rowNumber };
  const codigo = requiredTextField(ctx, "CODIGOUNICO");
  const nroListaPrecio = safeIntegerField(ctx, "NROLISTAPRECIO");
  const cantidad = finiteDoubleField(ctx, "CANTIDADAPARTIRDE");
  const porcentaje = finiteDoubleField(ctx, "PORCDESCUENTO");
  return {
    nroListaPrecio,
    codigoUnicoRaw: codigo.raw,
    codigoUnico: codigo.value,
    cantidadAPartirDeRaw: cantidad.raw,
    cantidadAPartirDe: cantidad.value,
    porcDescuentoRaw: porcentaje.raw,
    porcDescuento: porcentaje.value,
  };
}

export function parseListarDescuentosXCantidadResult(result: XmlElement): KoreDescuentoXCantidad[] {
  return readDataSetRows(result, CANTIDAD_TABLE, CANTIDAD_OPERATION, { expectedFields: KORE_DESCUENTO_X_CANTIDAD_FIELDS }).map(
    (row, index) => normalizeDescuentoXCantidadRow(row, index + 1),
  );
}

export async function fetchKoreDescuentosXCantidad(
  client: KoreClient,
  filters: KoreDescuentoXCantidadFilters,
): Promise<KoreDescuentoXCantidad[]> {
  const docFields = buildDescuentoXCantidadFilterFields(filters);
  return parseListarDescuentosXCantidadResult(await client.call(CANTIDAD_OPERATION, docFields, { soapVersion: "1.2" }));
}

// ---------------------------------------------------------------------------
// ListarCuentasGruposDescuentos
// ---------------------------------------------------------------------------

export type KoreCuentaGrupoDescuento = {
  autonumerico: number | null;
  codigoFamiliaRaw: string | null;
  codigoFamilia: string | null;
  codigoGrupoRaw: string | null;
  codigoGrupo: string | null;
  codigoSubgrupoRaw: string | null;
  codigoSubgrupo: string | null;
  nroCuenta: number | null;
  codigoUnicoInicialRaw: string | null;
  codigoUnicoInicial: string | null;
  codigoUnicoFinalRaw: string | null;
  codigoUnicoFinal: string | null;
  descuento1Raw: string | null;
  descuento1: number | null;
  descuento2Raw: string | null;
  descuento2: number | null;
  descuento3Raw: string | null;
  descuento3: number | null;
  simboloRaw: string | null;
  simbolo: string | null;
  /** xs:double real: se preserva raw además del number. */
  nroListaRaw: string | null;
  nroLista: number | null;
};

/**
 * Todos opcionales, pero (documentado) debe indicarse rango de artículos o algún
 * campo de categoría: se exige al menos uno efectivo.
 */
export type KoreCuentaGrupoDescuentoFilters = {
  codigoFamilia?: string;
  codigoGrupo?: string;
  codigoSubgrupo?: string;
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
};

const GRUPOS_OPERATION = "ListarCuentasGruposDescuentos";
const GRUPOS_TABLE = "DescuentoXCantidad";
const CATEGORIA_MAX_LENGTH = 6;

export const KORE_CUENTA_GRUPO_DESCUENTO_FIELDS = [
  "AUTONUMERICO",
  "CODIGOFAMILIA",
  "CODIGOGRUPO",
  "CODIGOSUBGRUPO",
  "NROCUENTA",
  "CODIGOUNICOINICIAL",
  "CODIGOUNICOFINAL",
  "DESCUENTO3",
  "DESCUENTO2",
  "DESCUENTO1",
  "SIMBOLO",
  "NROLISTA",
] as const;

const GRUPOS_FILTER_TAGS = [
  ["codigoFamilia", "CodigoFamilia", CATEGORIA_MAX_LENGTH],
  ["codigoGrupo", "CodigoGrupo", CATEGORIA_MAX_LENGTH],
  ["codigoSubgrupo", "CodigoSubgrupo", CATEGORIA_MAX_LENGTH],
  ["codigoUnicoInicial", "CodigoUnicoInicial", KORE_CODIGO_UNICO_MAX_LENGTH],
  ["codigoUnicoFinal", "CodigoUnicoFinal", KORE_CODIGO_UNICO_MAX_LENGTH],
] as const satisfies readonly (readonly [keyof KoreCuentaGrupoDescuentoFilters, string, number])[];

export function buildCuentaGrupoDescuentoFilterFields(filters: KoreCuentaGrupoDescuentoFilters): KoreDocField[] {
  assertFilterObject(GRUPOS_OPERATION, filters, GRUPOS_FILTER_TAGS.map(([key]) => key));
  const fields = GRUPOS_FILTER_TAGS.map(([key, tag, max]) => optionalTextFilter(GRUPOS_OPERATION, key, tag, filters[key], max)).filter(
    (field): field is KoreDocField => field !== null,
  );
  if (fields.length === 0) {
    throw invalidArgument(GRUPOS_OPERATION, "ListarCuentasGruposDescuentos requires a code range or category filter");
  }
  return fields;
}

export function normalizeCuentaGrupoDescuentoRow(row: DataSetRow, rowNumber: number): KoreCuentaGrupoDescuento {
  const ctx: RowContext = { operation: GRUPOS_OPERATION, table: GRUPOS_TABLE, row, rowNumber };
  const familia = textField(ctx, "CODIGOFAMILIA");
  const grupo = textField(ctx, "CODIGOGRUPO");
  const subgrupo = textField(ctx, "CODIGOSUBGRUPO");
  const inicial = textField(ctx, "CODIGOUNICOINICIAL");
  const final = textField(ctx, "CODIGOUNICOFINAL");
  const simbolo = textField(ctx, "SIMBOLO");
  const autonumerico = safeIntegerField(ctx, "AUTONUMERICO");
  const nroCuenta = safeIntegerField(ctx, "NROCUENTA");
  const d3 = finiteDoubleField(ctx, "DESCUENTO3");
  const d2 = finiteDoubleField(ctx, "DESCUENTO2");
  const d1 = finiteDoubleField(ctx, "DESCUENTO1");
  const nroLista = finiteDoubleField(ctx, "NROLISTA");
  return {
    autonumerico,
    codigoFamiliaRaw: familia.raw,
    codigoFamilia: familia.value,
    codigoGrupoRaw: grupo.raw,
    codigoGrupo: grupo.value,
    codigoSubgrupoRaw: subgrupo.raw,
    codigoSubgrupo: subgrupo.value,
    nroCuenta,
    codigoUnicoInicialRaw: inicial.raw,
    codigoUnicoInicial: inicial.value,
    codigoUnicoFinalRaw: final.raw,
    codigoUnicoFinal: final.value,
    descuento1Raw: d1.raw,
    descuento1: d1.value,
    descuento2Raw: d2.raw,
    descuento2: d2.value,
    descuento3Raw: d3.raw,
    descuento3: d3.value,
    simboloRaw: simbolo.raw,
    simbolo: simbolo.value,
    nroListaRaw: nroLista.raw,
    nroLista: nroLista.value,
  };
}

export function parseListarCuentasGruposDescuentosResult(result: XmlElement): KoreCuentaGrupoDescuento[] {
  return readDataSetRows(result, GRUPOS_TABLE, GRUPOS_OPERATION, { expectedFields: KORE_CUENTA_GRUPO_DESCUENTO_FIELDS }).map(
    (row, index) => normalizeCuentaGrupoDescuentoRow(row, index + 1),
  );
}

export async function fetchKoreCuentasGruposDescuentos(
  client: KoreClient,
  filters: KoreCuentaGrupoDescuentoFilters,
): Promise<KoreCuentaGrupoDescuento[]> {
  const docFields = buildCuentaGrupoDescuentoFilterFields(filters);
  return parseListarCuentasGruposDescuentosResult(await client.call(GRUPOS_OPERATION, docFields, { soapVersion: "1.2" }));
}
