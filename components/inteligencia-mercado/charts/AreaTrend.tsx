"use client";

import { CHART } from "./theme";
import { useChartWidth } from "./useChartWidth";
import { smoothPath, niceMax, formatNum, type Pt } from "./utils";

export type AreaPunto = { label: string; valor: number };

type AreaTrendProps = {
  puntos: AreaPunto[];
  height?: number;
  color?: string;
};

/**
 * Área de evolución temporal con grilla horizontal, eje X con etiquetas
 * espaciadas y degradé bajo la curva. Responsive vía ResizeObserver.
 */
export function AreaTrend({
  puntos,
  height = 220,
  color = CHART.data,
}: AreaTrendProps) {
  const { ref, width } = useChartWidth(560);

  if (puntos.length === 0) {
    return (
      <div ref={ref} className="flex h-[220px] items-center justify-center">
        <p className="text-sm text-slate-500">Sin datos para graficar todavía.</p>
      </div>
    );
  }

  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);

  const max = niceMax(Math.max(...puntos.map((p) => p.valor)));
  const n = puntos.length;
  const x = (i: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const points: Pt[] = puntos.map((p, i) => ({ x: x(i), y: y(p.valor) }));
  const dLine = smoothPath(points);
  const dArea = `${dLine} L ${points[points.length - 1]!.x} ${padT + innerH} L ${points[0]!.x} ${padT + innerH} Z`;

  // Líneas de grilla (0, 50%, 100%).
  const ticks = [0, max / 2, max];
  // Etiquetas X: primera, última y ~3 intermedias.
  const step = Math.max(1, Math.ceil(n / 5));
  const labelIdx = new Set<number>([0, n - 1]);
  for (let i = step; i < n - 1; i += step) labelIdx.add(i);

  const gradId = "area-trend-grad";
  const total = puntos.reduce((s, p) => s + p.valor, 0);

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grilla + etiquetas Y */}
        {ticks.map((t, i) => {
          const gy = y(t);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={width - padR}
                y1={gy}
                y2={gy}
                stroke={CHART.grid}
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={gy + 3}
                textAnchor="end"
                fontSize={10}
                fill={CHART.textMuted}
              >
                {formatNum(Math.round(t))}
              </text>
            </g>
          );
        })}

        {/* Área + línea */}
        <path d={dArea} fill={`url(#${gradId})`} />
        <path
          d={dLine}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Puntos + etiquetas X */}
        {points.map((p, i) => (
          <g key={i}>
            {labelIdx.has(i) ? (
              <>
                <circle cx={p.x} cy={p.y} r={2.5} fill={color} />
                <text
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill={CHART.textMuted}
                >
                  {puntos[i]!.label}
                </text>
              </>
            ) : null}
            <title>{`${puntos[i]!.label}: ${formatNum(puntos[i]!.valor)}`}</title>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        {formatNum(total)} respuesta(s) en el período
      </p>
    </div>
  );
}
