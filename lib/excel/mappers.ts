import { buildCodigoAplicacion } from "@/lib/excel/application-code";
import {
  ARTICULOS_COLUMNS,
  CLIENTES_COLUMNS,
  type ColumnAliases,
  normalizeColumnName,
  sanitizeExcelHeader,
  VENTAS_COLUMNS,
} from "@/lib/excel/column-map";
import {
  isBlank,
  normalizeBoolean,
  normalizeClienteEstado,
  normalizeCodigoUnico,
  normalizeCurrency,
  normalizeDate,
  normalizeInteger,
  normalizePhone,
  normalizeText,
  normalizeTipoComprobante,
} from "@/lib/excel/normalizers";
import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import { resolveVentaFecha } from "@/lib/models/venta-fecha";
import type { Venta } from "@/lib/models/venta";

export class ExcelMapError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ExcelMapError";
  }
}

/** Busca el primer alias presente en la fila (matching normalizado de encabezados). */
export function pickRowValue(
  row: Record<string, unknown>,
  aliasList: ColumnAliases,
): unknown {
  const normalizedRow = new Map<string, unknown>();

  for (const [key, value] of Object.entries(row)) {
    normalizedRow.set(normalizeColumnName(key), value);
    normalizedRow.set(sanitizeExcelHeader(key).toLowerCase(), value);
  }

  for (const alias of aliasList) {
    const normalizedAlias = normalizeColumnName(alias);
    const exactAlias = sanitizeExcelHeader(alias).toLowerCase();
    const hit =
      normalizedRow.get(normalizedAlias) ?? normalizedRow.get(exactAlias);
    if (!isBlank(hit)) return hit;
  }

  return undefined;
}

function requireField<T>(
  value: T | undefined,
  field: string,
  context: string,
): T {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) {
    throw new ExcelMapError(`Falta campo obligatorio "${field}" en ${context}`, field);
  }
  return value;
}

