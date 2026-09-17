import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { finiteDoubleField, requiredSafeIntegerFilter, safeIntegerField, textField } from "./row-fields.ts";
import type { RowContext } from "./row-fields.ts";
import type { KoreSoapVersion } from "./soap.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Documentos con saldo pendiente por cuenta (READ-ONLY, KORE-21). Datos financieros:
 * no loguear filas.
 *
 * ListarFacturasVivasxCuenta     → KoreFacturaViva[]     (SOAP 1.1, ejemplo oficial)
 * ListarNotasCreditoVivasxCuenta → KoreNotaCreditoViva[] (SOAP 1.1, ejemplo oficial)
 *   XSD REAL idéntico en ambos: tabla `FacturasVivas` con Emision, Vencimiento,
 *   Comprobante (xs:string), Numero (xs:int), Moneda (xs:string), Total, Saldo
 *   (xs:double). Por eso comparten el parser interno, pero los tipos públicos y
 *   las funciones se mantienen separados (no se fusionan facturas y notas de crédito).
 *
 * ListarRecibosVivosxCuenta      → KoreReciboVivo[]      (SOAP 1.2, ejemplo propio del método)
 *   Tabla `RecibosVivos` con Fecha (xs:string), NUMERO (xs:int), MONEDA (xs:string),
 *   MONTO, SALDO (xs:double).
 *
 * Request: `NroCuenta` obligatorio (Integer). `Direccion` (documentado como opcional)
 * NO se expone: no fue validado contra el servidor.
 *
 * Todos minOccurs=0. La inspección devolvió 0 filas en los tres: formato de filas
 * reales NO observado (padding, formato de fechas, escalas, signos).
 *
 * Reglas: fechas xs:string preservadas como texto (sin parsear); montos double
 * finitos con raw exacto y SIN transformar signos; sin deduplicar ni PK; sin
 * interpretar saldo, vencido ni tipo de comprobante.
 */

type DocumentoVivo = {
  emisionRaw: string | null;
  emision: string | null;
  vencimientoRaw: string | null;
  vencimiento: string | null;
  comprobanteRaw: string | null;
  comprobante: string | null;
  numero: number | null;
  monedaRaw: string | null;
  moneda: string | null;
  totalRaw: string | null;
  total: number | null;
  saldoRaw: string | null;
  saldo: number | null;
};

export type KoreFacturaViva = DocumentoVivo;
export type KoreNotaCreditoViva = DocumentoVivo;

export type KoreReciboVivo = {
  fechaRaw: string | null;
  fecha: string | null;
  numero: number | null;
  monedaRaw: string | null;
  moneda: string | null;
  montoRaw: string | null;
  monto: number | null;
  saldoRaw: string | null;
  saldo: number | null;
};

const FACTURAS_OPERATION = "ListarFacturasVivasxCuenta";
const NOTAS_OPERATION = "ListarNotasCreditoVivasxCuenta";
const RECIBOS_OPERATION = "ListarRecibosVivosxCuenta";
const DOCUMENTOS_TABLE = "FacturasVivas";
const RECIBOS_TABLE = "RecibosVivos";

/** Contrato real (KORE-21) de FacturasVivas y NotasCreditoVivas. */
export const KORE_DOCUMENTO_VIVO_FIELDS = ["Emision", "Vencimiento", "Comprobante", "Numero", "Moneda", "Total", "Saldo"] as const;
/** Contrato real (KORE-21) de RecibosVivos. */
export const KORE_RECIBO_VIVO_FIELDS = ["Fecha", "NUMERO", "MONEDA", "MONTO", "SALDO"] as const;

type DocumentoOperation = typeof FACTURAS_OPERATION | typeof NOTAS_OPERATION | typeof RECIBOS_OPERATION;

export function buildCuentaFields(operation: DocumentoOperation, nroCuenta: number): KoreDocField[] {
  return [requiredSafeIntegerFilter(operation, "nroCuenta", "NroCuenta", nroCuenta)];
}

