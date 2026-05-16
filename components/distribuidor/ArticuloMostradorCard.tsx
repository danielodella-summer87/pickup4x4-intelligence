"use client";

import type { ArticuloMostrador } from "@/lib/data/distribuidor-insights";

type ArticuloMostradorCardProps = {
  articulo: ArticuloMostrador;
  seleccionado: boolean;
  onToggle: () => void;
};

export function ArticuloMostradorCard({
  articulo,
  seleccionado,
  onToggle,
}: ArticuloMostradorCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border p-5 text-left transition active:scale-[0.99] sm:p-6 ${
        seleccionado
          ? "border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/40"
          : "border-slate-800 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-900/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-snug text-white sm:text-xl">
            {articulo.descripcion}
          </p>
          <p className="mt-2 font-mono text-sm text-slate-400">{articulo.codigoUnico}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            seleccionado
              ? "bg-emerald-500 text-slate-950"
              : "border border-slate-600 text-slate-400"
          }`}
        >
          {seleccionado ? "Agregado" : "Tocar para agregar"}
        </span>
      </div>

      <p className="mt-4 text-sm text-slate-400">
        {articulo.categoria}
        <span className="mx-2 text-slate-600">·</span>
        {articulo.rubro}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300">
          {articulo.cantidadAplicacionesVehiculo} aplicación
          {articulo.cantidadAplicacionesVehiculo === 1 ? "" : "es"} para este auto
        </span>
        {articulo.requiereRevisionAplicacion ? (
          <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200">
            Aplicación a revisar
          </span>
        ) : null}
        {articulo.esAltaRotacion ? (
          <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200">
            Alta rotación
          </span>
        ) : null}
        {articulo.esUniversal ? (
          <span className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200">
            Universal
          </span>
        ) : null}
      </div>
    </button>
  );
}
