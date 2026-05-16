/** Estado comercial de la cuenta (derivado o normalizado post-importación). */
export type ClienteEstado =
  | "activo"
  | "inactivo"
  | "dormido"
  | "en_seguimiento";

/**
 * Cuenta / cliente del listado de cuentas (Excel KORE).
 * Clave de relación: `numeroCuenta`.
 */
export interface Cliente {
  numeroCuenta: string;
  razonSocial: string;
  nombreFantasia?: string;
  zona: string;
  vendedor: string;
  estado: ClienteEstado;
  cuit?: string;
  localidad?: string;
  provincia?: string;
  email?: string;
  telefono?: string;
}
