import {
  mockPickupDataToActive,
  type ActivePickupData,
} from "@/lib/data/pickup-data";
import type { DatasetWarning } from "@/lib/excel/build-dataset";
import type { DataQualityReport } from "@/lib/excel/data-quality";
import type { SmartNormalizationReport } from "@/lib/excel/normalization";
import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente, ClienteEstado } from "@/lib/models/cliente";
import type { OportunidadComercial, OportunidadPrioridad } from "@/lib/models/oportunidad";
import type { SolicitudPresupuesto } from "@/lib/models/solicitud";
import type { Venta, VentaItem } from "@/lib/models/venta";

type PickupData = ActivePickupData;

const defaultPickupData = mockPickupDataToActive();

const STOCK_BAJO_UMBRAL = 10;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatClienteEstado(estado: ClienteEstado): string {
  const labels: Record<ClienteEstado, string> = {
    activo: "Activo",
    inactivo: "Inactivo",
    dormido: "Dormido",
    en_seguimiento: "En seguimiento",
  };
  return labels[estado];
}

export function formatClienteTipo(cliente: Cliente): string {
  if (cliente.estado === "dormido") return "Dormida";
  if (cliente.estado === "en_seguimiento") return "Seguimiento";
  if (cliente.zona === "Norte" || cliente.zona === "Sur") return "Distribuidor";
  return "Mayorista";
}

export function formatPrioridad(prioridad: OportunidadPrioridad): string {
  const labels: Record<OportunidadPrioridad, string> = {
    alta: "Alta",
    media: "Media",
    baja: "Baja",
  };
  return labels[prioridad];
}

export function formatOportunidadTipo(tipo: OportunidadComercial["tipo"]): string {
  const labels: Record<OportunidadComercial["tipo"], string> = {
    cliente_dormido: "Cliente dormido",
    venta_cruzada: "Venta cruzada",
    producto_impulsar: "Producto a impulsar",
    recupero_cartera: "Recupero de cartera",
  };
  return labels[tipo];
}

export function formatSolicitudEstado(estado: SolicitudPresupuesto["estado"]): string {
  const labels: Record<SolicitudPresupuesto["estado"], string> = {
    pendiente: "Pendiente",
    enviado: "Enviado",
    cerrado: "Cerrado",
    cancelado: "Cancelado",
  };
  return labels[estado];
}

export function formatCondicionVenta(tipoComprobante: Venta["tipoComprobante"]): string {
  const labels: Record<Venta["tipoComprobante"], string> = {
    factura: "Factura",
    remito: "Remito",
    nota_credito: "Nota de crédito",
    otro: "Otro",
  };
  return labels[tipoComprobante];
}

function buildClienteMap(data: PickupData = defaultPickupData) {
  return new Map(data.clientes.map((cliente) => [cliente.numeroCuenta, cliente]));
}

function buildArticuloMap(data: PickupData = defaultPickupData) {
  return new Map(data.articulos.map((articulo) => [articulo.codigoUnico, articulo]));
}

export function getClienteByNumeroCuenta(
  numeroCuenta: string,
  data: PickupData = defaultPickupData,
): Cliente | undefined {
  return buildClienteMap(data).get(numeroCuenta);
}

export function calcularTotalVentas(data: PickupData = defaultPickupData): number {
  return data.ventas.reduce((total, venta) => total + venta.importeTotal, 0);
}

export function calcularCantidadClientes(data: PickupData = defaultPickupData): number {
  return data.clientes.length;
}

export function calcularCantidadArticulos(data: PickupData = defaultPickupData): number {
  return data.articulos.filter((articulo) => articulo.activo).length;
}

export function calcularSolicitudesAbiertas(data: PickupData = defaultPickupData): number {
  return data.solicitudes.filter(
    (solicitud) => solicitud.estado === "pendiente" || solicitud.estado === "enviado",
  ).length;
}

export function calcularClientesActivos(data: PickupData = defaultPickupData): number {
  return data.clientes.filter((cliente) => cliente.estado === "activo").length;
}

export function calcularArticulosConStock(data: PickupData = defaultPickupData): number {
  return getArticulosConStock(data).length;
}

