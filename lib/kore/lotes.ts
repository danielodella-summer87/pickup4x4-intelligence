import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { finiteDoubleField, requiredCodigoUnicoField, textField } from "./row-fields.ts";
import type { RowContext } from "./row-fields.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Lotes KORE (READ-ONLY), dos métodos con contratos SEPARADOS (KORE-20).
 *
 * ListarLotesxCodigoUnico → KoreLote[] (SOAP 1.1, como el ejemplo oficial; el PDF
 *   escribe "ListarLoterxCodigoUnico", el WSDL real es ListarLotesxCodigoUnico).
 *   Tabla `Lotes`: Lote, Estado, FechaVencimiento (xs:string), Cantidad (xs:double).
 *
 * ListarLotesYUbicacionesxCodigoUnico → KoreLoteUbicacion[] (SOAP 1.2).
 *   Tabla `Lotes`: Lote, Estado, CodigoUbicacion, Ubicacion, FechaVencimiento
 *   (xs:string), Cantidad (xs:double). El PDF escribe "CodigoUbicocacion" en el XSD;
 *   el XSD real declara CodigoUbicacion.
 *
 * Todos minOccurs=0. La inspección del artículo de prueba devolvió 0 filas en ambos.
 *
 * Reglas: textos raw + trim; FechaVencimiento es xs:string y NO se parsea como
 * fecha (formato real no observado); Cantidad double finito con signo (el ejemplo
 * oficial muestra negativos) y raw exacto. Sin interpretar estado, stock disponible
 * ni lote activo. Sin deduplicar ni PK.
 */

export type KoreLote = {
  loteRaw: string | null;
  lote: string | null;
  estadoRaw: string | null;
  estado: string | null;
  fechaVencimientoRaw: string | null;
  fechaVencimiento: string | null;
  cantidadRaw: string | null;
  cantidad: number | null;
};

export type KoreLoteUbicacion = {
  loteRaw: string | null;
  lote: string | null;
  estadoRaw: string | null;
  estado: string | null;
  codigoUbicacionRaw: string | null;
  codigoUbicacion: string | null;
  ubicacionRaw: string | null;
  ubicacion: string | null;
  fechaVencimientoRaw: string | null;
  fechaVencimiento: string | null;
  cantidadRaw: string | null;
  cantidad: number | null;
};

const LOTES_OPERATION = "ListarLotesxCodigoUnico";
const UBICACIONES_OPERATION = "ListarLotesYUbicacionesxCodigoUnico";
const TABLE = "Lotes";

export const KORE_LOTE_FIELDS = ["Lote", "Estado", "FechaVencimiento", "Cantidad"] as const;
export const KORE_LOTE_UBICACION_FIELDS = ["Lote", "Estado", "CodigoUbicacion", "Ubicacion", "FechaVencimiento", "Cantidad"] as const;

export function buildLotesFields(operation: typeof LOTES_OPERATION | typeof UBICACIONES_OPERATION, codigoUnico: string): KoreDocField[] {
  return [requiredCodigoUnicoField(operation, codigoUnico)];
}

function commonLote(ctx: RowContext) {
  const lote = textField(ctx, "Lote");
  const estado = textField(ctx, "Estado");
  const fecha = textField(ctx, "FechaVencimiento");
  const cantidad = finiteDoubleField(ctx, "Cantidad");
  return { lote, estado, fecha, cantidad };
}

export function normalizeLoteRow(row: DataSetRow, rowNumber: number): KoreLote {
  const { lote, estado, fecha, cantidad } = commonLote({ operation: LOTES_OPERATION, table: TABLE, row, rowNumber });
  return {
    loteRaw: lote.raw,
    lote: lote.value,
    estadoRaw: estado.raw,
    estado: estado.value,
    fechaVencimientoRaw: fecha.raw,
    fechaVencimiento: fecha.value,
    cantidadRaw: cantidad.raw,
    cantidad: cantidad.value,
  };
}

export function normalizeLoteUbicacionRow(row: DataSetRow, rowNumber: number): KoreLoteUbicacion {
  const ctx: RowContext = { operation: UBICACIONES_OPERATION, table: TABLE, row, rowNumber };
  const codigoUbicacion = textField(ctx, "CodigoUbicacion");
  const ubicacion = textField(ctx, "Ubicacion");
  const { lote, estado, fecha, cantidad } = commonLote(ctx);
  return {
    loteRaw: lote.raw,
    lote: lote.value,
    estadoRaw: estado.raw,
    estado: estado.value,
    codigoUbicacionRaw: codigoUbicacion.raw,
    codigoUbicacion: codigoUbicacion.value,
    ubicacionRaw: ubicacion.raw,
    ubicacion: ubicacion.value,
    fechaVencimientoRaw: fecha.raw,
    fechaVencimiento: fecha.value,
    cantidadRaw: cantidad.raw,
    cantidad: cantidad.value,
  };
}

export function parseListarLotesResult(result: XmlElement): KoreLote[] {
  return readDataSetRows(result, TABLE, LOTES_OPERATION, { expectedFields: KORE_LOTE_FIELDS }).map((row, index) =>
    normalizeLoteRow(row, index + 1),
  );
}

export function parseListarLotesYUbicacionesResult(result: XmlElement): KoreLoteUbicacion[] {
  return readDataSetRows(result, TABLE, UBICACIONES_OPERATION, { expectedFields: KORE_LOTE_UBICACION_FIELDS }).map(
    (row, index) => normalizeLoteUbicacionRow(row, index + 1),
  );
}

/** SOAP 1.1 (binding del ejemplo oficial, validado en KORE-20). */
export async function fetchKoreLotes(client: KoreClient, codigoUnico: string): Promise<KoreLote[]> {
  const docFields = buildLotesFields(LOTES_OPERATION, codigoUnico);
  return parseListarLotesResult(await client.call(LOTES_OPERATION, docFields, { soapVersion: "1.1" }));
}

/** SOAP 1.2 (binding del ejemplo oficial, validado en KORE-20). */
export async function fetchKoreLotesYUbicaciones(client: KoreClient, codigoUnico: string): Promise<KoreLoteUbicacion[]> {
  const docFields = buildLotesFields(UBICACIONES_OPERATION, codigoUnico);
  return parseListarLotesYUbicacionesResult(await client.call(UBICACIONES_OPERATION, docFields, { soapVersion: "1.2" }));
}
