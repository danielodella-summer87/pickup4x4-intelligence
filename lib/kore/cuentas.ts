import type { KoreClient, KoreDocField } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarCuentas → KoreCuenta[].
 *
 * Fiel a KORE, sin interpretar: textos tal como llegan (RUC, teléfonos,
 * observaciones sin formatear ni recortar), códigos sin resolver (localidad,
 * vendedor, lista de precios). Texto ausente o solo whitespace → "";
 * numéricos y flags: tag ausente → null, presente vacío/whitespace → invalid_data.
 *
 * Cuenta contiene PII: los errores indican fila, campo técnico y problema,
 * NUNCA valores (ni de filas ni de filtros).
 */

export type KoreCuenta = {
  nroCuenta: number;

  razonSocial: string;
  nombreFantasia: string;

  direccion: string;
  telefono: string;
  ruc: string;
  email: string;
  celular: string;
  codigoPostal: string;
  codigoLocalidad: string;

  deshabilitado: 0 | 1 | null;
  nroListaDePrecio: number | null;
  nroVendedor: number | null;
  cliente: 0 | 1 | null;
  proveedor: 0 | 1 | null;

  observaciones: string;
};

/**
 * Filtros de KORE. Se exige al menos uno efectivo (nroCuenta, rut/nombre no
 * vacíos o nroVendedor): sin filtros KORE devolvería TODAS las cuentas.
 */
export type KoreCuentaFilters = {
  nroCuenta?: number;
  rut?: string;
  nombre?: string;
  nroVendedor?: number;
};

const OPERATION = "ListarCuentas";
const TABLE = "Cuenta";

/** Contrato observado en KORE-4: cualquier campo fuera de esta lista hace fallar la lectura. */
export const KORE_CUENTA_FIELDS = [
  "NROCUENTA",
  "RAZONSOCIAL",
  "NOMBREFANTASIA",
  "DIRECCION",
  "TELEFONO",
  "RUC",
  "EMAIL",
  "CELULAR",
  "CODIGOPOSTAL",
  "DESHABILITADO",
  "NROLISTADEPRECIO",
  "OBSERVACIONES",
  "NROVENDEDOR",
  "CODIGOLOCALIDAD",
  "CLIENTE",
  "PROVEEDOR",
] as const;

type KoreCuentaField = (typeof KORE_CUENTA_FIELDS)[number];

const FILTER_TAGS = {
  nroCuenta: "NroCuenta",
  rut: "Rut",
  nombre: "Nombre",
  nroVendedor: "NroVendedor",
} as const;

function invalidArgument(message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation: OPERATION, message });
}

function invalidData(rowNumber: number, problem: string, field: KoreCuentaField): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: OPERATION,
    message: `${TABLE} row ${rowNumber}: ${problem} ${field}`,
  });
}

function integerFilter(value: unknown, key: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalidArgument(`Filtro ${key} debe ser un entero`);
  }
  return String(value);
}

function stringFilter(value: unknown, key: string): string {
  if (typeof value !== "string") throw invalidArgument(`Filtro ${key} debe ser texto`);
  return value;
}

/**
 * Tags de filtro en orden estable. Omite `undefined` y strings vacíos (no se
 * envían tags vacíos); no altera los strings (el escape XML lo hace soap.ts).
 * Claves desconocidas fallan: un typo no debe convertirse en "todas las cuentas".
 */
