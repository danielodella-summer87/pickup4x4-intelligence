import type { KoreClient, KoreDocField } from "./client.ts";
import { readDirectDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import {
  KORE_CODIGO_UNICO_MAX_LENGTH,
  assertFilterObject,
  invalidArgument,
  invalidRowData,
  optionalTextFilter,
  requiredTextField,
} from "./row-fields.ts";
import type { RowContext } from "./row-fields.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarImagenes → KoreImagen[] (KORE-20, SOAP 1.2).
 *
 * Contrato REAL: `ListarImagenesResult → DataSet → Imagenes*` SIN xs:schema ni
 * diffgram (no hay tipos XSD). Campos: CodigoUnico y Imagen (Base64). Observado:
 * 1 fila con 1 imagen por código. Si una fila trae más de un <Imagen> se falla
 * (no observado; no se inventa multiplicidad).
 *
 * - CodigoUnico obligatorio: raw exacto + trim.
 * - Imagen: tag ausente → null; presente → texto Base64 EXACTO (validación léxica,
 *   sin decodificar). Puede pesar cientos de KB: no loguear.
 * - Sin deduplicar.
 *
 * Seguridad local: se exige al menos un código (nunca "todas las imágenes").
 */

export type KoreImagen = {
  codigoUnicoRaw: string;
  codigoUnico: string;
  /** Base64 tal cual lo envía KORE (sin decodificar). */
  imagenBase64: string | null;
};

export type KoreImagenFilters = {
  codigoUnicoInicial?: string;
  codigoUnicoFinal?: string;
};

const OPERATION = "ListarImagenes";
const TABLE = "Imagenes";

export const KORE_IMAGEN_FIELDS = ["CodigoUnico", "Imagen"] as const;

const BASE64_LEXICAL = /^[A-Za-z0-9+/\s]*(={0,2})\s*$/;

export function buildImagenFilterFields(filters: KoreImagenFilters): KoreDocField[] {
  assertFilterObject(OPERATION, filters, ["codigoUnicoInicial", "codigoUnicoFinal"]);
  const fields = [
    optionalTextFilter(OPERATION, "codigoUnicoInicial", "CodigoUnicoInicial", filters.codigoUnicoInicial, KORE_CODIGO_UNICO_MAX_LENGTH),
    optionalTextFilter(OPERATION, "codigoUnicoFinal", "CodigoUnicoFinal", filters.codigoUnicoFinal, KORE_CODIGO_UNICO_MAX_LENGTH),
  ].filter((field): field is KoreDocField => field !== null);
  // Sin rango KORE devolvería todas las imágenes (payload potencialmente enorme): no permitido.
  if (fields.length === 0) throw invalidArgument(OPERATION, "ListarImagenes requires codigoUnicoInicial or codigoUnicoFinal");
  return fields;
}

export function normalizeImagenRow(row: DataSetRow, rowNumber: number): KoreImagen {
  const ctx: RowContext = { operation: OPERATION, table: TABLE, row, rowNumber };
  const codigo = requiredTextField(ctx, "CodigoUnico");
  const imagen = row.Imagen;
  if (imagen !== undefined && !BASE64_LEXICAL.test(imagen)) throw invalidRowData(ctx, "invalid", "Imagen");
  return { codigoUnicoRaw: codigo.raw, codigoUnico: codigo.value, imagenBase64: imagen ?? null };
}

export function parseListarImagenesResult(result: XmlElement): KoreImagen[] {
  return readDirectDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_IMAGEN_FIELDS }).map((row, index) =>
    normalizeImagenRow(row, index + 1),
  );
}

export async function fetchKoreImagenes(client: KoreClient, filters: KoreImagenFilters): Promise<KoreImagen[]> {
  const docFields = buildImagenFilterFields(filters);
  return parseListarImagenesResult(await client.call(OPERATION, docFields, { soapVersion: "1.2" }));
}
