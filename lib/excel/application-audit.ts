import {
  resolveApplicationValidation,
} from "@/lib/excel/application-confidence";
import { ARTICULOS_COLUMNS } from "@/lib/excel/column-map";
import { mapArticuloAplicacionRows, pickRowValue } from "@/lib/excel/mappers";
import {
  isRowCompletelyEmpty,
  normalizeMarca,
  normalizeModelo,
  type NormalizationRegistry,
} from "@/lib/excel/normalization";
import type { ArticuloAplicacion } from "@/lib/models/articulo";
import {
  normalizeCodigoUnico,
  normalizeText,
} from "@/lib/excel/normalizers";

export type ExcludedApplicationExample = {
  rowIndex: number;
  codigoUnico: string | null;
  descripcion: string | null;
  marcaOriginal: string | null;
  modeloOriginal: string | null;
  motivo: string;
  confianza?: number;
  teniaAplicacionPreview: boolean;
  validationStatus: "excluded" | "review";
};

export type ApplicationAuditRankedItem = {
  label: string;
  count: number;
};

export type ApplicationAuditReport = {
  filasOriginales: number;
  aplicacionesAntesFiltros: number;
  /** Alta confianza (validationStatus valid). */
  aplicacionesAltaConfianza: number;
  /** Confianza media incluidas con requiresReview. */
  aplicacionesRevision: number;
  /** Alta + revisión (en dataset). */
  aplicacionesUtilizables: number;
  aplicacionesExcluidas: number;
  /** (utilizables / preview) × 100 */
  porcentajeAprovechamientoReal: number;
  porcentajeAltaConfianza: number;
  porcentajeRevision: number;
  porcentajeExcluidas: number;
  /** @deprecated Usar aplicacionesAltaConfianza */
  aplicacionesFinalesValidas: number;
  /** @deprecated Usar porcentajeAprovechamientoReal */
  porcentajeAprovechamiento: number;
  perdidaPorFiltrosCalidad: number;
  filasVacias: number;
  filasSinCodigo: number;
  filasSinMarcaModeloEnPreview: number;
  topMotivos: ApplicationAuditRankedItem[];
  topMotivosRevision: ApplicationAuditRankedItem[];
  topMarcasExcluidas: ApplicationAuditRankedItem[];
  topModelosExcluidos: ApplicationAuditRankedItem[];
  ejemplosFilasExcluidas: ExcludedApplicationExample[];
  ejemplosFilasRevision: ExcludedApplicationExample[];
};

