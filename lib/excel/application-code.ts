/**
 * Genera el código auxiliar de aplicación manteniendo `codigoUnico` intacto.
 * Ej.: 1832 + 0 → 1832-A, 1 → 1832-B, 25 → 1832-Z, 26 → 1832-AA
 */

function indexToSuffix(index: number): string {
  if (index < 0 || !Number.isInteger(index)) {
    throw new RangeError("index debe ser un entero >= 0");
  }

  let n = index;
  let suffix = "";

  do {
    suffix = String.fromCharCode(65 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return suffix;
}

export function buildCodigoAplicacion(codigoUnico: string, index: number): string {
  const codigo = codigoUnico.trim();
  if (!codigo) {
    throw new Error("codigoUnico no puede estar vacío");
  }
  return `${codigo}-${indexToSuffix(index)}`;
}

/**
 * Asigna índices secuenciales por `codigoUnico` en el orden de aparición de las filas.
 */
export function assignCodigosAplicacion(
  codigosUnicosEnOrden: string[],
): Map<string, string[]> {
  const contadores = new Map<string, number>();
  const resultado = new Map<string, string[]>();

  for (const codigoUnico of codigosUnicosEnOrden) {
    const index = contadores.get(codigoUnico) ?? 0;
    const codigoAplicacion = buildCodigoAplicacion(codigoUnico, index);
    contadores.set(codigoUnico, index + 1);

    const lista = resultado.get(codigoUnico) ?? [];
    lista.push(codigoAplicacion);
    resultado.set(codigoUnico, lista);
  }

  return resultado;
}
