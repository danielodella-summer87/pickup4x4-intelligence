import type { ActivePickupData } from "@/lib/data/pickup-data";
import { formatClienteEstado, formatMesComercial } from "@/lib/data/insights";
import type { Cliente, ClienteEstado } from "@/lib/models/cliente";
import {
  formatVentaFechaDisplay,
  getMesClaveFromVentaFecha,
  isVentaFechaConfiable,
  ventasTienenFechasConfiables,
} from "@/lib/models/venta-fecha";

export const MODULE_LIST_LIMIT = 100;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function limitList<T>(items: T[]): {
  visible: T[];
  total: number;
  truncated: boolean;
} {
  const total = items.length;
  return {
    visible: items.slice(0, MODULE_LIST_LIMIT),
    total,
    truncated: total > MODULE_LIST_LIMIT,
  };
}

export type ListMeta = {
  total: number;
  truncated: boolean;
};

// ——— Clientes ———

export type ClienteConsultaFila = {
  numeroCuenta: string;
  nombreDisplay: string;
  razonSocial: string;
  localidad: string;
  ruc: string;
  estado: ClienteEstado;
  estadoLabel: string;
  cantidadVentas: number;
  searchText: string;
};

export type ClientesFiltros = {
  busqueda: string;
  localidad: string;
  estado: string;
};

export type ClientesKpis = {
  totalClientes: number;
  localidades: number;
  conVentas: number;
  sinVentas: number;
};

export function buildClientesConsulta(data: ActivePickupData): ClienteConsultaFila[] {
  const ventasPorCuenta = new Map<string, number>();
  for (const venta of data.ventas) {
    ventasPorCuenta.set(
      venta.numeroCuenta,
      (ventasPorCuenta.get(venta.numeroCuenta) ?? 0) + 1,
    );
  }

  return data.clientes
    .map((cliente) => {
      const nombreDisplay =
        cliente.nombreFantasia?.trim() || cliente.razonSocial;
      const localidad = cliente.localidad?.trim() || "Sin localidad";
      const ruc = cliente.cuit?.trim() || "—";
      const searchText = normalizeSearchText(
        [
          cliente.numeroCuenta,
          cliente.razonSocial,
          cliente.nombreFantasia,
          localidad,
          ruc,
        ]
          .filter(Boolean)
          .join(" "),
      );

      return {
        numeroCuenta: cliente.numeroCuenta,
        nombreDisplay,
        razonSocial: cliente.razonSocial,
        localidad,
        ruc,
        estado: cliente.estado,
        estadoLabel: formatClienteEstado(cliente.estado),
        cantidadVentas: ventasPorCuenta.get(cliente.numeroCuenta) ?? 0,
        searchText,
      };
    })
    .sort((a, b) => a.nombreDisplay.localeCompare(b.nombreDisplay, "es"));
}

export function getClientesKpis(filas: ClienteConsultaFila[]): ClientesKpis {
  const localidades = new Set(
    filas.map((f) => f.localidad).filter((l) => l !== "Sin localidad"),
  );
  let conVentas = 0;
  for (const f of filas) {
    if (f.cantidadVentas > 0) conVentas += 1;
  }
  return {
    totalClientes: filas.length,
    localidades: localidades.size,
    conVentas,
    sinVentas: filas.length - conVentas,
  };
}

export function getClientesOpcionesFiltro(filas: ClienteConsultaFila[]) {
  const localidades = new Set<string>();
  const estados = new Set<string>();
  for (const f of filas) {
    localidades.add(f.localidad);
    estados.add(f.estado);
  }
  return {
    localidades: [...localidades].sort((a, b) => a.localeCompare(b, "es")),
    estados: [...estados].sort(),
  };
}

export function filterClientes(
  filas: ClienteConsultaFila[],
  filtros: ClientesFiltros,
): ClienteConsultaFila[] {
  const q = normalizeSearchText(filtros.busqueda);

  return filas.filter((f) => {
    if (q && !f.searchText.includes(q)) return false;
    if (filtros.localidad && f.localidad !== filtros.localidad) return false;
    if (filtros.estado && f.estado !== filtros.estado) return false;
    return true;
  });
}

