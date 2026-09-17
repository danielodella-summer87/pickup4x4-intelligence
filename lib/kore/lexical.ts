/**
 * Validación léxica de tipos numéricos XSD para respuestas KORE (interno).
 *
 * El texto de KORE es la fuente fiel: estas funciones solo deciden si el raw es
 * válido y producen un `number` de CONVENIENCIA. Nunca usar ese number para
 * identidad, igualdad exacta ni persistencia exacta: para eso está el raw.
 * Se aplica trim (whiteSpace=collapse de los tipos numéricos XSD) solo para
 * validar; el raw no se modifica.
 */

/** xs:decimal: signo opcional, parte entera y/o decimal; sin exponente ni INF/NaN. */
const XS_DECIMAL_LEXICAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** xs:double en forma decimal o científica; excluye INF, -INF y NaN a propósito. */
const XS_DOUBLE_FINITE_LEXICAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const XS_INTEGER_LEXICAL = /^[+-]?\d+$/;

/** -0 → 0: mismo valor numérico, evita sorpresas en comparaciones estrictas. */
function finiteOrNull(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

/** Valor de conveniencia de un xs:decimal válido, o null si el texto es inválido o no representable. */
export function parseXsDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  return XS_DECIMAL_LEXICAL.test(trimmed) ? finiteOrNull(Number(trimmed)) : null;
}

/** Valor de un xs:double finito, o null si el texto es inválido, especial (INF/NaN) o desborda. */
export function parseFiniteXsDouble(raw: string): number | null {
  const trimmed = raw.trim();
  return XS_DOUBLE_FINITE_LEXICAL.test(trimmed) ? finiteOrNull(Number(trimmed)) : null;
}

/** Entero con forma léxica decimal y dentro de Number.MAX_SAFE_INTEGER, o null. */
export function parseSafeIntegerLexical(raw: string): number | null {
  const trimmed = raw.trim();
  if (!XS_INTEGER_LEXICAL.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? finiteOrNull(value) : null;
}
