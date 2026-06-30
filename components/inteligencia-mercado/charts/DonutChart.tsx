"use client";

import { CHART, serieColor } from "./theme";
import { formatNum } from "./utils";

export type DonutDato = { label: string; valor: number };

type DonutChartProps = {
  data: DonutDato[];
  size?: number;
  thickness?: number;
  /** Texto bajo el total en el centro. */
  centroLabel?: string;
};

/**
 * Donut por segmentos (técnica stroke-dasharray, trazo nítido) con total al
 * centro y leyenda lateral con valores y porcentajes.
 */
export function DonutChart({
  data,
  size = 168,
  thickness = 20,
  centroLabel = "total",
}: DonutChartProps) {
  const segmentos = data.filter((d) => d.valor > 0);
  const total = segmentos.reduce((s, d) => s + d.valor, 0);

  if (total === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center">
        <p className="text-sm text-slate-500">Sin datos para distribuir todavía.</p>
      </div>
    );
  }

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  let acumulado = 0;
  const arcos = segmentos.map((d, i) => {
    const frac = d.valor / total;
    const len = frac * C;
    const dash = `${len} ${C - len}`;
    const offset = -acumulado;
    acumulado += len;
    return {
      key: i,
      color: serieColor(i),
      dash,
      offset,
      label: d.label,
      valor: d.valor,
      pct: Math.round(frac * 100),
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        {/* Pista de fondo */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={CHART.track}
          strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {arcos.map((a) => (
            <circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
            >
              <title>{`${a.label}: ${formatNum(a.valor)} (${a.pct}%)`}</title>
            </circle>
          ))}
        </g>
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize={26}
          fontWeight={700}
          fill="#fff"
        >
          {formatNum(total)}
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize={11}
          fill={CHART.textMuted}
        >
          {centroLabel}
        </text>
      </svg>

      <ul className="min-w-[8rem] flex-1 space-y-2">
        {arcos.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: a.color }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-300">
              {a.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-white">
              {formatNum(a.valor)}
              <span className="ml-1 text-xs font-normal text-slate-500">
                {a.pct}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
