import type { PickupDataset } from "@/lib/excel/build-dataset";
import { mockPickupData } from "@/lib/data/mock-pickup";
import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { OportunidadComercial } from "@/lib/models/oportunidad";
import type { SolicitudPresupuesto } from "@/lib/models/solicitud";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import type { Venta, VentaItem } from "@/lib/models/venta";

/** Shape consumed by insights and module pages (mock + Excel). */
export type ActivePickupData = {
  vehiculoMarcas: VehiculoMarca[];
  vehiculoModelos: VehiculoModelo[];
  clientes: Cliente[];
  articulos: Articulo[];
  articuloAplicaciones: ArticuloAplicacion[];
  ventas: Venta[];
  ventaItems: VentaItem[];
  solicitudes: SolicitudPresupuesto[];
  oportunidades: OportunidadComercial[];
};

export function pickupDatasetToActiveData(dataset: PickupDataset): ActivePickupData {
  return {
    vehiculoMarcas: dataset.marcas,
    vehiculoModelos: dataset.modelos,
    clientes: dataset.clientes,
    articulos: dataset.articulos,
    articuloAplicaciones: dataset.aplicaciones,
    ventas: dataset.ventas,
    ventaItems: dataset.ventaItems,
    solicitudes: dataset.solicitudes,
    oportunidades: dataset.oportunidades,
  };
}

export function mockPickupDataToActive(): ActivePickupData {
  return {
    vehiculoMarcas: [...mockPickupData.vehiculoMarcas],
    vehiculoModelos: [...mockPickupData.vehiculoModelos],
    clientes: [...mockPickupData.clientes],
    articulos: [...mockPickupData.articulos],
    articuloAplicaciones: [...mockPickupData.articuloAplicaciones],
    ventas: [...mockPickupData.ventas],
    ventaItems: [...mockPickupData.ventaItems],
    solicitudes: [...mockPickupData.solicitudes],
    oportunidades: [...mockPickupData.oportunidades],
  };
}
