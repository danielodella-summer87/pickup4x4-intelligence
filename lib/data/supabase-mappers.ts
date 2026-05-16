import type { PickupDataset } from "@/lib/excel/build-dataset";
import type { Articulo, ArticuloAplicacion, ApplicationValidationStatus } from "@/lib/models/articulo";
import type { Cliente, ClienteEstado } from "@/lib/models/cliente";
import type {
  OportunidadDetectada,
  OportunidadFuenteDatos,
} from "@/lib/models/oportunidad";
import type { SolicitudLocal, SolicitudLocalEstado } from "@/lib/models/solicitud";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import type { Venta, VentaItem, VentaTipoComprobante } from "@/lib/models/venta";
import type {
  DbAplicacion,
  DbArticulo,
  DbCliente,
  DbImportacionObservaciones,
  DbOportunidad,
  DbSolicitud,
  DbVenta,
} from "@/lib/supabase/types";

export function createDbId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function slugId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// ——— App → DB ———

export function clienteToDbRow(cliente: Cliente): DbCliente {
  return {
    id: createDbId(),
    numero_cuenta: cliente.numeroCuenta,
    nombre:
      cliente.razonSocial?.trim() ||
      cliente.nombreFantasia?.trim() ||
      cliente.numeroCuenta,
    telefono: cliente.telefono ?? null,
    celular: null,
    email: cliente.email ?? null,
    localidad: cliente.localidad ?? null,
    sector: [cliente.zona, cliente.vendedor].filter(Boolean).join(" · ") || null,
  };
}

export function ventasFlatToDbRows(
  dataset: PickupDataset,
  clienteNombreByCuenta: Map<string, string>,
): DbVenta[] {
  const ventaById = new Map(dataset.ventas.map((v) => [v.id, v]));
  const rows: DbVenta[] = [];

  for (const item of dataset.ventaItems) {
    const venta = ventaById.get(item.ventaId);
    if (!venta) continue;

    const cuenta = venta.numeroCuenta;
    rows.push({
      id: item.id,
      cliente_numero_cuenta: cuenta,
      cliente_nombre: clienteNombreByCuenta.get(cuenta) ?? cuenta,
      comprobante: venta.numeroComprobante,
      fecha: venta.fecha,
      codigo_unico: item.codigoUnico,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      localidad: clienteNombreByCuenta.get(`loc:${cuenta}`) ?? null,
    });
  }

  return rows;
}

export function buildClienteNombreMap(clientes: Cliente[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of clientes) {
    map.set(
      c.numeroCuenta,
      c.razonSocial?.trim() || c.nombreFantasia?.trim() || c.numeroCuenta,
    );
    if (c.localidad) {
      map.set(`loc:${c.numeroCuenta}`, c.localidad);
    }
  }
  return map;
}

export function articuloToDbRow(articulo: Articulo): DbArticulo {
  return {
    id: createDbId(),
    codigo_unico: articulo.codigoUnico,
    descripcion: articulo.descripcion,
    familia: null,
    grupo: null,
    subgrupo: null,
    marca: articulo.marcaArticulo ?? null,
    modelo: null,
    categoria: articulo.categoria ?? null,
    rubro: articulo.rubro ?? null,
    confidence: null,
    validation_status: null,
    requires_review: null,
    review_reason: null,
  };
}

export function aplicacionToDbRow(
  ap: ArticuloAplicacion,
  marcaNombreById: Map<string, string>,
  modeloNombreById: Map<string, string>,
): DbAplicacion {
  return {
    id: ap.codigoAplicacion || createDbId(),
    codigo_unico: ap.codigoUnico,
    marca: marcaNombreById.get(ap.marcaId) ?? ap.marcaLegible ?? ap.marcaId,
    modelo: modeloNombreById.get(ap.modeloId) ?? ap.modeloLegible ?? ap.modeloId,
    marca_legible: ap.marcaLegible ?? null,
    modelo_legible: ap.modeloLegible ?? null,
    confidence: ap.confidence ?? null,
    validation_status: ap.validationStatus ?? null,
    requires_review: ap.requiresReview ?? null,
    review_reason: ap.reviewReason ?? null,
  };
}

