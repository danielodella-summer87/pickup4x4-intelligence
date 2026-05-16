import type { DataQualitySeverity } from "@/lib/excel/data-quality";
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
  V1_SCHEMA_MINIMUM_FIELDS,
  V1_SCHEMA_MINIMUM_LABELS,
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
  severity: DataQualitySeverity;
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
  /** Todas las obligatorias faltantes (bloqueantes + informativas v1). */
  missingRequired: MissingRequiredColumn[];
  /** Todas las recomendadas faltantes (revisar + informativas v1). */
  missingRecommended: MissingRequiredColumn[];
  missingRequiredBlocking: MissingRequiredColumn[];
  missingRequiredInformativo: MissingRequiredColumn[];
  missingRecommendedRevisar: MissingRequiredColumn[];
  missingRecommendedInformativo: MissingRequiredColumn[];
  sampleMapSuccessRate: number | null;
};

export type ImportReadinessStatus = "valida" | "valida_observaciones" | "bloqueada";

export type SchemaCriticalIssue = {
  datasetKey: ImportDatasetKey;
  fileLabel: string;
  fieldKey: string;
  fieldLabel: string;
  expectedLabels: string[];
  diagnosticSummary: string;
};

export type RowQualityIssue = {
  code: string;
  message: string;
  count?: number;
  severity: DataQualitySeverity;
};

export type ColumnDiagnosticsSummary = {
  files: FileColumnDiagnostic[];
  /** @deprecated Usar readiness.status */
  overallStatus: "listo" | "ajustes";
  /** @deprecated Usar readiness.label */
  overallLabel: string;
  readiness: ImportReadiness;
};

