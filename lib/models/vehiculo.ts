/** Marca de vehículo (catálogo normalizado). */
export interface VehiculoMarca {
  id: string;
  nombre: string;
}

/**
 * Modelo de vehículo.
 * Relación: `marcaId` → VehiculoMarca.
 */
export interface VehiculoModelo {
  id: string;
  marcaId: string;
  nombre: string;
}
