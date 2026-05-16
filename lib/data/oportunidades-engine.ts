import {
  contarVentasSinArticulo,
  getClientesPorLocalidad,
  getClientesSinVentas,
  getTopArticulosPorFrecuencia,
  getTopClientesPorCompras,
  getAplicacionesPorMarcaModelo,
} from "@/lib/data/insights";
import type { ActivePickupData } from "@/lib/data/pickup-data";
import type { DatasetSource } from "@/contexts/DatasetContext";
import type {
  OportunidadDetectada,
  OportunidadDetectadaTipo,
  OportunidadEntidadRelacionada,
  OportunidadFuenteDatos,
  OportunidadPrioridad,
} from "@/lib/models/oportunidad";

const UNIVERSAL_MIN_APLICACIONES = 6;
const UNIVERSAL_MIN_MODELOS = 4;
const TOP_EJEMPLOS = 3;
const VEHICULOS_DESTACADOS = 3;

export type OportunidadesFiltros = {
  busqueda: string;
  prioridad: "" | OportunidadPrioridad;
  tipo: "" | OportunidadDetectadaTipo;
};

export type OportunidadesKpis = {
  detectadas: number;
  altaPrioridad: number;
  revisarCatalogo: number;
  crecimientoComercial: number;
};

const TIPOS_CRECIMIENTO: OportunidadDetectadaTipo[] = [
  "clientes_alta_actividad",
  "articulos_frecuentes",
  "articulos_universales",
  "vehiculos_alta_cobertura",
  "localidades_cartera_fuerte",
];

const TIPOS_CATALOGO: OportunidadDetectadaTipo[] = [
  "aplicaciones_revision",
  "articulos_universales",
  "vehiculos_baja_cobertura",
];

const TIPO_LABELS: Record<OportunidadDetectadaTipo, string> = {
  clientes_sin_ventas: "Clientes sin ventas",
  clientes_alta_actividad: "Clientes con alta actividad",
  articulos_frecuentes: "Artículos frecuentes",
  articulos_universales: "Artículos universales",
  vehiculos_alta_cobertura: "Vehículos con alta cobertura",
  vehiculos_baja_cobertura: "Vehículos con baja cobertura",
  aplicaciones_revision: "Aplicaciones a revisar",
  ventas_sin_articulo: "Ventas sin artículo",
  localidades_cartera_fuerte: "Localidades con cartera fuerte",
  localidades_cartera_debil: "Localidades con cartera débil",
};

function fuenteFromSource(source: DatasetSource): OportunidadFuenteDatos {
  return source === "excel" ? "excel" : "mock";
}

function baseConfianza(fuente: OportunidadFuenteDatos): number {
  return fuente === "excel" ? 0.9 : 0.55;
}

function listaNombres(items: string[], max = TOP_EJEMPLOS): string {
  if (items.length === 0) return "—";
  const slice = items.slice(0, max);
  const resto = items.length - slice.length;
  const texto = slice.join(", ");
  return resto > 0 ? `${texto} y ${resto} más` : texto;
}

function crearOportunidad(
  partial: Omit<OportunidadDetectada, "fuenteDatos"> & { fuenteDatos?: OportunidadFuenteDatos },
  fuente: OportunidadFuenteDatos,
): OportunidadDetectada {
  return { ...partial, fuenteDatos: partial.fuenteDatos ?? fuente };
}

function detectarArticulosUniversales(data: ActivePickupData): {
  codigos: string[];
  descripciones: string[];
} {
  const articuloMap = new Map(data.articulos.map((a) => [a.codigoUnico, a]));
  const appsPorCodigo = new Map<string, number>();
  const modelosPorCodigo = new Map<string, Set<string>>();

  for (const ap of data.articuloAplicaciones) {
    appsPorCodigo.set(ap.codigoUnico, (appsPorCodigo.get(ap.codigoUnico) ?? 0) + 1);
    const set = modelosPorCodigo.get(ap.codigoUnico) ?? new Set<string>();
    set.add(ap.modeloId);
    modelosPorCodigo.set(ap.codigoUnico, set);
  }

  const universales: { codigo: string; apps: number }[] = [];

  for (const [codigo, apps] of appsPorCodigo.entries()) {
    const modelos = modelosPorCodigo.get(codigo)?.size ?? 0;
    if (apps >= UNIVERSAL_MIN_APLICACIONES && modelos >= UNIVERSAL_MIN_MODELOS) {
      universales.push({ codigo, apps });
    }
  }

  universales.sort((a, b) => b.apps - a.apps);

  return {
    codigos: universales.map((u) => u.codigo),
    descripciones: universales
      .slice(0, TOP_EJEMPLOS)
      .map((u) => articuloMap.get(u.codigo)?.descripcion ?? u.codigo),
  };
}