function slugId(prefix: string, raw: string): string {
  const slug = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${prefix}-${slug || "sin-nombre"}`;
}

export function mapClienteRow(row: Record<string, unknown>): Cliente {
  const numeroCuenta = normalizeCodigoUnico(
    pickRowValue(row, CLIENTES_COLUMNS.numeroCuenta),
  );
  const razonSocial = normalizeText(pickRowValue(row, CLIENTES_COLUMNS.razonSocial));

  // TODO: confirmar columnas obligatorias del LISTADO DE CUENTAS real.
  const cuenta = requireField(numeroCuenta, "numeroCuenta", "LISTADO DE CUENTAS");
  const razon = requireField(razonSocial, "razonSocial", "LISTADO DE CUENTAS");

  const estadoNormalizado = normalizeClienteEstado(
    pickRowValue(row, CLIENTES_COLUMNS.estado),
  );

  return {
    numeroCuenta: cuenta,
    razonSocial: razon,
    nombreFantasia: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.nombreFantasia)),
    zona: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.zona)) ?? "",
    vendedor: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.vendedor)) ?? "",
    // TODO: definir regla de estado por defecto si el Excel no trae columna.
    estado: estadoNormalizado ?? "activo",
    cuit: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.cuit)),
    localidad: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.localidad)),
    provincia: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.provincia)),
    email: normalizeText(pickRowValue(row, CLIENTES_COLUMNS.email)),
    telefono: normalizePhone(pickRowValue(row, CLIENTES_COLUMNS.telefono)),
  };
}

export function mapVentaRow(row: Record<string, unknown>): Venta {
  const numeroCuenta = normalizeCodigoUnico(
    pickRowValue(row, VENTAS_COLUMNS.numeroCuenta),
  );
  const fecha = normalizeDate(pickRowValue(row, VENTAS_COLUMNS.fecha));
  const numeroComprobante = normalizeText(
    pickRowValue(row, VENTAS_COLUMNS.numeroComprobante),
  );
  const importeTotal = normalizeCurrency(
    pickRowValue(row, VENTAS_COLUMNS.importeTotal),
  );

  const cuenta = requireField(numeroCuenta, "numeroCuenta", "Diario de Ventas");
  const fechaIso = resolveVentaFecha(fecha);
  const comprobante = requireField(
    numeroComprobante,
    "numeroComprobante",
    "Diario de Ventas",
  );
  const total = importeTotal ?? 0;

  const tipoComprobante =
    normalizeTipoComprobante(pickRowValue(row, VENTAS_COLUMNS.tipoComprobante)) ??
    "factura";

  const id = normalizeText(
    pickRowValue(row, ["id", "ID", "Id venta", "Id Venta"] as ColumnAliases),
  );

  return {
    id: id ?? `venta-${cuenta}-${fechaIso}-${comprobante}`,
    numeroCuenta: cuenta,
    fecha: fechaIso,
    tipoComprobante,
    numeroComprobante: comprobante,
    importeTotal: total,
    moneda: "ARS",
    vendedor: normalizeText(pickRowValue(row, VENTAS_COLUMNS.vendedor)),
  };
}

export type ArticuloAplicacionMapResult = {
  articulos: Articulo[];
  aplicaciones: ArticuloAplicacion[];
  marcas: VehiculoMarca[];
  modelos: VehiculoModelo[];
};

/**
 * Procesa filas del listado de artículos + aplicaciones.
 * Una fila de Excel = una aplicación; artículos se deduplican por `codigoUnico`.
 */
export function mapArticuloAplicacionRows(
  rows: Record<string, unknown>[],
): ArticuloAplicacionMapResult {
  const articulosMap = new Map<string, Articulo>();
  const aplicaciones: ArticuloAplicacion[] = [];
  const marcasMap = new Map<string, VehiculoMarca>();
  const modelosMap = new Map<string, VehiculoModelo>();
  const aplicacionIndexPorCodigo = new Map<string, number>();

  for (const row of rows) {
    const codigoUnico = normalizeCodigoUnico(
      pickRowValue(row, ARTICULOS_COLUMNS.codigoUnico),
    );
    if (!codigoUnico) {
      // Fila sin código: se omite en import real; el preview la reportará.
      continue;
    }

    if (!articulosMap.has(codigoUnico)) {
      const activo = normalizeBoolean(pickRowValue(row, ARTICULOS_COLUMNS.activo));

      articulosMap.set(codigoUnico, {
        codigoUnico,
        descripcion:
          normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.descripcion)) ??
          codigoUnico,
        rubro: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.rubro)),
        categoria: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.categoria)),
        marcaArticulo: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.marcaArticulo)),
        stock: normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.stock)),
        precioLista: normalizeCurrency(pickRowValue(row, ARTICULOS_COLUMNS.precioLista)),
        unidadMedida: normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.unidadMedida)),
        activo: activo ?? true,
      });
    }

    const marcaNombre = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.marcaVehiculo));
    const modeloNombre = normalizeText(pickRowValue(row, ARTICULOS_COLUMNS.modeloVehiculo));
    const anioDesde = normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.anioDesde));
    const anioHasta = normalizeInteger(pickRowValue(row, ARTICULOS_COLUMNS.anioHasta));

    // TODO: confirmar si todas las filas traen marca/modelo/años o solo las de aplicación.
    if (!marcaNombre || !modeloNombre) continue;

    const marcaId = slugId("marca", marcaNombre);
    const modeloId = slugId("modelo", `${marcaNombre}-${modeloNombre}`);

    if (!marcasMap.has(marcaId)) {
      marcasMap.set(marcaId, { id: marcaId, nombre: marcaNombre });
    }

    if (!modelosMap.has(modeloId)) {
      modelosMap.set(modeloId, { id: modeloId, marcaId, nombre: modeloNombre });
    }

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
  }

  return {
    articulos: [...articulosMap.values()],
    aplicaciones,
    marcas: [...marcasMap.values()],
    modelos: [...modelosMap.values()],
  };
}

/** Variante segura que no lanza: útil para vista previa fila a fila. */
export function tryMapClienteRow(
  row: Record<string, unknown>,
): { data?: Cliente; error?: string } {
  try {
    return { data: mapClienteRow(row) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Error al mapear cliente",
    };
  }
}

export function tryMapVentaRow(
  row: Record<string, unknown>,
): { data?: Venta; error?: string } {
  try {
    return { data: mapVentaRow(row) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Error al mapear venta",
    };
  }
}
