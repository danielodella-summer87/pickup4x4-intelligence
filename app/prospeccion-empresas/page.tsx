"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
  ResultadosMeta,
} from "@/components/module/ConsultaToolbar";
import {
  GuiaUso,
  NextActivityBadge,
  PriorityBadge,
  ProspeccionTabs,
  RubroBadge,
  StageBadge,
  TrafficLightDot,
} from "@/components/prospeccion/ProspeccionUI";
import { ProductOpportunitiesBlock } from "@/components/prospeccion/ProductOpportunitiesBlock";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  ProspectOrgType,
  ProspectPriority,
  ProspectRubro,
  ProspectStage,
  ProspectTrafficLight,
  TriState,
} from "@/lib/models/prospeccion";
import {
  ORG_TYPE_LABELS,
  PRIORITY_LABELS,
  RUBRO_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  TRAFFIC_LIGHT_LABELS,
  emptyProspectFilters,
  fleetSummary,
  filterProspects,
  formatProspectDate,
  getNextActivityStatus,
  getProspectFilterOptions,
  getProspectTrafficLight,
  getProspectionKpis,
  hasSentProposal,
  hayFiltrosActivos,
  referenteNombre,
  type ProspectFilters,
} from "@/lib/prospeccion/helpers";

const primaryCta =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const RUBRO_VALUES = Object.keys(RUBRO_LABELS) as ProspectRubro[];
const ORG_VALUES = Object.keys(ORG_TYPE_LABELS) as ProspectOrgType[];
const TRI_VALUES: TriState[] = ["si", "no", "no_se_sabe"];
const SEMAFORO_VALUES: ProspectTrafficLight[] = ["verde", "amarillo", "rojo", "gris"];
const PRIORITY_VALUES: ProspectPriority[] = ["alta", "media", "baja"];