function detectarRevisionPorVehiculo(
  data: ActivePickupData,
): { marca: string; modelo: string; cantidad: number }[] {
  const marcaMap = new Map(data.vehiculoMarcas.map((m) => [m.id, m.nombre]));
  const modeloMap = new Map(data.vehiculoModelos.map((m) => [m.id, m]));
  const conteo = new Map<string, { marca: string; modelo: string; cantidad: number }>();

  for (const ap of data.articuloAplicaciones) {
    if (ap.validationStatus !== "review" && !ap.requiresReview) continue;
    const modelo = modeloMap.get(ap.modeloId);
    if (!modelo) continue;
    const marca = marcaMap.get(modelo.marcaId) ?? "Sin marca";
    const key = `${marca}::${modelo.nombre}`;
    const actual = conteo.get(key) ?? { marca, modelo: modelo.nombre, cantidad: 0 };
    actual.cantidad += 1;
    conteo.set(key, actual);
  }

  return [...conteo.values()].sort((a, b) => b.cantidad - a.cantidad);
}

function detectarLocalidadesDebil(
  data: ActivePickupData,
): { localidad: string; clientes: number; ventas: number }[] {
  const ventasPorCuenta = new Map<string, number>();
  for (const venta of data.ventas) {
    ventasPorCuenta.set(
      venta.numeroCuenta,
      (ventasPorCuenta.get(venta.numeroCuenta) ?? 0) + 1,
    );
  }

  const bucket = new Map<string, { clientes: number; ventas: number }>();

  for (const cliente of data.clientes) {
    const loc = cliente.localidad?.trim() || "Sin localidad";
    const entry = bucket.get(loc) ?? { clientes: 0, ventas: 0 };
    entry.clientes += 1;
    entry.ventas += ventasPorCuenta.get(cliente.numeroCuenta) ?? 0;
    bucket.set(loc, entry);
  }

  return [...bucket.entries()]
    .map(([localidad, stats]) => ({ localidad, ...stats }))
    .filter(
      (row) =>
        row.localidad !== "Sin localidad" &&
        row.clientes >= 1 &&
        row.clientes <= 8 &&
        row.ventas >= 4,
    )
    .sort((a, b) => b.ventas / Math.max(b.clientes, 1) - a.ventas / Math.max(a.clientes, 1))
    .slice(0, TOP_EJEMPLOS);
}

function percentilValores(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p)),
  );
  return sorted[idx] ?? 0;
}

export function formatOportunidadDetectadaTipo(tipo: OportunidadDetectadaTipo): string {
  return TIPO_LABELS[tipo];
}

export function getOportunidadesKpis(
  oportunidades: OportunidadDetectada[],
): OportunidadesKpis {
  return {
    detectadas: oportunidades.length,
    altaPrioridad: oportunidades.filter((o) => o.prioridad === "alta").length,
    revisarCatalogo: oportunidades.filter((o) => TIPOS_CATALOGO.includes(o.tipo))
      .length,
    crecimientoComercial: oportunidades.filter((o) =>
      TIPOS_CRECIMIENTO.includes(o.tipo),
    ).length,
  };
}

