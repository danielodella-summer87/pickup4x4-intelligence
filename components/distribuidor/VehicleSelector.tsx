"use client";

import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";

const selectClass =
  "min-h-[3.25rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50";

type VehicleSelectorProps = {
  marcas: VehiculoMarca[];
  modelos: VehiculoModelo[];
  marcaId: string | null;
  modeloId: string | null;
  onMarcaChange: (marcaId: string) => void;
  onModeloChange: (modeloId: string) => void;
};

export function VehicleSelector({
  marcas,
  modelos,
  marcaId,
  modeloId,
  onMarcaChange,
  onModeloChange,
}: VehicleSelectorProps) {
  const modeloDeshabilitado = !marcaId;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          Marca del vehículo
        </span>
        {marcas.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay marcas con aplicaciones cargadas. Importá el catálogo en Importar
            datos.
          </p>
        ) : (
          <select
            value={marcaId ?? ""}
            onChange={(e) => onMarcaChange(e.target.value)}
            className={selectClass}
            aria-label="Marca del vehículo"
          >
            <option value="">Elegí una marca…</option>
            {marcas.map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          Modelo del vehículo
        </span>
        <select
          value={modeloId ?? ""}
          onChange={(e) => onModeloChange(e.target.value)}
          disabled={modeloDeshabilitado}
          className={selectClass}
          aria-label="Modelo del vehículo"
        >
          <option value="">
            {modeloDeshabilitado
              ? "Primero elegí una marca"
              : modelos.length === 0
                ? "Sin modelos para esta marca"
                : "Elegí un modelo…"}
          </option>
          {modelos.map((modelo) => (
            <option key={modelo.id} value={modelo.id}>
              {modelo.nombre}
            </option>
          ))}
        </select>
        {marcaId && modelos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Esta marca no tiene modelos con accesorios cargados.
          </p>
        ) : null}
      </label>
    </div>
  );
}
