/**
 * Lógica reusable para campañas comerciales por artículos.
 *
 * Flujo: Excel de artículos objetivo → validar contra el catálogo real →
 * buscar ventas de esos artículos → obtener número de cliente →
 * buscar datos del cliente → generar listado de candidatos.
 *
 * Es agnóstico del caso (lonas, accesorios, repuestos, etc.): la "lona" no se
 * hardcodea, se define por el Excel que sube el usuario.
 *
 * Pieza pura (sin React): se consume desde la pantalla y es testeable.
 */
import type { ColumnAliases } from "@/lib/excel/column-map";
import { pickRowValue } from "@/lib/excel/mappers";
import { normalizeCodigoUnico, normalizeText } from "@/lib/excel/normalizers";
import { normalizeSearchText } from "@/lib/data/module-filters";
import type { ActivePickupData } from "@/lib/data/pickup-data";
import { formatVentaFechaDisplay, isVentaFechaConfiable } from "@/lib/models/venta-fecha";

/** Umbral (en meses) por debajo del cual una compra se considera "reciente". */
export const COMPRA_RECIENTE_MESES = 6;

/**
 * Período mínimo (en meses) de Diario de Ventas recomendado para una campaña
 * real de renovación. Por debajo de este valor se considera "período corto".
 */
export const PERIODO_VENTAS_CORTO_MESES = 12;

export type CampaignTipo =
  | "recompra"
  | "renovacion"
  | "cross_sell"
  | "seguimiento"
  | "otro";

export const CAMPAIGN_TIPO_OPCIONES: { value: CampaignTipo; label: string }[] = [
  { value: "recompra", label: "Recompra" },
  { value: "renovacion", label: "Renovación" },
  { value: "cross_sell", label: "Cross-sell" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "otro", label: "Otro" },
];

export type CampaignMeta = {
  nombre: string;
  descripcion: string;
  tipo: CampaignTipo;
};

/** Fila editable de artículo objetivo (lo que el usuario sube/edita). */
export type CampaignArticuloInput = {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  marca: string;
  modelo: string;
  observaciones: string;
  /** Recambio sugerido a ofrecer (ej. código de tapa en equivalencias). */
  codigoTapa?: string;
};

export type CampaignArticuloEstado =
  | "validado_codigo"
  | "validado_descripcion"
  | "ambiguo"
  | "no_encontrado"
  | "incompleto";

export const ESTADO_LABEL: Record<CampaignArticuloEstado, string> = {
  validado_codigo: "Validado por código",
  validado_descripcion: "Validado por descripción",
  ambiguo: "Ambiguo",
  no_encontrado: "No encontrado",
  incompleto: "Incompleto",
};

/** Resultado de validar una fila contra el catálogo. */
export type CampaignArticuloValidado = CampaignArticuloInput & {
  estado: CampaignArticuloEstado;
  /** `codigoUnico` real del catálogo cuando se resolvió el match. */
  codigoCatalogo?: string;
  descripcionCatalogo?: string;
  categoriaCatalogo?: string;
  coincidencias?: number;
  mensaje: string;
};

export type ConfianzaMatch = "Alta" | "Media";

export type ClienteCandidato = {
  numeroCuenta: string;
  cliente: string;
  razonSocial: string;
  email: string | null;
  telefono: string | null;
  localidad: string | null;
  vendedor: string | null;
  articuloComprado: string;
  codigoArticulo: string;
  fechaCompra: string;
  fechaCompraDisplay: string;
  fechaConfiable: boolean;
  antiguedadMeses: number | null;
  comprobante: string | null;
  vehiculos: string[];
  vehiculoIdentificado: boolean;
  confianzaMatch: ConfianzaMatch;
  comprasTotales: number;
  articulosDistintos: number;
  multiplesCompras: boolean;
  accionSugerida: string;
  observaciones: string[];
  /** Recambio sugerido (código de tapa) asociado a la lona comprada. */
  codigoTapaSugerido?: string | null;
  /** Modelo/camioneta según la tabla de equivalencia importada. */
  modeloEquivalencia?: string | null;
};

export type CampaignFiltros = {
  soloConEmail: boolean;
  soloConTelefono: boolean;
  antiguedadMinMeses: number;
  excluirComprasRecientes: boolean;
  localidad: string;
  confianza: "" | ConfianzaMatch;
  ocultarSinContacto: boolean;
};

export const FILTROS_INICIALES: CampaignFiltros = {
  soloConEmail: false,
  soloConTelefono: false,
  antiguedadMinMeses: 12,
  excluirComprasRecientes: true,
  localidad: "",
  confianza: "",
  ocultarSinContacto: false,
};

export type CampaignQualitySummary = {
  articulosImportados: number;
  articulosValidados: number;
  articulosAmbiguos: number;
  articulosNoEncontrados: number;
  articulosIncompletos: number;
  ventasEncontradas: number;
  clientesUnicos: number;
  clientesConEmail: number;
  clientesConTelefono: number;
  clientesSinContacto: number;
  clientesConVehiculo: number;
  filasRevisionPendiente: number;
};

// --- Alias flexibles para el Excel de artículos objetivo ----------------------

const CODIGO_ALIASES = [
  "Código",
  "Codigo",
  "Código Artículo",
  "Codigo Articulo",
  "Cod. Art.",
  "Cod Articulo",
  "cod_articulo",
  "SKU",
  "Código Único",
  "Codigo Unico",
  "CODIGO",
] as ColumnAliases;

const DESCRIPCION_ALIASES = [
  "Descripción",
  "Descripcion",
  "DESCRIPCION",
  "Producto",
  "Nombre",
  "Detalle",
  "Artículo",
  "Articulo",
] as ColumnAliases;

const CATEGORIA_ALIASES = [
  "Categoría",
  "Categoria",
  "CATEGORIA",
  "Grupo",
  "Rubro",
  "Familia",
] as ColumnAliases;

