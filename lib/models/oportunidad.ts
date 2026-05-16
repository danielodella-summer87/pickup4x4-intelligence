export type OportunidadTipo =
  | "cliente_dormido"
  | "venta_cruzada"
  | "producto_impulsar"
  | "recupero_cartera";

export type OportunidadPrioridad = "alta" | "media" | "baja";

/**
 * Oportunidad o alerta de inteligencia comercial.
 * Relación principal con cliente: `numeroCuenta`.
 * Opcionalmente referencia artículo / aplicación.
 */
export interface OportunidadComercial {
  id: string;
  numeroCuenta: string;
  tipo: OportunidadTipo;
  prioridad: OportunidadPrioridad;
  titulo: string;
  detalle: string;
  codigoUnico?: string;
  codigoAplicacion?: string;
  fechaDeteccion: string;
}