export function calcularArticulosBajoStock(data: PickupData = defaultPickupData): number {
  return data.articulos.filter(
    (articulo) => articulo.activo && (articulo.stock ?? 0) > 0 && (articulo.stock ?? 0) < STOCK_BAJO_UMBRAL,
  ).length;
}

export function calcularOportunidadesPrioritarias(data: PickupData = defaultPickupData): number {
  return data.oportunidades.filter((oportunidad) => oportunidad.prioridad === "alta").length;
}

export type TopClienteVentas = {
  numeroCuenta: string;
  razonSocial: string;
  zona: string;
  totalVentas: number;
};

export function getTopClientesPorVentas(
  limit = 5,
  data: PickupData = defaultPickupData,
): TopClienteVentas[] {
  const clienteMap = buildClienteMap(data);
  const totales = new Map<string, number>();

  for (const venta of data.ventas) {
    totales.set(venta.numeroCuenta, (totales.get(venta.numeroCuenta) ?? 0) + venta.importeTotal);
  }

  return [...totales.entries()]
    .map(([numeroCuenta, totalVentas]) => {
      const cliente = clienteMap.get(numeroCuenta);
      return {
        numeroCuenta,
        razonSocial: cliente?.razonSocial ?? numeroCuenta,
        zona: cliente?.zona ?? "—",
        totalVentas,
      };
    })
    .sort((a, b) => b.totalVentas - a.totalVentas)
    .slice(0, limit);
}

export type TopArticuloCantidad = {
  codigoUnico: string;
  descripcion: string;
  cantidadVendida: number;
};

export function getTopArticulosPorCantidad(
  limit = 5,
  data: PickupData = defaultPickupData,
): TopArticuloCantidad[] {
  const articuloMap = buildArticuloMap(data);
  const totales = new Map<string, number>();

  for (const item of data.ventaItems) {
    totales.set(item.codigoUnico, (totales.get(item.codigoUnico) ?? 0) + item.cantidad);
  }

  return [...totales.entries()]
    .map(([codigoUnico, cantidadVendida]) => {
      const articulo = articuloMap.get(codigoUnico);
      return {
        codigoUnico,
        descripcion: articulo?.descripcion ?? codigoUnico,
        cantidadVendida,
      };
    })
    .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
    .slice(0, limit);
}

export type VentasPorLocalidad = {
  localidad: string;
  totalVentas: number;
  cantidadComprobantes: number;
};

export function getVentasPorLocalidad(
  data: PickupData = defaultPickupData,
): VentasPorLocalidad[] {
  const clienteMap = buildClienteMap(data);
  const agrupado = new Map<string, { totalVentas: number; cantidadComprobantes: number }>();

  for (const venta of data.ventas) {
    const cliente = clienteMap.get(venta.numeroCuenta);
    const localidad = cliente?.localidad ?? "Sin localidad";
    const actual = agrupado.get(localidad) ?? { totalVentas: 0, cantidadComprobantes: 0 };
    agrupado.set(localidad, {
      totalVentas: actual.totalVentas + venta.importeTotal,
      cantidadComprobantes: actual.cantidadComprobantes + 1,
    });
  }

  return [...agrupado.entries()]
    .map(([localidad, valores]) => ({ localidad, ...valores }))
    .sort((a, b) => b.totalVentas - a.totalVentas);
}

export function getClientesDormidosOBajaActividad(
  data: PickupData = defaultPickupData,
): Cliente[] {
  const cuentasConVentas = new Set(data.ventas.map((venta) => venta.numeroCuenta));

  return data.clientes.filter(
    (cliente) =>
      cliente.estado === "dormido" ||
      cliente.estado === "en_seguimiento" ||
      !cuentasConVentas.has(cliente.numeroCuenta),
  );
}

export function getArticulosConStock(data: PickupData = defaultPickupData): Articulo[] {
  return data.articulos.filter(
    (articulo) => articulo.activo && (articulo.stock ?? 0) > 0,
  );
}

export function getOportunidadesPorPrioridad(
  data: PickupData = defaultPickupData,
): Record<OportunidadPrioridad, OportunidadComercial[]> {
  const orden: OportunidadPrioridad[] = ["alta", "media", "baja"];
  const agrupado: Record<OportunidadPrioridad, OportunidadComercial[]> = {
    alta: [],
    media: [],
    baja: [],
  };

  for (const oportunidad of data.oportunidades) {
    agrupado[oportunidad.prioridad].push(oportunidad);
  }

  for (const prioridad of orden) {
    agrupado[prioridad].sort(
      (a, b) => b.fechaDeteccion.localeCompare(a.fechaDeteccion),
    );
  }

  return agrupado;
}

