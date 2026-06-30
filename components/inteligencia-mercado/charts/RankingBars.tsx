"use client";

import { CHART } from "./theme";
import { formatNum } from "./utils";

export type RankingDato = {
  label: string;
  valor: number;
  /** Porcentaje opcional ya calculado (0-100). */
  pct?: number;
};

type RankingBarsProps = {
  data: RankingDato[];
  /** Máximo de filas a mostrar. */
  max?: number;
  /** Color de la barra. Por defecto azul de datos. */
  color?: string;
  /** Sufijo del valor (ej. " resp."). */
  sufijo?: string;
};

/**
 * Ranking en barras horizontales (DOM/CSS para texto nítido). Cada fila:
 * etiqueta, pista de fondo, barra proporcional y valor. Ordena por valor desc.
 */
export function RankingBars({
  data,
  max = 8,
  color = CHART.data,
  sufijo = "",
}: RankingBarsProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos para rankear todavía.</p>;
  }

  const rows = [...data].sort((a, b) => b.valor - a.valor).slice(0, max);
  const tope = Math.max(1, ...rows.map((r) => r.valor));

  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const width = `${Math.max(2, (r.valor / tope) * 100)}%`;
        return (
          <li key={`${r.label}-${i}`} className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-slate-200">
                <span className="mr-2 text-xs font-semibold tabular-nums text-slate-500">
                  {i + 1}
                </span>
                {r.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                {formatNum(r.valor)}
                {sufijo}
                {typeof r.pct === "number" ? (
                  <span className="ml-1.5 text-xs font-normal text-slate-500">
                    {r.pct}%
                  </span>
                ) : null}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: CHART.track }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