export function buildImportacionObservaciones(
  dataset: PickupDataset,
  generatedAt: Date,
): DbImportacionObservaciones {
  return {
    generatedAt: generatedAt.toISOString(),
    stats: dataset.stats as unknown as Record<string, unknown>,
    warnings: dataset.warnings,
    dataQuality: dataset.dataQuality as unknown as Record<string, unknown>,
    smartNormalization: dataset.smartNormalization as unknown as Record<string, unknown>,
    applicationAudit: dataset.applicationAudit as unknown as Record<string, unknown>,
    marcas: dataset.marcas,
    modelos: dataset.modelos,
  };
}

export function solicitudLocalToDbRow(solicitud: SolicitudLocal): DbSolicitud {
  return {
    id: solicitud.id,
    cliente_nombre: solicitud.nombre,
    telefono: solicitud.telefono,
    marca: solicitud.marcaVehiculo,
    modelo: solicitud.modeloVehiculo,
    estado: solicitud.estado,
    observaciones: solicitud.observaciones,
    articulos: solicitud.articulos,
  };
}

export function oportunidadDetectadaToDbRow(op: OportunidadDetectada): DbOportunidad {
  return {
    id: op.id,
    tipo: op.tipo,
    prioridad: op.prioridad,
    titulo: op.titulo,
    descripcion: op.descripcion,
    recomendacion: op.recomendacion,
    confianza: op.confianza,
    metadata: {
      metricaPrincipal: op.metricaPrincipal,
      metricaValor: op.metricaValor,
      entidad: op.entidad,
      fuenteDatos: op.fuenteDatos,
    },
  };
}

// ——— DB → App ———

const ESTADOS_CLIENTE: ClienteEstado[] = [
  "activo",
  "inactivo",
  "dormido",
  "en_seguimiento",
];

function parseClienteEstado(sector: string | null): ClienteEstado {
  const lower = (sector ?? "").toLowerCase();
  for (const e of ESTADOS_CLIENTE) {
    if (lower.includes(e.replace("_", " ")) || lower.includes(e)) return e;
  }
  return "activo";
}

export function dbRowToCliente(row: DbCliente): Cliente {
  const sector = row.sector ?? "";
  const [zona, ...rest] = sector.split(" · ");
  return {
    numeroCuenta: row.numero_cuenta ?? row.id,
    razonSocial: row.nombre,
    nombreFantasia: undefined,
    zona: zona || "",
    vendedor: rest.join(" · ") || "",
    estado: parseClienteEstado(row.sector),
    localidad: row.localidad ?? undefined,
    email: row.email ?? undefined,
    telefono: row.telefono ?? row.celular ?? undefined,
  };
}

export function dbVentasToVentaItems(rows: DbVenta[]): {
  ventas: Venta[];
  ventaItems: VentaItem[];
} {
  const ventasMap = new Map<string, Venta>();
  const ventaItems: VentaItem[] = [];

  for (const row of rows) {
    const cuenta = row.cliente_numero_cuenta ?? "sin-cuenta";
    const comprobante = row.comprobante ?? "";
    const fecha = row.fecha ?? "";
    const groupKey = `${cuenta}|${fecha}|${comprobante}`;
    let venta = ventasMap.get(groupKey);

    if (!venta) {
      venta = {
        id: `venta-${slugId(groupKey)}`,
        numeroCuenta: cuenta,
        fecha,
        tipoComprobante: inferTipoComprobante(comprobante),
        numeroComprobante: comprobante,
        importeTotal: 0,
        vendedor: undefined,
      };
      ventasMap.set(groupKey, venta);
    }

    ventaItems.push({
      id: row.id,
      ventaId: venta.id,
      codigoUnico: row.codigo_unico ?? "",
      descripcion: row.descripcion ?? "",
      cantidad: row.cantidad ?? 0,
      precioUnitario: 0,
      importe: 0,
    });
  }

  return { ventas: [...ventasMap.values()], ventaItems };
}

function inferTipoComprobante(comprobante: string): VentaTipoComprobante {
  const c = comprobante.toLowerCase();
  if (c.includes("nc") || c.includes("credito")) return "nota_credito";
  if (c.includes("rem")) return "remito";
  if (c.includes("fa") || c.includes("fact")) return "factura";
  return "otro";
}

export function dbRowToArticulo(row: DbArticulo): Articulo {
  return {
    codigoUnico: row.codigo_unico,
    descripcion: row.descripcion,
    rubro: row.rubro ?? undefined,
    categoria: row.categoria ?? undefined,
    marcaArticulo: row.marca ?? undefined,
    activo: true,
  };
}

