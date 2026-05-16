"use client";

import { useMemo, useState } from "react";
import type { CodigoRepetidoResumen } from "@/lib/excel/import-preview";

const TOP_LIMIT = 20;

function countBadgeClass(filas: number): string {
  if (filas >= 5) return "bg-rose-500/15 text-rose-300";
  if (filas >= 3) return "bg-amber-500/15 text-amber-300";
  return "bg-sky-500/15 text-sky-300";
}

type CodigosMultiplesAplicacionesPanelProps = {
  items: CodigoRepetidoResumen[];
  totalLabel?: string;
};

export function CodigosMultiplesAplicacionesPanel({
  items,
  totalLabel,
}: CodigosMultiplesAplicacionesPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      item.codigoUnico.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  const visible = filtered.slice(0, TOP_LIMIT);
  const hiddenCount = Math.max(0, filtered.length - TOP_LIMIT);

  if (items.length === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">
            Códigos con múltiples aplicaciones
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {totalLabel ??
              `${items.length.toLocaleString("es-AR")} códigos · top ${TOP_LIMIT} con búsqueda`}
          </p>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
          {items.length.toLocaleString("es-AR")} códigos
        </span>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Buscar código único</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por codigoUnico…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        />
      </label>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950/95 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">codigoUnico</th>
              <th className="px-3 py-2 font-medium text-right">Aplicaciones</th>
              <th className="px-3 py-2 font-medium">codigoAplicacion (muestra)</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-slate-500">
                  Sin coincidencias para &quot;{query}&quot;.
                </td>
              </tr>
            ) : (
              visible.map((item) => (
                <tr key={item.codigoUnico} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono">{item.codigoUnico}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 font-medium ${countBadgeClass(item.filas)}`}
                    >
                      {item.filas}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-400">
                    {item.codigosAplicacion.slice(0, 4).join(" · ")}
                    {item.codigosAplicacion.length > 4
                      ? ` · +${item.codigosAplicacion.length - 4}`
                      : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Mostrando {visible.length} de {filtered.length} resultados filtrados
          {query ? "" : ` (top ${TOP_LIMIT} del total)`}.
          {hiddenCount > 0 && !query
            ? ` Quedan ${(items.length - TOP_LIMIT).toLocaleString("es-AR")} códigos fuera del top.`
            : null}
        </p>
      ) : null}
    </section>
  );
}