const TOP_N = 20;
const EJEMPLOS_MAX = 20;

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topRanked(map: Map<string, number>, limit: number): ApplicationAuditRankedItem[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function pickExamples(
  candidates: ExcludedApplicationExample[],
  preferPreview = true,
): ExcludedApplicationExample[] {
  const conPreview = candidates.filter((item) => item.teniaAplicacionPreview);
  const sinPreview = candidates.filter((item) => !item.teniaAplicacionPreview);
  const ordered = preferPreview ? [...conPreview, ...sinPreview] : candidates;
  return ordered.slice(0, EJEMPLOS_MAX);
}

export type ApplicationAuditReference = {
  totalUtilizables: number;
  altaConfianza: number;
  revision: number;
};

/**
 * Audita el pipeline con bandas de confianza comercial (alta / revisión / excluida).
 */
export function buildApplicationAudit(
  rows: Record<string, unknown>[],
  normRegistry: NormalizationRegistry,
  referencia?: ApplicationAuditReference,
): ApplicationAuditReport {
  const previewMapped = mapArticuloAplicacionRows(rows);
  const aplicacionesAntesFiltros = previewMapped.aplicaciones.length;

  const motivoExclusionCounts = new Map<string, number>();
  const motivoRevisionCounts = new Map<string, number>();
  const marcaExcluidaCounts = new Map<string, number>();
  const modeloExcluidoCounts = new Map<string, number>();
  const exclusionCandidates: ExcludedApplicationExample[] = [];
  const revisionCandidates: ExcludedApplicationExample[] = [];

  let aplicacionesAltaConfianza = 0;
  let aplicacionesRevision = 0;
  let filasVacias = 0;
  let filasSinCodigo = 0;
  let filasSinMarcaModeloEnPreview = 0;

  rows.forEach((row, rowIndex) => {
    const codigoUnico = normalizeCodigoUnico(
      pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico),
    );
    const descripcion = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.descripcion));
    const marcaRaw = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.marcaVehiculo));
    const modeloRaw = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.modeloVehiculo));
    const teniaAplicacionPreview = Boolean(codigoUnico && marcaRaw && modeloRaw);

    const recordExcluded = (motivo: string, confianza?: number): void => {
      incrementCount(motivoExclusionCounts, motivo);
      if (marcaRaw) incrementCount(marcaExcluidaCounts, marcaRaw);
      if (modeloRaw) incrementCount(modeloExcluidoCounts, modeloRaw);
      exclusionCandidates.push({
        rowIndex,
        codigoUnico: codigoUnico ?? null,
        descripcion: descripcion ?? null,
        marcaOriginal: marcaRaw ?? null,
        modeloOriginal: modeloRaw ?? null,
        motivo,
        confianza,
        teniaAplicacionPreview,
        validationStatus: "excluded",
      });
    };

    if (isRowCompletelyEmpty(row)) {
      filasVacias += 1;
      recordExcluded("Fila completamente vacía");
      return;
    }

    if (!codigoUnico) {
      filasSinCodigo += 1;
      recordExcluded("Falta código único");
      return;
    }

    if (!marcaRaw || !modeloRaw) {
      filasSinMarcaModeloEnPreview += 1;
    }

    const marcaNorm = normalizeMarca(marcaRaw, normRegistry);
    const modeloNorm = normalizeModelo(
      modeloRaw,
      marcaNorm.canonical ?? undefined,
      normRegistry,
    );
    const validation = resolveApplicationValidation(
      marcaNorm,
      modeloNorm,
      marcaRaw,
      modeloRaw,
    );

    if (!validation.include) {
      recordExcluded(validation.motivo, validation.confidence);
      return;
    }

    if (validation.validationStatus === "review") {
      aplicacionesRevision += 1;
      const motivo =
        validation.reviewReason ?? `Confianza media (${validation.confidence.toFixed(2)})`;
      incrementCount(motivoRevisionCounts, motivo);
      revisionCandidates.push({
        rowIndex,
        codigoUnico: codigoUnico ?? null,
        descripcion: descripcion ?? null,
        marcaOriginal: marcaRaw ?? null,
        modeloOriginal: modeloRaw ?? null,
        motivo,
        confianza: validation.confidence,
        teniaAplicacionPreview,
        validationStatus: "review",
      });
      return;
    }

    aplicacionesAltaConfianza += 1;
  });

  const aplicacionesUtilizables = aplicacionesAltaConfianza + aplicacionesRevision;
  const aplicacionesExcluidas = Math.max(
    0,
    aplicacionesAntesFiltros - aplicacionesUtilizables,
  );

  if (
    process.env.NODE_ENV === "development" &&
    referencia !== undefined &&
    (referencia.totalUtilizables !== aplicacionesUtilizables ||
      referencia.altaConfianza !== aplicacionesAltaConfianza ||
      referencia.revision !== aplicacionesRevision)
  ) {
    console.warn("[ApplicationAudit] Desvío con pipeline ETL", {
      audit: { aplicacionesUtilizables, aplicacionesAltaConfianza, aplicacionesRevision },
      etl: referencia,
    });
  }

  const pct = (part: number, total: number) =>
    total > 0 ? Math.round((part / total) * 1000) / 10 : part > 0 ? 100 : 0;

  const porcentajeAprovechamientoReal = pct(
    aplicacionesUtilizables,
    aplicacionesAntesFiltros,
  );

  if (process.env.NODE_ENV === "development") {
    console.info("[ApplicationAudit]", {
      filasOriginales: rows.length,
      aplicacionesAntesFiltros,
      aplicacionesAltaConfianza,
      aplicacionesRevision,
      aplicacionesUtilizables,
      aplicacionesExcluidas,
      porcentajeAprovechamientoReal,
    });
  }

  return {
    filasOriginales: rows.length,
    aplicacionesAntesFiltros,
    aplicacionesAltaConfianza,
    aplicacionesRevision,
    aplicacionesUtilizables,
    aplicacionesExcluidas,
    porcentajeAprovechamientoReal,
    porcentajeAltaConfianza: pct(aplicacionesAltaConfianza, aplicacionesAntesFiltros),
    porcentajeRevision: pct(aplicacionesRevision, aplicacionesAntesFiltros),
    porcentajeExcluidas: pct(aplicacionesExcluidas, aplicacionesAntesFiltros),
    aplicacionesFinalesValidas: aplicacionesAltaConfianza,
    porcentajeAprovechamiento: porcentajeAprovechamientoReal,
    perdidaPorFiltrosCalidad: aplicacionesExcluidas,
    filasVacias,
    filasSinCodigo,
    filasSinMarcaModeloEnPreview,
    topMotivos: topRanked(motivoExclusionCounts, TOP_N),
    topMotivosRevision: topRanked(motivoRevisionCounts, TOP_N),
    topMarcasExcluidas: topRanked(marcaExcluidaCounts, TOP_N),
    topModelosExcluidos: topRanked(modeloExcluidoCounts, TOP_N),
    ejemplosFilasExcluidas: pickExamples(exclusionCandidates),
    ejemplosFilasRevision: pickExamples(revisionCandidates, true),
  };
}

export function buildApplicationAuditFromAplicaciones(
  aplicaciones: ArticuloAplicacion[],
  aplicacionesAntesFiltros: number,
): Pick<
  ApplicationAuditReport,
  | "aplicacionesAltaConfianza"
  | "aplicacionesRevision"
  | "aplicacionesUtilizables"
  | "aplicacionesExcluidas"
> {
  let alta = 0;
  let revision = 0;

  for (const ap of aplicaciones) {
    if (ap.validationStatus === "review") {
      revision += 1;
    } else {
      alta += 1;
    }
  }

  const utilizables = alta + revision;

  return {
    aplicacionesAltaConfianza: alta,
    aplicacionesRevision: revision,
    aplicacionesUtilizables: utilizables,
    aplicacionesExcluidas: Math.max(0, aplicacionesAntesFiltros - utilizables),
  };
}
