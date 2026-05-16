import {
  ARTICULOS_COLUMNS,
  CLIENTES_COLUMNS,
  findHeaderForField,
  formatMatchKindLabel,
  getFieldLabel,
  IMPORT_DATASETS,
  normalizeColumnName,
  RECOMMENDED_FIELDS,
  REQUIRED_FIELDS,
  sanitizeExcelHeader,
  type ColumnMap,
  type ColumnMatchKind,
  type ImportDatasetKey,
  VENTAS_COLUMNS,
} from "@/lib/excel/column-map";
import {
  mapArticuloAplicacionRows,
  tryMapClienteRow,
  tryMapVentaRow,
} from "@/lib/excel/mappers";
import { pickRowValue } from "@/lib/excel/mappers";
import { normalizeCodigoUnico } from "@/lib/excel/normalizers";

export type ExcelImportRawInput = {
  clientes?: Record<string, unknown>[];
  ventas?: Record<string, unknown>[];
  articulosAplicaciones?: Record<string, unknown>[];
};

export type ImportPreviewWarning = {
  code: string;
  message: string;
  count?: number;
};

export type CodigoRepetidoResumen = {
  codigoUnico: string;
  filas: number;
  codigosAplicacion: string[];
};

export type ColumnCompatibilityStatus = "compatible" | "revisar" | "incompleto";

export type ColumnMatchAttempt = {
  alias: string;
  normalizedAlias: string;
  reason: string;
};

export type RecognizedColumn = {
  fieldKey: string;
  fieldLabel: string;
  matchedHeader: string;
  matchedAlias: string;
  matchKind: ColumnMatchKind;
  matchDetail: string;
};

export type MissingRequiredColumn = {
  fieldKey: string;
  fieldLabel: string;
  expectedAliases: string[];
  matchAttempts: ColumnMatchAttempt[];
  nearestHeaders: string[];
  diagnosticSummary: string;
};

export type FileColumnDiagnostic = {
  datasetKey: ImportDatasetKey;
  fileLabel: string;
  rowCount: number;
  status: ColumnCompatibilityStatus;
  statusLabel: string;
  totalColumns: number;
  detectedHeaders: string[];
  first20Headers: string[];
  recognized: RecognizedColumn[];
  unrecognized: string[];
  missingRequired: MissingRequiredColumn[];
  missingRecommended: MissingRequiredColumn[];
  sampleMapSuccessRate: number | null;
};

export type ColumnDiagnosticsSummary = {
  files: FileColumnDiagnostic[];
  overallStatus: "listo" | "ajustes";
  overallLabel: string;
};

export type ImportPreview = {
  filasClientes: number;
  filasVentas: number;
  filasArticulosAplicaciones: number;
  clientesMapeados: number;
  ventasMapeadas: number;
  articulosUnicos: number;
  aplicaciones: number;
  marcas: number;
  modelos: number;
  codigosRepetidos: CodigoRepetidoResumen[];
  advertencias: ImportPreviewWarning[];
  columnDiagnostics: ColumnDiagnosticsSummary;
};

const HEADER_SAMPLE_ROWS = 30;
const MAP_SAMPLE_SIZE = 200;
const PREVIEW_HEADER_LIMIT = 20;
const LOG_PREFIX = "[Pickup ColumnMatch]";

function extractDetectedHeaders(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  const sample = rows.slice(0, HEADER_SAMPLE_ROWS);

  for (const row of sample) {
    for (const key of Object.keys(row)) {
      const sanitized = sanitizeExcelHeader(key);
      if (sanitized) keys.add(sanitized);
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b, "es"));
}

function buildMatchDetail(match: {
  header: string;
  alias: string;
  kind: ColumnMatchKind;
}): string {
  return `${formatMatchKindLabel(match.kind)} · alias "${match.alias}" → encabezado "${match.header}"`;
}

function findNearestHeaders(
  detectedHeaders: string[],
  aliases: readonly string[],
): string[] {
  const normalizedAliases = aliases.map((alias) => normalizeColumnName(alias));

  return detectedHeaders.filter((header) => {
    const normalizedHeader = normalizeColumnName(header);
    return normalizedAliases.some((aliasNorm) => {
      if (!aliasNorm || !normalizedHeader) return false;
      return (
        normalizedHeader.includes(aliasNorm) ||
        aliasNorm.includes(normalizedHeader)
      );
    });
  });
}

