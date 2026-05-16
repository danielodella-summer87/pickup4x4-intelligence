"use client";

import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";

const touchButtonBase =
  "min-h-[3.25rem] rounded-xl border px-4 py-3 text-left text-base font-medium transition active:scale-[0.98] sm:min-h-[3.5rem]";

const touchButtonIdle =
  "border-slate-700 bg-slate-950/80 text-slate-200 hover:border-slate-500 hover:bg-slate-900";

const touchButtonActive =
  "border-emerald-500/60 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/30";

type VehicleSelectorProps = {
  marcas: VehiculoMarca[];
  modelos: VehiculoModelo[];
  marcaId: string | null;
  modeloId: string | null;
  onSelectMarca: (marcaId: string) => void;
  onSelectModelo: (modeloId: string) => void;
};

export function VehicleSelector({
  marcas,
  modelos,
  marcaId,
  modeloId,
  onSelectMarca,
  onSelectModelo,
}: VehicleSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          1. Elegí la marca
        </p>
        {marcas.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No hay marcas con aplicaciones cargadas. Importá el catálogo en
            Importar datos.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {marcas.map((marca) => (
              <button
                key={marca.id}
                type="button"
                onClick={() => onSelectMarca(marca.id)}
                className={`${touchButtonBase} ${
                  marcaId === marca.id ? touchButtonActive : touchButtonIdle
                }`}
              >
                {marca.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {marcaId ? (
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
            2. Elegí el modelo
          </p>
          {modelos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Esta marca no tiene modelos con accesorios cargados.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modelos.map((modelo) => (
                <button
                  key={modelo.id}
                  type="button"
                  onClick={() => onSelectModelo(modelo.id)}
                  className={`${touchButtonBase} ${
                    modeloId === modelo.id ? touchButtonActive : touchButtonIdle
                  }`}
                >
                  {modelo.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
