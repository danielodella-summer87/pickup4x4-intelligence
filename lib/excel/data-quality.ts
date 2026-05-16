import { buildCodigoAplicacion } from "@/lib/excel/application-code";
import {
  ARTICULOS_COLUMNS,
  CLIENTES_COLUMNS,
  VENTAS_COLUMNS,
} from "@/lib/excel/column-map";
import { pickRowValue } from "@/lib/excel/mappers";
import {
  isRowCompletelyEmpty,
  normalizeLocalidad,
  normalizeMarca,
  normalizeModelo,
  type NormalizationRegistry,
} from "@/lib/excel/normalization";
import {
  isBlank,
  normalizeBoolean,
  normalizeClienteEstado,
  normalizeCodigoUnico,
  normalizeDate,
  normalizeInteger,
  normalizePhone,
  normalizeText,
  normalizeTipoComprobante,
} from "@/lib/excel/normalizers";
import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import type { Venta, VentaItem } from "@/lib/models/venta";

export type DataQualityDataset = "clientes" | "ventas" | "articulos";

export type DataQualityIssueKind = "critical" | "warning" | "fallback";

export type DataQualityFallback = {
  dataset: DataQualityDataset;
  rowIndex: number;
  campo: string;
  valorOriginal: string | null;
  valorFinal: string;
  motivo: string;
};

export type DataQualityCriticalError = {
  dataset: DataQualityDataset;
  rowIndex: number;
  campo: string;
  motivo: string;
};

export type DataQualityWarning = {
  dataset: DataQualityDataset;
  rowIndex?: number;
  code: string;
  message: string;
};

export type ExcludedRow = {
  dataset: DataQualityDataset;
  rowIndex: number;
  campos: string[];
  motivo: string;
};

export type ProblematicRowExample = {
  dataset: DataQualityDataset;
  rowIndex: number;
  motivo: string;
  detalle: string;
  preview: Record<string, string>;
};

export type DataQualitySummary = {
  filasExcluidas: number;
  fallbacksAplicados: number;
  advertencias: number;
  erroresCriticos: number;
};

export type TopMotivo = {
  motivo: string;
  count: number;
  kind: DataQualityIssueKind;
};

export type DataQualityReport = {
  summary: DataQualitySummary;
  criticalErrors: DataQualityCriticalError[];
  warnings: DataQualityWarning[];
  fallbacks: DataQualityFallback[];
  excludedRows: ExcludedRow[];
  topMotivos: TopMotivo[];
  ejemploFilasProblematicas: ProblematicRowExample[];
};

const SIN_CATEGORIA = "Sin categoría";
const SIN_DESCRIPCION_ARTICULO = "Artículo sin descripción";
const MIN_NORM_CONFIDENCE = 0.75;