function buildMissingFieldDiagnostics(
  fieldKey: string,
  aliases: readonly string[],
  detectedHeaders: string[],
  headerOwners: Map<string, string>,
): Pick<MissingRequiredColumn, "matchAttempts" | "nearestHeaders" | "diagnosticSummary"> {
  const matchAttempts: ColumnMatchAttempt[] = aliases.map((alias) => {
    const normalizedAlias = normalizeColumnName(alias);
    const exactHeader = detectedHeaders.find(
      (header) =>
        sanitizeExcelHeader(header).toLowerCase() ===
        sanitizeExcelHeader(alias).toLowerCase(),
    );
    const normalizedHeader = detectedHeaders.find(
      (header) => normalizeColumnName(header) === normalizedAlias,
    );

    if (exactHeader) {
      const owner = headerOwners.get(exactHeader);
      if (owner && owner !== fieldKey) {
        return {
          alias,
          normalizedAlias,
          reason: `Encabezado exacto "${exactHeader}" ya asignado al campo "${owner}"`,
        };
      }
      if (!owner) {
        return {
          alias,
          normalizedAlias,
          reason: `Coincidencia exacta posible con "${exactHeader}" pero no se asignó al campo`,
        };
      }
    }

    if (normalizedHeader) {
      const owner = headerOwners.get(normalizedHeader);
      if (owner && owner !== fieldKey) {
        return {
          alias,
          normalizedAlias,
          reason: `Encabezado normalizado "${normalizedHeader}" (${normalizeColumnName(normalizedHeader)}) ya asignado a "${owner}"`,
        };
      }
      if (!owner) {
        return {
          alias,
          normalizedAlias,
          reason: `Coincidencia normalizada posible con "${normalizedHeader}" pero no se asignó`,
        };
      }
    }

    return {
      alias,
      normalizedAlias,
      reason: "Ningún encabezado coincide (ni exacto ni normalizado)",
    };
  });

  const nearestHeaders = findNearestHeaders(detectedHeaders, aliases);
  const closestLabel =
    nearestHeaders.length > 0
      ? `Encabezados cercanos: ${nearestHeaders.join(", ")}`
      : `Encabezados detectados: ${detectedHeaders.join(" · ") || "(ninguno)"}`;

  const attemptSummary = matchAttempts
    .slice(0, 4)
    .map((item) => `"${item.alias}" [${item.normalizedAlias}] → ${item.reason}`)
    .join(" | ");

  return {
    matchAttempts,
    nearestHeaders,
    diagnosticSummary: `${closestLabel}. Intentos: ${attemptSummary}`,
  };
}

function recognizeColumns(
  detectedHeaders: string[],
  columnMap: ColumnMap,
): {
  recognized: RecognizedColumn[];
  unrecognized: string[];
  headerOwners: Map<string, string>;
} {
  const recognized: RecognizedColumn[] = [];
  const matchedHeaders = new Set<string>();
  const headerOwners = new Map<string, string>();

  for (const [fieldKey, aliasList] of Object.entries(columnMap)) {
    const match = findHeaderForField(detectedHeaders, aliasList);
    if (!match) continue;

    recognized.push({
      fieldKey,
      fieldLabel: getFieldLabel(fieldKey),
      matchedHeader: `${match.header} · ${formatMatchKindLabel(match.kind)} ("${match.alias}")`,
      matchedAlias: match.alias,
      matchKind: match.kind,
      matchDetail: buildMatchDetail(match),
    });
    matchedHeaders.add(match.header);
    headerOwners.set(match.header, fieldKey);
  }

  const unrecognized = detectedHeaders.filter((header) => !matchedHeaders.has(header));

  return { recognized, unrecognized, headerOwners };
}

