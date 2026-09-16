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
 *
 * Contrato estricto: una operación espera UNA tabla. Cualquier otra entidad,
 * ya sea con filas en NewDataSet o declarada en xs:schema, hace fallar la
 * lectura (no se pierden datos en silencio, p. ej. "otras direcciones").
 * Con `expectedFields`, un campo no listado en una fila también falla.
 * Los errores incluyen solo nombres técnicos y número de fila, nunca valores.
 */

export type DataSetRow = Readonly<Partial<Record<string, string>>>;

export type ReadDataSetOptions = {
  /** Si se indica, cualquier campo fuera de esta lista es un cambio de contrato. */
  expectedFields?: readonly string[];
};

const MAX_NAME_IN_MESSAGE = 80;

function parseError(operation: string, message: string): KoreError {
  return new KoreError({ kind: "parse", operation, message });
}

function invalidData(operation: string, message: string): KoreError {
  return new KoreError({ kind: "invalid_data", operation, message });
}

function findDataSetContainer(result: XmlElement): XmlElement | undefined {
  if (firstChildElement(result, "diffgram")) return result;
  return childElements(result, "DataSet").find((child) => firstChildElement(child, "diffgram"));
}

/** Tablas declaradas en xs:schema: elementos hijos del elemento DataSet (msdata:IsDataSet). */
function declaredSchemaTables(schema: XmlElement): string[] {
  const tables: string[] = [];
  for (const dataSetElement of childElements(schema, "element")) {
    for (const complexType of childElements(dataSetElement, "complexType")) {
      for (const group of childElements(complexType)) {
        if (group.localName !== "choice" && group.localName !== "sequence" && group.localName !== "all") {
          continue;
        }
        for (const table of childElements(group, "element")) {
          tables.push(table.attributes.name ?? table.attributes.ref ?? "");
        }
      }
    }
  }
  return tables;
}

function unexpectedEntity(operation: string, name: string): KoreError {
  return invalidData(
    operation,
    `Unexpected KORE dataset entity: ${name.slice(0, MAX_NAME_IN_MESSAGE)}`,
  );
}

function readRow(
  rowElement: XmlElement,
  rowNumber: number,
  tableName: string,
  operation: string,
  expectedFields: ReadonlySet<string> | undefined,
): DataSetRow {
  const row: Record<string, string> = Object.create(null);
  for (const field of childElements(rowElement)) {
    const fieldName = field.localName.slice(0, MAX_NAME_IN_MESSAGE);
    if (expectedFields && !expectedFields.has(field.localName)) {
      throw invalidData(operation, `${tableName} row ${rowNumber}: unexpected field ${fieldName}`);
    }
    if (childElements(field).length > 0) {
      throw invalidData(operation, `${tableName} row ${rowNumber}: nested content in ${fieldName}`);
    }
    if (Object.prototype.hasOwnProperty.call(row, field.localName)) {
      throw invalidData(operation, `${tableName} row ${rowNumber}: repeated field ${fieldName}`);
    }
    row[field.localName] = textContent(field);
  }
  return row;
}

export function readDataSetRows(
  result: XmlElement,
  tableName: string,
  operation: string,
  options: ReadDataSetOptions = {},
): DataSetRow[] {
  const container = findDataSetContainer(result);
  if (!container) throw parseError(operation, `${operation}Result sin DataSet/diffgram`);

  const schema = firstChildElement(container, "schema");
  if (schema) {
    const unexpected = declaredSchemaTables(schema).find((name) => name !== tableName);
    if (unexpected !== undefined) throw unexpectedEntity(operation, unexpected);
  }

  const diffgram = firstChildElement(container, "diffgram")!;
  const datasets = childElements(diffgram).filter(
    (child) => child.localName !== "before" && child.localName !== "errors",
  );
  if (datasets.length === 0) return [];
  if (datasets.length > 1) throw parseError(operation, "diffgram con más de un DataSet");

  const entities = childElements(datasets[0]);
  const unexpected = entities.find((entity) => entity.localName !== tableName);
  if (unexpected) throw unexpectedEntity(operation, unexpected.localName);

  const expectedFields = options.expectedFields ? new Set(options.expectedFields) : undefined;
  return entities.map((rowElement, index) =>
    readRow(rowElement, index + 1, tableName, operation, expectedFields),
  );
}
