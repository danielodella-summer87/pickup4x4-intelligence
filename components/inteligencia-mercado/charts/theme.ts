/**
 * Tokens de color para los gráficos del Command Center.
 *
 * Disciplina de color (definida con dirección):
 *  - Azul / cyan / índigo = color de datos NEUTRO (áreas, barras, donut).
 *  - Verde (emerald)       = SOLO positivo (deltas en alza, estado activo).
 *  - Ámbar / rojo (rose)   = SOLO alertas (deltas en caída, sin datos).
 *
 * Todo se apoya sobre la base navy del módulo (#081726 superficie, #0d2236 card).
 */
export const CHART = {
  // Ejes y grilla muy sutiles sobre fondo oscuro.
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.10)",
  // Texto de ejes / etiquetas.
  text: "#94a3b8", // slate-400
  textMuted: "#64748b", // slate-500
  // Paleta de series neutra (azules / cyan / índigo).
  series: [
    "#38bdf8", // sky-400
    "#818cf8", // indigo-400
    "#22d3ee", // cyan-400
    "#60a5fa", // blue-400
    "#a78bfa", // violet-400
    "#2dd4bf", // teal-400
  ],
  // Acento principal de datos (líneas / áreas).
  data: "#38bdf8", // sky-400
  // Semánticos.
  positive: "#34d399", // emerald-400
  alert: "#fbbf24", // amber-400
  danger: "#fb7185", // rose-400
  // Pista de fondo para barras de ranking.
  track: "rgba(255,255,255,0.06)",
} as const;

/** Devuelve el color de serie ciclando la paleta neutra. */
export function serieColor(index: number): string {
  return CHART.series[index % CHART.series.length] ?? CHART.data;
}