export function filterOportunidades(
  oportunidades: OportunidadDetectada[],
  filtros: OportunidadesFiltros,
): OportunidadDetectada[] {
  const q = filtros.busqueda.trim().toLowerCase();

  return oportunidades.filter((op) => {
    if (filtros.prioridad && op.prioridad !== filtros.prioridad) return false;
    if (filtros.tipo && op.tipo !== filtros.tipo) return false;
    if (!q) return true;

    const haystack = [
      op.titulo,
      op.descripcion,
      op.recomendacion,
      op.metricaPrincipal,
      formatOportunidadDetectadaTipo(op.tipo),
      op.entidad?.etiqueta ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function detectarOportunidadesComerciales(
  data: ActivePickupData,
  source: DatasetSource,
): OportunidadDetectada[] {
  const fuente = fuenteFromSource(source);
  const confBase = baseConfianza(fuente);
  const resultados: OportunidadDetectada[] = [];
  let seq = 0;

  const push = (
    partial: Omit<OportunidadDetectada, "id" | "fuenteDatos">,
  ): void => {
    seq += 1;
    resultados.push(
      crearOportunidad(
        {
          ...partial,
          id: `opp-${partial.tipo}-${seq}`,
        },
        fuente,
      ),
    );
  };

  const totalClientes = data.clientes.length;
  const sinVentas = getClientesSinVentas(data);

  if (sinVentas.length > 0 && totalClientes > 0) {
    const pct = sinVentas.length / totalClientes;
    const ejemplos = sinVentas
      .slice(0, TOP_EJEMPLOS)
      .map((c) => c.razonSocial || c.nombreFantasia || c.numeroCuenta);

    push({
      tipo: "clientes_sin_ventas",
      prioridad: pct >= 0.15 ? "alta" : pct >= 0.05 ? "media" : "baja",
      titulo: "Clientes en cartera sin movimientos de venta",
      descripcion: `${sinVentas.length.toLocaleString("es-AR")} cuentas están cargadas pero no tienen comprobantes en el diario. Ejemplos: ${listaNombres(ejemplos)}.`,
      recomendacion:
        "Asigná un vendedor para reactivar estas cuentas: llamada de presentación, visita o propuesta de artículos más vendidos de su zona.",
      metricaPrincipal: `${sinVentas.length.toLocaleString("es-AR")} clientes`,
      metricaValor: sinVentas.length,
      entidad: { tipo: "sistema", etiqueta: "Cartera de clientes" },
      confianza: confBase,
    });
  }

  const topClientes = getTopClientesPorCompras(5, data);
  if (topClientes.length > 0 && topClientes[0].cantidadCompras >= 3) {
    const lider = topClientes[0];
    push({
      tipo: "clientes_alta_actividad",
      prioridad: lider.cantidadCompras >= 15 ? "alta" : "media",
      titulo: "Clientes que más compran en tu base",
      descripcion: `El más activo es ${lider.razonSocial} (${lider.localidad}) con ${lider.cantidadCompras.toLocaleString("es-AR")} movimientos. Otros destacados: ${listaNombres(topClientes.slice(1).map((c) => c.razonSocial))}.`,
      recomendacion:
        "Protegé la relación con estos clientes: prioridad en stock, seguimiento postventa y oferta de artículos universales que aún no les vendés.",
      metricaPrincipal: `${lider.cantidadCompras.toLocaleString("es-AR")} compras (líder)`,
      metricaValor: lider.cantidadCompras,
      entidad: {
        tipo: "cliente",
        id: lider.numeroCuenta,
        etiqueta: lider.razonSocial,
      },
      confianza: confBase,
    });
  }

  const topArticulos = getTopArticulosPorFrecuencia(5, data);
  if (topArticulos.length > 0 && topArticulos[0].vecesEnVentas >= 2) {
    const top = topArticulos[0];
    push({
      tipo: "articulos_frecuentes",
      prioridad: top.vecesEnVentas >= 20 ? "alta" : "media",
      titulo: "Artículos que más salen en ventas",
      descripcion: `«${top.descripcion}» (${top.codigoUnico}) aparece ${top.vecesEnVentas.toLocaleString("es-AR")} veces. También destacan: ${listaNombres(topArticulos.slice(1).map((a) => a.descripcion))}.`,
      recomendacion:
        "Asegurate de tener stock y aplicaciones bien cargadas para estos códigos; usalos como gancho en visitas a clientes dormidos.",
      metricaPrincipal: `${top.vecesEnVentas.toLocaleString("es-AR")} apariciones`,
      metricaValor: top.vecesEnVentas,
      entidad: {
        tipo: "articulo",
        id: top.codigoUnico,
        etiqueta: top.descripcion,
      },
      confianza: confBase,
    });
  }

  const universales = detectarArticulosUniversales(data);
  if (universales.codigos.length > 0) {
    push({
      tipo: "articulos_universales",
      prioridad: universales.codigos.length >= 50 ? "alta" : "media",
      titulo: "Artículos que sirven para muchos vehículos",
      descripcion: `${universales.codigos.length.toLocaleString("es-AR")} códigos tienen amplia cobertura de aplicaciones. Ejemplos: ${listaNombres(universales.descripciones)}.`,
      recomendacion:
        "Promové estos artículos en el mostrador y en presupuestos: son los que más chances tienen de cerrar sin depender de un solo modelo.",
      metricaPrincipal: `${universales.codigos.length.toLocaleString("es-AR")} universales`,
      metricaValor: universales.codigos.length,
      entidad: { tipo: "catalogo", etiqueta: "Catálogo de artículos" },
      confianza: confBase * 0.95,
    });
  }

  const porMarcaModelo = getAplicacionesPorMarcaModelo(
    Math.max(20, data.vehiculoModelos.length),
    data,
  );
  const conteosModelo = porMarcaModelo.map((m) => m.cantidadAplicaciones);
  const umbralAlta = percentilValores(conteosModelo, 0.85);
  const umbralBaja = percentilValores(conteosModelo, 0.2);

  const altaCobertura = porMarcaModelo
    .filter((m) => m.cantidadAplicaciones >= Math.max(umbralAlta, 30))
    .slice(0, VEHICULOS_DESTACADOS);

  for (const vehiculo of altaCobertura) {
    push({
      tipo: "vehiculos_alta_cobertura",
      prioridad: vehiculo.cantidadAplicaciones >= umbralAlta * 1.2 ? "alta" : "media",
      titulo: `Alta cobertura: ${vehiculo.marca} ${vehiculo.modelo}`,
      descripcion: `Hay ${vehiculo.cantidadAplicaciones.toLocaleString("es-AR")} aplicaciones de repuestos cargadas para este modelo. Es un parque fuerte en tu catálogo.`,
      recomendacion:
        "Usá este vehículo en el mostrador táctil y en campañas: es donde más podés armar presupuestos completos sin quedar corto.",
      metricaPrincipal: `${vehiculo.cantidadAplicaciones.toLocaleString("es-AR")} aplicaciones`,
      metricaValor: vehiculo.cantidadAplicaciones,
      entidad: {
        tipo: "vehiculo",
        etiqueta: `${vehiculo.marca} ${vehiculo.modelo}`,
      },
      confianza: confBase,
    });
  }

  const bajaCobertura = porMarcaModelo
    .filter(
      (m) =>
        m.cantidadAplicaciones > 0 &&
        m.cantidadAplicaciones <= Math.max(umbralBaja, 12),
    )
    .slice(0, VEHICULOS_DESTACADOS);

  for (const vehiculo of bajaCobertura) {
    push({
      tipo: "vehiculos_baja_cobertura",
      prioridad: "media",
      titulo: `Cobertura limitada: ${vehiculo.marca} ${vehiculo.modelo}`,
      descripcion: `Solo ${vehiculo.cantidadAplicaciones.toLocaleString("es-AR")} aplicaciones disponibles. Si hay demanda en la calle, el catálogo puede quedar corto.`,
      recomendacion:
        "Revisá si faltan filas en el Excel de artículos o si hay aplicaciones en revisión sin validar para este modelo.",
      metricaPrincipal: `${vehiculo.cantidadAplicaciones.toLocaleString("es-AR")} aplicaciones`,
      metricaValor: vehiculo.cantidadAplicaciones,
      entidad: {
        tipo: "vehiculo",
        etiqueta: `${vehiculo.marca} ${vehiculo.modelo}`,
      },
      confianza: confBase * 0.85,
    });
  }

  const revisionPorVehiculo = detectarRevisionPorVehiculo(data);
  const totalRevision = data.articuloAplicaciones.filter(
    (ap) => ap.validationStatus === "review" || ap.requiresReview,
  ).length;

  if (totalRevision > 0) {
    const liderRevision = revisionPorVehiculo[0];
    push({
      tipo: "aplicaciones_revision",
      prioridad: totalRevision >= 500 ? "alta" : "media",
      titulo: "Aplicaciones que conviene validar en el catálogo",
      descripcion: liderRevision
        ? `${totalRevision.toLocaleString("es-AR")} aplicaciones están marcadas para revisión. El combo con más casos: ${liderRevision.marca} ${liderRevision.modelo} (${liderRevision.cantidad.toLocaleString("es-AR")}).`
        : `${totalRevision.toLocaleString("es-AR")} aplicaciones requieren revisión de marca/modelo antes de confiar en el cruce con ventas.`,
      recomendacion:
        "En Importar revisá la auditoría de aplicaciones y corregí marcas/modelos dudosos. Mientras tanto, el mostrador las muestra con aviso «a revisar».",
      metricaPrincipal: `${totalRevision.toLocaleString("es-AR")} en revisión`,
      metricaValor: totalRevision,
      entidad: { tipo: "catalogo", etiqueta: "Catálogo de aplicaciones" },
      confianza: confBase * (totalRevision > 0 ? 0.88 : 0.7),
    });
  }

  const ventasSinArticulo = contarVentasSinArticulo(data);
  if (ventasSinArticulo > 0) {
    push({
      tipo: "ventas_sin_articulo",
      prioridad: ventasSinArticulo >= 100 ? "alta" : "media",
      titulo: "Ventas que no cruzan con el catálogo",
      descripcion: `${ventasSinArticulo.toLocaleString("es-AR")} comprobantes no tienen línea de artículo reconocida en el catálogo cargado.`,
      recomendacion:
        "Revisá códigos en el diario de ventas y en el maestro de artículos: suele ser diferencia de formato o artículos nuevos aún no importados.",
      metricaPrincipal: `${ventasSinArticulo.toLocaleString("es-AR")} comprobantes`,
      metricaValor: ventasSinArticulo,
      entidad: { tipo: "sistema", etiqueta: "Cruce ventas ↔ catálogo" },
      confianza: confBase,
    });
  }

  const porLocalidad = getClientesPorLocalidad(data);
  const topLocalidades = porLocalidad.filter((l) => l.localidad !== "Sin localidad").slice(0, TOP_EJEMPLOS);

  if (topLocalidades.length > 0 && topLocalidades[0].cantidadClientes >= 5) {
    const top = topLocalidades[0];
    push({
      tipo: "localidades_cartera_fuerte",
      prioridad: top.cantidadClientes >= 50 ? "alta" : "media",
      titulo: "Zonas con cartera concentrada",
      descripcion: `${top.localidad} lidera con ${top.cantidadClientes.toLocaleString("es-AR")} clientes. También destacan: ${listaNombres(topLocalidades.slice(1).map((l) => l.localidad))}.`,
      recomendacion:
        "Planificá visitas o llamadas por zona: en estos lugares un solo viaje alcanza para atender muchas cuentas.",
      metricaPrincipal: `${top.cantidadClientes.toLocaleString("es-AR")} clientes`,
      metricaValor: top.cantidadClientes,
      entidad: { tipo: "localidad", etiqueta: top.localidad },
      confianza: confBase,
    });
  }

  const localidadesDebil = detectarLocalidadesDebil(data);
  if (localidadesDebil.length > 0) {
    const ejemplo = localidadesDebil[0];
    push({
      tipo: "localidades_cartera_debil",
      prioridad: "media",
      titulo: "Zonas chicas con actividad comercial",
      descripcion: `Hay localidades con pocos clientes cargados pero con ventas registradas. Ejemplo: ${ejemplo.localidad} (${ejemplo.clientes} clientes, ${ejemplo.ventas} movimientos).`,
      recomendacion:
        "Puede haber cuentas sin cargar o potencial de ampliar cartera en esa zona. Vale la pena revisar si faltan altas de clientes.",
      metricaPrincipal: `${ejemplo.ventas.toLocaleString("es-AR")} ventas`,
      metricaValor: ejemplo.ventas,
      entidad: { tipo: "localidad", etiqueta: ejemplo.localidad },
      confianza: confBase * 0.8,
    });
  }

  const prioridadOrden: Record<OportunidadPrioridad, number> = {
    alta: 0,
    media: 1,
    baja: 2,
  };

  return resultados.sort((a, b) => {
    const byP = prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad];
    if (byP !== 0) return byP;
    return b.metricaValor - a.metricaValor;
  });
}

export function getOportunidadesTiposDisponibles(
  oportunidades: OportunidadDetectada[],
): OportunidadDetectadaTipo[] {
  return [...new Set(oportunidades.map((o) => o.tipo))].sort((a, b) =>
    TIPO_LABELS[a].localeCompare(TIPO_LABELS[b], "es"),
  );
}
