export type OportunidadTipo =
  | "cliente_dormido"
  | "venta_cruzada"
  | "producto_impulsar"
  | "recupero_cartera";

export type OportunidadPrioridad = "alta" | "media" | "baja";

/**
 * Oportunidad o alerta de inteligencia comercial (dataset mock / legacy).
 * Relación principal con cliente: `numeroCuenta`.
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

/** Tipos detectados automáticamente desde datos activos (Excel o mock). */
export type OportunidadDetectadaTipo =
  | "clientes_sin_ventas"
  | "clientes_alta_actividad"
  | "articulos_frecuentes"
  | "articulos_universales"
  | "vehiculos_alta_cobertura"
  | "vehiculos_baja_cobertura"
  | "aplicaciones_revision"
  | "ventas_sin_articulo"
  | "localidades_cartera_fuerte"
  | "localidades_cartera_debil";

export type OportunidadFuenteDatos = "excel" | "mock";

export type OportunidadEntidadTipo =
  | "cliente"
  | "articulo"
  | "vehiculo"
  | "localidad"
  | "catalogo"
  | "sistema";

export type OportunidadEntidadRelacionada = {
  tipo: OportunidadEntidadTipo;
  id?: string;
  etiqueta: string;
};

/**
 * Oportunidad comercial generada en el cliente a partir del dataset activo.
 */
export interface OportunidadDetectada {
  id: string;
  tipo: OportunidadDetectadaTipo;
  prioridad: OportunidadPrioridad;
  titulo: string;
  descripcion: string;
  recomendacion: string;
  /** Texto listo para mostrar (ej. "847 clientes"). */
  metricaPrincipal: string;
  /** Valor numérico para ordenar o filtrar. */
  metricaValor: number;
  entidad?: OportunidadEntidadRelacionada;
  /** 0–1 según solidez del dato y del patrón detectado. */
  confianza: number;
  fuenteDatos: OportunidadFuenteDatos;
}