const MARCA_ALIASES = [
  "Marca",
  "MARCA",
  "Marca Vehículo",
  "Marca Vehiculo",
  "Marca Veh",
] as ColumnAliases;

const MODELO_ALIASES = [
  "Modelo",
  "MODELO",
  "Modelo Vehículo",
  "Modelo Vehiculo",
  "Modelo Veh",
] as ColumnAliases;

const OBSERVACIONES_ALIASES = [
  "Observaciones",
  "Observación",
  "Observacion",
  "OBS",
  "Notas",
  "Comentarios",
] as ColumnAliases;

function cell(row: Record<string, unknown>, aliasList: ColumnAliases): string {
  return normalizeText(pickRowValue(row, aliasList)) ?? "";
}

/** Mapea filas crudas del Excel a artículos editables. */
export function parseArticulosRows(
  rows: Record<string, unknown>[],
): CampaignArticuloInput[] {
  const result: CampaignArticuloInput[] = [];
  rows.forEach((row, index) => {
    const codigo = cell(row, CODIGO_ALIASES);
    const descripcion = cell(row, DESCRIPCION_ALIASES);
    // Saltear filas totalmente vacías (sin código ni descripción).
    if (!codigo && !descripcion) return;
    result.push({
      id: `art-${index}`,
      codigo,
      descripcion,
      categoria: cell(row, CATEGORIA_ALIASES),
      marca: cell(row, MARCA_ALIASES),
      modelo: cell(row, MODELO_ALIASES),
      observaciones: cell(row, OBSERVACIONES_ALIASES),
    });
  });
  return result;
}

type CatalogoIndex = {
  porCodigo: Map<string, { codigoUnico: string; descripcion: string; categoria?: string }>;
  porDescripcion: Map<string, { codigoUnico: string; descripcion: string; categoria?: string }[]>;
};

function buildCatalogoIndex(data: ActivePickupData): CatalogoIndex {
  const porCodigo = new Map<string, { codigoUnico: string; descripcion: string; categoria?: string }>();
  const porDescripcion = new Map<string, { codigoUnico: string; descripcion: string; categoria?: string }[]>();

  for (const articulo of data.articulos) {
    const codigoNorm = normalizeCodigoUnico(articulo.codigoUnico);
    const entry = {
      codigoUnico: articulo.codigoUnico,
      descripcion: articulo.descripcion,
      categoria: articulo.categoria,
    };
    if (codigoNorm) porCodigo.set(codigoNorm, entry);

    const descKey = normalizeSearchText(articulo.descripcion ?? "");
    if (descKey) {
      const list = porDescripcion.get(descKey) ?? [];
      list.push(entry);
      porDescripcion.set(descKey, list);
    }
  }

  return { porCodigo, porDescripcion };
}

/** Valida cada artículo objetivo contra el catálogo del dataset activo. */
export function validarArticulos(
  inputs: CampaignArticuloInput[],
  data: ActivePickupData,
): CampaignArticuloValidado[] {
  const index = buildCatalogoIndex(data);

  return inputs.map((input) => {
    const codigo = input.codigo.trim();
    const descripcion = input.descripcion.trim();

    if (!codigo && !descripcion) {
      return {
        ...input,
        estado: "incompleto",
        mensaje: "Falta código y descripción; no se puede validar.",
      };
    }

    // 1) Match por código exacto.
    if (codigo) {
      const codigoNorm = normalizeCodigoUnico(codigo);
      const hit = codigoNorm ? index.porCodigo.get(codigoNorm) : undefined;
      if (hit) {
        return {
          ...input,
          estado: "validado_codigo",
          codigoCatalogo: hit.codigoUnico,
          descripcionCatalogo: hit.descripcion,
          categoriaCatalogo: hit.categoria,
          mensaje: "Coincidencia exacta por código en el catálogo.",
        };
      }
    }

    // 2) Match por descripción normalizada.
    if (descripcion) {
      const descKey = normalizeSearchText(descripcion);
      const matches = descKey ? index.porDescripcion.get(descKey) ?? [] : [];
      if (matches.length === 1) {
        const hit = matches[0];
        return {
          ...input,
          estado: "validado_descripcion",
          codigoCatalogo: hit.codigoUnico,
          descripcionCatalogo: hit.descripcion,
          categoriaCatalogo: hit.categoria,
          mensaje: "Coincidencia única por descripción.",
        };
      }
      if (matches.length > 1) {
        return {
          ...input,
          estado: "ambiguo",
          coincidencias: matches.length,
          mensaje: `${matches.length} artículos comparten esta descripción; revisar antes de usar.`,
        };
      }
    }

    return {
      ...input,
      estado: "no_encontrado",
      mensaje: codigo
        ? "El código no existe en el catálogo y la descripción no coincide."
        : "La descripción no coincide con ningún artículo del catálogo.",
    };
  });
}

function resolveVehiculos(codigoUnico: string, data: ActivePickupData): string[] {
  const apps = data.articuloAplicaciones.filter((a) => a.codigoUnico === codigoUnico);
  const vistos = new Set<string>();
  const result: string[] = [];
  for (const app of apps) {
    const marca =
      app.marcaLegible ??
      data.vehiculoMarcas.find((m) => m.id === app.marcaId)?.nombre ??
      "";
    const modelo =
      app.modeloLegible ??
      data.vehiculoModelos.find((m) => m.id === app.modeloId)?.nombre ??
      "";
    const texto = [marca, modelo].filter(Boolean).join(" ").trim();
    if (texto && !vistos.has(texto)) {
      vistos.add(texto);
      result.push(texto);
    }
  }
  return result;
}

