"use client";

import type { ArticuloMostrador } from "@/lib/data/distribuidor-insights";

const touchInputClass =
  "min-h-[3.25rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";

export type PresupuestoFormulario = {
  nombre: string;
  telefono: string;
  observaciones: string;
};

type PresupuestoModalProps = {
  abierto: boolean;
  marcaNombre: string;
  modeloNombre: string;
  articulos: ArticuloMostrador[];
  formulario: PresupuestoFormulario;
  onCerrar: () => void;
  onChange: (formulario: PresupuestoFormulario) => void;
  onQuitarArticulo: (codigoUnico: string) => void;
};

export function PresupuestoModal({
  abierto,
  marcaNombre,
  modeloNombre,
  articulos,
  formulario,
  onCerrar,
  onChange,
  onQuitarArticulo,
}: PresupuestoModalProps) {
  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presupuesto-titulo"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="border-b border-slate-800 px-5 py-4 sm:px-6">
          <h2 id="presupuesto-titulo" className="text-lg font-semibold text-white">
            Solicitud de presupuesto
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {marcaNombre} {modeloNombre} · solo en este dispositivo (sin envío)
          </p>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Artículos seleccionados ({articulos.length})
            </p>
            {articulos.length === 0 ? (
              <p className="mt-2 text-sm text-amber-200/90">
                Agregá accesorios desde la lista antes de guardar la solicitud.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {articulos.map((articulo) => (
                  <li
                    key={articulo.codigoUnico}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-200">{articulo.descripcion}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {articulo.codigoUnico}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onQuitarArticulo(articulo.codigoUnico)}
                      className="shrink-0 min-h-[2.5rem] rounded-lg border border-slate-600 px-3 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">
              Nombre o empresa
            </span>
            <input
              type="text"
              value={formulario.nombre}
              onChange={(e) =>
                onChange({ ...formulario, nombre: e.target.value })
              }
              placeholder="Ej. Juan Pérez"
              className={touchInputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">
              Teléfono
            </span>
            <input
              type="tel"
              value={formulario.telefono}
              onChange={(e) =>
                onChange({ ...formulario, telefono: e.target.value })
              }
              placeholder="Ej. 11 5555 1234"
              className={touchInputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">
              Observaciones
            </span>
            <textarea
              value={formulario.observaciones}
              onChange={(e) =>
                onChange({ ...formulario, observaciones: e.target.value })
              }
              placeholder="Color, año del vehículo, urgencia…"
              rows={3}
              className={`${touchInputClass} min-h-[5.5rem] resize-y`}
            />
          </label>

          <p className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 text-xs text-slate-500">
            Esta solicitud queda registrada solo en la pantalla. No se envía por
            correo ni a un servidor.
          </p>
        </div>

        <footer className="flex gap-3 border-t border-slate-800 p-4 sm:p-5">
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[3.25rem] flex-1 rounded-xl border border-slate-600 bg-slate-800/80 text-base font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