function logFileColumnDiagnostics(
  datasetKey: ImportDatasetKey,
  fileLabel: string,
  detectedHeaders: string[],
  recognized: RecognizedColumn[],
  missingRequired: MissingRequiredColumn[],
  missingRecommended: MissingRequiredColumn[],
): void {
  console.group(`${LOG_PREFIX} ${fileLabel} (${datasetKey})`);
  console.log("Encabezados detectados (sanitizados):", detectedHeaders);
  console.log(
    "Encabezados normalizados:",
    detectedHeaders.map((header) => ({
      raw: header,
      normalized: normalizeColumnName(header),
    })),
  );

  if (recognized.length > 0) {
    console.log("Columnas reconocidas:");
    for (const col of recognized) {
      console.log(`  • ${col.fieldKey}: ${col.matchDetail}`);
    }
  }

  const logMissing = (label: string, items: MissingRequiredColumn[]) => {
    if (items.length === 0) return;
    console.warn(`${label}:`);
    for (const item of items) {
      console.warn(`  • ${item.fieldKey} (${item.fieldLabel})`);
      for (const attempt of item.matchAttempts) {
        console.warn(
          `      alias "${attempt.alias}" [${attempt.normalizedAlias}] → ${attempt.reason}`,
        );
      }
      console.warn(`      ${item.diagnosticSummary}`);
    }
  };

  logMissing("Obligatorias faltantes", missingRequired);
  logMissing("Recomendadas faltantes", missingRecommended);
  console.groupEnd();
}

function measureMapSuccessRate(
  datasetKey: ImportDatasetKey,
  rows: Record<string, unknown>[],
): number | null {
  if (rows.length === 0) return null;

  const sample = rows.slice(0, MAP_SAMPLE_SIZE);
  let ok = 0;

  for (const row of sample) {
    if (datasetKey === "clientes" && tryMapClienteRow(row).data) ok += 1;
    else if (datasetKey === "ventas" && tryMapVentaRow(row).data) ok += 1;
    else if (
      datasetKey === "articulos" &&
      pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico) !== undefined
    ) {
      ok += 1;
    }
  }

  return ok / sample.length;
}

function resolveFileStatus(
  missingRequired: MissingRequiredColumn[],
  missingRecommended: MissingRequiredColumn[],
  unrecognized: string[],
  sampleMapSuccessRate: number | null,
): { status: ColumnCompatibilityStatus; statusLabel: string } {
  if (missingRequired.length > 0) {
    return { status: "incompleto", statusLabel: "Incompleto" };
  }

  const lowMapRate =
    sampleMapSuccessRate !== null && sampleMapSuccessRate < 0.85;

  if (missingRecommended.length > 0 || unrecognized.length > 0 || lowMapRate) {
    return { status: "revisar", statusLabel: "Revisar" };
  }

  return { status: "compatible", statusLabel: "Compatible" };
}

export function diagnoseFileColumns(
  datasetKey: ImportDatasetKey,
  rows: Record<string, unknown>[],
): FileColumnDiagnostic {
  const { workbookTitle, columnMap } = IMPORT_DATASETS[datasetKey];
  const detectedHeaders = extractDetectedHeaders(rows);
  const { recognized, unrecognized, headerOwners } = recognizeColumns(
    detectedHeaders,
    columnMap,
  );

  const recognizedKeys = new Set(recognized.map((item) => item.fieldKey));

  const buildMissing = (fieldKey: string): MissingRequiredColumn => {
    const aliasList = columnMap[fieldKey] ?? [];
    const diagnostics = buildMissingFieldDiagnostics(
      fieldKey,
      aliasList,
      detectedHeaders,
      headerOwners,
    );
    return {
      fieldKey,
      fieldLabel: getFieldLabel(fieldKey),
      expectedAliases: [
        ...aliasList.map(
          (alias) => `${alias} → norm: "${normalizeColumnName(alias)}"`,
        ),
      ],
      ...diagnostics,
    };
  };

  const missingRequired = REQUIRED_FIELDS[datasetKey]
    .filter((fieldKey) => !recognizedKeys.has(fieldKey))
    .map((fieldKey) => buildMissing(fieldKey));

  const missingRecommended = RECOMMENDED_FIELDS[datasetKey]
    .filter((fieldKey) => !recognizedKeys.has(fieldKey))
    .map((fieldKey) => buildMissing(fieldKey));

  const sampleMapSuccessRate = measureMapSuccessRate(datasetKey, rows);
  const { status, statusLabel } = resolveFileStatus(
    missingRequired,
    missingRecommended,
    unrecognized,
    sampleMapSuccessRate,
  );

  logFileColumnDiagnostics(
    datasetKey,
    workbookTitle,
    detectedHeaders,
    recognized,
    missingRequired,
    missingRecommended,
  );

  return {
    datasetKey,
    fileLabel: workbookTitle,
    rowCount: rows.length,
    status,
    statusLabel,
    totalColumns: detectedHeaders.length,
    detectedHeaders,
    first20Headers: detectedHeaders.slice(0, PREVIEW_HEADER_LIMIT),
    recognized,
    unrecognized,
    missingRequired,
    missingRecommended,
    sampleMapSuccessRate,
  };
}

