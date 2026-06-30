/** Utilidades matemáticas puras para los gráficos SVG (sin dependencias). */

/** Formatea números enteros con separador es-UY. */
export function formatNum(n: number): string {
  try {
    return new Intl.NumberFormat("es-UY").format(n);
  } catch {
    return String(n);
  }
}

/** Redondea el máximo a un valor "lindo" para la escala del eje. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  if (value <= 5) return Math.ceil(value);
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return Math.ceil((nice * pow) / 1) ;
}

export type Pt = { x: number; y: number };

/** Construye el `d` de una polilínea suave (catmull-rom simplificado a bézier). */
export function smoothPath(points: Pt[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x} ${p.y}`;
  }
  const d: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]!;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

/** Línea recta segmentada (para sparklines pequeños). */
export function linePath(points: Pt[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}
