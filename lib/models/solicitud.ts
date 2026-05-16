export type SolicitudEstado =
  | "pendiente"
  | "enviado"
  | "cerrado"
  | "cancelado";

/** Ítem de una solicitud de presupuesto. */
export interface SolicitudPresupuestoItem {
  codigoUnico: string;
  codigoAplicacion?: string;
  cantidad: number;
  descripcion?: string;
}

/**
 * Solicitud de presupuesto (mostrador / distribuidor).
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
