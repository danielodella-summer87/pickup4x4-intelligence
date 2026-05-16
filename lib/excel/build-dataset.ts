import {
  attachRowPreviewsToReport,
  DataQualityCollector,
  processArticulosWithQuality,
  processClientesWithQuality,
  processVentasWithQuality,
  type DataQualityReport,
} from "@/lib/excel/data-quality";
import {
  NormalizationRegistry,
  type SmartNormalizationReport,
} from "@/lib/excel/normalization";
import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { OportunidadComercial } from "@/lib/models/oportunidad";
import type { SolicitudPresupuesto } from "@/lib/models/solicitud";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import type { Venta, VentaItem } from "@/lib/models/venta";

export type DatasetWarning = {
  code: string;
  message: string;
  count?: number;
};

export type PickupDatasetStats = {
  clientesInputRows: number;
  clientesNormalized: number;
  clientesDuplicatesSkipped: number;
  clientesMapErrors: number;
  ventasInputRows: number;
  ventasNormalized: number;
  ventasMapErrors: number;
  ventasSinCliente: number;
  ventaItemsGenerated: number;
  ventaItemsSinArticulo: number;
  articulosInputRows: number;
  articulosUnicos: number;
  aplicacionesGenerated: number;
  marcasDetectadas: number;
  modelosDetectados: number;
  codigosConMultiplesAplicaciones: number;
  filasExcluidas: number;
  fallbacksAplicados: number;
  erroresCriticos: number;
  advertenciasCalidad: number;
  localidadesUnificadas: number;
  marcasUnificadas: number;
  modelosUnificados: number;
  buildTimeMs: number;
};

export type PickupDataset = {
  clientes: Cliente[];
  ventas: Venta[];
  ventaItems: VentaItem[];
  articulos: Articulo[];
  aplicaciones: ArticuloAplicacion[];
  marcas: VehiculoMarca[];
  modelos: VehiculoModelo[];
  solicitudes: SolicitudPresupuesto[];
  oportunidades: OportunidadComercial[];
  warnings: DatasetWarning[];
  dataQuality: DataQualityReport;
  smartNormalization: SmartNormalizationReport;
  stats: PickupDatasetStats;
};

export type BuildPickupDatasetParams = {
  clientesRows: Record<string, unknown>[];
  ventasRows: Record<string, unknown>[];
  articulosRows: Record<string, unknown>[];
};

function pushWarning(
  warnings: DatasetWarning[],
  code: string,
  message: string,
  count?: number,
): void {
  const existing = warnings.find((item) => item.code === code);
  if (existing && count !== undefined) {
    existing.count = (existing.count ?? 0) + count;
    return;
  }
  if (!existing) {
    warnings.push({ code, message, count });
  }
}

function countCodigosConMultiplesAplicaciones(
  aplicaciones: ArticuloAplicacion[],
): number {
  const conteo = new Map<string, number>();

  for (const aplicacion of aplicaciones) {
    conteo.set(
      aplicacion.codigoUnico,
      (conteo.get(aplicacion.codigoUnico) ?? 0) + 1,
    );
  }

  return [...conteo.values()].filter((count) => count > 1).length;
}

function mergeQualityIntoWarnings(
  warnings: DatasetWarning[],
  report: DataQualityReport,
): void {
  if (report.summary.filasExcluidas > 0) {
    pushWarning(
      warnings,
      "CALIDAD_FILAS_EXCLUIDAS",
      "Filas excluidas por errores críticos de calidad",
      report.summary.filasExcluidas,
    );
  }
  if (report.summary.fallbacksAplicados > 0) {
    pushWarning(
      warnings,
      "CALIDAD_FALLBACKS",
      "Campos completados por fallback conservador",
      report.summary.fallbacksAplicados,
    );
  }
}