export function buildColumnDiagnostics(
  input: ExcelImportRawInput,
): ColumnDiagnosticsSummary {
  const files: FileColumnDiagnostic[] = [];

  if (input.clientes?.length) {
    files.push(diagnoseFileColumns("clientes", input.clientes));
  }
  if (input.ventas?.length) {
    files.push(diagnoseFileColumns("ventas", input.ventas));
  }
  if (input.articulosAplicaciones?.length) {
    files.push(diagnoseFileColumns("articulos", input.articulosAplicaciones));
  }

  const hasIncomplete = files.some((file) => file.status === "incompleto");
  const needsReview = files.some((file) => file.status === "revisar");

  const overallStatus = hasIncomplete || needsReview ? "ajustes" : "listo";
  const overallLabel =
    overallStatus === "listo"
      ? "Listo para mapear"
      : "Requiere ajustes de columnas";

  return { files, overallStatus, overallLabel };
}

function contarFilasSinCampo(
  rows: Record<string, unknown>[],
  aliases: readonly string[],
): number {
  return rows.filter((row) => !pickRowValue(row, aliases)).length;
}

function analizarCodigosRepetidos(
  rows: Record<string, unknown>[],
): CodigoRepetidoResumen[] {
  const conteo = new Map<string, number>();

  for (const row of rows) {
    const codigo = normalizeCodigoUnico(pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico));
    if (!codigo) continue;
    conteo.set(codigo, (conteo.get(codigo) ?? 0) + 1);
  }

  const repetidos: CodigoRepetidoResumen[] = [];

  for (const [codigoUnico, filas] of conteo.entries()) {
    if (filas <= 1) continue;

    const mapped = mapArticuloAplicacionRows(
      rows.filter(
        (row) =>
          normalizeCodigoUnico(pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico)) ===
          codigoUnico,
      ),
    );

    repetidos.push({
      codigoUnico,
      filas,
      codigosAplicacion: mapped.aplicaciones
        .filter((ap) => ap.codigoUnico === codigoUnico)
        .map((ap) => ap.codigoAplicacion),
    });
  }

  return repetidos.sort((a, b) => b.filas - a.filas);
}

/**
 * Genera un resumen preliminar sin leer archivos del disco.
 * Pensado para una futura pantalla “Vista previa de importación”.
 */
