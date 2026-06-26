"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
  ResultadosMeta,
} from "@/components/module/ConsultaToolbar";
import {
  CollapsibleSection,
  GuiaUso,
  ProspeccionTabs,
  RubroBadge,
} from "@/components/prospeccion/ProspeccionUI";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import {
  PROPOSAL_STATUS_LABELS,
  RUBRO_LABELS,
  formatProspectDate,
} from "@/lib/prospeccion/helpers";
import type {
  CompanyProspect,
  ProposalChannel,
  ProposalStatus,
  ProspectProposal,
  ProspectRubro,
} from "@/lib/models/prospeccion";

type PropuestaFila = {
  proposal: ProspectProposal;
  prospect: CompanyProspect;
};

const SENT_STATES: ProposalStatus[] = [
  "enviada",
  "en_revision",
  "aceptada",
  "rechazada",
];

const PREP_STATES: ProposalStatus[] = ["no_iniciada", "en_preparacion"];

const CHANNEL_LABELS: Record<ProposalChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  impresa: "Impresa",
  otro: "Otro",
};

function estadoBadgeClass(estado: ProposalStatus): string {
  if (estado === "enviada" || estado === "aceptada") {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (estado === "en_revision") return "bg-sky-500/15 text-sky-300";
  if (estado === "rechazada") return "bg-rose-500/15 text-rose-300";
  return "bg-slate-700/60 text-slate-300";
}

const montoFormatter = new Intl.NumberFormat("es-UY", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const secondaryLinkClass =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";

function fechaOrden(proposal: ProspectProposal): string {
  return proposal.fechaEnvio ?? proposal.fechaCreacion ?? "";
}

export default function PropuestasPage() {
  const { prospects, isHydrated } = useProspeccion();
  const [estado, setEstado] = useState<ProposalStatus | "">("");
  const [rubro, setRubro] = useState<ProspectRubro | "">("");
  const [busqueda, setBusqueda] = useState("");

  const filasBase = useMemo<PropuestaFila[]>(() => {
    const filas: PropuestaFila[] = [];
    for (const prospect of prospects) {
      for (const proposal of prospect.propuestas) {
        filas.push({ proposal, prospect });
      }
    }
    return filas.sort((a, b) =>
      fechaOrden(b.proposal).localeCompare(fechaOrden(a.proposal)),
    );
  }, [prospects]);

  const filtradas = useMemo<PropuestaFila[]>(() => {
    const term = busqueda.trim().toLowerCase();
    return filasBase.filter((fila) => {
      if (estado && fila.proposal.estado !== estado) return false;
      if (rubro && fila.prospect.rubro !== rubro) return false;
      if (term && !fila.prospect.nombre.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [filasBase, estado, rubro, busqueda]);

  const kpis = useMemo(() => {
    let enviadas = 0;
    let preparacion = 0;
    let monto = 0;
    for (const { proposal } of filasBase) {
      if (SENT_STATES.includes(proposal.estado)) enviadas += 1;
      if (PREP_STATES.includes(proposal.estado)) preparacion += 1;
      if (typeof proposal.montoEstimado === "number") {
        monto += proposal.montoEstimado;
      }
    }
    return {
      total: filasBase.length,
      enviadas,
      preparacion,
      monto,
    };
  }, [filasBase]);

  const hayFiltros = Boolean(estado || rubro || busqueda);

  const limpiar = () => {
    setEstado("");
    setRubro("");
    setBusqueda("");
  };

  if (!isHydrated) {
    return (
      <AppShell>
        <p className="text-sm text-slate-400">Cargando propuestas…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <ProspeccionTabs />

        <GuiaUso>
          Historial de propuestas enviadas y en preparación. Cada propuesta
          pertenece a una oportunidad; desde la ficha de cada empresa podés crear
          nuevas versiones.
        </GuiaUso>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total propuestas"
            value={kpis.total.toLocaleString("es-AR")}
          />
          <StatCard
            label="Enviadas"
            value={kpis.enviadas.toLocaleString("es-AR")}
            trend="up"
          />
          <StatCard
            label="En preparación"
            value={kpis.preparacion.toLocaleString("es-AR")}
          />
          <StatCard
            label="Monto estimado total"
            value={kpis.monto > 0 ? montoFormatter.format(kpis.monto) : "—"}
          />
        </div>

        <CollapsibleSection
          title="Historial de propuestas"
          countLabel={
            filtradas.length !== filasBase.length
              ? `${filtradas.length} de ${filasBase.length}`
              : `${filasBase.length}`
          }
          description="Propuestas generadas en todas las oportunidades B2B."
          action={
            <Link href="/prospeccion-empresas" className={secondaryLinkClass}>
              Ver oportunidades
            </Link>
          }
        >
          <ConsultaToolbar
            busqueda={busqueda}
            onBusquedaChange={setBusqueda}
            placeholder="Buscar por empresa…"
            onLimpiar={hayFiltros ? limpiar : undefined}
          >
            <FilterField label="Estado de propuesta">
              <FilterSelect
                value={estado}
                onChange={(e) => setEstado(e.target.value as ProposalStatus | "")}
              >
                <option value="">Todos los estados</option>
                {(Object.keys(PROPOSAL_STATUS_LABELS) as ProposalStatus[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {PROPOSAL_STATUS_LABELS[key]}
                    </option>
                  ),
                )}
              </FilterSelect>
            </FilterField>
            <FilterField label="Rubro">
              <FilterSelect
                value={rubro}
                onChange={(e) => setRubro(e.target.value as ProspectRubro | "")}
              >
                <option value="">Todos los rubros</option>
                {(Object.keys(RUBRO_LABELS) as ProspectRubro[]).map((key) => (
                  <option key={key} value={key}>
                    {RUBRO_LABELS[key]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
          </ConsultaToolbar>

          <div className="mt-4">
            <ResultadosMeta
              total={filasBase.length}
              filtrados={filtradas.length}
              truncated={false}
            />
          </div>

          {filtradas.length === 0 ? (
            <div className="mt-6">
              <EstadoVacioConsulta
                titulo="No hay propuestas para mostrar"
                descripcion={
                  filasBase.length === 0
                    ? "Todavía no se generaron propuestas. Creá la primera desde la ficha de una oportunidad."
                    : "Ninguna propuesta coincide con los filtros aplicados."
                }
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Empresa</th>
                    <th className="pb-2 font-medium">Versión</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium">Productos</th>
                    <th className="pb-2 text-right font-medium">Monto estimado</th>
                    <th className="pb-2 font-medium">Creación</th>
                    <th className="pb-2 font-medium">Envío</th>
                    <th className="pb-2 font-medium">Medio</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {filtradas.map(({ proposal, prospect }) => (
                    <tr
                      key={`${prospect.id}-${proposal.id}`}
                      className="border-t border-slate-800"
                    >
                      <td className="py-2.5">
                        <span className="font-medium">{prospect.nombre}</span>
                        <span className="mt-1 block">
                          <RubroBadge value={prospect.rubro} />
                        </span>
                      </td>
                      <td className="py-2.5 tabular-nums">v{proposal.version}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${estadoBadgeClass(
                            proposal.estado,
                          )}`}
                        >
                          {PROPOSAL_STATUS_LABELS[proposal.estado]}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {proposal.productos.length > 0
                          ? `${proposal.productos.length} producto${
                              proposal.productos.length === 1 ? "" : "s"
                            }`
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {typeof proposal.montoEstimado === "number"
                          ? montoFormatter.format(proposal.montoEstimado)
                          : "—"}
                      </td>
                      <td className="py-2.5">
                        {formatProspectDate(proposal.fechaCreacion)}
                      </td>
                      <td className="py-2.5">
                        {formatProspectDate(proposal.fechaEnvio)}
                      </td>
                      <td className="py-2.5">
                        {proposal.medioEnvio
                          ? CHANNEL_LABELS[proposal.medioEnvio]
                          : "—"}
                      </td>
                      <td className="py-2.5">
                        <Link
                          href={`/prospeccion-empresas/${prospect.id}`}
                          className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          Ver oportunidad
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </AppShell>
  );
}
