import * as XLSX from "xlsx";

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"] as const;

export const PREVIEW_ROW_LIMIT = 2000;

const WARN_ROWS = 10_000;
const WARN_COLUMNS = 50;
const WARN_SIZE_MB = 15;
const LARGE_FILE_MB = 5;

const LOG_PREFIX = "[Pickup Excel]";

export class ExcelReadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExcelReadError";
  }
}

export type ExcelReadProgressPhase =
  | "reading_buffer"
  | "parsing_workbook"
  | "analyzing_sheet"
  | "building_preview"
  | "loading_full_data"
  | "done";

export type ExcelReadOptions = {
  /** Máximo de filas de datos en `previewRows` (default 2000). */
  previewRowLimit?: number;
  /** Si true, incluye todos los datos en `fullData` (default true). */
  loadFullData?: boolean;
  onProgress?: (phase: ExcelReadProgressPhase) => void;
};

export type ExcelReadMetadata = {
  fileName: string;
  fileSizeMB: number;
  rowsCount: number;
  columnsCount: number;
  sheetName: string;
  readTimeMs: number;
  previewRowLimit: number;
  previewRowsCount: number;
  previewTruncated: boolean;
  fullDataLoaded: boolean;
  isLargeFile: boolean;
  warnings: string[];
};

export type ExcelReadResult = {
  metadata: ExcelReadMetadata;
  /** Filas para UI / tablas (máx. `previewRowLimit`). */
  previewRows: Record<string, unknown>[];
  /** Dataset completo para mapeo e importación futura. */
  fullData?: Record<string, unknown>[];
};

function isAllowedExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(
    (value) =>
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === ""),
  );
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function fileSizeMB(file: File): number {
  return file.size / (1024 * 1024);
}

function getSheetDimensions(sheet: XLSX.WorkSheet): {
  rowsCount: number;
  columnsCount: number;
} {
  const ref = sheet["!ref"];
  if (!ref) {
    return { rowsCount: 0, columnsCount: 0 };
  }

  const range = XLSX.utils.decode_range(ref);
  const columnsCount = range.e.c - range.s.c + 1;
  const rowsCount = Math.max(0, range.e.r - range.s.r);

  return { rowsCount, columnsCount };
}

function buildPreviewRange(
  sheet: XLSX.WorkSheet,
  maxDataRows: number,
): string | undefined {
  const ref = sheet["!ref"];
  if (!ref) return undefined;

  const range = XLSX.utils.decode_range(ref);
  const endRow = Math.min(range.e.r, range.s.r + maxDataRows);

  return XLSX.utils.encode_range({
    s: { r: range.s.r, c: range.s.c },
    e: { r: endRow, c: range.e.c },
  });
}

function sheetToRows(
  sheet: XLSX.WorkSheet,
  range?: string,
): Record<string, unknown>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: undefined,
    raw: true,
    range,
  });

  return rows.filter((row) => !isEmptyRow(row));
}

function collectWarnings(
  file: File,
  rowsCount: number,
  columnsCount: number,
): string[] {
  const warnings: string[] = [];
  const sizeMb = fileSizeMB(file);

  if (sizeMb > WARN_SIZE_MB) {
    warnings.push(`Archivo mayor a ${WARN_SIZE_MB} MB (${sizeMb.toFixed(2)} MB).`);
  }
  if (rowsCount > WARN_ROWS) {
    warnings.push(`Más de ${WARN_ROWS.toLocaleString("es-AR")} filas de datos.`);
  }
  if (columnsCount > WARN_COLUMNS) {
    warnings.push(`Más de ${WARN_COLUMNS} columnas detectadas.`);
  }

  for (const warning of warnings) {
    console.warn(`${LOG_PREFIX} ${warning}`, {
      fileName: file.name,
      rowsCount,
      columnsCount,
      fileSizeMB: sizeMb.toFixed(2),
    });
  }

  return warnings;
}

/**
 * Lee la primera hoja de un Excel en el navegador.
 * - `previewRows`: hasta 2000 filas para UI.
 * - `fullData`: dataset completo (carga diferida en archivos grandes).
 */
export async function readExcelFile(
  file: File,
  options: ExcelReadOptions = {},
): Promise<ExcelReadResult> {
  const previewRowLimit = options.previewRowLimit ?? PREVIEW_ROW_LIMIT;
  const loadFullData = options.loadFullData ?? true;
  const onProgress = options.onProgress;

  if (!isAllowedExcelFile(file)) {
    throw new ExcelReadError(
      "Formato no válido. Seleccioná un archivo .xlsx o .xls.",
    );
  }

  if (file.size === 0) {
    throw new ExcelReadError("El archivo está vacío.");
  }

  const startedAt = performance.now();
  const sizeMb = fileSizeMB(file);
  const isLargeFile = sizeMb >= LARGE_FILE_MB;

  try {
    onProgress?.("reading_buffer");
    await yieldToMain();

    const buffer = await file.arrayBuffer();

    onProgress?.("parsing_workbook");
    await yieldToMain();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellNF: false,
      cellStyles: false,
      sheetStubs: false,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new ExcelReadError("El archivo no contiene hojas de cálculo.");
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new ExcelReadError(`No se pudo leer la hoja "${sheetName}".`);
    }

    onProgress?.("analyzing_sheet");
    await yieldToMain();

    const { rowsCount, columnsCount } = getSheetDimensions(sheet);
    const warnings = collectWarnings(file, rowsCount, columnsCount);
    const previewTruncated = rowsCount > previewRowLimit;

    onProgress?.("building_preview");
    await yieldToMain();

    const previewRange = buildPreviewRange(sheet, previewRowLimit);
    const previewRows = sheetToRows(sheet, previewRange);

    let fullData: Record<string, unknown>[] | undefined;

    if (loadFullData) {
      onProgress?.("loading_full_data");
      await yieldToMain();

      if (previewTruncated) {
        console.warn(
          `${LOG_PREFIX} Archivo grande: parseando dataset completo en segundo plano (${rowsCount.toLocaleString("es-AR")} filas).`,
          { fileName: file.name },
        );
      }

      fullData = sheetToRows(sheet);
    }

    const readTimeMs = Math.round(performance.now() - startedAt);

    onProgress?.("done");

    const metadata: ExcelReadMetadata = {
      fileName: file.name,
      fileSizeMB: Number(sizeMb.toFixed(2)),
      rowsCount,
      columnsCount,
      sheetName,
      readTimeMs,
      previewRowLimit,
      previewRowsCount: previewRows.length,
      previewTruncated,
      fullDataLoaded: Boolean(fullData),
      isLargeFile,
      warnings,
    };

    if (previewTruncated) {
      console.warn(
        `${LOG_PREFIX} Vista previa limitada a ${previewRowLimit} filas; fullData tiene ${fullData?.length ?? 0} filas útiles.`,
        { fileName: file.name, readTimeMs },
      );
    }

    return { metadata, previewRows, fullData };
  } catch (error) {
    if (error instanceof ExcelReadError) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al procesar el archivo.";

    throw new ExcelReadError(`No se pudo leer el Excel: ${message}`, error);
  }
}

/** Compatibilidad: devuelve fullData o preview. */
export async function readExcelFileRows(
  file: File,
  options?: ExcelReadOptions,
): Promise<Record<string, unknown>[]> {
  const result = await readExcelFile(file, options);
  return result.fullData ?? result.previewRows;
}
