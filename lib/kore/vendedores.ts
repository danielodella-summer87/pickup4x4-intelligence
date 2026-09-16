import type { KoreClient } from "./client.ts";
import { readDataSetRows } from "./dataset.ts";
import type { DataSetRow } from "./dataset.ts";
import { KoreError } from "./errors.ts";
import type { XmlElement } from "./xml.ts";

/**
 * ListarVendedores → KoreVendedor[].
 *
 * Reglas: NROVENDEDOR es la clave (entero xs:int, obligatorio y único).
 * No se asumen IDs consecutivos, no se descarta el vendedor 0 ni se le
 * asigna significado. NOMBRE ausente se normaliza a "" (no se inventa).
 * Los errores nunca incluyen valores de la fila, solo su posición.
 */

export type KoreVendedor = {
  nroVendedor: number;
  nombre: string;
};

const OPERATION = "ListarVendedores";
const TABLE = "Vendedor";
const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

function invalidData(message: string): KoreError {
  return new KoreError({ kind: "invalid_data", operation: OPERATION, message });
}

export function normalizeVendedorRow(row: DataSetRow, rowNumber: number): KoreVendedor {
  const rawNro = row.NROVENDEDOR?.trim();
  if (!rawNro) throw invalidData(`Vendedor sin NROVENDEDOR en la fila ${rowNumber}`);
  if (!/^-?[0-9]+$/.test(rawNro)) {
    throw invalidData(`NROVENDEDOR no entero en la fila ${rowNumber}`);
  }
  const nroVendedor = Number(rawNro);
  if (nroVendedor < INT32_MIN || nroVendedor > INT32_MAX) {
    throw invalidData(`NROVENDEDOR fuera de rango en la fila ${rowNumber}`);
  }

  return { nroVendedor, nombre: (row.NOMBRE ?? "").trim() };
}

export function parseListarVendedoresResult(result: XmlElement): KoreVendedor[] {
  const seen = new Set<number>();
  return readDataSetRows(result, TABLE, OPERATION).map((row, index) => {
    const vendedor = normalizeVendedorRow(row, index + 1);
    if (seen.has(vendedor.nroVendedor)) {
      throw invalidData(`NROVENDEDOR duplicado en la fila ${index + 1}`);
    }
    seen.add(vendedor.nroVendedor);
    return vendedor;
  });
}

export async function fetchKoreVendedores(client: KoreClient): Promise<KoreVendedor[]> {
  return parseListarVendedoresResult(await client.call(OPERATION));
}
