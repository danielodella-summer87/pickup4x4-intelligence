/**
 * Filtro de segmento del dashboard (Departamento, Giro, Fecha, Distribuidor/Empresa).
 * Función pura sobre Respuesta[]: se aplica antes de pasar el array a
 * CommandCenter/aggregations/export, que no necesitan saber que existe.
 */
import type { Respuesta } from "@/lib/inteligencia-mercado/types";

export type SegmentoFiltro = {
  departamento: string;
  giro: string;
  /** yyyy-mm-dd, inclusive. */
  fechaDesde: string;
  /** yyyy-mm-dd, inclusive. */
  fechaHasta: string;
  distribuidorOEmpresa: string;
};

export const SEGMENTO_FILTRO_VACIO: SegmentoFiltro = {
  departamento: "",
  giro: "",
  fechaDesde: "",
  fechaHasta: "",
  distribuidorOEmpresa: "",
};

export function haySegmentoFiltroActivo(filtro: SegmentoFiltro): boolean {
  return Boolean(
    filtro.departamento ||
      filtro.giro ||
      filtro.fechaDesde ||
      filtro.fechaHasta ||
      filtro.distribuidorOEmpresa.trim(),
  );
}

function cumpleSegmento(r: Respuesta, filtro: SegmentoFiltro): boolean {
  if (filtro.departamento && r.departamento !== filtro.departamento) return false;
  if (filtro.giro && r.giro !== filtro.giro) return false;

  if (filtro.fechaDesde || filtro.fechaHasta) {
    const fecha = r.createdAt.slice(0, 10); // yyyy-mm-dd, comparable lexicográficamente
    if (filtro.fechaDesde && fecha < filtro.fechaDesde) return false;
    if (filtro.fechaHasta && fecha > filtro.fechaHasta) return false;
  }

  if (filtro.distribuidorOEmpresa.trim()) {
    const q = filtro.distribuidorOEmpresa.trim().toLowerCase();
    const haystack = `${r.distribuidorNombre ?? ""} ${r.empresa ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/** Aplica el filtro de segmento sobre una lista de respuestas. */
export function filtrarPorSegmento(
  respuestas: Respuesta[],
  filtro: SegmentoFiltro,
): Respuesta[] {
  if (!haySegmentoFiltroActivo(filtro)) return respuestas;
  return respuestas.filter((r) => cumpleSegmento(r, filtro));
}
