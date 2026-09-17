import type { PickupDataset, PickupDatasetStats } from "@/lib/excel/build-dataset";
import { isValidPickupDataset } from "@/lib/data/excel-dataset-persistence";
import type { ActiveDatasetStatus, DatasetProvenance } from "@/lib/data/mixed-dataset";

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
 * Dataset legacy vacío explícito (sin clientes, ventas, artículos ni aplicaciones).
 * Base del dataset mixto cuando legacy no tiene datos: nunca se rellena con mock.
 */
export function emptyPickupDataset(): PickupDataset {
  return {
    clientes: [],
    ventas: [],
    ventaItems: [],
    articulos: [],
    aplicaciones: [],
    marcas: [],
    modelos: [],
    solicitudes: [],
    oportunidades: [],
    warnings: [],
    dataQuality: emptyDataQuality(),
    smartNormalization: emptySmartNormalization(),
    stats: defaultStats(),
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
    catalogTaxonomy: isRecord(value.catalogTaxonomy)
      ? (value.catalogTaxonomy as PickupDataset["catalogTaxonomy"])
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

export type ParsedLoadDatasetBody = {
  ok: boolean;
  /** Estado explícito informado por el servidor (ready | empty | error); null si no vino. */
  status: ActiveDatasetStatus | null;
  errorCode: string | null;
  emptyReason: string | null;
  dataset: PickupDataset | null;
  generatedAt: Date | null;
  oportunidades: unknown[];
  provenance: DatasetProvenance | null;
  errorMessage?: string;
};

const DOMAIN_KEYS = ["catalog", "sales", "customers", "applications"] as const;

function parseProvenance(value: unknown): DatasetProvenance | null {
  if (!isRecord(value) || !isRecord(value.sources) || !isRecord(value.catalog)) return null;
  const sources = value.sources;
  if (!DOMAIN_KEYS.every((key) => typeof sources[key] === "string")) return null;
  if (value.mode !== "legacy" && value.mode !== "mixed" && value.mode !== "mock") return null;
  return value as DatasetProvenance;
}

export function parseLoadDatasetApiBody(body: unknown): ParsedLoadDatasetBody {
  if (!isRecord(body)) {
    return { ok: false, status: null, errorCode: null, emptyReason: null, dataset: null, generatedAt: null, oportunidades: [], provenance: null };
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

  const status =
    body.status === "ready" || body.status === "empty" || body.status === "error" ? body.status : null;

  return {
    ok,
    status,
    errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
    emptyReason: typeof body.emptyReason === "string" ? body.emptyReason : null,
    dataset,
    generatedAt,
    oportunidades,
    provenance: parseProvenance(body.provenance),
    errorMessage,
  };
}