export function getOportunidadesDestacadas(
  limit = 3,
  data: PickupData = defaultPickupData,
): OportunidadComercial[] {
  const porPrioridad = getOportunidadesPorPrioridad(data);
  return [...porPrioridad.alta, ...porPrioridad.media, ...porPrioridad.baja].slice(
    0,
    limit,
  );
}

export function contarAplicacionesPorCodigo(
  codigoUnico: string,
  data: PickupData = defaultPickupData,
): number {
  return data.articuloAplicaciones.filter((ap) => ap.codigoUnico === codigoUnico).length;
}

export type ArticuloConAplicaciones = Articulo & {
  cantidadAplicaciones: number;
};

export function getArticulosConConteoAplicaciones(
  data: PickupData = defaultPickupData,
): ArticuloConAplicaciones[] {
  return data.articulos.map((articulo) => ({
    ...articulo,
    cantidadAplicaciones: contarAplicacionesPorCodigo(articulo.codigoUnico, data),
  }));
}

export type VentaEnriquecida = Venta & {
  clienteNombre: string;
  localidad: string;
  condicion: string;
};

export function getVentasEnriquecidas(
  data: PickupData = defaultPickupData,
): VentaEnriquecida[] {
  const clienteMap = buildClienteMap(data);

  return [...data.ventas]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((venta) => {
      const cliente = clienteMap.get(venta.numeroCuenta);
      return {
        ...venta,
        clienteNombre: cliente?.razonSocial ?? venta.numeroCuenta,
        localidad: cliente?.localidad ?? "—",
        condicion: formatCondicionVenta(venta.tipoComprobante),
      };
    });
}

export function calcularTicketPromedio(data: PickupData = defaultPickupData): number {
  if (data.ventas.length === 0) return 0;
  return calcularTotalVentas(data) / data.ventas.length;
}

export function calcularUnidadesVendidas(data: PickupData = defaultPickupData): number {
  return data.ventaItems.reduce((total, item) => total + item.cantidad, 0);
}

export function resolverVehiculoPorAplicacion(
  codigoAplicacion: string | undefined,
  data: PickupData = defaultPickupData,
): string {
  if (!codigoAplicacion) return "—";

  const aplicacion = data.articuloAplicaciones.find(
    (ap) => ap.codigoAplicacion === codigoAplicacion,
  );
  if (!aplicacion) return "—";

  const marca = data.vehiculoMarcas.find((m) => m.id === aplicacion.marcaId);
  const modelo = data.vehiculoModelos.find((m) => m.id === aplicacion.modeloId);
  if (!marca || !modelo) return "—";

  return `${marca.nombre} ${modelo.nombre} (${aplicacion.anioDesde}-${aplicacion.anioHasta})`;
}

export function inferirOrigenSolicitud(
  solicitud: SolicitudPresupuesto,
): string {
  if (solicitud.estado === "pendiente") return "Mostrador táctil";
  if (solicitud.estado === "enviado") return "Comercial";
  if (solicitud.estado === "cerrado") return "Cierre comercial";
  return "Otro";
}

export type SolicitudEnriquecida = SolicitudPresupuesto & {
  clienteNombre: string;
  origen: string;
  vehiculo: string;
  cantidadItems: number;
};

export function getSolicitudesEnriquecidas(
  data: PickupData = defaultPickupData,
): SolicitudEnriquecida[] {
  const clienteMap = buildClienteMap(data);

  return [...data.solicitudes]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((solicitud) => {
      const cliente = clienteMap.get(solicitud.numeroCuenta);
      const primerItem = solicitud.items[0];
      return {
        ...solicitud,
        clienteNombre: cliente?.razonSocial ?? solicitud.numeroCuenta,
        origen: inferirOrigenSolicitud(solicitud),
        vehiculo: resolverVehiculoPorAplicacion(primerItem?.codigoAplicacion, data),
        cantidadItems: solicitud.items.length,
      };
    });
}