export type ImportReadiness = {
  status: ImportReadinessStatus;
  label: string;
  canBuildDataset: boolean;
  /** Solo columnas mínimas faltantes en el encabezado del Excel. */
  schemaCriticalIssues: SchemaCriticalIssue[];
  /** Filas o mapeos problemáticos: no bloquean la importación en v1. */
  rowQualityIssues: RowQualityIssue[];
  blockReason: string | null;
  estimatedRowsExcluded: number;
  severity: {
    /** Cantidad de problemas de esquema (bloquean). */
    schemaCriticos: number;
    revisar: number;
    informativos: number;
    filasExcluidasEstimadas: number;
  };
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

/** Campos legacy en REQUIRED_FIELDS que ya no son mínimos v1 (solo informativo si faltan). */
const V1_LEGACY_OPTIONAL_REQUIRED: Partial<Record<ImportDatasetKey, ReadonlySet<string>>> = {
  ventas: new Set(["importeTotal", "fecha"]),
};

/** Recomendadas / opcionales que en v1 son solo informativas. */
const V1_INFORMATIVO_FIELDS = new Set([
  "moneda",
  "importeTotal",
  "precioUnitario",
  "importe",
  "precioLista",
  "cuit",
  "email",
  "telefono",
  "fax",
  "direccion",
  "domicilio",
]);

const PREVIEW_WARNING_SEVERITY: Record<string, DataQualitySeverity> = {
  CLIENTES_SIN_CUENTA: "revisar",
  VENTAS_SIN_CUENTA: "revisar",
  VENTAS_SIN_FECHA: "informativo",
  ARTICULOS_SIN_CODIGO: "revisar",
  APLICACIONES_SIN_MARCA: "revisar",
  SIN_APLICACIONES_GENERADAS: "revisar",
  SIN_DATOS: "critico",
  CLIENTES_NO_MAPEADOS: "revisar",
  VENTAS_NO_MAPEADAS: "revisar",
  CLIENTES_SIN_RAZON_SOCIAL: "informativo",
  VENTAS_SIN_IMPORTE: "informativo",
  ARTICULOS_SIN_DESCRIPCION: "informativo",
  COLUMNAS_REQUIEREN_AJUSTE: "revisar",
  COLUMNAS_V1_INFORMATIVAS: "informativo",
  COLUMNAS_RECOMENDADAS: "revisar",
  COLUMNAS_NO_USADAS_V1: "informativo",
  MAPEO_BAJO: "revisar",
  CODIGOS_REPETIDOS: "revisar",
};

function severityForPreviewWarning(
  code: string,
  message: string,
): DataQualitySeverity {
  if (PREVIEW_WARNING_SEVERITY[code]) {
    return PREVIEW_WARNING_SEVERITY[code];
  }
  const lower = message.toLowerCase();
  if (lower.includes("importe") || lower.includes("moneda") || lower.includes("precio")) {
    return "informativo";
  }
  return "revisar";
}

function pushPreviewWarning(
  list: ImportPreviewWarning[],
  code: string,
  message: string,
  count?: number,
): void {
  list.push({
    code,
    message,
    count,
    severity: severityForPreviewWarning(code, message),
  });
}

function partitionMissingRequired(
  datasetKey: ImportDatasetKey,
  missingRequired: MissingRequiredColumn[],
): {
  blocking: MissingRequiredColumn[];
  v1Informativo: MissingRequiredColumn[];
} {
  const exempt = V1_LEGACY_OPTIONAL_REQUIRED[datasetKey] ?? new Set<string>();
  const blocking: MissingRequiredColumn[] = [];
  const v1Informativo: MissingRequiredColumn[] = [];

  for (const item of missingRequired) {
    if (exempt.has(item.fieldKey)) {
      v1Informativo.push(item);
    } else {
      blocking.push(item);
    }
  }

  return { blocking, v1Informativo };
}

function partitionMissingRecommended(
  missingRecommended: MissingRequiredColumn[],
): {
  revisar: MissingRequiredColumn[];
  informativo: MissingRequiredColumn[];
} {
  const revisar: MissingRequiredColumn[] = [];
  const informativo: MissingRequiredColumn[] = [];

  for (const item of missingRecommended) {
    if (V1_INFORMATIVO_FIELDS.has(item.fieldKey)) {
      informativo.push(item);
    } else {
      revisar.push(item);
    }
  }

  return { revisar, informativo };
}

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
  blockingRequired: MissingRequiredColumn[],
  missingRecommendedRevisar: MissingRequiredColumn[],
  sampleMapSuccessRate: number | null,
): { status: ColumnCompatibilityStatus; statusLabel: string } {
  if (blockingRequired.length > 0) {
    return { status: "incompleto", statusLabel: "Bloqueado" };
  }

  const lowMapRate =
    sampleMapSuccessRate !== null && sampleMapSuccessRate < 0.85;

  if (missingRecommendedRevisar.length > 0 || lowMapRate) {
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

  const missingRequiredRaw = V1_SCHEMA_MINIMUM_FIELDS[datasetKey]
    .filter((fieldKey) => !recognizedKeys.has(fieldKey))
    .map((fieldKey) => buildMissing(fieldKey));

  const { blocking: missingRequired, v1Informativo: missingRequiredV1 } =
    partitionMissingRequired(datasetKey, missingRequiredRaw);

  const missingRecommendedRaw = RECOMMENDED_FIELDS[datasetKey]
    .filter((fieldKey) => !recognizedKeys.has(fieldKey))
    .map((fieldKey) => buildMissing(fieldKey));

  const { revisar: missingRecommended, informativo: missingRecommendedV1 } =
    partitionMissingRecommended(missingRecommendedRaw);

  const missingRequiredForUi = [...missingRequired, ...missingRequiredV1];
  const missingRecommendedForUi = [
    ...missingRecommended,
    ...missingRecommendedV1,
  ];

  const sampleMapSuccessRate = measureMapSuccessRate(datasetKey, rows);
  const { status, statusLabel } = resolveFileStatus(
    missingRequired,
    missingRecommended,
    sampleMapSuccessRate,
  );

  logFileColumnDiagnostics(
    datasetKey,
    workbookTitle,
    detectedHeaders,
    recognized,
    missingRequiredForUi,
    missingRecommendedForUi,
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
    missingRequired: missingRequiredForUi,
    missingRecommended: missingRecommendedForUi,
    missingRequiredBlocking: missingRequired,
    missingRequiredInformativo: missingRequiredV1,
    missingRecommendedRevisar: missingRecommended,
    missingRecommendedInformativo: missingRecommendedV1,
    sampleMapSuccessRate,
  };
}

function buildSchemaCriticalIssues(
  files: FileColumnDiagnostic[],
): SchemaCriticalIssue[] {
  const issues: SchemaCriticalIssue[] = [];

  for (const file of files) {
    const labels = V1_SCHEMA_MINIMUM_LABELS[file.datasetKey];
    for (const col of file.missingRequiredBlocking) {
      const idx = V1_SCHEMA_MINIMUM_FIELDS[file.datasetKey].indexOf(col.fieldKey);
      issues.push({
        datasetKey: file.datasetKey,
        fileLabel: file.fileLabel,
        fieldKey: col.fieldKey,
        fieldLabel: col.fieldLabel,
        expectedLabels: idx >= 0 ? [labels[idx] ?? col.fieldLabel] : [col.fieldLabel],
        diagnosticSummary: col.diagnosticSummary,
      });
    }
  }

  return issues;
}

function buildRowQualityIssues(
  previewWarnings: ImportPreviewWarning[],
): RowQualityIssue[] {
  const rowCodes = new Set([
    "CLIENTES_SIN_CUENTA",
    "CLIENTES_NO_MAPEADOS",
    "VENTAS_SIN_CUENTA",
    "VENTAS_NO_MAPEADAS",
    "ARTICULOS_SIN_CODIGO",
    "APLICACIONES_SIN_MARCA",
    "MAPEO_BAJO",
    "CODIGOS_REPETIDOS",
    "SIN_APLICACIONES_GENERADAS",
  ]);

  return previewWarnings
    .filter((w) => rowCodes.has(w.code) || w.severity === "revisar")
    .map((w) => ({
      code: w.code,
      message: w.message,
      count: w.count,
      severity: w.severity,
    }));
}

function estimateRowsExcluded(previewWarnings: ImportPreviewWarning[]): number {
  return previewWarnings.reduce((sum, warning) => {
    if (
      warning.code.endsWith("_NO_MAPEADOS") ||
      warning.code === "CLIENTES_SIN_CUENTA" ||
      warning.code === "VENTAS_SIN_CUENTA" ||
      warning.code === "ARTICULOS_SIN_CODIGO"
    ) {
      return sum + (warning.count ?? 0);
    }
    return sum;
  }, 0);
}

export function resolveImportReadiness(
  files: FileColumnDiagnostic[],
  previewWarnings: ImportPreviewWarning[] = [],
  options?: { allFilesLoaded?: boolean },
): ImportReadiness {
  const schemaCriticalIssues = buildSchemaCriticalIssues(files);
  const rowQualityIssues = buildRowQualityIssues(previewWarnings);
  const estimatedRowsExcluded = estimateRowsExcluded(previewWarnings);

  let revisar = 0;
  let informativos = 0;

  for (const file of files) {
    informativos += file.missingRequiredInformativo.length;
    informativos += file.missingRecommendedInformativo.length;
    revisar += file.missingRecommendedRevisar.length;

    if (file.unrecognized.length > 0) {
      informativos += 1;
    }

    if (
      file.sampleMapSuccessRate !== null &&
      file.sampleMapSuccessRate < 0.85
    ) {
      revisar += 1;
    }
  }

  for (const warning of previewWarnings) {
    if (warning.severity === "revisar") revisar += 1;
    else if (warning.severity === "informativo") informativos += 1;
  }

  const sinDatos = previewWarnings.some((w) => w.code === "SIN_DATOS");
  const hasSchemaBlock = schemaCriticalIssues.length > 0;
  const allFilesLoaded = options?.allFilesLoaded ?? files.length >= 3;

  let status: ImportReadinessStatus;
  let label: string;
  let blockReason: string | null = null;

  if (sinDatos || !allFilesLoaded) {
    status = "bloqueada";
    label = "Importación bloqueada";
    blockReason = sinDatos
      ? "No hay filas para importar en los archivos cargados."
      : "Faltan archivos Excel por cargar (clientes, ventas y artículos).";
  } else if (hasSchemaBlock) {
    status = "bloqueada";
    label = "Importación bloqueada";
    const missingLabels = schemaCriticalIssues
      .map((issue) => `${issue.fileLabel}: ${issue.expectedLabels.join(" / ")}`)
      .join(" · ");
    blockReason = `Faltan columnas mínimas en el encabezado: ${missingLabels}`;
  } else if (revisar > 0 || estimatedRowsExcluded > 0 || rowQualityIssues.length > 0) {
    status = "valida_observaciones";
    label = "Importación válida con observaciones";
  } else {
    status = "valida";
    label = "Importación válida";
  }

  return {
    status,
    label,
    canBuildDataset: allFilesLoaded && !hasSchemaBlock && !sinDatos,
    schemaCriticalIssues,
    rowQualityIssues,
    blockReason,
    estimatedRowsExcluded,
    severity: {
      schemaCriticos: schemaCriticalIssues.length,
      revisar,
      informativos,
      filasExcluidasEstimadas: estimatedRowsExcluded,
    },
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

  const readiness = resolveImportReadiness(files, [], {
    allFilesLoaded: files.length >= 3,
  });
  const overallStatus =
    readiness.status === "bloqueada" ? "ajustes" : "listo";
  const overallLabel = readiness.label;

  return { files, overallStatus, overallLabel, readiness };
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
      pushPreviewWarning(
        advertencias,
        "CLIENTES_SIN_CUENTA",
        "Filas de clientes sin número de cuenta",
        sinCuenta,
      );
    }
    if (sinRazon > 0) {
      pushPreviewWarning(
        advertencias,
        "CLIENTES_SIN_RAZON_SOCIAL",
        "Filas de clientes sin razón social (se completará si hay fantasía)",
        sinRazon,
      );
    }
    if (errores > 0) {
      pushPreviewWarning(
        advertencias,
        "CLIENTES_NO_MAPEADOS",
        "Filas de clientes que no pudieron mapearse",
        errores,
      );
    }
  }

  if (input.ventas) {
    const errores = input.ventas.filter((row) => !tryMapVentaRow(row).data).length;
    ventasMapeadas = filasVentas - errores;

    const sinCuenta = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.numeroCuenta);
    const sinFecha = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.fecha);
    const sinImporte = contarFilasSinCampo(input.ventas, VENTAS_COLUMNS.importeTotal);

    if (sinCuenta > 0) {
      pushPreviewWarning(
        advertencias,
        "VENTAS_SIN_CUENTA",
        "Filas de ventas sin número de cuenta",
        sinCuenta,
      );
    }
    if (sinFecha > 0) {
      pushPreviewWarning(
        advertencias,
        "VENTAS_SIN_FECHA",
        "Filas de ventas sin fecha",
        sinFecha,
      );
    }
    if (sinImporte > 0) {
      pushPreviewWarning(
        advertencias,
        "VENTAS_SIN_IMPORTE",
        "Filas de ventas sin importe (no se usa en v1)",
        sinImporte,
      );
    }
    if (errores > 0) {
      pushPreviewWarning(
        advertencias,
        "VENTAS_NO_MAPEADAS",
        "Filas de ventas que no pudieron mapearse",
        errores,
      );
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
      pushPreviewWarning(
        advertencias,
        "ARTICULOS_SIN_CODIGO",
        "Filas de artículos sin código único",
        sinCodigo,
      );
    }
    if (sinDescripcion > 0) {
      pushPreviewWarning(
        advertencias,
        "ARTICULOS_SIN_DESCRIPCION",
        "Filas de artículos sin descripción (se usará el código)",
        sinDescripcion,
      );
    }
    if (sinMarcaVehiculo > 0) {
      pushPreviewWarning(
        advertencias,
        "APLICACIONES_SIN_MARCA",
        "Filas sin marca de vehículo (no generan aplicación)",
        sinMarcaVehiculo,
      );
    }
    if (aplicaciones === 0 && filasArticulosAplicaciones > 0) {
      pushPreviewWarning(
        advertencias,
        "SIN_APLICACIONES_GENERADAS",
        "No se generaron aplicaciones; revisar columnas de marca/modelo/años",
      );
    }
  }

  if (
    filasClientes === 0 &&
    filasVentas === 0 &&
    filasArticulosAplicaciones === 0
  ) {
    pushPreviewWarning(
      advertencias,
      "SIN_DATOS",
      "No se recibieron filas para previsualizar",
    );
  }

  const columnDiagnostics = buildColumnDiagnostics(input);

  for (const file of columnDiagnostics.files) {
    if (file.missingRequiredInformativo.length > 0) {
      pushPreviewWarning(
        advertencias,
        "COLUMNAS_V1_INFORMATIVAS",
        `${file.fileLabel}: columnas no usadas en v1 (${file.missingRequiredInformativo.map((c) => c.fieldLabel).join(", ")})`,
      );
    }
    if (file.unrecognized.length > 0) {
      pushPreviewWarning(
        advertencias,
        "COLUMNAS_NO_USADAS_V1",
        `${file.fileLabel}: ${file.unrecognized.length} columnas del Excel no se usan en esta versión`,
        file.unrecognized.length,
      );
    }
    if (
      file.sampleMapSuccessRate !== null &&
      file.sampleMapSuccessRate < 0.85
    ) {
      pushPreviewWarning(
        advertencias,
        "MAPEO_BAJO",
        `${file.fileLabel}: bajo porcentaje de filas mapeables en muestra`,
      );
    }
  }

  if (codigosRepetidos.length > 0) {
    pushPreviewWarning(
      advertencias,
      "CODIGOS_REPETIDOS",
      "Códigos con varias aplicaciones (se generará código auxiliar)",
      codigosRepetidos.length,
    );
  }

  columnDiagnostics.readiness = resolveImportReadiness(
    columnDiagnostics.files,
    advertencias,
    { allFilesLoaded: true },
  );

  if (columnDiagnostics.readiness.schemaCriticalIssues.length > 0) {
    pushPreviewWarning(
      advertencias,
      "COLUMNAS_MINIMAS_FALTANTES",
      columnDiagnostics.readiness.blockReason ?? "Faltan columnas mínimas en el Excel",
    );
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
