"use client";

type DistribuidorSummaryProps = {
  marcaNombre: string | null;
  modeloNombre: string | null;
  cantidadAccesorios: number;
  cantidadSeleccionados: number;
};

export function DistribuidorSummary({
  marcaNombre,
  modeloNombre,
  cantidadAccesorios,
  cantidadSeleccionados,
}: DistribuidorSummaryProps) {
  const vehiculoListo = marcaNombre && modeloNombre;

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
        Consulta en mostrador
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Marca</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {marcaNombre ?? "Sin elegir"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Modelo</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {modeloNombre ?? "Sin elegir"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Accesorios encontrados</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">
            {vehiculoListo ? cantidadAccesorios.toLocaleString("es-AR") : "—"}
          </p>
        </div>
      </div>
      {cantidadSeleccionados > 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          <span className="font-medium text-emerald-300">
            {cantidadSeleccionados}
          </span>{" "}
          artículo{cantidadSeleccionados === 1 ? "" : "s"} en la solicitud
        </p>
      ) : null}
    </div>
  );
}
