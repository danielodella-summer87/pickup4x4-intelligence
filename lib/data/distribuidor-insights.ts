import {
  mockPickupDataToActive,
  type ActivePickupData,
} from "@/lib/data/pickup-data";
import type { Articulo } from "@/lib/models/articulo";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";

type PickupData = ActivePickupData;

const defaultPickupData = mockPickupDataToActive();

const DESCRIPCIONES_NO_USABLES = new Set([
  "",
  "articulo sin descripcion",
  "sin descripcion",
  "sin descripción",
  "n/a",
  "na",
  "s/d",
]);

/** Apariciones mínimas en ventas para badge de alta rotación. */
const ALTA_ROTACION_MIN_VENTAS = 3;

/** Aplicaciones totales para considerar un artículo "universal". */
const UNIVERSAL_MIN_APLICACIONES = 6;

/** Modelos distintos para badge universal (además del umbral de aplicaciones). */
const UNIVERSAL_MIN_MODELOS = 4;

export type ArticuloMostrador = {
  codigoUnico: string;
  descripcion: string;
  rubro: string;
  categoria: string;
  cantidadAplicacionesVehiculo: number;
  cantidadAplicacionesTotal: number;
  esAltaRotacion: boolean;
  esUniversal: boolean;
  /** Alguna aplicación para este vehículo tiene confianza media (revisión). */
  requiereRevisionAplicacion: boolean;
};

export type FiltrosMostrador = {
  busqueda?: string;
  categoria?: string;
  rubro?: string;
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function isDescripcionUsable(descripcion: string | undefined | null): boolean {
  if (!descripcion?.trim()) return false;
  return !DESCRIPCIONES_NO_USABLES.has(normalizeKey(descripcion));
}

function buildArticuloMap(data: PickupData) {
  return new Map(data.articulos.map((a) => [a.codigoUnico, a]));
}

function buildModeloIdsValidos(data: PickupData): Set<string> {
  return new Set(data.vehiculoModelos.map((m) => m.id));
}

function getAplicacionesValidas(data: PickupData) {
  const modelosValidos = buildModeloIdsValidos(data);
  return data.articuloAplicaciones.filter((ap) => modelosValidos.has(ap.modeloId));
}

function contarVentasPorCodigo(data: PickupData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of data.ventaItems) {
    counts.set(item.codigoUnico, (counts.get(item.codigoUnico) ?? 0) + 1);
  }
  return counts;
}

function contarAplicacionesTotales(data: PickupData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ap of getAplicacionesValidas(data)) {
    counts.set(ap.codigoUnico, (counts.get(ap.codigoUnico) ?? 0) + 1);
  }
  return counts;
}

function contarModelosDistintosPorCodigo(data: PickupData): Map<string, number> {
  const modelosPorCodigo = new Map<string, Set<string>>();
  for (const ap of getAplicacionesValidas(data)) {
    const set = modelosPorCodigo.get(ap.codigoUnico) ?? new Set<string>();
    set.add(ap.modeloId);
    modelosPorCodigo.set(ap.codigoUnico, set);
  }
  const result = new Map<string, number>();
  for (const [codigo, set] of modelosPorCodigo.entries()) {
    result.set(codigo, set.size);
  }
  return result;
}

export function getArticulosAltaRotacion(
  data: PickupData = defaultPickupData,
): Set<string> {
  const ventas = contarVentasPorCodigo(data);
  const alta = new Set<string>();

  const valores = [...ventas.values()].sort((a, b) => b - a);
  const umbralDinamico =
    valores.length > 0
      ? Math.max(
          ALTA_ROTACION_MIN_VENTAS,
          valores[Math.min(Math.floor(valores.length * 0.15), valores.length - 1)] ??
            ALTA_ROTACION_MIN_VENTAS,
        )
      : ALTA_ROTACION_MIN_VENTAS;

  for (const [codigo, count] of ventas.entries()) {
    if (count >= umbralDinamico) {
      alta.add(codigo);
    }
  }

  return alta;
}

function esArticuloUniversal(
  codigoUnico: string,
  aplicacionesTotales: Map<string, number>,
  modelosDistintos: Map<string, number>,
): boolean {
  const apps = aplicacionesTotales.get(codigoUnico) ?? 0;
  const modelos = modelosDistintos.get(codigoUnico) ?? 0;
  return apps >= UNIVERSAL_MIN_APLICACIONES && modelos >= UNIVERSAL_MIN_MODELOS;
}