// ——— Ventas ———

export type VentaConsultaFila = {
  id: string;
  fecha: string;
  mesClave: string;
  mesEtiqueta: string;
  comprobante: string;
  clienteNombre: string;
  localidad: string;
  codigoUnico: string;
  descripcion: string;
  cantidad: number;
  tieneArticulo: boolean;
  searchText: string;
};

export type VentasFiltros = {
  busqueda: string;
  mes: string;
  localidad: string;
  articulo: "" | "con" | "sin";
};

export type VentasKpis = {
  totalRegistros: number;
  mesesConActividad: number;
  comprobantesUnicos: number;
  conArticulo: number;
  sinArticulo: number;
  fechasConfiables: boolean;
};

export function buildVentasConsulta(data: ActivePickupData): VentaConsultaFila[] {
  const clienteMap = new Map(data.clientes.map((c) => [c.numeroCuenta, c]));
  const itemsPorVenta = new Map<string, typeof data.ventaItems>();
  for (const item of data.ventaItems) {
    const list = itemsPorVenta.get(item.ventaId) ?? [];
    list.push(item);
    itemsPorVenta.set(item.ventaId, list);
  }

  const filas: VentaConsultaFila[] = [];

  for (const venta of data.ventas) {
    const cliente = clienteMap.get(venta.numeroCuenta);
    const clienteNombre = cliente?.razonSocial ?? venta.numeroCuenta;
    const localidad = cliente?.localidad?.trim() || "Sin localidad";
    const mesClave = getMesClaveFromVentaFecha(venta.fecha) ?? "";
    const mesEtiqueta =
      mesClave.length >= 7 ? formatMesComercial(mesClave) : "Sin fecha";
    const items = itemsPorVenta.get(venta.id) ?? [];

    if (items.length === 0) {
      const searchText = normalizeSearchText(
        [venta.fecha, venta.numeroComprobante, clienteNombre, localidad].join(" "),
      );
      filas.push({
        id: `${venta.id}-sin-item`,
        fecha: venta.fecha,
        mesClave,
        mesEtiqueta,
        comprobante: venta.numeroComprobante,
        clienteNombre,
        localidad,
        codigoUnico: "—",
        descripcion: "Sin línea de artículo",
        cantidad: 0,
        tieneArticulo: false,
        searchText,
      });
      continue;
    }

    for (const item of items) {
      const searchText = normalizeSearchText(
        [
          venta.fecha,
          venta.numeroComprobante,
          clienteNombre,
          localidad,
          item.codigoUnico,
          item.descripcion,
        ].join(" "),
      );
      filas.push({
        id: item.id,
        fecha: venta.fecha,
        mesClave,
        mesEtiqueta,
        comprobante: venta.numeroComprobante,
        clienteNombre,
        localidad,
        codigoUnico: item.codigoUnico,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        tieneArticulo: true,
        searchText,
      });
    }
  }

  return filas.sort((a, b) => {
    const aOk = isVentaFechaConfiable(a.fecha);
    const bOk = isVentaFechaConfiable(b.fecha);
    if (aOk && bOk) return b.fecha.localeCompare(a.fecha);
    if (aOk) return -1;
    if (bOk) return 1;
    return a.comprobante.localeCompare(b.comprobante, "es");
  });
}

export function ventasConsultaTienenFechasConfiables(
  filas: VentaConsultaFila[],
): boolean {
  return filas.some((f) => isVentaFechaConfiable(f.fecha));
}

