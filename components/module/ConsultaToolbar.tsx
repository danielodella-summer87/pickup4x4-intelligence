"use client";

import type { ReactNode } from "react";

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";

const selectClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none";

type ConsultaToolbarProps = {
  busqueda: string;
  onBusquedaChange: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  onLimpiar?: () => void;
};

export function ConsultaToolbar({
  busqueda,
  onBusquedaChange,
  placeholder = "Buscar…",
  children,
  onLimpiar,
}: ConsultaToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Búsqueda
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        </label>
        {onLimpiar ? (
          <button
            type="button"
            onClick={onLimpiar}
            className="min-h-[2.75rem] shrink-0 rounded-lg border border-slate-600 px-4 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>
      {children ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      ) : null}
    </div>
  );
}

export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function FilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={selectClass} />;
}

export function FuenteDatosLabel({
  sourceLabel,
  isExcel,
}: {
  sourceLabel: string;
  isExcel: boolean;
}) {
  return (
    <p className="text-xs text-slate-500">
      Fuente de datos:{" "}
      <span
        className={
          isExcel ? "font-medium text-emerald-400" : "font-medium text-slate-400"
        }
      >
        {sourceLabel}
      </span>
    </p>
  );
}

export function ResultadosMeta({
  total,
  filtrados,
  truncated,
}: {
  total: number;
  filtrados: number;
  truncated: boolean;
}) {
  return (
    <p className="text-sm text-slate-500">
      {filtrados === total
        ? `${total.toLocaleString("es-AR")} resultado${total === 1 ? "" : "s"}`
        : `${filtrados.toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")} resultados`}
      {truncated ? " · Mostrando primeros 100 resultados" : ""}
    </p>
  );
}

export function EstadoVacioConsulta({
  titulo,
  descripcion,
  action,
}: {
  titulo: string;
  descripcion: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 py-12 text-center">
      <p className="text-base font-medium text-slate-300">{titulo}</p>
      <p className="mt-2 text-sm text-slate-500">{descripcion}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