export function buildPickupDatasetFromRows(
  params: BuildPickupDatasetParams,
): PickupDataset {
  const startedAt = performance.now();
  const warnings: DatasetWarning[] = [];
  const collector = new DataQualityCollector();
  const normRegistry = new NormalizationRegistry();

  const { clientes, duplicatesSkipped: clientesDuplicatesSkipped } =
    processClientesWithQuality(params.clientesRows, collector, normRegistry);

  const clientesByCuenta = new Map(clientes.map((c) => [c.numeroCuenta, c]));

  const { articulos, aplicaciones, marcas, modelos } = processArticulosWithQuality(
    params.articulosRows,
    collector,
    normRegistry,
  );

  const articuloCodigos = new Set(articulos.map((item) => item.codigoUnico));

  const {
    ventas,
    ventaItems,
    ventasSinCliente,
    ventaItemsSinArticulo,
  } = processVentasWithQuality(
    params.ventasRows,
    clientesByCuenta,
    articuloCodigos,
    collector,
    normRegistry,
  );

  const dataQuality = attachRowPreviewsToReport(collector.buildReport(), {
    clientes: params.clientesRows,
    ventas: params.ventasRows,
    articulos: params.articulosRows,
  });

  const smartNormalization: SmartNormalizationReport = {
    ...normRegistry.buildReport(),
    filasExcluidasAutomaticamente: dataQuality.summary.filasExcluidas,
  };

  mergeQualityIntoWarnings(warnings, dataQuality);

  if (clientesDuplicatesSkipped > 0) {
    pushWarning(
      warnings,
      "CLIENTES_DUPLICADOS",
      "Cuentas duplicadas; se conservó la última ocurrencia",
      clientesDuplicatesSkipped,
    );
  }

  if (ventasSinCliente > 0) {
    pushWarning(
      warnings,
      "VENTAS_SIN_CLIENTE",
      "Ventas excluidas por cliente inválido o ausente en listado",
      ventasSinCliente,
    );
  }

  if (smartNormalization.topEquivalencias.length > 0) {
    pushWarning(
      warnings,
      "NORMALIZACION_INTELIGENTE",
      "Se unificaron localidades, marcas y modelos con heurísticas de similitud",
    );
  }

  if (ventaItemsSinArticulo > 0) {
    pushWarning(
      warnings,
      "VENTA_ITEMS_SIN_ARTICULO",
      "Ítems de venta con codigoUnico no presente en artículos",
      ventaItemsSinArticulo,
    );
  }

  const codigosConMultiplesAplicaciones =
    countCodigosConMultiplesAplicaciones(aplicaciones);

  if (codigosConMultiplesAplicaciones > 0) {
    pushWarning(
      warnings,
      "CODIGOS_MULTIPLES_APLICACIONES",
      "Códigos únicos con más de una aplicación (codigoAplicacion auxiliar generado)",
      codigosConMultiplesAplicaciones,
    );
  }

  const clientesMapErrors = dataQuality.excludedRows.filter(
    (row) => row.dataset === "clientes",
  ).length;
  const ventasMapErrors = dataQuality.excludedRows.filter(
    (row) => row.dataset === "ventas",
  ).length;

  const buildTimeMs = Math.round(performance.now() - startedAt);

  return {
    clientes,
    ventas,
    ventaItems,
    articulos,
    aplicaciones,
    marcas,
    modelos,
    solicitudes: [],
    oportunidades: [],
    warnings,
    dataQuality,
    smartNormalization,
    stats: {
      clientesInputRows: params.clientesRows.length,
      clientesNormalized: clientes.length,
      clientesDuplicatesSkipped,
      clientesMapErrors,
      ventasInputRows: params.ventasRows.length,
      ventasNormalized: ventas.length,
      ventasMapErrors,
      ventasSinCliente,
      ventaItemsGenerated: ventaItems.length,
      ventaItemsSinArticulo,
      articulosInputRows: params.articulosRows.length,
      articulosUnicos: articulos.length,
      aplicacionesGenerated: aplicaciones.length,
      marcasDetectadas: marcas.length,
      modelosDetectados: modelos.length,
      codigosConMultiplesAplicaciones,
      filasExcluidas: dataQuality.summary.filasExcluidas,
      fallbacksAplicados: dataQuality.summary.fallbacksAplicados,
      erroresCriticos: dataQuality.summary.erroresCriticos,
      advertenciasCalidad: dataQuality.summary.advertencias,
      localidadesUnificadas: smartNormalization.localidadesUnificadas,
      marcasUnificadas: smartNormalization.marcasUnificadas,
      modelosUnificados: smartNormalization.modelosUnificados,
      buildTimeMs,
    },
  };
}
