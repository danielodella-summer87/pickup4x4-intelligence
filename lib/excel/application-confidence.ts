import type { ArticuloAplicacion, ApplicationValidationStatus } from "@/lib/models/articulo";
import { normalizeKey, type NormalizationResult } from "@/lib/excel/normalization";

/** Alta confianza: entra como válida. */
export const COMMERCIAL_CONFIDENCE_HIGH = 0.85;

/** Umbral histórico banda media (referencia); la revisión ya no depende solo de este valor. */
export const COMMERCIAL_CONFIDENCE_MEDIUM = 0.55;

/**
 * Umbral histórico del ETL (0.75). Se conserva exportado por compatibilidad
 * (p. ej. localidades en clientes).
 */
export const MIN_NORM_CONFIDENCE = 0.75;

export const REVIEW_REASON_MANUAL_VALIDATION =
  "Marca/modelo legibles, pero requieren validación manual";

const VEHICLE_GARBAGE_EXACT = new Set([
  "",
  "-",
  "--",
  "—",
  ".",
  "..",
  "?",
  "??",
  "n/a",
  "na",
  "s/d",
  "sd",
  "sin dato",
  "sin datos",
  "sin marca",
  "sin modelo",
  "no informado",
  "no aplica",
  "null",
  "undefined",
  "xxx",
  "0",
  "1",
]);

export type { ApplicationValidationStatus };

export type ApplicationValidationDecision =
  | {
      include: false;
      validationStatus: "excluded";
      confidence: number;
      motivo: string;
      campos: ("marcaVehiculo" | "modeloVehiculo")[];
    }
  | {
      include: true;
      validationStatus: "valid" | "review";
      confidence: number;
      requiresReview: boolean;
      reviewReason?: string;
      marcaNombre: string;
      modeloNombre: string;
      marcaLegible?: string;
      modeloLegible?: string;
    };

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Texto legible para mostrar en catálogo cuando no hay canónico. */
export function normalizeVehicleDisplayText(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  if (/^[A-Z0-9\s./-]+$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
    return toTitleCase(trimmed);
  }
  return toTitleCase(trimmed);
}

export function isObviousGarbageVehicleText(value: string | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;

  const key = normalizeKey(trimmed);
  if (VEHICLE_GARBAGE_EXACT.has(key)) return true;
  if (/^\d+$/.test(key)) return true;
  if (key.length === 1) return true;
  if (key.length === 2 && !/[a-z]{2}/i.test(key)) return true;

  return false;
}

export function isUsableVehicleMarcaText(value: string | undefined): boolean {
  return !isObviousGarbageVehicleText(value);
}

export function isUsableVehicleModeloText(value: string | undefined): boolean {
  return !isObviousGarbageVehicleText(value);
}

export function combinedNormalizationConfidence(
  marca: NormalizationResult,
  modelo: NormalizationResult,
): number {
  return Math.min(marca.confidence, modelo.confidence);
}

type FieldAssessment =
  | {
      ok: false;
      campo: "marcaVehiculo" | "modeloVehiculo";
      motivo: string;
    }
  | {
      ok: true;
      display: string;
    };

function assessVehicleField(
  raw: string | undefined,
  campo: "marcaVehiculo" | "modeloVehiculo",
): FieldAssessment {
  if (!raw?.trim()) {
    return {
      ok: false,
      campo,
      motivo:
        campo === "marcaVehiculo"
          ? "Marca de vehículo ausente"
          : "Modelo de vehículo ausente",
    };
  }

  if (isObviousGarbageVehicleText(raw)) {
    return {
      ok: false,
      campo,
      motivo:
        campo === "marcaVehiculo"
          ? `Marca basura evidente: "${raw}"`
          : `Modelo basura evidente: "${raw}"`,
    };
  }

  return { ok: true, display: normalizeVehicleDisplayText(raw) };
}

export function resolveApplicationValidation(
  marcaNorm: NormalizationResult,
  modeloNorm: NormalizationResult,
  marcaRaw: string | undefined,
  modeloRaw: string | undefined,
): ApplicationValidationDecision {
  const marcaField = assessVehicleField(marcaRaw, "marcaVehiculo");
  if (!marcaField.ok) {
    return {
      include: false,
      validationStatus: "excluded",
      confidence: marcaNorm.confidence,
      motivo: marcaField.motivo,
      campos: [marcaField.campo],
    };
  }

  const modeloField = assessVehicleField(modeloRaw, "modeloVehiculo");
  if (!modeloField.ok) {
    return {
      include: false,
      validationStatus: "excluded",
      confidence: modeloNorm.confidence,
      motivo: modeloField.motivo,
      campos: [modeloField.campo],
    };
  }

  const marcaLegible = marcaField.display;
  const modeloLegible = modeloField.display;
  const marcaNombre = marcaNorm.canonical ?? marcaLegible;
  const modeloNombre = modeloNorm.canonical ?? modeloLegible;

  const confidence = combinedNormalizationConfidence(marcaNorm, modeloNorm);

  const hasHighConfidenceMatch =
    Boolean(marcaNorm.canonical) &&
    Boolean(modeloNorm.canonical) &&
    confidence >= COMMERCIAL_CONFIDENCE_HIGH;

  if (hasHighConfidenceMatch) {
    return {
      include: true,
      validationStatus: "valid",
      confidence,
      requiresReview: false,
      marcaNombre,
      modeloNombre,
    };
  }

  return {
    include: true,
    validationStatus: "review",
    confidence,
    requiresReview: true,
    reviewReason: REVIEW_REASON_MANUAL_VALIDATION,
    marcaNombre,
    modeloNombre,
    marcaLegible,
    modeloLegible,
  };
}

export function withDefaultApplicationConfidenceFields(
  aplicacion: ArticuloAplicacion,
): ArticuloAplicacion {
  return {
    ...aplicacion,
    confidence: aplicacion.confidence ?? 1,
    validationStatus: aplicacion.validationStatus ?? "valid",
    requiresReview: aplicacion.requiresReview ?? false,
    reviewReason: aplicacion.reviewReason,
  };
}

export function countApplicationsByValidationStatus(
  aplicaciones: ArticuloAplicacion[],
): {
  validas: number;
  revision: number;
  totalUtilizables: number;
} {
  let validas = 0;
  let revision = 0;

  for (const aplicacion of aplicaciones) {
    const status = aplicacion.validationStatus ?? "valid";
    if (status === "review") {
      revision += 1;
    } else {
      validas += 1;
    }
  }

  return {
    validas,
    revision,
    totalUtilizables: validas + revision,
  };
}