export function buildCuentaFilterFields(filters: KoreCuentaFilters = {}): KoreDocField[] {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument("Filtros de cuentas inválidos");
  }
  for (const key of Object.keys(filters)) {
    if (!Object.prototype.hasOwnProperty.call(FILTER_TAGS, key)) {
      throw invalidArgument(`Filtro de cuentas desconocido: ${key.slice(0, 40)}`);
    }
  }

  const fields: KoreDocField[] = [];
  if (filters.nroCuenta !== undefined) {
    fields.push({ name: FILTER_TAGS.nroCuenta, value: integerFilter(filters.nroCuenta, "nroCuenta") });
  }
  if (filters.rut !== undefined) {
    const rut = stringFilter(filters.rut, "rut");
    if (rut !== "") fields.push({ name: FILTER_TAGS.rut, value: rut, sensitive: true });
  }
  if (filters.nombre !== undefined) {
    const nombre = stringFilter(filters.nombre, "nombre");
    if (nombre !== "") fields.push({ name: FILTER_TAGS.nombre, value: nombre, sensitive: true });
  }
  if (filters.nroVendedor !== undefined) {
    fields.push({
      name: FILTER_TAGS.nroVendedor,
      value: integerFilter(filters.nroVendedor, "nroVendedor"),
    });
  }

  // Sin filtros KORE devuelve TODAS las cuentas: no permitido en esta etapa.
  // Una sincronización completa tendrá su propio mecanismo explícito.
  if (fields.length === 0) {
    throw invalidArgument("ListarCuentas requires at least one filter");
  }
  return fields;
}

/**
 * Texto ausente o solo whitespace → "". Con algún carácter no-whitespace se
 * conserva EXACTAMENTE como llegó (sin trim ni reformateo).
 */
function text(row: DataSetRow, field: KoreCuentaField): string {
  const raw = row[field];
  if (raw === undefined || raw.trim() === "") return "";
  return raw;
}

function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function optionalInteger(row: DataSetRow, field: KoreCuentaField, rowNumber: number): number | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const value = parseInteger(raw);
  if (value === null) throw invalidData(rowNumber, "invalid", field);
  return value;
}

function optionalFlag(row: DataSetRow, field: KoreCuentaField, rowNumber: number): 0 | 1 | null {
  const raw = row[field];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "0") return 0;
  if (trimmed === "1") return 1;
  throw invalidData(rowNumber, "invalid", field);
}

export function normalizeCuentaRow(row: DataSetRow, rowNumber: number): KoreCuenta {
  const rawNro = row.NROCUENTA;
  if (rawNro === undefined || rawNro.trim() === "") {
    throw invalidData(rowNumber, "missing", "NROCUENTA");
  }
  const nroCuenta = parseInteger(rawNro);
  if (nroCuenta === null) throw invalidData(rowNumber, "invalid", "NROCUENTA");

  return {
    nroCuenta,
    razonSocial: text(row, "RAZONSOCIAL"),
    nombreFantasia: text(row, "NOMBREFANTASIA"),
    direccion: text(row, "DIRECCION"),
    telefono: text(row, "TELEFONO"),
    ruc: text(row, "RUC"),
    email: text(row, "EMAIL"),
    celular: text(row, "CELULAR"),
    codigoPostal: text(row, "CODIGOPOSTAL"),
    codigoLocalidad: text(row, "CODIGOLOCALIDAD"),
    deshabilitado: optionalFlag(row, "DESHABILITADO", rowNumber),
    nroListaDePrecio: optionalInteger(row, "NROLISTADEPRECIO", rowNumber),
    nroVendedor: optionalInteger(row, "NROVENDEDOR", rowNumber),
    cliente: optionalFlag(row, "CLIENTE", rowNumber),
    proveedor: optionalFlag(row, "PROVEEDOR", rowNumber),
    observaciones: text(row, "OBSERVACIONES"),
  };
}

export function parseListarCuentasResult(result: XmlElement): KoreCuenta[] {
  const rows = readDataSetRows(result, TABLE, OPERATION, { expectedFields: KORE_CUENTA_FIELDS });
  const seen = new Set<number>();
  return rows.map((row, index) => {
    const cuenta = normalizeCuentaRow(row, index + 1);
    if (seen.has(cuenta.nroCuenta)) throw invalidData(index + 1, "duplicate", "NROCUENTA");
    seen.add(cuenta.nroCuenta);
    return cuenta;
  });
}

export async function fetchKoreCuentas(
  client: KoreClient,
  filters: KoreCuentaFilters = {},
): Promise<KoreCuenta[]> {
  const docFields = buildCuentaFilterFields(filters);
  return parseListarCuentasResult(await client.call(OPERATION, docFields));
}
