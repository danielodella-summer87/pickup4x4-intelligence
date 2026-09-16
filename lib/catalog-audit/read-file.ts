/**
 * Lectura local de catálogos (.xlsx / .xls / .csv) para Auditoría de Catálogo.
 * 100% en el navegador — nunca se envía el archivo a un servidor o API externa.
 */
import * as XLSX from "xlsx";

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

export class CatalogFileReadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CatalogFileReadError";
  }
}

export type CatalogFileReadResult = {
  fileName: string;
  fileSizeMB: number;
  sheetName: string;
  detectedHeaders: string[];
  rows: Record<string, unknown>[];
  readTimeMs: number;
};

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv");
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(
    (value) =>
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === ""),
  );
}

function fileSizeMB(file: File): number {
  return file.size / (1024 * 1024);
}

/**
 * Lee un catálogo `.xlsx`/`.xls`/`.csv` en el navegador y devuelve filas
 * como objetos { encabezado: valor }. No hardcodea nombres de archivo.
 */
export async function readCatalogFile(
  file: File,
): Promise<CatalogFileReadResult> {
  if (!isAllowedFile(file)) {
    throw new CatalogFileReadError(
      "Formato no válido. Seleccioná un archivo .xlsx, .xls o .csv.",
    );
  }

  if (file.size === 0) {
    throw new CatalogFileReadError("El archivo está vacío.");
  }

  const startedAt = performance.now();

  try {
    let workbook: XLSX.WorkBook;

    if (isCsvFile(file)) {
      const text = await file.text();
      workbook = XLSX.read(text, { type: "string", raw: true });
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        cellNF: false,
        cellStyles: false,
        sheetStubs: false,
      });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new CatalogFileReadError("El archivo no contiene hojas de datos.");
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new CatalogFileReadError(`No se pudo leer la hoja "${sheetName}".`);
    }

    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, {
        defval: undefined,
        raw: true,
      })
      .filter((row) => !isEmptyRow(row));

    const detectedHeaders =
      rows.length > 0
        ? [...new Set(rows.flatMap((row) => Object.keys(row)))]
        : XLSX.utils
            .sheet_to_json<string[]>(sheet, { header: 1, range: 0 })[0]
            ?.map((h) => String(h ?? "")) ?? [];

    return {
      fileName: file.name,
      fileSizeMB: Number(fileSizeMB(file).toFixed(2)),
      sheetName,
      detectedHeaders,
      rows,
      readTimeMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof CatalogFileReadError) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al procesar el archivo.";

    throw new CatalogFileReadError(
      `No se pudo leer el catálogo: ${message}`,
      error,
    );
  }
}