export function dbRowsToMarcasModelos(
  aplicacionRows: DbAplicacion[],
  observaciones: DbImportacionObservaciones | null,
): { marcas: VehiculoMarca[]; modelos: VehiculoModelo[] } {
  if (observaciones?.marcas?.length && observaciones?.modelos?.length) {
    return {
      marcas: observaciones.marcas,
      modelos: observaciones.modelos,
    };
  }

  const marcasMap = new Map<string, VehiculoMarca>();
  const modelosMap = new Map<string, VehiculoModelo>();

  for (const row of aplicacionRows) {
    const marcaNombre = (row.marca ?? row.marca_legible ?? "").trim();
    const modeloNombre = (row.modelo ?? row.modelo_legible ?? "").trim();
    if (!marcaNombre) continue;

    const marcaId = slugId(marcaNombre);
    if (!marcasMap.has(marcaId)) {
      marcasMap.set(marcaId, { id: marcaId, nombre: marcaNombre });
    }

    if (!modeloNombre) continue;
    const modeloId = `${marcaId}-${slugId(modeloNombre)}`;
    if (!modelosMap.has(modeloId)) {
      modelosMap.set(modeloId, {
        id: modeloId,
        marcaId,
        nombre: modeloNombre,
      });
    }
  }

  return { marcas: [...marcasMap.values()], modelos: [...modelosMap.values()] };
}

export function dbRowToAplicacion(
  row: DbAplicacion,
  marcas: VehiculoMarca[],
  modelos: VehiculoModelo[],
): ArticuloAplicacion {
  const marcaNombre = (row.marca ?? row.marca_legible ?? "").trim();
  const modeloNombre = (row.modelo ?? row.modelo_legible ?? "").trim();
  const marcaId =
    marcas.find((m) => m.nombre === marcaNombre)?.id ?? slugId(marcaNombre || "marca");
  const modeloId =
    modelos.find((m) => m.nombre === modeloNombre && m.marcaId === marcaId)?.id ??
    `${marcaId}-${slugId(modeloNombre || "modelo")}`;

  return {
    codigoAplicacion: row.id,
    codigoUnico: row.codigo_unico,
    marcaId,
    modeloId,
    anioDesde: 0,
    anioHasta: 9999,
    confidence: row.confidence ?? undefined,
    validationStatus: (row.validation_status as ApplicationValidationStatus) ?? undefined,
    requiresReview: row.requires_review ?? undefined,
    reviewReason: row.review_reason ?? undefined,
    marcaLegible: row.marca_legible ?? undefined,
    modeloLegible: row.modelo_legible ?? undefined,
  };
}

export function dbRowToSolicitudLocal(row: DbSolicitud): SolicitudLocal {
  const articulos = Array.isArray(row.articulos)
    ? (row.articulos as SolicitudLocal["articulos"])
    : [];

  const estado = row.estado as SolicitudLocalEstado;

  return {
    id: row.id,
    fecha: row.created_at ?? new Date().toISOString(),
    nombre: row.cliente_nombre,
    telefono: row.telefono ?? "",
    observaciones: row.observaciones ?? "",
    marcaVehiculo: row.marca ?? "",
    modeloVehiculo: row.modelo ?? "",
    articulos,
    origen: "mostrador",
    estado:
      estado === "nueva" ||
      estado === "en_revision" ||
      estado === "enviada" ||
      estado === "descartada"
        ? estado
        : "nueva",
  };
}

export function dbRowToOportunidadDetectada(row: DbOportunidad): OportunidadDetectada {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    tipo: row.tipo as OportunidadDetectada["tipo"],
    prioridad: row.prioridad as OportunidadDetectada["prioridad"],
    titulo: row.titulo,
    descripcion: row.descripcion,
    recomendacion: row.recomendacion,
    confianza: row.confianza ?? 0,
    metricaPrincipal: String(meta.metricaPrincipal ?? ""),
    metricaValor: Number(meta.metricaValor ?? 0),
    entidad: meta.entidad as OportunidadDetectada["entidad"],
    fuenteDatos: (meta.fuenteDatos as OportunidadFuenteDatos) ?? "excel",
  };
}