function slugId(prefix: string, raw: string): string {
  const slug = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${prefix}-${slug || "sin-nombre"}`;
}

function asDisplayValue(value: unknown): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function rowPreview(row: Record<string, unknown>, maxKeys = 8): Record<string, string> {
  const preview: Record<string, string> = {};
  let count = 0;

  for (const [key, value] of Object.entries(row)) {
    if (count >= maxKeys) break;
    preview[key] = asDisplayValue(value) ?? "";
    count += 1;
  }

  return preview;
}

export class DataQualityCollector {
  readonly criticalErrors: DataQualityCriticalError[] = [];
  readonly warnings: DataQualityWarning[] = [];
  readonly fallbacks: DataQualityFallback[] = [];
  readonly excludedRows: ExcludedRow[] = [];

  addCritical(
    dataset: DataQualityDataset,
    rowIndex: number,
    campo: string,
    motivo: string,
  ): void {
    this.criticalErrors.push({ dataset, rowIndex, campo, motivo });
  }

  addWarning(
    dataset: DataQualityDataset,
    code: string,
    message: string,
    rowIndex?: number,
  ): void {
    this.warnings.push({ dataset, rowIndex, code, message });
  }

  addFallback(entry: DataQualityFallback): void {
    this.fallbacks.push(entry);
  }

  excludeRow(
    dataset: DataQualityDataset,
    rowIndex: number,
    campos: string[],
    motivo: string,
  ): void {
    this.excludedRows.push({ dataset, rowIndex, campos, motivo });
  }

  buildReport(): DataQualityReport {
    const motivoCounts = new Map<string, { count: number; kind: DataQualityIssueKind }>();

    const registerMotivo = (motivo: string, kind: DataQualityIssueKind) => {
      const key = `${kind}::${motivo}`;
      const current = motivoCounts.get(key) ?? { count: 0, kind };
      current.count += 1;
      motivoCounts.set(key, current);
    };

    for (const item of this.criticalErrors) {
      registerMotivo(item.motivo, "critical");
    }
    for (const item of this.excludedRows) {
      registerMotivo(item.motivo, "critical");
    }
    for (const item of this.warnings) {
      registerMotivo(item.message, "warning");
    }
    for (const item of this.fallbacks) {
      registerMotivo(item.motivo, "fallback");
    }

    const topMotivos: TopMotivo[] = [...motivoCounts.entries()]
      .map(([key, value]) => {
        const motivo = key.split("::").slice(1).join("::");
        return { motivo, count: value.count, kind: value.kind };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const ejemploFilasProblematicas = buildProblematicExamples(
      this.criticalErrors,
      this.excludedRows,
      this.fallbacks,
    );

    return {
      summary: {
        filasExcluidas: this.excludedRows.length,
        fallbacksAplicados: this.fallbacks.length,
        advertencias: this.warnings.length,
        erroresCriticos: this.criticalErrors.length,
      },
      criticalErrors: this.criticalErrors,
      warnings: this.warnings,
      fallbacks: this.fallbacks,
      excludedRows: this.excludedRows,
      topMotivos,
      ejemploFilasProblematicas,
    };
  }
}

function buildProblematicExamples(
  criticalErrors: DataQualityCriticalError[],
  excludedRows: ExcludedRow[],
  fallbacks: DataQualityFallback[],
  limit = 5,
): ProblematicRowExample[] {
  const examples: ProblematicRowExample[] = [];
  const seen = new Set<string>();

  const push = (example: ProblematicRowExample) => {
    const key = `${example.dataset}:${example.rowIndex}:${example.motivo}`;
    if (seen.has(key) || examples.length >= limit) return;
    seen.add(key);
    examples.push(example);
  };

  for (const row of excludedRows) {
    push({
      dataset: row.dataset,
      rowIndex: row.rowIndex,
      motivo: row.motivo,
      detalle: `Campos: ${row.campos.join(", ")}`,
      preview: {},
    });
  }

  for (const error of criticalErrors) {
    push({
      dataset: error.dataset,
      rowIndex: error.rowIndex,
      motivo: error.motivo,
      detalle: `Campo crítico: ${error.campo}`,
      preview: {},
    });
  }

  for (const fallback of fallbacks) {
    push({
      dataset: fallback.dataset,
      rowIndex: fallback.rowIndex,
      motivo: fallback.motivo,
      detalle: `${fallback.campo}: "${fallback.valorOriginal ?? "∅"}" → "${fallback.valorFinal}"`,
      preview: {},
    });
  }

  return examples;
}

export type ProcessClientesQualityResult = {
  clientes: Cliente[];
  duplicatesSkipped: number;
};

export function processClientesWithQuality(
  rows: Record<string, unknown>[],
  collector: DataQualityCollector,
  normRegistry: NormalizationRegistry,
): ProcessClientesQualityResult {
  const byCuenta = new Map<string, Cliente>();
  let duplicatesSkipped = 0;

  rows.forEach((row, rowIndex) => {
    if (isRowCompletelyEmpty(row)) {
      collector.excludeRow("clientes", rowIndex, [], "Fila completamente vacía");
      normRegistry.incrementExclusions();
      return;
    }

    const numeroCuenta = normalizeCodigoUnico(
      pickRowValue(row, CLIENTES_COLUMNS.numeroCuenta),
    );

    if (!numeroCuenta) {
      collector.addCritical(
        "clientes",
        rowIndex,
        "numeroCuenta",
        "Falta número de cuenta",
      );
      collector.excludeRow("clientes", rowIndex, ["numeroCuenta"], "Falta número de cuenta");
      return;
    }

    let razonSocial = normalizeText(pickRowValue(row, CLIENTES_COLUMNS.razonSocial));
    let nombreFantasia = normalizeText(
      pickRowValue(row, CLIENTES_COLUMNS.nombreFantasia),
    );

    if (!razonSocial && nombreFantasia) {
      collector.addFallback({
        dataset: "clientes",
        rowIndex,
        campo: "razonSocial",
        valorOriginal: null,
        valorFinal: nombreFantasia,
        motivo: "Falta razón social; se usó nombre fantasía",
      });
      razonSocial = nombreFantasia;
    } else if (razonSocial && !nombreFantasia) {
      collector.addFallback({
        dataset: "clientes",
        rowIndex,
        campo: "nombreFantasia",
        valorOriginal: null,
        valorFinal: razonSocial,
        motivo: "Falta nombre fantasía; se usó razón social",
      });
      nombreFantasia = razonSocial;
    } else if (!razonSocial && !nombreFantasia) {
      collector.addCritical(
        "clientes",
        rowIndex,
        "razonSocial",
        "Faltan razón social y nombre fantasía",
      );
      collector.excludeRow(
        "clientes",
        rowIndex,
        ["razonSocial", "nombreFantasia"],
        "Faltan razón social y nombre fantasía",
      );
      return;
    }

    const localidadRaw = normalizeText(pickRowValue(row, CLIENTES_COLUMNS.localidad));
    const localidadNorm = normalizeLocalidad(localidadRaw, normRegistry);
    if (!localidadNorm.canonical || localidadNorm.confidence < MIN_NORM_CONFIDENCE) {
      collector.addCritical(
        "clientes",
        rowIndex,
        "localidad",
        localidadRaw
          ? `Localidad no confiable: "${localidadRaw}"`
          : "Localidad ausente o basura",
      );
      collector.excludeRow(
        "clientes",
        rowIndex,
        ["localidad"],
        localidadRaw
          ? `Localidad ambigua o basura: "${localidadRaw}"`
          : "Localidad ausente",
      );
      normRegistry.incrementExclusions();
      return;
    }

    if (localidadNorm.method !== "dictionary" && localidadNorm.method !== "alias") {
      collector.addFallback({
        dataset: "clientes",
        rowIndex,
        campo: "localidad",
        valorOriginal: localidadRaw ?? null,
        valorFinal: localidadNorm.canonical,
        motivo: `Localidad unificada (${localidadNorm.method}, confianza ${(localidadNorm.confidence * 100).toFixed(0)}%)`,
      });
    }

    const localidad = localidadNorm.canonical;

    const cuitRaw = pickRowValue(row, CLIENTES_COLUMNS.cuit);
    const cuit = normalizeText(cuitRaw);
    if (isBlank(cuitRaw)) {
      collector.addWarning(
        "clientes",
        "CLIENTE_SIN_RUC",
        "RUC/CUIT vacío; se deja sin documento",
        rowIndex,
      );
    }

    const cliente: Cliente = {
      numeroCuenta,
      razonSocial: razonSocial!,
      nombreFantasia,
      zona: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.zona)) ?? "",
      vendedor: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.vendedor)) ?? "",
      estado:
        normalizeClienteEstado(pickRowValue(row, CLIENTES_COLUMNS.estado)) ?? "activo",
      cuit,
      localidad,
      provincia: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.provincia)),
      email: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.email)),
      telefono: normalizePhone(pickRowValue(row, CLIENTES_COLUMNS.telefono)),
    };

    if (byCuenta.has(numeroCuenta)) {
      duplicatesSkipped += 1;
    }
    byCuenta.set(numeroCuenta, cliente);
  });

  return {
    clientes: [...byCuenta.values()],
    duplicatesSkipped,
  };
}

export type ProcessVentasQualityResult = {
  ventas: Venta[];
  ventaItems: VentaItem[];
  ventasSinCliente: number;
  ventaItemsSinArticulo: number;
};

export function processVentasWithQuality(
  rows: Record<string, unknown>[],
  clientesByCuenta: Map<string, Cliente>,
  articuloCodigos: Set<string>,
  collector: DataQualityCollector,
  normRegistry: NormalizationRegistry,
): ProcessVentasQualityResult {
  const ventas: Venta[] = [];
  const ventaItems: VentaItem[] = [];
  const ventaIds = new Set<string>();
  let ventasSinCliente = 0;
  let ventaItemsSinArticulo = 0;
  let itemIndex = 0;

  collector.addWarning(
    "ventas",
    "IMPORTES_OMITIDOS_V1",
    "Versión v1: no se utilizan moneda, precios ni importes del Excel",
  );

  rows.forEach((row, rowIndex) => {
    if (isRowCompletelyEmpty(row)) {
      collector.excludeRow("ventas", rowIndex, [], "Fila completamente vacía");
      normRegistry.incrementExclusions();
      return;
    }

    const fecha = normalizeDate(pickRowValue(row, VENTAS_COLUMNS.fecha));
    const numeroCuenta = normalizeCodigoUnico(
      pickRowValue(row, VENTAS_COLUMNS.numeroCuenta),
    );

    if (!fecha) {
      collector.addCritical("ventas", rowIndex, "fecha", "Falta fecha");
      collector.excludeRow("ventas", rowIndex, ["fecha"], "Falta fecha");
      normRegistry.incrementExclusions();
      return;
    }
    if (!numeroCuenta) {
      collector.addCritical("ventas", rowIndex, "numeroCuenta", "Falta número de cuenta");
      collector.excludeRow("ventas", rowIndex, ["numeroCuenta"], "Falta número de cuenta");
      normRegistry.incrementExclusions();
      return;
    }

    if (!clientesByCuenta.has(numeroCuenta)) {
      collector.addCritical(
        "ventas",
        rowIndex,
        "numeroCuenta",
        `Cliente no válido en listado: ${numeroCuenta}`,
      );
      collector.excludeRow(
        "ventas",
        rowIndex,
        ["numeroCuenta"],
        "Venta sin cliente válido en listado de cuentas",
      );
      normRegistry.incrementExclusions();
      ventasSinCliente += 1;
      return;
    }

    let numeroComprobante = normalizeText(
      pickRowValue(row, VENTAS_COLUMNS.numeroComprobante),
    );
    if (!numeroComprobante) {
      numeroComprobante = `SIN-COMPROBANTE-${rowIndex}`;
      collector.addFallback({
        dataset: "ventas",
        rowIndex,
        campo: "numeroComprobante",
        valorOriginal: null,
        valorFinal: numeroComprobante,
        motivo: "Falta comprobante; identificador sintético por fila",
      });
    }

    const localidadRaw =
      normalizeText(pickRowValue(row, VENTAS_COLUMNS.localidadVenta)) ??
      clientesByCuenta.get(numeroCuenta)?.localidad;
    const localidadNorm = normalizeLocalidad(localidadRaw, normRegistry);
    if (!localidadNorm.canonical || localidadNorm.confidence < MIN_NORM_CONFIDENCE) {
      collector.excludeRow(
        "ventas",
        rowIndex,
        ["localidad"],
        `Localidad de venta no confiable: "${localidadRaw ?? ""}"`,
      );
      normRegistry.incrementExclusions();
      return;
    }

    const tipoComprobante =
      normalizeTipoComprobante(pickRowValue(row, VENTAS_COLUMNS.tipoComprobante)) ??
      "factura";

    let venta: Venta = {
      id: `venta-${numeroCuenta}-${fecha}-${numeroComprobante}`,
      numeroCuenta,
      fecha,
      tipoComprobante,
      numeroComprobante,
      importeTotal: 0,
      vendedor: normalizeText(pickRowValue(row, VENTAS_COLUMNS.vendedor)),
    };

    if (ventaIds.has(venta.id)) {
      venta = { ...venta, id: `${venta.id}-dup-${ventaIds.size}` };
    }
    ventaIds.add(venta.id);

    ventas.push(venta);

    const codigoUnico = normalizeCodigoUnico(
      pickRowValue(row, VENTAS_COLUMNS.codigoUnico),
    );
    if (!codigoUnico) return;

    const cantidad = normalizeInteger(pickRowValue(row, VENTAS_COLUMNS.cantidad)) ?? 1;

    if (!articuloCodigos.has(codigoUnico)) {
      ventaItemsSinArticulo += 1;
    }

    ventaItems.push({
      id: `venta-item-${venta.id}-${itemIndex}`,
      ventaId: venta.id,
      codigoUnico,
      descripcion:
        normalizeText(pickRowValue(row, VENTAS_COLUMNS.descripcion)) ?? codigoUnico,
      cantidad,
      precioUnitario: 0,
      importe: 0,
    });
    itemIndex += 1;
  });

  return {
    ventas,
    ventaItems,
    ventasSinCliente,
    ventaItemsSinArticulo,
  };
}

export type ProcessArticulosQualityResult = {
  articulos: Articulo[];
  aplicaciones: ArticuloAplicacion[];
  marcas: VehiculoMarca[];
  modelos: VehiculoModelo[];
};

export function processArticulosWithQuality(
  rows: Record<string, unknown>[],
  collector: DataQualityCollector,
  normRegistry: NormalizationRegistry,
): ProcessArticulosQualityResult {
  const articulosMap = new Map<string, Articulo>();
  const aplicaciones: ArticuloAplicacion[] = [];
  const marcasMap = new Map<string, VehiculoMarca>();
  const modelosMap = new Map<string, VehiculoModelo>();
  const aplicacionIndexPorCodigo = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    if (isRowCompletelyEmpty(row)) {
      collector.excludeRow("articulos", rowIndex, [], "Fila completamente vacía");
      normRegistry.incrementExclusions();
      return;
    }

    const codigoUnico = normalizeCodigoUnico(
      pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico),
    );

    if (!codigoUnico) {
      collector.addCritical("articulos", rowIndex, "codigoUnico", "Falta código único");
      collector.excludeRow("articulos", rowIndex, ["codigoUnico"], "Falta código único");
      normRegistry.incrementExclusions();
      return;
    }

    if (!articulosMap.has(codigoUnico)) {
      let descripcion = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.descripcion));
      if (!descripcion) {
        descripcion = SIN_DESCRIPCION_ARTICULO;
        collector.addFallback({
          dataset: "articulos",
          rowIndex,
          campo: "descripcion",
          valorOriginal: null,
          valorFinal: descripcion,
          motivo: "Falta descripción del artículo",
        });
      }

      let rubro = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.rubro));
      if (!rubro) {
        rubro = SIN_CATEGORIA;
        collector.addFallback({
          dataset: "articulos",
          rowIndex,
          campo: "rubro",
          valorOriginal: null,
          valorFinal: rubro,
          motivo: "Falta familia/rubro",
        });
      }

      let categoria = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.categoria));
      if (!categoria) {
        categoria = SIN_CATEGORIA;
        collector.addFallback({
          dataset: "articulos",
          rowIndex,
          campo: "categoria",
          valorOriginal: null,
          valorFinal: categoria,
          motivo: "Falta grupo/categoría",
        });
      }

      const subgrupo = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.subgrupo));
      if (!subgrupo) {
        collector.addFallback({
          dataset: "articulos",
          rowIndex,
          campo: "subgrupo",
          valorOriginal: null,
          valorFinal: SIN_CATEGORIA,
          motivo: "Falta subgrupo",
        });
      }

      const activo = normalizeBoolean(pickRowValue(row, ARTICULOS_COLUMNS.activo));

      articulosMap.set(codigoUnico, {
        codigoUnico,
        descripcion,
        rubro,
        categoria,
        marcaArticulo: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.marcaArticulo)),
        stock: normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.stock)),
        unidadMedida: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.unidadMedida)),
        activo: activo ?? true,
      });
    }

    const marcaRaw = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.marcaVehiculo));
    const marcaNorm = normalizeMarca(marcaRaw, normRegistry);
    if (!marcaNorm.canonical || marcaNorm.confidence < MIN_NORM_CONFIDENCE) {
      collector.excludeRow(
        "articulos",
        rowIndex,
        ["marcaVehiculo"],
        marcaRaw
          ? `Marca ambigua o basura: "${marcaRaw}"`
          : "Marca de vehículo ausente",
      );
      normRegistry.incrementExclusions();
      return;
    }

    const modeloRaw = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.modeloVehiculo));
    const modeloNorm = normalizeModelo(modeloRaw, marcaNorm.canonical, normRegistry);
    if (!modeloNorm.canonical || modeloNorm.confidence < MIN_NORM_CONFIDENCE) {
      collector.excludeRow(
        "articulos",
        rowIndex,
        ["modeloVehiculo"],
        modeloRaw
          ? `Modelo ambiguo o basura: "${modeloRaw}"`
          : "Modelo de vehículo ausente",
      );
      normRegistry.incrementExclusions();
      return;
    }

    if (marcaNorm.method !== "dictionary" && marcaNorm.method !== "alias") {
      collector.addFallback({
        dataset: "articulos",
        rowIndex,
        campo: "marcaVehiculo",
        valorOriginal: marcaRaw ?? null,
        valorFinal: marcaNorm.canonical,
        motivo: `Marca unificada (${marcaNorm.method})`,
      });
    }

    if (modeloNorm.method !== "dictionary" && modeloNorm.method !== "alias") {
      collector.addFallback({
        dataset: "articulos",
        rowIndex,
        campo: "modeloVehiculo",
        valorOriginal: modeloRaw ?? null,
        valorFinal: modeloNorm.canonical,
        motivo: `Modelo unificado (${modeloNorm.method})`,
      });
    }

    const marcaNombre = marcaNorm.canonical;
    const modeloNombre = modeloNorm.canonical;

    const marcaId = slugId("marca", marcaNombre);
    const modeloId = slugId("modelo", `${marcaNombre}-${modeloNombre}`);

    if (!marcasMap.has(marcaId)) {
      marcasMap.set(marcaId, { id: marcaId, nombre: marcaNombre });
    }
    if (!modelosMap.has(modeloId)) {
      modelosMap.set(modeloId, { id: modeloId, marcaId, nombre: modeloNombre });
    }

    const anioDesde = normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.anioDesde));
    const anioHasta = normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.anioHasta));
    const index = aplicacionIndexPorCodigo.get(codigoUnico) ?? 0;
    aplicacionIndexPorCodigo.set(codigoUnico, index + 1);

    aplicaciones.push({
      codigoAplicacion: buildCodigoAplicacion(codigoUnico, index),
      codigoUnico,
      marcaId,
      modeloId,
      anioDesde: anioDesde ?? 0,
      anioHasta: anioHasta ?? anioDesde ?? 0,
      observaciones: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.observaciones)),
    });
  });

  return {
    articulos: [...articulosMap.values()],
    aplicaciones,
    marcas: [...marcasMap.values()],
    modelos: [...modelosMap.values()],
  };
}

export function attachRowPreviewsToReport(
  report: DataQualityReport,
  rowsByDataset: {
    clientes: Record<string, unknown>[];
    ventas: Record<string, unknown>[];
    articulos: Record<string, unknown>[];
  },
): DataQualityReport {
  const getRows = (dataset: DataQualityDataset) => rowsByDataset[dataset];

  const enrich = (example: ProblematicRowExample): ProblematicRowExample => {
    const row = getRows(example.dataset)[example.rowIndex];
    return {
      ...example,
      preview: row ? rowPreview(row) : example.preview,
    };
  };

  return {
    ...report,
    ejemploFilasProblematicas: report.ejemploFilasProblematicas.map(enrich),
  };
}