export function mesesEntre(fechaIso: string, ahora: Date): number | null {
  if (!isVentaFechaConfiable(fechaIso)) return null;
  const compra = new Date(`${fechaIso}T00:00:00`);
  if (Number.isNaN(compra.getTime())) return null;
  let meses =
    (ahora.getFullYear() - compra.getFullYear()) * 12 +
    (ahora.getMonth() - compra.getMonth());
  if (ahora.getDate() < compra.getDate()) meses -= 1;
  return Math.max(0, meses);
}

type CompraDetectada = {
  codigoUnico: string;
  descripcion: string;
  fecha: string;
  comprobante: string | null;
  confianza: ConfianzaMatch;
};

/**
 * Cruza los artículos validados contra ventas → ventaItems → clientes.
 * Deduplica a una fila por cliente, conservando la compra válida más antigua.
 */
export function buscarClientesCandidatos(
  validados: CampaignArticuloValidado[],
  data: ActivePickupData,
  ahora: Date = new Date(),
): ClienteCandidato[] {
  // Clave de búsqueda = CODIGO LONA: el código del catálogo si validó, o el
  // código crudo ingresado como fallback (para encontrarlo en ventas aunque no
  // esté en el catálogo de artículos). Cada código arrastra sus recambios (tapa)
  // y modelos de equivalencia.
  type ObjetivoBusqueda = {
    confianza: ConfianzaMatch;
    tapas: Set<string>;
    modelos: Set<string>;
  };
  const objetivoPorCodigo = new Map<string, ObjetivoBusqueda>();
  for (const art of validados) {
    const codigoBusqueda =
      art.codigoCatalogo ??
      (art.codigo.trim() ? normalizeCodigoUnico(art.codigo) : undefined);
    if (!codigoBusqueda) continue;
    const confianza: ConfianzaMatch =
      art.estado === "validado_codigo" ? "Alta" : "Media";
    const obj =
      objetivoPorCodigo.get(codigoBusqueda) ??
      { confianza, tapas: new Set<string>(), modelos: new Set<string>() };
    if (confianza === "Alta") obj.confianza = "Alta";
    if (art.codigoTapa?.trim()) obj.tapas.add(art.codigoTapa.trim());
    if (art.modelo?.trim()) obj.modelos.add(art.modelo.trim());
    objetivoPorCodigo.set(codigoBusqueda, obj);
  }
  if (objetivoPorCodigo.size === 0) return [];

  const ventaById = new Map(data.ventas.map((v) => [v.id, v]));
  const clienteByCuenta = new Map(data.clientes.map((c) => [c.numeroCuenta, c]));

  // Agrupar compras por cliente.
  const comprasPorCuenta = new Map<string, CompraDetectada[]>();
  for (const item of data.ventaItems) {
    const objetivo = objetivoPorCodigo.get(item.codigoUnico);
    if (!objetivo) continue;
    const venta = ventaById.get(item.ventaId);
    if (!venta) continue;
    const cuenta = venta.numeroCuenta;
    const lista = comprasPorCuenta.get(cuenta) ?? [];
    lista.push({
      codigoUnico: item.codigoUnico,
      descripcion: item.descripcion,
      fecha: venta.fecha,
      comprobante: venta.numeroComprobante || null,
      confianza: objetivo.confianza,
    });
    comprasPorCuenta.set(cuenta, lista);
  }

  const candidatos: ClienteCandidato[] = [];

  for (const [cuenta, compras] of comprasPorCuenta) {
    const cliente = clienteByCuenta.get(cuenta);

    // Compra representativa: la válida más antigua; si ninguna es válida, la primera.
    const validasOrdenadas = compras
      .filter((c) => isVentaFechaConfiable(c.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const representativa = validasOrdenadas[0] ?? compras[0];

    const codigosDistintos = new Set(compras.map((c) => c.codigoUnico));
    const vehiculos = [...codigosDistintos].flatMap((cod) =>
      resolveVehiculos(cod, data),
    );
    const vehiculosUnicos = [...new Set(vehiculos)];

    // Recambios (tapa) y modelos de equivalencia para los códigos comprados.
    const tapasSugeridas = new Set<string>();
    const modelosEquivalencia = new Set<string>();
    for (const cod of codigosDistintos) {
      const obj = objetivoPorCodigo.get(cod);
      if (!obj) continue;
      obj.tapas.forEach((t) => tapasSugeridas.add(t));
      obj.modelos.forEach((m) => modelosEquivalencia.add(m));
    }

    // Mejor confianza entre las compras del cliente.
    const confianzaMatch: ConfianzaMatch = compras.some((c) => c.confianza === "Alta")
      ? "Alta"
      : "Media";

    const email = cliente?.email?.trim() ? cliente.email.trim() : null;
    const telefono = cliente?.telefono?.trim() ? cliente.telefono.trim() : null;
    const localidad = cliente?.localidad?.trim() ? cliente.localidad.trim() : null;
    const razonSocial = cliente?.razonSocial?.trim()
      ? cliente.razonSocial.trim()
      : cuenta;
    const nombreFantasia = cliente?.nombreFantasia?.trim() ?? "";
    const clienteDisplay = nombreFantasia || razonSocial;

    const fechaConfiable = isVentaFechaConfiable(representativa.fecha);
    const antiguedadMeses = mesesEntre(representativa.fecha, ahora);
    const multiplesCompras = compras.length > 1;
    const vehiculoIdentificado = vehiculosUnicos.length > 0;

    const observaciones: string[] = [];
    if (!email) observaciones.push("Sin email");
    if (!telefono) observaciones.push("Sin teléfono");
    if (!cliente) observaciones.push("Cliente no encontrado en listado de cuentas");
    if (!vehiculoIdentificado) observaciones.push("Vehículo no identificado");
    if (!fechaConfiable) observaciones.push("Fecha no confiable");
    if (confianzaMatch === "Media") observaciones.push("Revisar match (por descripción)");
    if (antiguedadMeses !== null && antiguedadMeses < COMPRA_RECIENTE_MESES) {
      observaciones.push("Compra reciente");
    }
    if (multiplesCompras) observaciones.push("Cliente con múltiples compras detectadas");

    let accionSugerida: string;
    if (!email) {
      accionSugerida = "Completar email antes de enviar";
    } else if (!vehiculoIdentificado) {
      accionSugerida = "Revisar vehículo/modelo";
    } else if (confianzaMatch === "Media") {
      accionSugerida = "Match ambiguo, revisar antes de contactar";
    } else if (antiguedadMeses !== null && antiguedadMeses < COMPRA_RECIENTE_MESES) {
      accionSugerida = "Compra muy reciente, excluir o revisar";
    } else if (multiplesCompras) {
      accionSugerida = "Cliente con varias compras, priorizar contacto";
    } else if (!telefono) {
      accionSugerida = "Revisar teléfono";
    } else {
      accionSugerida = "Cliente apto para campaña";
    }

    candidatos.push({
      numeroCuenta: cuenta,
      cliente: clienteDisplay,
      razonSocial,
      email,
      telefono,
      localidad,
      vendedor: cliente?.vendedor?.trim() ? cliente.vendedor.trim() : null,
      articuloComprado: representativa.descripcion,
      codigoArticulo: representativa.codigoUnico,
      fechaCompra: representativa.fecha,
      fechaCompraDisplay: formatVentaFechaDisplay(representativa.fecha),
      fechaConfiable,
      antiguedadMeses,
      comprobante: representativa.comprobante,
      vehiculos: vehiculosUnicos,
      vehiculoIdentificado,
      confianzaMatch,
      comprasTotales: compras.length,
      articulosDistintos: codigosDistintos.size,
      multiplesCompras,
      accionSugerida,
      observaciones,
      codigoTapaSugerido:
        tapasSugeridas.size > 0 ? [...tapasSugeridas].join(" | ") : null,
      modeloEquivalencia:
        modelosEquivalencia.size > 0 ? [...modelosEquivalencia].join(" | ") : null,
    });
  }

  // Orden: aptos primero (con email), luego por antigüedad descendente.
  return candidatos.sort((a, b) => {
    if (Boolean(a.email) !== Boolean(b.email)) return a.email ? -1 : 1;
    return (b.antiguedadMeses ?? -1) - (a.antiguedadMeses ?? -1);
  });
}

export function buildQualitySummary(
  validados: CampaignArticuloValidado[],
  candidatos: ClienteCandidato[],
): CampaignQualitySummary {
  const articulosValidados = validados.filter(
    (a) => a.estado === "validado_codigo" || a.estado === "validado_descripcion",
  ).length;

  const ventasEncontradas = candidatos.reduce((acc, c) => acc + c.comprasTotales, 0);

  return {
    articulosImportados: validados.length,
    articulosValidados,
    articulosAmbiguos: validados.filter((a) => a.estado === "ambiguo").length,
    articulosNoEncontrados: validados.filter((a) => a.estado === "no_encontrado").length,
    articulosIncompletos: validados.filter((a) => a.estado === "incompleto").length,
    ventasEncontradas,
    clientesUnicos: candidatos.length,
    clientesConEmail: candidatos.filter((c) => c.email).length,
    clientesConTelefono: candidatos.filter((c) => c.telefono).length,
    clientesSinContacto: candidatos.filter((c) => !c.email && !c.telefono).length,
    clientesConVehiculo: candidatos.filter((c) => c.vehiculoIdentificado).length,
    filasRevisionPendiente: candidatos.filter(
      (c) =>
        c.confianzaMatch === "Media" ||
        !c.fechaConfiable ||
        !c.vehiculoIdentificado,
    ).length,
  };
}

export function applyFiltros(
  candidatos: ClienteCandidato[],
  filtros: CampaignFiltros,
): ClienteCandidato[] {
  return candidatos.filter((c) => {
    if (filtros.soloConEmail && !c.email) return false;
    if (filtros.soloConTelefono && !c.telefono) return false;
    if (filtros.ocultarSinContacto && !c.email && !c.telefono) return false;
    if (filtros.localidad && c.localidad !== filtros.localidad) return false;
    if (filtros.confianza && c.confianzaMatch !== filtros.confianza) return false;
    if (
      filtros.excluirComprasRecientes &&
      c.antiguedadMeses !== null &&
      c.antiguedadMeses < filtros.antiguedadMinMeses
    ) {
      return false;
    }
    return true;
  });
}

export function getLocalidadesDisponibles(candidatos: ClienteCandidato[]): string[] {
  const set = new Set<string>();
  for (const c of candidatos) {
    if (c.localidad) set.add(c.localidad);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

// --- Presets de campaña -------------------------------------------------------

/** Carga de artículos objetivo desde el catálogo activo por patrón de texto. */
export type CampaignPresetCatalogo = {
  label: string;
  descripcion: string;
  /** Subcadena a buscar (normalizada) en descripción, categoría o rubro. */
  patron: string;
};

/** Kit de copy comercial para la preparación final de envío. */
export type CampaignEmailKit = {
  subjects: string[];
  body: string;
  variables: string[];
  exportPrefix: string;
};

/**
 * Importador específico de un preset: interpreta un Excel con columnas propias
 * (ej. equivalencia lona/tapa/modelo) en vez del mapeo genérico.
 */
export type CampaignImporter = {
  sectionTitle: string;
  helpText: string;
  codigoLabel: string;
  recambioLabel: string;
  modeloLabel: string;
  codigoAliases: string[];
  recambioAliases: string[];
  modeloAliases: string[];
  expectedColumns: string[];
};

// --- Chequeo de coincidencia contra ventas reales ----------------------------

export type CodigoEncontrado = {
  codigoLona: string;
  codigoTapa: string;
  modelo: string;
  ventas: number;
  clientesUnicos: number;
  ultimaVenta: string | null;
  ejemploCliente: string | null;
};

export type CodigoNoEncontrado = {
  codigoLona: string;
  codigoTapa: string;
  modelo: string;
  observacion: string;
  posibleCoincidencia: string | null;
};

export type ChequeoEstado = "bueno" | "parcial" | "bajo" | "no_viable";

export type ChequeoCoincidencia = {
  codigosLonaUnicos: number;
  codigosEncontrados: number;
  codigosNoEncontrados: number;
  coberturaPct: number;
  lineasCoincidentes: number;
  clientesPotenciales: number;
  ventasConCuentaValida: number;
  ventasSinCuenta: number;
  ventasCuentaInexistente: number;
  cruceCuentasPct: number;
  encontrados: CodigoEncontrado[];
  noEncontrados: CodigoNoEncontrado[];
  estado: ChequeoEstado;
};

/** Clave laxa para detectar "posible coincidencia" por formato (no se usa para la campaña). */
function looseCodeKey(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Compara los CODIGO LONA del Excel contra los códigos vendidos en el dataset
 * activo (ventas reales de Supabase) y cruza las cuentas contra clientes.
 * Solo diagnóstico: el matching difuso se reporta como "posible coincidencia".
 */
export function chequearCoincidencia(
  articulos: CampaignArticuloInput[],
  data: ActivePickupData,
): ChequeoCoincidencia {
  type LonaAgg = { original: string; tapas: Set<string>; modelos: Set<string> };
  const lonaPorCodigo = new Map<string, LonaAgg>();
  for (const a of articulos) {
    const raw = a.codigo.trim();
    if (!raw) continue;
    const key = normalizeCodigoUnico(raw) ?? raw.toUpperCase();
    const agg = lonaPorCodigo.get(key) ?? {
      original: raw,
      tapas: new Set<string>(),
      modelos: new Set<string>(),
    };
    if (a.codigoTapa?.trim()) agg.tapas.add(a.codigoTapa.trim());
    if (a.modelo.trim()) agg.modelos.add(a.modelo.trim());
    lonaPorCodigo.set(key, agg);
  }

  const ventaById = new Map(data.ventas.map((v) => [v.id, v]));
  const clienteByCuenta = new Map(data.clientes.map((c) => [c.numeroCuenta, c]));

  type VentaStat = {
    lineas: number;
    clientes: Set<string>;
    ultima: string | null;
    ejemplo: string | null;
  };
  const statsPorCodigo = new Map<string, VentaStat>();
  const looseVentas = new Map<string, string>();

  let ventasConCuentaValida = 0;
  let ventasSinCuenta = 0;
  let ventasCuentaInexistente = 0;

  for (const item of data.ventaItems) {
    const code = item.codigoUnico; // ya normalizado al importar
    if (code) {
      const lk = looseCodeKey(code);
      if (!looseVentas.has(lk)) looseVentas.set(lk, code);
    }

    const venta = ventaById.get(item.ventaId);
    const cuenta = venta?.numeroCuenta ?? "";
    if (!cuenta) ventasSinCuenta += 1;
    else if (clienteByCuenta.has(cuenta)) ventasConCuentaValida += 1;
    else ventasCuentaInexistente += 1;

    if (!lonaPorCodigo.has(code)) continue;
    const stat =
      statsPorCodigo.get(code) ??
      { lineas: 0, clientes: new Set<string>(), ultima: null, ejemplo: null };
    stat.lineas += 1;
    if (cuenta) {
      stat.clientes.add(cuenta);
      if (!stat.ejemplo) {
        const cli = clienteByCuenta.get(cuenta);
        stat.ejemplo =
          cli?.razonSocial?.trim() || cli?.nombreFantasia?.trim() || cuenta;
      }
    }
    if (venta && isVentaFechaConfiable(venta.fecha)) {
      if (!stat.ultima || venta.fecha > stat.ultima) stat.ultima = venta.fecha;
    }
    statsPorCodigo.set(code, stat);
  }

  const encontrados: CodigoEncontrado[] = [];
  const noEncontrados: CodigoNoEncontrado[] = [];
  const clientesPotenciales = new Set<string>();

  for (const [key, agg] of lonaPorCodigo) {
    const tapa = [...agg.tapas].join(" | ");
    const modelo = [...agg.modelos].join(" | ");
    const stat = statsPorCodigo.get(key);
    if (stat) {
      stat.clientes.forEach((c) => clientesPotenciales.add(c));
      encontrados.push({
        codigoLona: agg.original,
        codigoTapa: tapa,
        modelo,
        ventas: stat.lineas,
        clientesUnicos: stat.clientes.size,
        ultimaVenta: stat.ultima,
        ejemploCliente: stat.ejemplo,
      });
    } else {
      const posible = looseVentas.get(looseCodeKey(key)) ?? null;
      noEncontrados.push({
        codigoLona: agg.original,
        codigoTapa: tapa,
        modelo,
        observacion: posible
          ? "Posible coincidencia por formato (revisar, no se usa automáticamente)"
          : "No aparece en ventas importadas",
        posibleCoincidencia: posible,
      });
    }
  }

  encontrados.sort((a, b) => b.ventas - a.ventas);

  const codigosLonaUnicos = lonaPorCodigo.size;
  const codigosEncontrados = encontrados.length;
  const coberturaPct =
    codigosLonaUnicos > 0
      ? Math.round((codigosEncontrados / codigosLonaUnicos) * 100)
      : 0;
  const lineasCoincidentes = encontrados.reduce((s, e) => s + e.ventas, 0);
  const totalLineas =
    ventasConCuentaValida + ventasSinCuenta + ventasCuentaInexistente;
  const cruceCuentasPct =
    totalLineas > 0 ? Math.round((ventasConCuentaValida / totalLineas) * 100) : 0;

  let estado: ChequeoEstado;
  if (codigosEncontrados === 0) estado = "no_viable";
  else if (coberturaPct < 20) estado = "bajo";
  else if (cruceCuentasPct < 60) estado = "parcial";
  else estado = "bueno";

  return {
    codigosLonaUnicos,
    codigosEncontrados,
    codigosNoEncontrados: noEncontrados.length,
    coberturaPct,
    lineasCoincidentes,
    clientesPotenciales: clientesPotenciales.size,
    ventasConCuentaValida,
    ventasSinCuenta,
    ventasCuentaInexistente,
    cruceCuentasPct,
    encontrados,
    noEncontrados,
    estado,
  };
}

export type ImporterResumen = {
  filasLeidas: number;
  codigosLonaValidos: number;
  filasSinCodigoLona: number;
  codigosTapaSugeridos: number;
  modelosDetectados: number;
};

/** Resumen de lo interpretado del Excel (para mostrar bajo el importador). */
export function resumenImporter(articulos: CampaignArticuloInput[]): ImporterResumen {
  const lonas = new Set<string>();
  const tapas = new Set<string>();
  const modelos = new Set<string>();
  let sinLona = 0;
  for (const a of articulos) {
    const cod = a.codigo.trim();
    if (cod) lonas.add(cod.toLowerCase());
    else sinLona += 1;
    if (a.codigoTapa?.trim()) tapas.add(a.codigoTapa.trim().toLowerCase());
    if (a.modelo.trim()) modelos.add(a.modelo.trim().toLowerCase());
  }
  return {
    filasLeidas: articulos.length,
    codigosLonaValidos: lonas.size,
    filasSinCodigoLona: sinLona,
    codigosTapaSugeridos: tapas.size,
    modelosDetectados: modelos.size,
  };
}

/** Códigos de lona que aparecen en más de una fila (equivalencias múltiples). */
export function codigosLonaDuplicados(articulos: CampaignArticuloInput[]): Set<string> {
  const conteo = new Map<string, number>();
  for (const a of articulos) {
    const cod = a.codigo.trim().toLowerCase();
    if (cod) conteo.set(cod, (conteo.get(cod) ?? 0) + 1);
  }
  const dup = new Set<string>();
  for (const [cod, n] of conteo) {
    if (n > 1) dup.add(cod);
  }
  return dup;
}

/** Mapea filas crudas usando el importador del preset (código/recambio/modelo). */
export function parseArticulosConImporter(
  rows: Record<string, unknown>[],
  importer: CampaignImporter,
): CampaignArticuloInput[] {
  const codigoAliases = importer.codigoAliases as ColumnAliases;
  const recambioAliases = importer.recambioAliases as ColumnAliases;
  const modeloAliases = importer.modeloAliases as ColumnAliases;
  const result: CampaignArticuloInput[] = [];
  rows.forEach((row, index) => {
    const codigo = normalizeText(pickRowValue(row, codigoAliases)) ?? "";
    const codigoTapa = normalizeText(pickRowValue(row, recambioAliases)) ?? "";
    const modelo = normalizeText(pickRowValue(row, modeloAliases)) ?? "";
    // Saltear filas totalmente vacías; conservar el resto (sin dedup).
    if (!codigo && !codigoTapa && !modelo) return;
    result.push({
      id: `eq-${index}`,
      codigo,
      descripcion: "",
      categoria: "",
      marca: "",
      modelo,
      observaciones: "",
      codigoTapa,
    });
  });
  return result;
}

/** Preconfiguración reusable de una campaña concreta sobre el módulo genérico. */
export type CampaignPreset = {
  /** Identificador estable del preset (se persiste en la campaña). */
  id: string;
  meta: CampaignMeta;
  catalogo?: CampaignPresetCatalogo;
  filtros?: Partial<CampaignFiltros>;
  /** Si está presente, habilita la sección "Segmentación final para envío". */
  emailKit?: CampaignEmailKit;
  /** Si está presente, interpreta el Excel con columnas propias del preset. */
  importer?: CampaignImporter;
};

/**
 * Preselecciona artículos del catálogo activo cuya descripción, categoría o
 * rubro contengan el patrón. Devuelve filas listas para la tabla editable; al
 * traer el `codigoUnico` real, validan automáticamente "por código".
 */
export function seleccionarArticulosDelCatalogo(
  data: ActivePickupData,
  patron: string,
): CampaignArticuloInput[] {
  const needle = normalizeSearchText(patron);
  if (!needle) return [];
  const result: CampaignArticuloInput[] = [];
  data.articulos.forEach((art, index) => {
    const desc = normalizeSearchText(art.descripcion ?? "");
    const cat = normalizeSearchText(art.categoria ?? "");
    const rub = normalizeSearchText(art.rubro ?? "");
    if (desc.includes(needle) || cat.includes(needle) || rub.includes(needle)) {
      result.push({
        id: `cat-${index}`,
        codigo: art.codigoUnico,
        descripcion: art.descripcion ?? "",
        categoria: art.categoria ?? "",
        marca: "",
        modelo: "",
        observaciones: "Precargado del catálogo",
      });
    }
  });
  return result;
}

/** Copy comercial para la campaña de renovación de lonas. */
export const LONAS_EMAIL_KIT: CampaignEmailKit = {
  subjects: [
    "Renová la lona de tu camioneta con Pickup 4x4",
    "Tomamos tu lona usada como parte de pago",
    "Una nueva lona para tu camioneta, con beneficio especial",
  ],
  body: `Hola {{nombre_cliente}},

En Pickup 4x4 queremos ayudarte a renovar la lona de tu camioneta.

Según nuestros registros, en su momento adquiriste una lona con nosotros. Por eso, queremos ofrecerte una propuesta especial:

tomamos tu lona usada como parte de pago y podés acceder a una lona nueva para tu camioneta.

Si querés, podemos revisar el modelo compatible y pasarte una propuesta personalizada.

Respondé este mail o comunicate con nosotros para coordinar.

Equipo Pickup 4x4`,
  variables: [
    "{{nombre_cliente}}",
    "{{email}}",
    "{{telefono}}",
    "{{localidad}}",
    "{{articulo_comprado}}",
    "{{codigo_articulo}}",
    "{{fecha_compra}}",
    "{{antiguedad_meses}}",
    "{{vehiculo_compatible}}",
  ],
  exportPrefix: "pickup4x4-renovacion-lonas",
};

/** Caso concreto: campaña "Renovación de lonas" (002), reusa el módulo genérico. */
export const LONAS_PRESET: CampaignPreset = {
  id: "lonas",
  meta: {
    nombre: "Renovación de lonas",
    descripcion:
      "Clientes que compraron lonas: ofrecer una lona nueva tomando la usada como parte de pago.",
    tipo: "renovacion",
  },
  catalogo: {
    label: "Cargar lonas del catálogo",
    descripcion:
      "Busca en el catálogo activo los artículos cuya descripción, categoría o rubro contengan «lona», y los carga como artículos objetivo.",
    patron: "lona",
  },
  filtros: { antiguedadMinMeses: 18 },
  emailKit: LONAS_EMAIL_KIT,
  importer: {
    sectionTitle: "Artículos interpretados para la campaña",
    helpText:
      "Revisá que el código de lona sea el producto histórico que se quiere buscar en ventas. El código de tapa es el producto sugerido para ofrecer como recambio.",
    codigoLabel: "Código lona vendido",
    recambioLabel: "Código tapa sugerido",
    modeloLabel: "Modelo / camioneta",
    codigoAliases: [
      "CODIGO LONA",
      "Codigo Lona",
      "Código Lona",
      "CÓDIGO LONA",
      "Cod Lona",
      "Cod. Lona",
    ],
    recambioAliases: [
      "CODIGO TAPA",
      "Codigo Tapa",
      "Código Tapa",
      "CÓDIGO TAPA",
      "Cod Tapa",
      "Cod. Tapa",
    ],
    modeloAliases: [
      "MODELO",
      "Modelo",
      "Modelo Vehiculo",
      "Modelo Vehículo",
      "Camioneta",
    ],
    expectedColumns: [
      "CODIGO LONA (histórico a buscar en ventas)",
      "CODIGO TAPA (recambio sugerido)",
      "MODELO (camioneta compatible)",
    ],
  },
};

// --- Segmentación final para envío --------------------------------------------

export type SegmentacionResultado = {
  email: ClienteCandidato[];
  whatsapp: ClienteCandidato[];
  revisar: ClienteCandidato[];
  excluir: ClienteCandidato[];
};

/** Un candidato necesita revisión humana antes de contactarlo. */
export function necesitaRevision(
  c: ClienteCandidato,
  antiguedadMinMeses: number,
): boolean {
  return (
    c.confianzaMatch === "Media" ||
    !c.vehiculoIdentificado ||
    !c.fechaConfiable ||
    (c.antiguedadMeses !== null && c.antiguedadMeses < antiguedadMinMeses)
  );
}

/**
 * Separa candidatos en grupos accionables. Cada cliente cae en exactamente uno:
 * sin contacto → excluir; con flag de revisión → revisar; con email → email;
 * sin email pero con teléfono → whatsapp.
 */
export function segmentarCandidatos(
  candidatos: ClienteCandidato[],
  antiguedadMinMeses: number,
): SegmentacionResultado {
  const r: SegmentacionResultado = { email: [], whatsapp: [], revisar: [], excluir: [] };
  for (const c of candidatos) {
    const tieneEmail = Boolean(c.email);
    const tieneTelefono = Boolean(c.telefono);
    if (!tieneEmail && !tieneTelefono) {
      r.excluir.push(c);
      continue;
    }
    if (necesitaRevision(c, antiguedadMinMeses)) {
      r.revisar.push(c);
      continue;
    }
    if (tieneEmail) {
      r.email.push(c);
      continue;
    }
    r.whatsapp.push(c);
  }
  return r;
}

export type VariableDisponibilidad = {
  variable: string;
  disponibles: number;
  total: number;
  porcentaje: number;
  baja: boolean;
};

/** Disponibilidad de cada variable de copy en los resultados (para advertir). */
export function calcularDisponibilidadVariables(
  candidatos: ClienteCandidato[],
): VariableDisponibilidad[] {
  const total = candidatos.length;
  const checks: { variable: string; has: (c: ClienteCandidato) => boolean }[] = [
    { variable: "{{nombre_cliente}}", has: (c) => Boolean(c.cliente) },
    { variable: "{{email}}", has: (c) => Boolean(c.email) },
    { variable: "{{telefono}}", has: (c) => Boolean(c.telefono) },
    { variable: "{{localidad}}", has: (c) => Boolean(c.localidad) },
    { variable: "{{articulo_comprado}}", has: (c) => Boolean(c.articuloComprado) },
    { variable: "{{codigo_articulo}}", has: (c) => Boolean(c.codigoArticulo) },
    { variable: "{{fecha_compra}}", has: (c) => c.fechaConfiable },
    { variable: "{{antiguedad_meses}}", has: (c) => c.antiguedadMeses !== null },
    { variable: "{{vehiculo_compatible}}", has: (c) => c.vehiculoIdentificado },
  ];
  return checks.map(({ variable, has }) => {
    const disponibles = candidatos.filter(has).length;
    const porcentaje = total > 0 ? Math.round((disponibles / total) * 100) : 0;
    return { variable, disponibles, total, porcentaje, baja: total > 0 && porcentaje < 60 };
  });
}

// --- Cobertura del Diario de Ventas ------------------------------------------

/** Cantidad de meses (inclusivos) entre dos fechas ISO `YYYY-MM-DD`. */
function mesesInclusive(min: string, max: string): number {
  const [y1, m1] = min.split("-").map(Number);
  const [y2, m2] = max.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/** Resumen del período y volumen del Diario de Ventas importado. */
export type CoberturaVentas = {
  ventasCargadas: number;
  lineasVenta: number;
  ventasConFecha: number;
  ventasSinFecha: number;
  fechaMin: string | null;
  fechaMax: string | null;
  mesesCubiertos: number | null;
  periodoCorto: boolean;
};

/**
 * Analiza el Diario de Ventas del dataset activo: período cubierto (fechas
 * confiables), volumen de ventas/líneas y si el período es corto para una
 * campaña real. Es agnóstico de la campaña; solo lee `data.ventas`.
 */
export function analizarCoberturaVentas(data: ActivePickupData): CoberturaVentas {
  let fechaMin: string | null = null;
  let fechaMax: string | null = null;
  let conFecha = 0;
  for (const v of data.ventas) {
    if (!isVentaFechaConfiable(v.fecha)) continue;
    conFecha += 1;
    if (!fechaMin || v.fecha < fechaMin) fechaMin = v.fecha;
    if (!fechaMax || v.fecha > fechaMax) fechaMax = v.fecha;
  }
  const mesesCubiertos =
    fechaMin && fechaMax ? mesesInclusive(fechaMin, fechaMax) : null;
  return {
    ventasCargadas: data.ventas.length,
    lineasVenta: data.ventaItems.length,
    ventasConFecha: conFecha,
    ventasSinFecha: data.ventas.length - conFecha,
    fechaMin,
    fechaMax,
    mesesCubiertos,
    periodoCorto:
      mesesCubiertos !== null && mesesCubiertos < PERIODO_VENTAS_CORTO_MESES,
  };
}

// --- Contactabilidad y casos a revisar ---------------------------------------

/** Indicadores de contactabilidad de los clientes detectados. */
export type Contactabilidad = {
  detectados: number;
  conEmail: number;
  conTelefono: number;
  sinContacto: number;
  porcentajeContactable: number;
  aptosEmail: number;
  aptosWhatsapp: number;
  casosARevisar: number;
};

/**
 * Calcula contactabilidad combinando los candidatos con la segmentación final
 * (aptos para email / WhatsApp) y los casos que requieren revisión humana.
 */
export function calcularContactabilidad(
  candidatos: ClienteCandidato[],
  segmentacion: SegmentacionResultado,
): Contactabilidad {
  const detectados = candidatos.length;
  const conEmail = candidatos.filter((c) => c.email).length;
  const conTelefono = candidatos.filter((c) => c.telefono).length;
  const sinContacto = candidatos.filter((c) => !c.email && !c.telefono).length;
  const contactables = detectados - sinContacto;
  return {
    detectados,
    conEmail,
    conTelefono,
    sinContacto,
    porcentajeContactable:
      detectados > 0 ? Math.round((contactables / detectados) * 100) : 0,
    aptosEmail: segmentacion.email.length,
    aptosWhatsapp: segmentacion.whatsapp.length,
    casosARevisar: segmentacion.revisar.length,
  };
}

/**
 * Motivos por los que un cliente debe revisarse antes de contactarlo. Lista
 * vacía = sin observaciones bloqueantes.
 */
export function motivosRevision(
  c: ClienteCandidato,
  antiguedadMinMeses: number,
): string[] {
  const m: string[] = [];
  if (!c.email && !c.telefono) m.push("Sin contacto");
  if (c.confianzaMatch === "Media") m.push("Match ambiguo");
  if (!c.vehiculoIdentificado) m.push("Vehículo/modelo ambiguo");
  if (!c.fechaConfiable) m.push("Fecha no confiable");
  if (c.antiguedadMeses !== null && c.antiguedadMeses < antiguedadMinMeses) {
    m.push("Compra muy reciente");
  }
  return m;
}

// --- Estado real de la campaña (diagnóstico para usuario no técnico) ----------

export type EstadoRealCaso =
  | "sin_contacto"
  | "pocos_compradores"
  | "lista";

export type EstadoRealCampaña = {
  caso: EstadoRealCaso;
  titulo: string;
  texto: string;
};

/**
 * Resume en lenguaje no técnico qué falta para enviar la campaña.
 * Prioridad: si hay clientes contactables → lista; si hay compradores pero
 * ninguno contactable → falta completar contacto; si no hay compradores
 * (o muy pocos) → falta importar más Diario de Ventas.
 */
export function evaluarEstadoReal(
  candidatos: ClienteCandidato[],
  segmentacion: SegmentacionResultado,
): EstadoRealCampaña {
  const aptos = segmentacion.email.length + segmentacion.whatsapp.length;
  if (aptos > 0) {
    return {
      caso: "lista",
      titulo: "Estado real de la campaña",
      texto:
        "Hay clientes con contacto suficiente. Podés exportar listos para email o WhatsApp y revisar los casos pendientes antes del envío.",
    };
  }
  if (candidatos.length > 0) {
    return {
      caso: "sin_contacto",
      titulo: "Estado real de la campaña",
      texto:
        "Se encontraron compradores reales, pero todavía no hay datos de contacto suficientes para enviar la campaña. El próximo paso es completar email o teléfono de esos clientes, o importar una base de clientes con datos de contacto más completa.",
    };
  }
  return {
    caso: "pocos_compradores",
    titulo: "Estado real de la campaña",
    texto:
      "Se encontraron pocos compradores porque el Diario de Ventas importado cubre un período corto. Para ampliar la campaña, importá más meses de ventas.",
  };
}
