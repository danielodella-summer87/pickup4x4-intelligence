"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
  FuenteDatosLabel,
  ResultadosMeta,
} from "@/components/module/ConsultaToolbar";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  detectarOportunidadesComerciales,
  filterOportunidades,
  formatOportunidadDetectadaTipo,
  getOportunidadesKpis,
  getOportunidadesTiposDisponibles,
  type OportunidadesFiltros,
} from "@/lib/data/oportunidades-engine";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";
import type {
  OportunidadDetectada,
  OportunidadPrioridad,
} from "@/lib/models/oportunidad";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const filtrosIniciales: OportunidadesFiltros = {
  busqueda: "",
  prioridad: "",
  tipo: "",
};

function prioridadBadgeClass(prioridad: OportunidadPrioridad): string {
  if (prioridad === "alta") return "bg-rose-500/15 text-rose-300";
  if (prioridad === "media") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-700 text-slate-300";
}

function prioridadLabel(prioridad: OportunidadPrioridad): string {
  const labels: Record<OportunidadPrioridad, string> = {
    alta: "Alta",
    media: "Media",
    baja: "Baja",
  };
  return labels[prioridad];
}

function confianzaLabel(valor: number): string {
  const pct = Math.round(valor * 100);
  if (pct >= 85) return `${pct}% · dato sólido`;
  if (pct >= 65) return `${pct}% · razonable`;
  return `${pct}% · conviene validar`;
}

function OportunidadCard({ oportunidad }: { oportunidad: OportunidadDetectada }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
            {formatOportunidadDetectadaTipo(oportunidad.tipo)}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">{oportunidad.titulo}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${prioridadBadgeClass(oportunidad.prioridad)}`}
        >
          {prioridadLabel(oportunidad.prioridad)}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        {oportunidad.descripcion}
      </p>

      <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/80">
          Qué hacer
        </p>
        <p className="mt-1 text-sm text-emerald-100/90">{oportunidad.recomendacion}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span>
          Métrica:{" "}
          <span className="font-medium text-slate-300">{oportunidad.metricaPrincipal}</span>
        </span>
        {oportunidad.entidad ? (
          <span>
            Foco:{" "}
            <span className="text-slate-400">{oportunidad.entidad.etiqueta}</span>
          </span>
        ) : null}
        <span>{confianzaLabel(oportunidad.confianza)}</span>
        <span className="capitalize">
          Fuente: {oportunidad.fuenteDatos === "excel" ? "Excel importado" : "Demo"}
        </span>
      </div>
    </article>
  );
}

export default function OportunidadesPage() {
  const { data, source, isExcel, isPersistedLocally } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [filtros, setFiltros] = useState<OportunidadesFiltros>(filtrosIniciales);

  const oportunidades = useMemo(
    () => detectarOportunidadesComerciales(data, source),
    [data, source],
  );

  const filtradas = useMemo(
    () => filterOportunidades(oportunidades, filtros),
    [oportunidades, filtros],
  );

  const kpis = useMemo(() => getOportunidadesKpis(oportunidades), [oportunidades]);
  const tiposDisponibles = useMemo(
    () => getOportunidadesTiposDisponibles(oportunidades),
    [oportunidades],
  );

  const hayFiltros =
    filtros.busqueda.trim() !== "" || filtros.prioridad !== "" || filtros.tipo !== "";

  const sinDatosComerciales =
    data.clientes.length === 0 &&
    data.ventas.length === 0 &&
    data.articuloAplicaciones.length === 0;

  return (
    <AppShell
      moduleTitle="Oportunidades comerciales"
      moduleDescription="Ideas accionables detectadas en tu base — sin depender de sistemas externos"
    >
      <div className="space-y-6">
        <FuenteDatosLabel sourceLabel={sourceLabel} isExcel={isExcel} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Oportunidades detectadas"
            value={kpis.detectadas.toLocaleString("es-AR")}
            hint={sourceLabel}
          />
          <StatCard
            label="Alta prioridad"
            value={kpis.altaPrioridad.toLocaleString("es-AR")}
            trend="up"
          />
          <StatCard
            label="Revisar catálogo"
            value={kpis.revisarCatalogo.toLocaleString("es-AR")}
            hint="Calidad de aplicaciones"
          />
          <StatCard
            label="Crecimiento comercial"
            value={kpis.crecimientoComercial.toLocaleString("es-AR")}
            hint="Ventas y cobertura"
            trend="up"
          />
        </div>

        <SectionCard
          title="Radar de oportunidades"
          description="Patrones automáticos sobre clientes, ventas, artículos y vehículos"
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) => setFiltros((prev) => ({ ...prev, busqueda }))}
            placeholder="Buscar por título, recomendación o tipo…"
            onLimpiar={
              hayFiltros
                ? () => setFiltros(filtrosIniciales)
                : undefined
            }
          >
            <FilterField label="Prioridad">
              <FilterSelect
                value={filtros.prioridad}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    prioridad: e.target.value as OportunidadesFiltros["prioridad"],
                  }))
                }
              >
                <option value="">Todas</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </FilterSelect>
            </FilterField>
            <FilterField label="Tipo">
              <FilterSelect
                value={filtros.tipo}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    tipo: e.target.value as OportunidadesFiltros["tipo"],
                  }))
                }
              >
                <option value="">Todos</option>
                {tiposDisponibles.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {formatOportunidadDetectadaTipo(tipo)}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
          </ConsultaToolbar>

          <div className="mt-4">
            <ResultadosMeta
              total={oportunidades.length}
              filtrados={filtradas.length}
              truncated={false}
            />
          </div>

          {sinDatosComerciales ? (
            <div className="mt-6">
              <EstadoVacioConsulta
                titulo="Todavía no hay datos para detectar oportunidades"
                descripcion="Importá los Excel de clientes, ventas y artículos para activar el radar comercial automático."
                action={
                  <Link href="/importar" className={primaryCtaClass}>
                    Actualizar datos
                  </Link>
                }
              />
            </div>
          ) : filtradas.length === 0 ? (
            <div className="mt-6">
              <EstadoVacioConsulta
                titulo="Ninguna oportunidad coincide con los filtros"
                descripcion="Probá ampliar la búsqueda o quitá prioridad y tipo para ver todo el radar."
                action={
                  hayFiltros ? (
                    <button
                      type="button"
                      onClick={() => setFiltros(filtrosIniciales)}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Limpiar filtros
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {filtradas.map((oportunidad) => (
                <li key={oportunidad.id}>
                  <OportunidadCard oportunidad={oportunidad} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="flex flex-wrap gap-3">
          <Link href="/importar" className={primaryCtaClass}>
            Actualizar datos
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Ver dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
