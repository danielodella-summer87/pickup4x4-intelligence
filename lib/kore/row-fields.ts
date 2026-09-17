import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import { parseFiniteXsDouble, parseSafeIntegerLexical } from "./lexical.ts";
import type { KoreDocField } from "./soap.ts";

/**
 * Lectura común (interna) de campos de filas KORE y de filtros de request.
 * Los errores indican fila, campo técnico y problema, NUNCA valores.
 */

export type RowContext = {
  operation: string;
  table: string;
  row: DataSetRow;
  rowNumber: number;
};

export type TextValue = { raw: string | null; value: string | null };
export type NumberValue = { raw: string | null; value: number | null };

export function invalidRowData(ctx: RowContext, problem: string, field: string): KoreError {
  return new KoreError({
    kind: "invalid_data",
    operation: ctx.operation,
    message: `${ctx.table} row ${ctx.rowNumber}: ${problem} ${field}`,
  });
}

/** Tag ausente → null/null; presente → raw exacto y normalizado = trim (puede quedar ""). */
export function textField(ctx: RowContext, field: string): TextValue {
  const raw = ctx.row[field];
  if (raw === undefined) return { raw: null, value: null };
  return { raw, value: raw.trim() };
}

/** Obligatorio para asociar la fila: ausente o vacío/whitespace → invalid_data. */
export function requiredTextField(ctx: RowContext, field: string): { raw: string; value: string } {
  const raw = ctx.row[field];
  if (raw === undefined || raw.trim() === "") throw invalidRowData(ctx, "missing", field);
  return { raw, value: raw.trim() };
}

/** xs:int y similares: tag ausente → null; presente → entero seguro (sin rango ni signo). */
export function safeIntegerField(ctx: RowContext, field: string): number | null {
  const raw = ctx.row[field];
  if (raw === undefined) return null;
  const value = parseSafeIntegerLexical(raw);
  if (value === null) throw invalidRowData(ctx, "invalid", field);
  return value;
}

/** xs:unsignedByte: tag ausente → null; presente → entero 0..255 sin signo negativo. */
export function unsignedByteField(ctx: RowContext, field: string): number | null {
  const raw = ctx.row[field];
  if (raw === undefined) return null;
  const value = /^\s*\+?\d+\s*$/.test(raw) ? parseSafeIntegerLexical(raw) : null;
  if (value === null || value > 255) throw invalidRowData(ctx, "invalid", field);
  return value;
}

/** xs:double: tag ausente → null/null; presente → raw exacto + number finito de conveniencia (INF/NaN inválidos). */
export function finiteDoubleField(ctx: RowContext, field: string): NumberValue {
  const raw = ctx.row[field];
  if (raw === undefined) return { raw: null, value: null };
  const value = parseFiniteXsDouble(raw);
  if (value === null) throw invalidRowData(ctx, "invalid", field);
  return { raw, value };
}

// ---------------------------------------------------------------------------
// Filtros de request
// ---------------------------------------------------------------------------

export function invalidArgument(operation: string, message: string): KoreError {
  return new KoreError({ kind: "invalid_argument", operation, message });
}

export function assertFilterObject(operation: string, filters: unknown, known: readonly string[]): asserts filters is Record<string, unknown> {
  if (typeof filters !== "object" || filters === null) {
    throw invalidArgument(operation, "Filtros inválidos");
  }
  for (const key of Object.keys(filters)) {
    if (!known.includes(key)) throw invalidArgument(operation, `Filtro desconocido: ${key.slice(0, 40)}`);
  }
}

/**
 * Filtro de texto opcional (Varchar(max)): undefined → sin tag; no string o
 * demasiado largo → invalid_argument; vacío/whitespace → sin tag (no efectivo);
 * si no, valor exacto y marcado sensible.
 */
export function optionalTextFilter(
  operation: string,
  key: string,
  tag: string,
  value: unknown,
  maxLength: number,
): KoreDocField | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw invalidArgument(operation, `Filtro ${key} debe ser texto`);
  if (value.length > maxLength) throw invalidArgument(operation, `Filtro ${key} excede ${maxLength} caracteres`);
  if (value.trim() === "") return null;
  return { name: tag, value, sensitive: true };
}

export const KORE_CODIGO_UNICO_MAX_LENGTH = 22;

/** `CodigoUnico` obligatorio y efectivo (≤ 22), enviado exacto y marcado sensible. */
export function requiredCodigoUnicoField(operation: string, codigoUnico: unknown): KoreDocField {
  if (typeof codigoUnico !== "string") throw invalidArgument(operation, "Filtro codigoUnico debe ser texto");
  const field = optionalTextFilter(operation, "codigoUnico", "CodigoUnico", codigoUnico, KORE_CODIGO_UNICO_MAX_LENGTH);
  if (field === null) throw invalidArgument(operation, `${operation} requires codigoUnico`);
  return field;
}

/** Entero seguro obligatorio (Integer documentado): sin rango ni signo. */
export function requiredSafeIntegerFilter(operation: string, key: string, tag: string, value: unknown): KoreDocField {
  if (value === undefined) throw invalidArgument(operation, `${operation} requires ${key}`);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalidArgument(operation, `Filtro ${key} debe ser un entero seguro`);
  }
  return { name: tag, value: String(value), sensitive: true };
}