export type OportunidadEnriquecida = OportunidadComercial & {
  clienteNombre: string;
  articuloLabel: string;
  impactoEstimado: string;
};

export function getImpactoEstimado(prioridad: OportunidadPrioridad): string {
  const labels: Record<OportunidadPrioridad, string> = {
    alta: "Alto",
    media: "Medio",
    baja: "Bajo",
  };
  return labels[prioridad];
}

export function getOportunidadesEnriquecidas(
  data: PickupData = defaultPickupData,
): OportunidadEnriquecida[] {
  const clienteMap = buildClienteMap(data);
  const articuloMap = buildArticuloMap(data);

  return [...data.oportunidades]
    .sort((a, b) => b.fechaDeteccion.localeCompare(a.fechaDeteccion))
    .map((oportunidad) => {
      const cliente = clienteMap.get(oportunidad.numeroCuenta);
      const articulo = oportunidad.codigoUnico
        ? articuloMap.get(oportunidad.codigoUnico)
        : undefined;

      const articuloLabel = articulo
        ? `${articulo.codigoUnico} · ${articulo.descripcion}`
        : "—";

      return {
        ...oportunidad,
        clienteNombre: cliente?.razonSocial ?? oportunidad.numeroCuenta,
        articuloLabel,
        impactoEstimado: getImpactoEstimado(oportunidad.prioridad),
      };
    });
}

export type ModeloConAplicaciones = {
  marcaId: string;
  marcaNombre: string;
  modeloId: string;
  modeloNombre: string;
  aplicaciones: ArticuloAplicacion[];
  articulos: { codigoUnico: string; descripcion: string; codigoAplicacion: string }[];
};

export function getModelosConAplicaciones(
  data: PickupData = defaultPickupData,
): ModeloConAplicaciones[] {
  const articuloMap = buildArticuloMap(data);
  const modeloIds = [...new Set(data.articuloAplicaciones.map((ap) => ap.modeloId))];

  return modeloIds.map((modeloId) => {
    const modelo = data.vehiculoModelos.find((m) => m.id === modeloId)!;
    const marca = data.vehiculoMarcas.find((m) => m.id === modelo.marcaId)!;
    const aplicaciones = data.articuloAplicaciones.filter((ap) => ap.modeloId === modeloId);

    const articulos = aplicaciones.map((ap) => {
      const articulo = articuloMap.get(ap.codigoUnico);
      return {
        codigoUnico: ap.codigoUnico,
        descripcion: articulo?.descripcion ?? ap.codigoUnico,
        codigoAplicacion: ap.codigoAplicacion,
      };
    });

    return {
      marcaId: marca.id,
      marcaNombre: marca.nombre,
      modeloId: modelo.id,
      modeloNombre: modelo.nombre,
      aplicaciones,
      articulos,
    };
  });
}

export function getResumenClientes(data: PickupData = defaultPickupData) {
  const dormidos = data.clientes.filter((c) => c.estado === "dormido").length;
  const activos = calcularClientesActivos(data);
  const total = calcularCantidadClientes(data);

  return { total, activos, dormidos };
}

// ——— Dashboard comercial v1 (conteos y frecuencia, sin importes) ———

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export function formatMesComercial(mesClave: string): string {
  const [year, month] = mesClave.split("-");
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return mesClave;
  return `${MESES_CORTOS[monthIndex]} ${year}`;
}

export type RankedCount = {
  nombre: string;
  cantidad: number;
  detalle?: string;
};

export type ClientesPorLocalidad = {
  localidad: string;
  cantidadClientes: number;
};

export type VentasPorMes = {
  mes: string;
  etiqueta: string;
  cantidadVentas: number;
};

export type TopClienteCompras = {
  numeroCuenta: string;
  razonSocial: string;
  localidad: string;
  cantidadCompras: number;
};

export type TopArticuloFrecuencia = {
  codigoUnico: string;
  descripcion: string;
  vecesEnVentas: number;
  unidadesTotales: number;
};

export type AplicacionPorMarcaModelo = {
  marca: string;
  modelo: string;
  cantidadAplicaciones: number;
};

export type ResumenCalidadDatos = {
  filasExcluidas: number;
  fallbacksAplicados: number;
  advertencias: number;
  erroresCriticos: number;
};

