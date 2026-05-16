/** Cabecera del diario de ventas (Excel KORE). */
export type VentaTipoComprobante =
  | "factura"
  | "remito"
  | "nota_credito"
  | "otro";

/**
 * Registro de venta.
 * Relación con cliente: `numeroCuenta`.
 */
export interface Venta {
  id: string;
  numeroCuenta: string;
  fecha: string;
  tipoComprobante: VentaTipoComprobante;
  numeroComprobante: string;
  importeTotal: number;
  moneda?: "ARS";
  vendedor?: string;
}

/**
 * Línea de venta.
 * Relaciones: `ventaId` → Venta, `codigoUnico` → Articulo,
 * `codigoAplicacion` → ArticuloAplicacion (opcional, si aplica).
 */
export interface VentaItem {
  id: string;
  ventaId: string;
  codigoUnico: string;
  codigoAplicacion?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}
