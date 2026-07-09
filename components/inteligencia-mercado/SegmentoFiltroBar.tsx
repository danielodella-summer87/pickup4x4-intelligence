"use client";

import {
  haySegmentoFiltroActivo,
  type SegmentoFiltro,
} from "@/lib/inteligencia-mercado/filters";
import { inputClass, secondaryBtnClass, selectClass } from "@/components/inteligencia-mercado/ui";

/**
 * Barra de filtros por segmento del dashboard. Afecta KPIs, gráficos,
 * Tendencias, Oportunidades, Comentarios, Respuestas y Export — se aplica
 * una sola vez sobre las respuestas antes de repartirlas entre las vistas.
 */
export function SegmentoFiltroBar({
  filtro,
  onChange,
  departamentosDisponibles,
  girosDisponibles,
  resultados,
  total,
}: {
  filtro: SegmentoFiltro;
  onChange: (filtro: SegmentoFiltro) => void;
  departamentosDisponibles: string[];
  girosDisponibles: string[];
  /** Cantidad de respuestas que quedan tras aplicar el filtro (para feedback). */
  resultados: number;
  /** Cantidad total de respuestas antes de filtrar. */
  total: number;
}) {
  const activo = haySegmentoFiltroActivo(filtro);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d2236] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtro.departamento}
          onChange={(e) => onChange({ ...filtro, departamento: e.target.value })}
          className={selectClass}
          aria-label="Filtrar por departamento"
        >
          <option value="">Todos los departamentos</option>
          {departamentosDisponibles.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={filtro.giro}
          onChange={(e) => onChange({ ...filtro, giro: e.target.value })}
          className={selectClass}
          aria-label="Filtrar por giro"
        >
          <option value="">Todos los giros</option>
          {girosDisponibles.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filtro.fechaDesde}
            onChange={(e) => onChange({ ...filtro, fechaDesde: e.target.value })}
            className={`${inputClass} w-auto`}
            aria-label="Desde"
          />
          <span className="text-xs text-slate-500">a</span>
          <input
            type="date"
            value={filtro.fechaHasta}
            onChange={(e) => onChange({ ...filtro, fechaHasta: e.target.value })}
            className={`${inputClass} w-auto`}
            aria-label="Hasta"
          />
        </div>

        <input
          type="search"
          value={filtro.distribuidorOEmpresa}
          onChange={(e) => onChange({ ...filtro, distribuidorOEmpresa: e.target.value })}
          placeholder="Distribuidor / empresa…"
          className={`${inputClass} max-w-[14rem]`}
        />

        {activo ? (
          <button
            type="button"
            onClick={() => onChange({ departamento: "", giro: "", fechaDesde: "", fechaHasta: "", distribuidorOEmpresa: "" })}
            className={secondaryBtnClass}
          >
            Limpiar filtros
          </button>
        ) : null}

        {activo ? (
          <span className="ml-auto text-xs text-slate-500">
            {resultados} de {total} respuesta(s) con estos filtros
          </span>
        ) : null}
      </div>
    </div>
  );
}