export type LecturaComercialRapida = {
  localidadMasClientes: RankedCount | null;
  modeloMasAplicaciones: RankedCount | null;
  clienteMasCompras: RankedCount | null;
  articuloMasFrecuente: RankedCount | null;
};

export type CommercialDashboardInsights = {
  kpis: {
    totalClientes: number;
    totalRegistrosVenta: number;
    totalArticulosUnicos: number;
    totalAplicaciones: number;
  };
  lecturaRapida: LecturaComercialRapida;
  clientesPorLocalidad: ClientesPorLocalidad[];
  demandaVehiculo: {
    topMarcas: RankedCount[];
    topModelos: RankedCount[];
    aplicacionesPorMarcaModelo: AplicacionPorMarcaModelo[];
  };
  actividadComercial: {
    ventasPorMes: VentasPorMes[];
    topClientesPorCompras: TopClienteCompras[];
    topArticulosPorFrecuencia: TopArticuloFrecuencia[];
  };
  calidadYOportunidades: {
    clientesSinVentas: number;
    ventasSinArticulo: number;
    articulosSinAplicaciones: number;
    alertasNormalizacion: string[];
    resumenCalidad: ResumenCalidadDatos | null;
  };
};

export type CommercialDashboardMeta = {
  dataQuality?: DataQualityReport;
  smartNormalization?: SmartNormalizationReport;
  warnings?: DatasetWarning[];
};

export function calcularTotalRegistrosVenta(
  data: PickupData = defaultPickupData,
): number {
  return data.ventas.length;
}

export function calcularTotalArticulosUnicos(
  data: PickupData = defaultPickupData,
): number {
  return data.articulos.length;
}

export function calcularTotalAplicaciones(
  data: PickupData = defaultPickupData,
): number {
  return data.articuloAplicaciones.length;
}

export function getClientesPorLocalidad(
  data: PickupData = defaultPickupData,
): ClientesPorLocalidad[] {
  const agrupado = new Map<string, number>();

  for (const cliente of data.clientes) {
    const localidad = cliente.localidad?.trim() || "Sin localidad";
    agrupado.set(localidad, (agrupado.get(localidad) ?? 0) + 1);
  }

  return [...agrupado.entries()]
    .map(([localidad, cantidadClientes]) => ({ localidad, cantidadClientes }))
    .sort((a, b) => b.cantidadClientes - a.cantidadClientes);
}

