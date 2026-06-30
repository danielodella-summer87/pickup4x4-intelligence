"use client";

import { CHART } from "./theme";
import { linePath, smoothPath, type Pt } from "./utils";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Rellena el área bajo la línea con un degradé suave. */
  fill?: boolean;
  /** Marca el último punto con un círculo. */
  showDot?: boolean;
  /** Suaviza la curva (bézier) en vez de segmentos rectos. */
  smooth?: boolean;
  className?: string;
};

/**
 * Mini gráfico de línea (sin ejes) para incrustar dentro de un KPI.
 * Render fijo en píxeles; pensado para anchos pequeños (~80-160px).
 */
export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = CHART.data,
  fill = true,
  showDot = false,
  smooth = true,
  className,
}: SparklineProps) {
  const padY = 3;
  const innerH = height - padY * 2;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const span = max - min || 1;
  const n = data.length;

  const points: Pt[] = data.map((v, i) => ({
    x: n <= 1 ? width / 2 : (i / (n - 1)) * width,
    y: padY + innerH - ((v - min) / span) * innerH,
  }));

  const dLine = smooth ? smoothPath(points) : linePath(points);
  const last = points[points.length - 1];
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  const dArea =
    points.length > 1
      ? `${dLine} L ${points[points.length - 1]!.x} ${height} L ${points[0]!.x} ${height} Z`
      : "";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && dArea ? <path d={dArea} fill={`url(#${gradId})`} /> : null}
      <path
        d={dLine}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && last ? (
        <circle cx={last.x} cy={last.y} r={2.6} fill={color} />
      ) : null}
    </svg>
  );
}

/** Variante de Sparkline con punto final resaltado (alias semántico). */
export function TrendLine(props: SparklineProps) {
  return <Sparkline showDot {...props} />;
}
