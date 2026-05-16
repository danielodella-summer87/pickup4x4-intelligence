export {
  EXCEL_WORKBOOKS,
  COLUMN_MAPS,
  CLIENTES_COLUMNS,
  VENTAS_COLUMNS,
  ARTICULOS_COLUMNS,
  type ExcelWorkbookKey,
  type ColumnAliases,
  type ColumnMap,
} from "@/lib/excel/column-map";

export {
  isBlank,
  normalizeText,
  normalizeCode,
  normalizeCodigoUnico,
  normalizeNumber,
  normalizeInteger,
  normalizeDate,
  normalizeCurrency,
  normalizePhone,
  normalizeBoolean,
  normalizeClienteEstado,
  normalizeTipoComprobante,
} from "@/lib/excel/normalizers";

export {
  buildCodigoAplicacion,
  assignCodigosAplicacion,
} from "@/lib/excel/application-code";

export {
  ExcelMapError,
  pickRowValue,
  mapClienteRow,
  mapVentaRow,
  mapArticuloAplicacionRows,
  tryMapClienteRow,
  tryMapVentaRow,
  type ArticuloAplicacionMapResult,
} from "@/lib/excel/mappers";

export {
  buildImportPreview,
  buildImportPreviewFromMockRows,
  type ExcelImportRawInput,
  type ImportPreview,
  type ImportPreviewWarning,
  type CodigoRepetidoResumen,
} from "@/lib/excel/import-preview";

export {
  ExcelReadError,
  PREVIEW_ROW_LIMIT,
  readExcelFile,
  readExcelFileRows,
  type ExcelReadMetadata,
  type ExcelReadOptions,
  type ExcelReadProgressPhase,
  type ExcelReadResult,
} from "@/lib/excel/read-workbook";

export {
  COMMERCIAL_CONFIDENCE_HIGH,
  COMMERCIAL_CONFIDENCE_MEDIUM,
  MIN_NORM_CONFIDENCE,
  countApplicationsByValidationStatus,
  resolveApplicationValidation,
  REVIEW_REASON_MANUAL_VALIDATION,
  isObviousGarbageVehicleText,
  isUsableVehicleMarcaText,
  isUsableVehicleModeloText,
  normalizeVehicleDisplayText,
  withDefaultApplicationConfidenceFields,
} from "@/lib/excel/application-confidence";

export {
  buildApplicationAudit,
  type ApplicationAuditReport,
  type ApplicationAuditRankedItem,
  type ApplicationAuditReference,
  type ExcludedApplicationExample,
} from "@/lib/excel/application-audit";

export {
  buildPickupDatasetFromRows,
  type BuildPickupDatasetParams,
  type DatasetWarning,
  type PickupDataset,
  type PickupDatasetStats,
} from "@/lib/excel/build-dataset";

export {
  DataQualityCollector,
  attachRowPreviewsToReport,
  processArticulosWithQuality,
  processClientesWithQuality,
  processVentasWithQuality,
  type DataQualityCriticalError,
  type DataQualityDataset,
  type DataQualityFallback,
  type DataQualityIssueKind,
  type DataQualityReport,
  type DataQualitySummary,
  type DataQualityWarning,
  type ExcludedRow,
  type ProblematicRowExample,
  type TopMotivo,
} from "@/lib/excel/data-quality";

export {
  NormalizationRegistry,
  normalizeLocalidad,
  normalizeMarca,
  normalizeModelo,
  stringSimilarity,
  type EquivalenceGroup,
  type NormalizationResult,
  type SmartNormalizationReport,
} from "@/lib/excel/normalization";
