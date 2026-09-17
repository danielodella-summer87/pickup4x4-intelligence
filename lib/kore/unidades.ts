import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { finiteDoubleField, requiredCodigoUnicoField, textField, unsignedByteField } from "./row-fields.ts";
import type { RowContext } from "./row-fields.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarUnidadesYFactoresxArticulo → KoreUnidadArticulo[] (KORE-20, SOAP 1.2).
 *
 * Nombre REAL de la operación (WSDL): `ListarUnidadesYFactoresxArticulo` (Y mayúscula;
 * el índice del manual escribe "yFactores").
 *
 * Contrato REAL: tabla `UNIDADES` con NROUNIDAD (xs:unsignedByte), UNIDAD (xs:string),
 * FACTOR (xs:double); todos minOccurs=0 (igual a la documentación). La inspección
 * devolvió 0 filas para el artículo de prueba: formato de filas no observado.
 *
 * No se asume unidad base, factor principal ni factor entero. Sin deduplicar.
 */

export type KoreUnidadArticulo = {
  nroUnidad: number | null;
  unidadRaw: string | null;
  unidad: string | null;
  factorRaw: string | null;
  factor: number | null;
};

const OPERATION = "ListarUnidadesYFactoresxArticulo";
const TABLE = "UNIDADES";

export const KORE_UNIDAD_FIELDS = ["NROUNIDAD", "UNIDAD", "FACTOR"] as const;

export function buildUnidadesFields(codigoUnico: string): KoreDocField[] {
  return [requiredCodigoUnicoField(OPERATION, codigoUnico)];
}

export function normalizeUnidadRow(row: DataSetRow, rowNumber: number): KoreUnidadArticulo {
  const ctx: RowContext = { operation: OPERATION, table: TABLE, row, rowNumber };
  const unidad = textField(ctx, "UNIDAD");
  const nroUnidad = unsignedByteField(ctx, "NROUNIDAD");
  const factor = finiteDoubleField(ctx, "FACTOR");
  return { nroUnidad, unidadRaw: unidad.raw, unidad: unidad.value, factorRaw: factor.raw, factor: factor.value };
}

export function parseListarUnidadesYFactoresResult(result: XmlElement): KoreUnidadArticulo[] {
  return readDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_UNIDAD_FIELDS }).map((row, index) =>
    normalizeUnidadRow(row, index + 1),
  );
}

export async function fetchKoreUnidadesYFactores(client: KoreClient, codigoUnico: string): Promise<KoreUnidadArticulo[]> {
  const docFields = buildUnidadesFields(codigoUnico);
  return parseListarUnidadesYFactoresResult(await client.call(OPERATION, docFields, { soapVersion: "1.2" }));
}