export function getVentasKpis(filas: VentaConsultaFila[]): VentasKpis {
  const meses = new Set(
    filas.map((f) => f.mesClave).filter((m) => m.length >= 7),
  );
  let conArticulo = 0;
  let sinArticulo = 0;
  for (const f of filas) {
    if (f.tieneArticulo) conArticulo += 1;
    else sinArticulo += 1;
  }
  const fechasConfiables = ventasConsultaTienenFechasConfiables(filas);
  const comprobantesUnicos = new Set(filas.map((f) => f.comprobante)).size;
  return {
    totalRegistros: filas.length,
    mesesConActividad: fechasConfiables ? meses.size : 0,
    comprobantesUnicos,
    conArticulo,
    sinArticulo,
    fechasConfiables,
  };
}

export function getVentasOpcionesFiltro(filas: VentaConsultaFila[]) {
  const meses = new Map<string, string>();
  const localidades = new Set<string>();
  for (const f of filas) {
    if (f.mesClave.length >= 7) {
      meses.set(f.mesClave, f.mesEtiqueta);
    }
    localidades.add(f.localidad);
  }
  return {
    fechasConfiables: ventasConsultaTienenFechasConfiables(filas),
    meses: [...meses.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([clave, etiqueta]) => ({ clave, etiqueta })),
    localidades: [...localidades].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export function filterVentas(
  filas: VentaConsultaFila[],
  filtros: VentasFiltros,
): VentaConsultaFila[] {
  const q = normalizeSearchText(filtros.busqueda);

  return filas.filter((f) => {
    if (q && !f.searchText.includes(q)) return false;
    if (filtros.mes && f.mesClave !== filtros.mes) return false;
    if (filtros.localidad && f.localidad !== filtros.localidad) return false;
    if (filtros.articulo === "con" && !f.tieneArticulo) return false;
    if (filtros.articulo === "sin" && f.tieneArticulo) return false;
    return true;
  });
}

// ——— Artículos ———

export type ArticuloConsultaFila = {
  codigoUnico: string;
  descripcion: string;
  rubro: string;
  categoria: string;
  cantidadAplicaciones: number;
  cantidadVentas: number;
  tieneAplicaciones: boolean;
  searchText: string;
};

export type ArticulosFiltros = {
  busqueda: string;
  rubro: string;
  categoria: string;
  aplicaciones: "" | "con" | "sin";
};

export type ArticulosKpis = {
  articulosUnicos: number;
  conAplicaciones: number;
  sinAplicaciones: number;
  topCategoria: string;
};

export function buildArticulosConsulta(data: ActivePickupData): ArticuloConsultaFila[] {
  const appsPorCodigo = new Map<string, number>();
  for (const ap of data.articuloAplicaciones) {
    appsPorCodigo.set(ap.codigoUnico, (appsPorCodigo.get(ap.codigoUnico) ?? 0) + 1);
  }

  const ventasPorCodigo = new Map<string, number>();
  for (const item of data.ventaItems) {
    ventasPorCodigo.set(
      item.codigoUnico,
      (ventasPorCodigo.get(item.codigoUnico) ?? 0) + 1,
    );
  }

  return data.articulos
    .map((articulo) => {
      const rubro = articulo.rubro?.trim() || "Sin rubro";
      const categoria = articulo.categoria?.trim() || "Sin categoría";
      const cantidadAplicaciones = appsPorCodigo.get(articulo.codigoUnico) ?? 0;
      const searchText = normalizeSearchText(
        [articulo.codigoUnico, articulo.descripcion, rubro, categoria].join(" "),
      );

      return {
        codigoUnico: articulo.codigoUnico,
        descripcion: articulo.descripcion,
        rubro,
        categoria,
        cantidadAplicaciones,
        cantidadVentas: ventasPorCodigo.get(articulo.codigoUnico) ?? 0,
        tieneAplicaciones: cantidadAplicaciones > 0,
        searchText,
      };
    })
    .sort((a, b) => b.cantidadVentas - a.cantidadVentas || a.descripcion.localeCompare(b.descripcion, "es"));
}

export function getArticulosKpis(filas: ArticuloConsultaFila[]): ArticulosKpis {
  let conAplicaciones = 0;
  const catCount = new Map<string, number>();
  for (const f of filas) {
    if (f.tieneAplicaciones) conAplicaciones += 1;
    catCount.set(f.categoria, (catCount.get(f.categoria) ?? 0) + 1);
  }
  let topCategoria = "—";
  let max = 0;
  for (const [cat, count] of catCount.entries()) {
    if (cat === "Sin categoría") continue;
    if (count > max) {
      max = count;
      topCategoria = cat;
    }
  }
  if (topCategoria === "—" && catCount.size > 0) {
    topCategoria = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }

  return {
    articulosUnicos: filas.length,
    conAplicaciones,
    sinAplicaciones: filas.length - conAplicaciones,
    topCategoria,
  };
}

export function getArticulosOpcionesFiltro(filas: ArticuloConsultaFila[]) {
  const rubros = new Set<string>();
  const categorias = new Set<string>();
  for (const f of filas) {
    rubros.add(f.rubro);
    categorias.add(f.categoria);
  }
  return {
    rubros: [...rubros].sort((a, b) => a.localeCompare(b, "es")),
    categorias: [...categorias].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export function filterArticulos(
  filas: ArticuloConsultaFila[],
  filtros: ArticulosFiltros,
): ArticuloConsultaFila[] {
  const q = normalizeSearchText(filtros.busqueda);

  return filas.filter((f) => {
    if (q && !f.searchText.includes(q)) return false;
    if (filtros.rubro && f.rubro !== filtros.rubro) return false;
    if (filtros.categoria && f.categoria !== filtros.categoria) return false;
    if (filtros.aplicaciones === "con" && !f.tieneAplicaciones) return false;
    if (filtros.aplicaciones === "sin" && f.tieneAplicaciones) return false;
    return true;
  });
}

// ——— Vehículos ———

export type VehiculoConsultaFila = {
  marcaId: string;
  marcaNombre: string;
  modeloId: string;
  modeloNombre: string;
  cantidadAccesorios: number;
  codigosPrincipales: string[];
  categoriasPrincipales: string[];
  rubrosPrincipales: string[];
  searchText: string;
};

export type VehiculosFiltros = {
  busqueda: string;
  marcaId: string;
  modeloId: string;
  categoria: string;
  rubro: string;
};

export type VehiculosKpis = {
  marcas: number;
  modelos: number;
  aplicaciones: number;
  articulosCompatibles: number;
};

export function buildVehiculosConsulta(data: ActivePickupData): VehiculoConsultaFila[] {
  const articuloMap = new Map(data.articulos.map((a) => [a.codigoUnico, a]));
  const marcaMap = new Map(data.vehiculoMarcas.map((m) => [m.id, m.nombre]));
  const modeloMap = new Map(
    data.vehiculoModelos.map((m) => [m.id, { nombre: m.nombre, marcaId: m.marcaId }]),
  );

  const porModelo = new Map<
    string,
    {
      codigos: Set<string>;
      categorias: Map<string, number>;
      rubros: Map<string, number>;
      searchParts: string[];
    }
  >();

  for (const ap of data.articuloAplicaciones) {
    const modelo = modeloMap.get(ap.modeloId);
    if (!modelo) continue;
    const marcaNombre = marcaMap.get(modelo.marcaId) ?? "Sin marca";
    const articulo = articuloMap.get(ap.codigoUnico);
    const descripcion = articulo?.descripcion ?? ap.codigoUnico;
    const categoria = articulo?.categoria?.trim() || "Sin categoría";
    const rubro = articulo?.rubro?.trim() || "Sin rubro";

    let bucket = porModelo.get(ap.modeloId);
    if (!bucket) {
      bucket = {
        codigos: new Set(),
        categorias: new Map(),
        rubros: new Map(),
        searchParts: [marcaNombre, modelo.nombre],
      };
      porModelo.set(ap.modeloId, bucket);
    }

    bucket.codigos.add(ap.codigoUnico);
    bucket.categorias.set(categoria, (bucket.categorias.get(categoria) ?? 0) + 1);
    bucket.rubros.set(rubro, (bucket.rubros.get(rubro) ?? 0) + 1);
    bucket.searchParts.push(ap.codigoUnico, descripcion, categoria, rubro);
  }

  const filas: VehiculoConsultaFila[] = [];

  for (const [modeloId, bucket] of porModelo.entries()) {
    const modelo = modeloMap.get(modeloId)!;
    const marcaNombre = marcaMap.get(modelo.marcaId) ?? "Sin marca";

    const topCodigos = [...bucket.codigos].slice(0, 5);
    const categoriasPrincipales = [...bucket.categorias.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);
    const rubrosPrincipales = [...bucket.rubros.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r]) => r);

    filas.push({
      marcaId: modelo.marcaId,
      marcaNombre,
      modeloId,
      modeloNombre: modelo.nombre,
      cantidadAccesorios: bucket.codigos.size,
      codigosPrincipales: topCodigos,
      categoriasPrincipales,
      rubrosPrincipales,
      searchText: normalizeSearchText(bucket.searchParts.join(" ")),
    });
  }

  return filas.sort(
    (a, b) =>
      b.cantidadAccesorios - a.cantidadAccesorios ||
      a.marcaNombre.localeCompare(b.marcaNombre, "es"),
  );
}

export function getVehiculosKpis(
  data: ActivePickupData,
  filas: VehiculoConsultaFila[],
): VehiculosKpis {
  const marcas = new Set(filas.map((f) => f.marcaId));
  const articulosCompatibles = new Set<string>();
  for (const ap of data.articuloAplicaciones) {
    articulosCompatibles.add(ap.codigoUnico);
  }

  return {
    marcas: marcas.size,
    modelos: filas.length,
    aplicaciones: data.articuloAplicaciones.length,
    articulosCompatibles: articulosCompatibles.size,
  };
}

export function getVehiculosOpcionesFiltro(
  filas: VehiculoConsultaFila[],
  data: ActivePickupData,
) {
  const marcasEnFilas = new Map<string, string>();
  const modelosPorMarca = new Map<string, { id: string; nombre: string }[]>();
  const categorias = new Set<string>();
  const rubros = new Set<string>();

  for (const f of filas) {
    marcasEnFilas.set(f.marcaId, f.marcaNombre);
    const list = modelosPorMarca.get(f.marcaId) ?? [];
    if (!list.some((m) => m.id === f.modeloId)) {
      list.push({ id: f.modeloId, nombre: f.modeloNombre });
    }
    modelosPorMarca.set(f.marcaId, list);
    for (const c of f.categoriasPrincipales) categorias.add(c);
    for (const r of f.rubrosPrincipales) rubros.add(r);
  }

  for (const a of data.articulos) {
    if (a.categoria) categorias.add(a.categoria.trim());
    if (a.rubro) rubros.add(a.rubro.trim());
  }

  return {
    marcas: [...marcasEnFilas.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    modelosPorMarca,
    categorias: [...categorias].sort((a, b) => a.localeCompare(b, "es")),
    rubros: [...rubros].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export function filterVehiculos(
  filas: VehiculoConsultaFila[],
  filtros: VehiculosFiltros,
): VehiculoConsultaFila[] {
  const q = normalizeSearchText(filtros.busqueda);

  return filas.filter((f) => {
    if (q && !f.searchText.includes(q)) return false;
    if (filtros.marcaId && f.marcaId !== filtros.marcaId) return false;
    if (filtros.modeloId && f.modeloId !== filtros.modeloId) return false;
    if (filtros.categoria && !f.categoriasPrincipales.includes(filtros.categoria)) {
      return false;
    }
    if (filtros.rubro && !f.rubrosPrincipales.includes(filtros.rubro)) {
      return false;
    }
    return true;
  });
}

export function formatFechaCorta(iso: string): string {
  return formatVentaFechaDisplay(iso);
}

export { ventasTienenFechasConfiables };