function toArticuloMostrador(
  articulo: Articulo,
  cantidadVehiculo: number,
  aplicacionesTotales: Map<string, number>,
  modelosDistintos: Map<string, number>,
  altaRotacion: Set<string>,
  requiereRevisionAplicacion: boolean,
): ArticuloMostrador | null {
  if (!isDescripcionUsable(articulo.descripcion)) return null;
  if (!articulo.activo) return null;

  const codigo = articulo.codigoUnico;
  const totalApps = aplicacionesTotales.get(codigo) ?? 0;

  return {
    codigoUnico: codigo,
    descripcion: articulo.descripcion.trim(),
    rubro: articulo.rubro?.trim() || "Sin rubro",
    categoria: articulo.categoria?.trim() || "Sin categoría",
    cantidadAplicacionesVehiculo: cantidadVehiculo,
    cantidadAplicacionesTotal: totalApps,
    esAltaRotacion: altaRotacion.has(codigo),
    esUniversal: esArticuloUniversal(codigo, aplicacionesTotales, modelosDistintos),
    requiereRevisionAplicacion,
  };
}

export function getMarcasDisponibles(
  data: PickupData = defaultPickupData,
): VehiculoMarca[] {
  const marcaIdsConAplicacion = new Set<string>();
  const modeloPorId = new Map(data.vehiculoModelos.map((m) => [m.id, m]));

  for (const ap of getAplicacionesValidas(data)) {
    const modelo = modeloPorId.get(ap.modeloId);
    if (modelo) marcaIdsConAplicacion.add(modelo.marcaId);
  }

  return data.vehiculoMarcas
    .filter((marca) => marcaIdsConAplicacion.has(marca.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function getModelosPorMarca(
  marcaId: string,
  data: PickupData = defaultPickupData,
): VehiculoModelo[] {
  const modeloIdsConAplicacion = new Set(
    getAplicacionesValidas(data)
      .filter((ap) => {
        const modelo = data.vehiculoModelos.find((m) => m.id === ap.modeloId);
        return modelo?.marcaId === marcaId;
      })
      .map((ap) => ap.modeloId),
  );

  return data.vehiculoModelos
    .filter((m) => m.marcaId === marcaId && modeloIdsConAplicacion.has(m.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function getCategoriasDisponibles(
  articulos: ArticuloMostrador[],
): string[] {
  return [...new Set(articulos.map((a) => a.categoria))]
    .filter((c) => c !== "Sin categoría")
    .sort((a, b) => a.localeCompare(b, "es"));
}

export function getRubrosDisponibles(articulos: ArticuloMostrador[]): string[] {
  return [...new Set(articulos.map((a) => a.rubro))]
    .filter((r) => r !== "Sin rubro")
    .sort((a, b) => a.localeCompare(b, "es"));
}

function matchesBusqueda(articulo: ArticuloMostrador, busqueda: string): boolean {
  const q = normalizeKey(busqueda);
  if (!q) return true;
  return (
    normalizeKey(articulo.descripcion).includes(q) ||
    normalizeKey(articulo.codigoUnico).includes(q) ||
    normalizeKey(articulo.categoria).includes(q) ||
    normalizeKey(articulo.rubro).includes(q)
  );
}

export function getArticulosPorVehiculo(
  marcaId: string,
  modeloId: string,
  data: PickupData = defaultPickupData,
  filtros: FiltrosMostrador = {},
): ArticuloMostrador[] {
  const articuloMap = buildArticuloMap(data);
  const aplicacionesTotales = contarAplicacionesTotales(data);
  const modelosDistintos = contarModelosDistintosPorCodigo(data);
  const altaRotacion = getArticulosAltaRotacion(data);

  const porCodigo = new Map<string, number>();
  const revisionPorCodigo = new Map<string, boolean>();

  for (const ap of getAplicacionesValidas(data)) {
    if (ap.marcaId !== marcaId || ap.modeloId !== modeloId) continue;
    porCodigo.set(ap.codigoUnico, (porCodigo.get(ap.codigoUnico) ?? 0) + 1);
    if (ap.requiresReview || ap.validationStatus === "review") {
      revisionPorCodigo.set(ap.codigoUnico, true);
    }
  }

  const resultados: ArticuloMostrador[] = [];

  for (const [codigo, cantidadVehiculo] of porCodigo.entries()) {
    const articulo = articuloMap.get(codigo);
    if (!articulo) continue;

    const mostrador = toArticuloMostrador(
      articulo,
      cantidadVehiculo,
      aplicacionesTotales,
      modelosDistintos,
      altaRotacion,
      revisionPorCodigo.get(codigo) ?? false,
    );
    if (!mostrador) continue;

    if (filtros.categoria && mostrador.categoria !== filtros.categoria) continue;
    if (filtros.rubro && mostrador.rubro !== filtros.rubro) continue;
    if (filtros.busqueda && !matchesBusqueda(mostrador, filtros.busqueda)) continue;

    resultados.push(mostrador);
  }

  return resultados.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

export function getMarcaNombre(
  marcaId: string,
  data: PickupData = defaultPickupData,
): string {
  return data.vehiculoMarcas.find((m) => m.id === marcaId)?.nombre ?? "—";
}

export function getModeloNombre(
  modeloId: string,
  data: PickupData = defaultPickupData,
): string {
  return data.vehiculoModelos.find((m) => m.id === modeloId)?.nombre ?? "—";
}