export default function ProspeccionEmpresasPage() {
  const { prospects, isHydrated, deleteProspect } = useProspeccion();
  const [filtros, setFiltros] = useState<ProspectFilters>(emptyProspectFilters);

  const kpis = useMemo(() => getProspectionKpis(prospects), [prospects]);
  const opciones = useMemo(() => getProspectFilterOptions(prospects), [prospects]);
  const filtradas = useMemo(
    () => filterProspects(prospects, filtros),
    [prospects, filtros],
  );
  const filtrosActivos = hayFiltrosActivos(filtros);

  function patch(changes: Partial<ProspectFilters>) {
    setFiltros((prev) => ({ ...prev, ...changes }));
  }

  if (!isHydrated) {
    return (
      <AppShell>
        <p className="text-sm text-slate-400">Cargando oportunidades…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <ProspeccionTabs />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total oportunidades" value={kpis.total.toLocaleString("es-AR")} />
          <StatCard
            label="Actividades vencidas"
            value={kpis.actividadesVencidas.toLocaleString("es-AR")}
            hint={kpis.actividadesVencidas > 0 ? "Requieren acción" : "Al día"}
            trend={kpis.actividadesVencidas > 0 ? "down" : "up"}
          />
          <StatCard
            label="Oportunidades calientes"
            value={kpis.calientes.toLocaleString("es-AR")}
            hint="Semáforo verde"
            trend="up"
          />
          <StatCard
            label="Sin próxima actividad"
            value={kpis.sinProximaActividad.toLocaleString("es-AR")}
            hint={kpis.sinProximaActividad > 0 ? "Riesgo comercial" : "Todas con paso"}
            trend={kpis.sinProximaActividad > 0 ? "down" : "up"}
          />
          <StatCard
            label="Propuestas enviadas"
            value={kpis.propuestasEnviadas.toLocaleString("es-AR")}
          />
          <StatCard
            label="Necesidades no cubiertas"
            value={kpis.necesidadesNoCubiertas.toLocaleString("es-AR")}
            hint="Oportunidades de producto"
          />
        </div>

        {/* Clave de lectura / ayuda */}
        <GuiaUso>
          <p className="font-medium text-slate-200">
            Este módulo sirve para ordenar la prospección B2B.
          </p>
          <p className="mt-1">
            Cada empresa debe tener un próximo paso claro. Si una oportunidad no
            tiene próxima actividad, el sistema la marca como riesgo comercial.
            Usá esta vista para priorizar empresas con mayor posibilidad de compra
            y prestá atención a las que están en rojo: suelen indicar falta de
            próxima actividad, datos incompletos o contacto vencido.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {SEMAFORO_VALUES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <TrafficLightDot value={s} /> {TRAFFIC_LIGHT_LABELS[s]}
              </span>
            ))}
          </p>
        </GuiaUso>

        {/* Listado */}
        <SectionCard
          title="Oportunidades"
          description="Empresas en prospección. Una empresa sugerida por estrategia se marca con su etiqueta."
          action={
            <Link href="/prospeccion-empresas/nueva" className={primaryCta}>
              Nueva oportunidad
            </Link>
          }
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) => patch({ busqueda })}
            placeholder="Empresa, contacto, teléfono, email, proveedor…"
            onLimpiar={filtrosActivos ? () => setFiltros(emptyProspectFilters) : undefined}
          >
            <FilterField label="Rubro">
              <FilterSelect
                value={filtros.rubro}
                onChange={(e) => patch({ rubro: e.target.value as ProspectRubro | "" })}
              >
                <option value="">Todos los rubros</option>
                {RUBRO_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {RUBRO_LABELS[r]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Tipo de organización">
              <FilterSelect
                value={filtros.tipoOrganizacion}
                onChange={(e) =>
                  patch({ tipoOrganizacion: e.target.value as ProspectOrgType | "" })
                }
              >
                <option value="">Todas</option>
                {ORG_VALUES.map((o) => (
                  <option key={o} value={o}>
                    {ORG_TYPE_LABELS[o]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Departamento">
              <FilterSelect
                value={filtros.departamento}
                onChange={(e) => patch({ departamento: e.target.value })}
              >
                <option value="">Todos</option>
                {opciones.departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Localidad">
              <FilterSelect
                value={filtros.localidad}
                onChange={(e) => patch({ localidad: e.target.value })}
              >
                <option value="">Todas</option>
                {opciones.localidades.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Etapa">
              <FilterSelect
                value={filtros.etapa}
                onChange={(e) => patch({ etapa: e.target.value as ProspectStage | "" })}
              >
                <option value="">Todas las etapas</option>
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Semáforo">
              <FilterSelect
                value={filtros.semaforo}
                onChange={(e) =>
                  patch({ semaforo: e.target.value as ProspectTrafficLight | "" })
                }
              >
                <option value="">Todos</option>
                {SEMAFORO_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {TRAFFIC_LIGHT_LABELS[s]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Prioridad">
              <FilterSelect
                value={filtros.prioridad}
                onChange={(e) =>
                  patch({ prioridad: e.target.value as ProspectPriority | "" })
                }
              >
                <option value="">Todas</option>
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Flota propia">
              <FilterSelect
                value={filtros.flotaPropia}
                onChange={(e) => patch({ flotaPropia: e.target.value as TriState | "" })}
              >
                <option value="">Indistinto</option>
                {TRI_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {t === "si" ? "Sí" : t === "no" ? "No" : "No se sabe"}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
          </ConsultaToolbar>

          {/* Toggles rápidos */}
          <div className="mt-4 flex flex-wrap gap-2">
            <FiltroToggle
              activo={filtros.sinProximaActividad}
              onClick={() => patch({ sinProximaActividad: !filtros.sinProximaActividad })}
            >
              Sin próxima actividad
            </FiltroToggle>
            <FiltroToggle
              activo={filtros.actividadVencida}
              onClick={() => patch({ actividadVencida: !filtros.actividadVencida })}
            >
              Actividad vencida
            </FiltroToggle>
            <FiltroToggle
              activo={filtros.propuestaEnviada}
              onClick={() => patch({ propuestaEnviada: !filtros.propuestaEnviada })}
            >
              Propuesta enviada
            </FiltroToggle>
            <FiltroToggle
              activo={filtros.oportunidadEstrategica}
              onClick={() =>
                patch({ oportunidadEstrategica: !filtros.oportunidadEstrategica })
              }
            >
              Oportunidad estratégica
            </FiltroToggle>
            <FiltroToggle
              activo={filtros.soloSugeridas}
              onClick={() => patch({ soloSugeridas: !filtros.soloSugeridas })}
            >
              Sugeridas
            </FiltroToggle>
          </div>

          <div className="mt-4">
            <ResultadosMeta
              total={prospects.length}
              filtrados={filtradas.length}
              truncated={false}
            />
          </div>

          {filtradas.length === 0 ? (
            <div className="mt-4">
              <EstadoVacioConsulta
                titulo="No hay oportunidades para mostrar"
                descripcion={
                  filtrosActivos
                    ? "Ninguna empresa coincide con los filtros actuales."
                    : "Empezá cargando una empresa para prospectar."
                }
                action={
                  filtrosActivos ? undefined : (
                    <Link href="/prospeccion-empresas/nueva" className={primaryCta}>
                      Nueva oportunidad
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[1280px] text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Empresa</th>
                    <th className="pb-2 font-medium">Rubro</th>
                    <th className="pb-2 font-medium">Localidad</th>
                    <th className="pb-2 font-medium">Etapa</th>
                    <th className="pb-2 font-medium">Sem.</th>
                    <th className="pb-2 font-medium">Flota</th>
                    <th className="pb-2 font-medium">Proveedor</th>
                    <th className="pb-2 font-medium">Referente</th>
                    <th className="pb-2 font-medium">Próx. actividad</th>
                    <th className="pb-2 font-medium">Prioridad</th>
                    <th className="pb-2 font-medium">Propuesta</th>
                    <th className="pb-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {filtradas.map((p) => {
                    const semaforo = getProspectTrafficLight(p);
                    const next = getNextActivityStatus(p);
                    const referente = referenteNombre(p);
                    return (
                      <tr key={p.id} className="border-t border-slate-800 align-top">
                        <td className="py-2.5">
                          <Link
                            href={`/prospeccion-empresas/${p.id}`}
                            className="font-medium text-white hover:text-emerald-300"
                          >
                            {p.nombre}
                          </Link>
                          {p.esSugerida ? (
                            <span className="mt-0.5 block text-xs text-indigo-300">
                              Sugerida{p.categoriaSugerida ? ` · ${p.categoriaSugerida}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5">
                          <RubroBadge value={p.rubro} />
                        </td>
                        <td className="py-2.5 text-slate-300">
                          {p.localidad ?? "—"}
                          {p.departamento ? (
                            <span className="block text-xs text-slate-500">
                              {p.departamento}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5">
                          <StageBadge value={p.etapa} />
                        </td>
                        <td className="py-2.5">
                          <TrafficLightDot value={semaforo} />
                        </td>
                        <td className="py-2.5 text-slate-300">{fleetSummary(p)}</td>
                        <td className="py-2.5 text-slate-300">
                          {p.proveedor.proveedorActual ?? "—"}
                        </td>
                        <td className="py-2.5 text-slate-300">{referente ?? "—"}</td>
                        <td className="py-2.5">
                          <NextActivityBadge state={next.state} />
                          {next.activity ? (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {formatProspectDate(next.activity.fecha)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5">
                          <PriorityBadge value={p.prioridad} />
                        </td>
                        <td className="py-2.5 text-slate-300">
                          {hasSentProposal(p) ? "Enviada" : p.propuestas.length > 0 ? "En curso" : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-3">
                            <Link
                              href={`/prospeccion-empresas/${p.id}`}
                              className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                            >
                              Ver
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Eliminar la oportunidad "${p.nombre}"? Esta acción no se puede deshacer.`,
                                  )
                                ) {
                                  deleteProspect(p.id);
                                }
                              }}
                              className="text-xs font-medium text-slate-500 hover:text-rose-300"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <ProductOpportunitiesBlock />
      </div>
    </AppShell>
  );
}

function FiltroToggle({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        activo
          ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
          : "rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800"
      }
    >
      {children}
    </button>
  );
}
