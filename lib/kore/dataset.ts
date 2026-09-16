import { KoreError } from "./errors.ts";
import { childElements, firstChildElement, textContent } from "./xml.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Lectura de un DataSet .NET serializado como DiffGram:
 *
 *   <XResult>
 *     [<DataSet>]            (envoltorio documentado por KORE; opcional)
 *       <xs:schema id="NewDataSet"/>
 *       <diffgr:diffgram>
 *         <NewDataSet>       (ausente si el DataSet está vacío)
 *           <Tabla>…</Tabla>*
 *
 * Solo lee filas actuales: ignora `diffgr:before` y `diffgr:errors`.
 */

export type DataSetRow = Readonly<Partial<Record<string, string>>>;

function parseError(operation: string, message: string): KoreError {
  return new KoreError({ kind: "parse", operation, message });
}

function findDataSetContainer(result: XmlElement): XmlElement | undefined {
  if (firstChildElement(result, "diffgram")) return result;
  return childElements(result, "DataSet").find((child) => firstChildElement(child, "diffgram"));
}

function readRow(rowElement: XmlElement, rowNumber: number, operation: string): DataSetRow {
  const row: Record<string, string> = Object.create(null);
  for (const field of childElements(rowElement)) {
    if (childElements(field).length > 0) {
      throw parseError(operation, `Campo anidado inesperado en la fila ${rowNumber}`);
    }
    if (Object.prototype.hasOwnProperty.call(row, field.localName)) {
      throw parseError(operation, `Campo repetido en la fila ${rowNumber}`);
    }
    row[field.localName] = textContent(field);
  }
  return row;
}

export function readDataSetRows(
  result: XmlElement,
  tableName: string,
  operation: string,
): DataSetRow[] {
  const container = findDataSetContainer(result);
  if (!container) throw parseError(operation, `${operation}Result sin DataSet/diffgram`);

  const diffgram = firstChildElement(container, "diffgram")!;
  const datasets = childElements(diffgram).filter(
    (child) => child.localName !== "before" && child.localName !== "errors",
  );
  if (datasets.length === 0) return [];
  if (datasets.length > 1) throw parseError(operation, "diffgram con más de un DataSet");

  return childElements(datasets[0], tableName).map((rowElement, index) =>
    readRow(rowElement, index + 1, operation),
  );
}