function normalizeDocumentoVivoRow(operation: DocumentoOperation, row: DataSetRow, rowNumber: number): DocumentoVivo {
  const ctx: RowContext = { operation, table: DOCUMENTOS_TABLE, row, rowNumber };
  const emision = textField(ctx, "Emision");
  const vencimiento = textField(ctx, "Vencimiento");
  const comprobante = textField(ctx, "Comprobante");
  const moneda = textField(ctx, "Moneda");
  const numero = safeIntegerField(ctx, "Numero");
  const total = finiteDoubleField(ctx, "Total");
  const saldo = finiteDoubleField(ctx, "Saldo");
  return {
    emisionRaw: emision.raw,
    emision: emision.value,
    vencimientoRaw: vencimiento.raw,
    vencimiento: vencimiento.value,
    comprobanteRaw: comprobante.raw,
    comprobante: comprobante.value,
    numero,
    monedaRaw: moneda.raw,
    moneda: moneda.value,
    totalRaw: total.raw,
    total: total.value,
    saldoRaw: saldo.raw,
    saldo: saldo.value,
  };
}

export function normalizeReciboVivoRow(row: DataSetRow, rowNumber: number): KoreReciboVivo {
  const ctx: RowContext = { operation: RECIBOS_OPERATION, table: RECIBOS_TABLE, row, rowNumber };
  const fecha = textField(ctx, "Fecha");
  const moneda = textField(ctx, "MONEDA");
  const numero = safeIntegerField(ctx, "NUMERO");
  const monto = finiteDoubleField(ctx, "MONTO");
  const saldo = finiteDoubleField(ctx, "SALDO");
  return {
    fechaRaw: fecha.raw,
    fecha: fecha.value,
    numero,
    monedaRaw: moneda.raw,
    moneda: moneda.value,
    montoRaw: monto.raw,
    monto: monto.value,
    saldoRaw: saldo.raw,
    saldo: saldo.value,
  };
}

function parseDocumentosVivos(operation: DocumentoOperation, result: XmlElement): DocumentoVivo[] {
  return readDataSetRows(result, DOCUMENTOS_TABLE, operation, { expectedFields: KORE_DOCUMENTO_VIVO_FIELDS }).map((row, index) =>
    normalizeDocumentoVivoRow(operation, row, index + 1),
  );
}

export function parseListarFacturasVivasResult(result: XmlElement): KoreFacturaViva[] {
  return parseDocumentosVivos(FACTURAS_OPERATION, result);
}

export function parseListarNotasCreditoVivasResult(result: XmlElement): KoreNotaCreditoViva[] {
  return parseDocumentosVivos(NOTAS_OPERATION, result);
}

export function parseListarRecibosVivosResult(result: XmlElement): KoreReciboVivo[] {
  return readDataSetRows(result, RECIBOS_TABLE, RECIBOS_OPERATION, { expectedFields: KORE_RECIBO_VIVO_FIELDS }).map((row, index) =>
    normalizeReciboVivoRow(row, index + 1),
  );
}

async function callCuenta(client: KoreClient, operation: DocumentoOperation, nroCuenta: number, soapVersion: KoreSoapVersion) {
  return client.call(operation, buildCuentaFields(operation, nroCuenta), { soapVersion });
}

/** SOAP 1.1 (binding del ejemplo oficial, validado en KORE-21). */
export async function fetchKoreFacturasVivas(client: KoreClient, nroCuenta: number): Promise<KoreFacturaViva[]> {
  return parseListarFacturasVivasResult(await callCuenta(client, FACTURAS_OPERATION, nroCuenta, "1.1"));
}

/** SOAP 1.1 (binding del ejemplo oficial, validado en KORE-21). */
export async function fetchKoreNotasCreditoVivas(client: KoreClient, nroCuenta: number): Promise<KoreNotaCreditoViva[]> {
  return parseListarNotasCreditoVivasResult(await callCuenta(client, NOTAS_OPERATION, nroCuenta, "1.1"));
}

/** SOAP 1.2 (binding del ejemplo propio del método, validado en KORE-21). */
export async function fetchKoreRecibosVivos(client: KoreClient, nroCuenta: number): Promise<KoreReciboVivo[]> {
  return parseListarRecibosVivosResult(await callCuenta(client, RECIBOS_OPERATION, nroCuenta, "1.2"));
}
