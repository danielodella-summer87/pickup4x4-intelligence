"use client";

import { CHART, serieColor } from "./theme";
import { useChartWidth } from "./useChartWidth";
import { niceMax, formatNum } from "./utils";

export type BarDato = { label: string; valor: number };

type BarChartProps = {
  data: BarDato[];
  height?: number;
  /** Color único; si se omite, cicla la paleta neutra. */
  color?: string;
};

/** Barras verticales con grilla sutil, valor encima y etiquetas truncadas. */
export function BarChart({ data, height = 220, color }: BarChartProps) {
  const { ref, width } = useChartWidth(420);

  if (data.length === 0) {
    return (
      <div ref={ref} className="flex h-[180px] items-center justify-center">
        <p className="text-sm text-slate-500">Sin datos para graficar todavía.</p>
      </div>
    );
  }

  const padL = 30;
  const padR = 8;
  const padT = 16;
  const padB = 30;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);

  const max = niceMax(Math.max(...data.map((d) => d.valor)));
  const n = data.length;
  const slot = innerW / n;
  const barW = Math.min(46, slot * 0.62);

  const ticks = [0, max / 2, max];
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
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

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const by = y(d.valor);
          const bh = padT + innerH - by;
          const fill = color ?? serieColor(i);
          const label =
            d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label;
          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={by}
                width={barW}
                height={Math.max(0, bh)}
                rx={4}
                fill={fill}
                opacity={0.9}
              >
                <title>{`${d.label}: ${formatNum(d.valor)}`}</title>
              </rect>
              <text
                x={cx}
                y={by - 5}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={CHART.text}
              >
                {formatNum(d.valor)}
              </text>
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                fontSize={10}
                fill={CHART.textMuted}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
