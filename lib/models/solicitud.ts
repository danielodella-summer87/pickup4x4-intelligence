/** Estados del mock / dataset Excel (legado). */
export type SolicitudEstado =
  | "pendiente"
  | "enviado"
  | "cerrado"
  | "cancelado";

/** Estados de solicitudes guardadas en mostrador (localStorage). */
export type SolicitudLocalEstado =
  | "nueva"
  | "en_revision"
  | "enviada"
  | "descartada";

export type SolicitudOrigen = "mostrador";

/** Ítem de una solicitud de presupuesto (legado). */
export interface SolicitudPresupuestoItem {
  codigoUnico: string;
  codigoAplicacion?: string;
  cantidad: number;
  descripcion?: string;
}

/**
 * Solicitud de presupuesto (mostrador / distribuidor) — mock y dataset.
 * Relación con cliente: `numeroCuenta`.
 */
export interface SolicitudPresupuesto {
  id: string;
  numeroCuenta: string;
  fecha: string;
  estado: SolicitudEstado;
  items: SolicitudPresupuestoItem[];
  observaciones?: string;
}

/** Artículo incluido en una solicitud local de mostrador. */
export interface SolicitudArticuloLocal {
  codigoUnico: string;
  descripcion: string;
  categoria?: string;
  rubro?: string;
}

/** Solicitud de presupuesto persistida en el navegador. */
export interface SolicitudLocal {
  id: string;
  fecha: string;
  nombre: string;
  telefono: string;
  observaciones: string;
  marcaVehiculo: string;
  modeloVehiculo: string;
  articulos: SolicitudArticuloLocal[];
  origen: SolicitudOrigen;
  estado: SolicitudLocalEstado;
}

export type CreateSolicitudInput = {
  nombre: string;
  telefono: string;
  observaciones: string;
  marcaVehiculo: string;
  modeloVehiculo: string;
  articulos: SolicitudArticuloLocal[];
  origen?: SolicitudOrigen;
};
