/** Valor interno cuando el Excel no trae fecha (v1: fecha no obligatoria). */
export const VENTA_SIN_FECHA = "sin-fecha";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isVentaFechaConfiable(fecha: string): boolean {
  return Boolean(fecha) && fecha !== VENTA_SIN_FECHA && ISO_DATE_RE.test(fecha);
}

export function resolveVentaFecha(fechaNormalizada: string | null | undefined): string {
  return isVentaFechaConfiable(fechaNormalizada ?? "") ? fechaNormalizada! : VENTA_SIN_FECHA;
}

export function getMesClaveFromVentaFecha(fecha: string): string | null {
  if (!isVentaFechaConfiable(fecha)) return null;
  const mes = fecha.slice(0, 7);
  return mes.length >= 7 ? mes : null;
}

export function formatVentaFechaDisplay(fecha: string): string {
  if (!isVentaFechaConfiable(fecha)) return "Sin fecha";
  const [year, month, day] = fecha.split("-");
  if (!year || !month || !day) return "Sin fecha";
  return `${day}/${month}/${year}`;
}

export function ventasTienenFechasConfiables(
  ventas: readonly { fecha: string }[],
): boolean {
  return ventas.some((v) => isVentaFechaConfiable(v.fecha));
}
