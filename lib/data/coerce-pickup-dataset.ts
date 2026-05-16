import type { PickupDataset, PickupDatasetStats } from "@/lib/excel/build-dataset";
import { isValidPickupDataset } from "@/lib/data/excel-dataset-persistence";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function defaultStats(): PickupDatasetStats {
  return {
    clientesInputRows: 0,
    clientesNormalized: 0,
    clientesDuplicatesSkipped: 0,
    clientesMapErrors: 0,
    ventasInputRows: 0,
    ventasNormalized: 0,
    ventasMapErrors: 0,
    ventasSinCliente: 0,
    ventaItemsGenerated: 0,
    ventaItemsSinArticulo: 0,
    articulosInputRows: 0,
    articulosUnicos: 0,
    aplicacionesGenerated: 0,
    marcasDetectadas: 0,
    modelosDetectados: 0,
    codigosConMultiplesAplicaciones: 0,
    filasExcluidas: 0,
    fallbacksAplicados: 0,
    erroresCriticos: 0,
    advertenciasCalidad: 0,
    localidadesUnificadas: 0,
    marcasUnificadas: 0,
    modelosUnificados: 0,
    buildTimeMs: 0,
  } satisfies PickupDatasetStats;
}

function emptyDataQuality(): PickupDataset["dataQuality"] {
  return {
    summary: {
      filasExcluidas: 0,
      fallbacksAplicados: 0,
      advertencias: 0,
      erroresCriticos: 0,
    },
    severity: {
      criticos: 0,
      revisar: 0,
      informativos: 0,
      filasExcluidas: 0,
    },
    issuesBySeverity: { critico: [], revisar: [], informativo: [] },
    criticalErrors: [],
    warnings: [],
    fallbacks: [],
    excludedRows: [],
    topMotivos: [],
    ejemploFilasProblematicas: [],
  };
}

function emptySmartNormalization(): PickupDataset["smartNormalization"] {
  return {
    localidadesUnificadas: 0,
    marcasUnificadas: 0,
    modelosUnificados: 0,
    filasExcluidasPorNormalizacion: 0,
    filasExcluidasAutomaticamente: 0,
    topEquivalencias: [],
  };
}

/**
 * Acepta dataset de la API aunque falten metadatos de calidad tras JSON.
 * Requiere al menos clientes + artículos + aplicaciones con datos.
 */
export function coercePickupDatasetFromApi(value: unknown): PickupDataset | null {
  if (isValidPickupDataset(value)) {
    return value;
  }

  if (!isRecord(value)) return null;

  const clientes = value.clientes;
  const articulos = value.articulos;
  const aplicaciones = value.aplicaciones;

  if (!isArray(clientes) || !isArray(articulos) || !isArray(aplicaciones)) {
    return null;
  }

  if (clientes.length === 0 && articulos.length === 0 && aplicaciones.length === 0) {
    return null;
  }

  const ventas = isArray(value.ventas) ? value.ventas : [];
  const ventaItems = isArray(value.ventaItems) ? value.ventaItems : [];
  const marcas = isArray(value.marcas) ? value.marcas : [];
  const modelos = isArray(value.modelos) ? value.modelos : [];
  const warnings = isArray(value.warnings) ? value.warnings : [];
  const stats = isRecord(value.stats)
    ? ({ ...defaultStats(), ...value.stats } as PickupDatasetStats)
    : defaultStats();

  return {
    clientes: clientes as PickupDataset["clientes"],
    ventas: ventas as PickupDataset["ventas"],
    ventaItems: ventaItems as PickupDataset["ventaItems"],
    articulos: articulos as PickupDataset["articulos"],
    aplicaciones: aplicaciones as PickupDataset["aplicaciones"],
    marcas: marcas as PickupDataset["marcas"],
    modelos: modelos as PickupDataset["modelos"],
    solicitudes: isArray(value.solicitudes) ? (value.solicitudes as PickupDataset["solicitudes"]) : [],
    oportunidades: isArray(value.oportunidades)
      ? (value.oportunidades as PickupDataset["oportunidades"])
      : [],
    warnings: warnings as PickupDataset["warnings"],
    dataQuality: isRecord(value.dataQuality)
      ? (value.dataQuality as PickupDataset["dataQuality"])
      : emptyDataQuality(),
    smartNormalization: isRecord(value.smartNormalization)
      ? (value.smartNormalization as PickupDataset["smartNormalization"])
      : emptySmartNormalization(),
    applicationAudit: isRecord(value.applicationAudit)
      ? (value.applicationAudit as PickupDataset["applicationAudit"])
      : undefined,
    stats: {
      ...stats,
      clientesNormalized: clientes.length,
      articulosUnicos: articulos.length,
      aplicacionesGenerated: aplicaciones.length,
      marcasDetectadas: marcas.length,
      modelosDetectados: modelos.length,
    },
  };
}

export function parseLoadDatasetApiBody(body: unknown): {
  ok: boolean;
  dataset: PickupDataset | null;
  generatedAt: Date | null;
  oportunidades: unknown[];
  errorMessage?: string;
} {
  if (!isRecord(body)) {
    return { ok: false, dataset: null, generatedAt: null, oportunidades: [] };
  }

  const ok = body.ok === true;
  const dataset = coercePickupDatasetFromApi(body.dataset);
  const generatedAt =
    typeof body.generatedAt === "string" && !Number.isNaN(Date.parse(body.generatedAt))
      ? new Date(body.generatedAt)
      : null;
  const oportunidades = Array.isArray(body.oportunidades) ? body.oportunidades : [];
  const errorMessage =
    typeof body.errorMessage === "string" ? body.errorMessage : undefined;

  return { ok, dataset, generatedAt, oportunidades, errorMessage };
}