export function getVentasPorMes(
  data: PickupData = defaultPickupData,
): VentasPorMes[] {
  const agrupado = new Map<string, number>();

  for (const venta of data.ventas) {
    const mes = venta.fecha.slice(0, 7);
    if (!mes || mes.length < 7) continue;
    agrupado.set(mes, (agrupado.get(mes) ?? 0) + 1);
  }

  return [...agrupado.entries()]
    .map(([mes, cantidadVentas]) => ({
      mes,
      etiqueta: formatMesComercial(mes),
      cantidadVentas,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export function getTopClientesPorCompras(
  limit = 5,
  data: PickupData = defaultPickupData,
): TopClienteCompras[] {
  const clienteMap = buildClienteMap(data);
  const compras = new Map<string, number>();

  for (const venta of data.ventas) {
    compras.set(venta.numeroCuenta, (compras.get(venta.numeroCuenta) ?? 0) + 1);
  }

  return [...compras.entries()]
    .map(([numeroCuenta, cantidadCompras]) => {
      const cliente = clienteMap.get(numeroCuenta);
      return {
        numeroCuenta,
        razonSocial: cliente?.razonSocial ?? numeroCuenta,
        localidad: cliente?.localidad ?? "—",
        cantidadCompras,
      };
    })
    .sort((a, b) => b.cantidadCompras - a.cantidadCompras)
    .slice(0, limit);
}

export function getTopArticulosPorFrecuencia(
  limit = 5,
  data: PickupData = defaultPickupData,
): TopArticuloFrecuencia[] {
  const articuloMap = buildArticuloMap(data);
  const veces = new Map<string, number>();
  const unidades = new Map<string, number>();

  for (const item of data.ventaItems) {
    veces.set(item.codigoUnico, (veces.get(item.codigoUnico) ?? 0) + 1);
    unidades.set(
      item.codigoUnico,
      (unidades.get(item.codigoUnico) ?? 0) + item.cantidad,
    );
  }

  return [...veces.entries()]
    .map(([codigoUnico, vecesEnVentas]) => {
      const articulo = articuloMap.get(codigoUnico);
      return {
        codigoUnico,
        descripcion: articulo?.descripcion ?? codigoUnico,
        vecesEnVentas,
        unidadesTotales: unidades.get(codigoUnico) ?? 0,
      };
    })
    .sort((a, b) => b.vecesEnVentas - a.vecesEnVentas)
    .slice(0, limit);
}

function buildMarcaModeloMaps(data: PickupData) {
  const marcaMap = new Map(data.vehiculoMarcas.map((m) => [m.id, m.nombre]));
  const modeloMap = new Map(
    data.vehiculoModelos.map((m) => [
      m.id,
      { nombre: m.nombre, marcaId: m.marcaId },
    ]),
  );
  return { marcaMap, modeloMap };
}

export function getTopMarcasPorAplicaciones(
  limit = 5,
  data: PickupData = defaultPickupData,
): RankedCount[] {
  const { marcaMap, modeloMap } = buildMarcaModeloMaps(data);
  const totales = new Map<string, number>();

  for (const ap of data.articuloAplicaciones) {
    const modelo = modeloMap.get(ap.modeloId);
    const marcaNombre = modelo
      ? (marcaMap.get(modelo.marcaId) ?? "Sin marca")
      : "Sin marca";
    totales.set(marcaNombre, (totales.get(marcaNombre) ?? 0) + 1);
  }

  return [...totales.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limit);
}

export function getTopModelosPorAplicaciones(
  limit = 5,
  data: PickupData = defaultPickupData,
): RankedCount[] {
  const { marcaMap, modeloMap } = buildMarcaModeloMaps(data);
  const totales = new Map<string, number>();

  for (const ap of data.articuloAplicaciones) {
    const modelo = modeloMap.get(ap.modeloId);
    if (!modelo) continue;
    const marca = marcaMap.get(modelo.marcaId) ?? "";
    const nombre = marca ? `${marca} ${modelo.nombre}` : modelo.nombre;
    totales.set(nombre, (totales.get(nombre) ?? 0) + 1);
  }

  return [...totales.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limit);
}

export function getAplicacionesPorMarcaModelo(
  limit = 8,
  data: PickupData = defaultPickupData,
): AplicacionPorMarcaModelo[] {
  const { marcaMap, modeloMap } = buildMarcaModeloMaps(data);
  const totales = new Map<string, AplicacionPorMarcaModelo>();

  for (const ap of data.articuloAplicaciones) {
    const modelo = modeloMap.get(ap.modeloId);
    if (!modelo) continue;
    const marca = marcaMap.get(modelo.marcaId) ?? "Sin marca";
    const key = `${marca}::${modelo.nombre}`;
    const actual = totales.get(key) ?? {
      marca,
      modelo: modelo.nombre,
      cantidadAplicaciones: 0,
    };
    actual.cantidadAplicaciones += 1;
    totales.set(key, actual);
  }

  return [...totales.values()]
    .sort((a, b) => b.cantidadAplicaciones - a.cantidadAplicaciones)
    .slice(0, limit);
}

export function contarClientesSinVentas(
  data: PickupData = defaultPickupData,
): number {
  return getClientesSinVentas(data).length;
}

export function getClientesSinVentas(
  data: PickupData = defaultPickupData,
): Cliente[] {
  const cuentasConVentas = new Set(data.ventas.map((v) => v.numeroCuenta));
  return data.clientes.filter((c) => !cuentasConVentas.has(c.numeroCuenta));
}

export function contarVentasSinArticulo(
  data: PickupData = defaultPickupData,
): number {
  const ventasConItems = new Set(data.ventaItems.map((item) => item.ventaId));
  return data.ventas.filter((venta) => !ventasConItems.has(venta.id)).length;
}

export function contarArticulosSinAplicaciones(
  data: PickupData = defaultPickupData,
): number {
  const codigosConAplicacion = new Set(
    data.articuloAplicaciones.map((ap) => ap.codigoUnico),
  );
  return data.articulos.filter((a) => !codigosConAplicacion.has(a.codigoUnico))
    .length;
}

function pickTopRanked(items: RankedCount[]): RankedCount | null {
  return items.length > 0 ? items[0] : null;
}

function buildLecturaComercialRapida(
  data: PickupData,
): LecturaComercialRapida {
  const porLocalidad = getClientesPorLocalidad(data);
  const topLocalidad = porLocalidad[0];

  const topModelos = getTopModelosPorAplicaciones(1, data);
  const topClientes = getTopClientesPorCompras(1, data);
  const topArticulos = getTopArticulosPorFrecuencia(1, data);

  return {
    localidadMasClientes: topLocalidad
      ? {
          nombre: topLocalidad.localidad,
          cantidad: topLocalidad.cantidadClientes,
        }
      : null,
    modeloMasAplicaciones: pickTopRanked(topModelos),
    clienteMasCompras: topClientes[0]
      ? {
          nombre: topClientes[0].razonSocial,
          cantidad: topClientes[0].cantidadCompras,
        }
      : null,
    articuloMasFrecuente: topArticulos[0]
      ? {
          nombre: topArticulos[0].descripcion,
          cantidad: topArticulos[0].vecesEnVentas,
          detalle: topArticulos[0].codigoUnico,
        }
      : null,
  };
}

function buildAlertasNormalizacion(meta?: CommercialDashboardMeta): string[] {
  const alertas: string[] = [];

  if (meta?.smartNormalization) {
    const { localidadesUnificadas, marcasUnificadas, modelosUnificados } =
      meta.smartNormalization;
    const unificados =
      localidadesUnificadas + marcasUnificadas + modelosUnificados;
    if (unificados > 0) {
      alertas.push(
        `Se unificaron ${unificados} grupos de nombres (localidades, marcas o modelos) para leer mejor los datos.`,
      );
    }
    if (meta.smartNormalization.topEquivalencias.length > 0) {
      const ejemplo = meta.smartNormalization.topEquivalencias[0];
      alertas.push(
        `Ejemplo: variantes como «${ejemplo.variants.slice(0, 2).join("», «")}» se leyeron como «${ejemplo.canonical}».`,
      );
    }
  }

  for (const warning of meta?.warnings ?? []) {
    if (
      warning.code === "NORMALIZACION_INTELIGENTE" ||
      warning.code === "IMPORTES_OMITIDOS_V1"
    ) {
      alertas.push(warning.message);
    }
  }

  return [...new Set(alertas)];
}

export function buildCommercialDashboardInsights(
  data: PickupData = defaultPickupData,
  meta?: CommercialDashboardMeta,
): CommercialDashboardInsights {
  const resumenCalidad = meta?.dataQuality
    ? {
        filasExcluidas: meta.dataQuality.summary.filasExcluidas,
        fallbacksAplicados: meta.dataQuality.summary.fallbacksAplicados,
        advertencias: meta.dataQuality.summary.advertencias,
        erroresCriticos: meta.dataQuality.summary.erroresCriticos,
      }
    : null;

  return {
    kpis: {
      totalClientes: calcularCantidadClientes(data),
      totalRegistrosVenta: calcularTotalRegistrosVenta(data),
      totalArticulosUnicos: calcularTotalArticulosUnicos(data),
      totalAplicaciones: calcularTotalAplicaciones(data),
    },
    lecturaRapida: buildLecturaComercialRapida(data),
    clientesPorLocalidad: getClientesPorLocalidad(data),
    demandaVehiculo: {
      topMarcas: getTopMarcasPorAplicaciones(5, data),
      topModelos: getTopModelosPorAplicaciones(5, data),
      aplicacionesPorMarcaModelo: getAplicacionesPorMarcaModelo(8, data),
    },
    actividadComercial: {
      ventasPorMes: getVentasPorMes(data),
      topClientesPorCompras: getTopClientesPorCompras(5, data),
      topArticulosPorFrecuencia: getTopArticulosPorFrecuencia(5, data),
    },
    calidadYOportunidades: {
      clientesSinVentas: contarClientesSinVentas(data),
      ventasSinArticulo: contarVentasSinArticulo(data),
      articulosSinAplicaciones: contarArticulosSinAplicaciones(data),
      alertasNormalizacion: buildAlertasNormalizacion(meta),
      resumenCalidad,
    },
  };
}