export function buildImportPreview(input: ExcelImportRawInput): ImportPreview {
  const filasClientes = input.clientes?.length ?? 0;
  const filasVentas = input.ventas?.length ?? 0;
  const filasArticulosAplicaciones = input.articulosAplicaciones?.length ?? 0;

  const advertencias: ImportPreviewWarning[] = [];

  let clientesMapeados = 0;
  let ventasMapeadas = 0;

  if (input.clientes) {
    const errores = input.clientes.filter((row) => !tryMapClienteRow(row).data).length;
    clientesMapeados = filasClientes - errores;

    const sinCuenta = contarFilasSinCampo(input.clientes, CLIENTES_COLUMNS.numeroCuenta);
    const sinRazon = contarFilasSinCampo(input.clientes, CLIENTES_COLUMNS.razonSocial);

    if (sinCuenta > 0) {
      advertencias.push({
        code: "CLIENTES_SIN_CUENTA",
        message: "Filas de clientes sin número de cuenta",
        count: sinCuenta,
      });
    }
    if (sinRazon > 0) {
      advertencias.push({
        code: "CLIENTES_SIN_RAZON_SOCIAL",
        message: "Filas de clientes sin razón social",
        count: sinRazon,
      });
    }
    if (errores > 0) {
      advertencias.push({
        code: "CLIENTES_NO_MAPEADOS",
        message: "Filas de clientes que no pudieron mapearse",
        count: errores,
      });
    }
  }

  if (input.ventas) {
    const errores = input.ventas.filter((row) => !tryMapVentaRow(row).data).length;
    ventasMapeadas = filasVentas - errores;

    const sinCuenta = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.numeroCuenta);
    const sinFecha = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.fecha);
    const sinImporte = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.importeTotal);

    if (sinCuenta > 0) {
      advertencias.push({
        code: "VENTAS_SIN_CUENTA",
        message: "Filas de ventas sin número de cuenta",
        count: sinCuenta,
      });
    }
    if (sinFecha > 0) {
      advertencias.push({
        code: "VENTAS_SIN_FECHA",
        message: "Filas de ventas sin fecha",
        count: sinFecha,
      });
    }
    if (sinImporte > 0) {
      advertencias.push({
        code: "VENTAS_SIN_IMPORTE",
        message: "Filas de ventas sin importe",
        count: sinImporte,
      });
    }
    if (errores > 0) {
      advertencias.push({
        code: "VENTAS_NO_MAPEADAS",
        message: "Filas de ventas que no pudieron mapearse",
        count: errores,
      });
    }
  }

  let articulosUnicos = 0;
  let aplicaciones = 0;
  let marcas = 0;
  let modelos = 0;
  let codigosRepetidos: CodigoRepetidoResumen[] = [];

  if (input.articulosAplicaciones && input.articulosAplicaciones.length > 0) {
    const mapped = mapArticuloAplicacionRows(input.articulosAplicaciones);
    articulosUnicos = mapped.articulos.length;
    aplicaciones = mapped.aplicaciones.length;
    marcas = mapped.marcas.length;
    modelos = mapped.modelos.length;
    codigosRepetidos = analizarCodigosRepetidos(input.articulosAplicaciones);

    const sinCodigo = contarFilasSinCampo(
      input.articulosAplicaciones,
      ARTICULOS_COLUMNS.codigoUnico,
    );
    const sinDescripcion = contarFilasSinCampo(
      input.articulosAplicaciones,
      ARTICULOS_COLUMNS.descripcion,
    );
    const sinMarcaVehiculo = contarFilasSinCampo(
      input.articulosAplicaciones,
      ARTICULOS_COLUMNS.marcaVehiculo,
    );

    if (sinCodigo > 0) {
      advertencias.push({
        code: "ARTICULOS_SIN_CODIGO",
        message: "Filas de artículos sin código único",
        count: sinCodigo,
      });
    }
    if (sinDescripcion > 0) {
      advertencias.push({
        code: "ARTICULOS_SIN_DESCRIPCION",
        message: "Filas de artículos sin descripción (se usará el código)",
        count: sinDescripcion,
      });
    }
    if (sinMarcaVehiculo > 0) {
      advertencias.push({
        code: "APLICACIONES_SIN_MARCA",
        message: "Filas sin marca de vehículo (no generan aplicación)",
        count: sinMarcaVehiculo,
      });
    }
    if (aplicaciones === 0 && filasArticulosAplicaciones > 0) {
      advertencias.push({
        code: "SIN_APLICACIONES_GENERADAS",
        message:
          "No se generaron aplicaciones; revisar columnas de marca/modelo/años",
      });
    }
  }

  if (
    filasClientes === 0 &&
    filasVentas === 0 &&
    filasArticulosAplicaciones === 0
  ) {
    advertencias.push({
      code: "SIN_DATOS",
      message: "No se recibieron filas para previsualizar",
    });
  }

  const columnDiagnostics = buildColumnDiagnostics(input);

  if (columnDiagnostics.overallStatus === "ajustes") {
    advertencias.push({
      code: "COLUMNAS_REQUIEREN_AJUSTE",
      message: columnDiagnostics.overallLabel,
    });
  }

  return {
    filasClientes,
    filasVentas,
    filasArticulosAplicaciones,
    clientesMapeados,
    ventasMapeadas,
    articulosUnicos,
    aplicaciones,
    marcas,
    modelos,
    codigosRepetidos,
    advertencias,
    columnDiagnostics,
  };
}

/**
 * Vista previa a partir del mock actual (útil para desarrollo sin Excel).
 */
export function buildImportPreviewFromMockRows(
  input: ExcelImportRawInput,
): ImportPreview {
  return buildImportPreview(input);
}
