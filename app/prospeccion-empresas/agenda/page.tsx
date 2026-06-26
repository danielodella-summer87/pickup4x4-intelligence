"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
} from "@/components/module/ConsultaToolbar";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  GuiaUso,
  ProspeccionTabs,
  TrafficLightDot,
} from "@/components/prospeccion/ProspeccionUI";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  ActivityStatus,
  ActivityType,
  CompanyProspect,
  ProspectActivity,
  ProspectTrafficLight,
} from "@/lib/models/prospeccion";
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  diffInDays,
  formatProspectDate,
  getProspectTrafficLight,
  RUBRO_LABELS,
  todayISO,
} from "@/lib/prospeccion/helpers";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

type Bucket = "vencidas" | "hoy" | "proximos_7" | "proximos_30" | "sin_fecha";

const BUCKET_ORDER: Bucket[] = [
  "vencidas",
  "hoy",
  "proximos_7",
  "proximos_30",
  "sin_fecha",
];

const BUCKET_LABELS: Record<Bucket, string> = {
  vencidas: "Vencidas",
  hoy: "Hoy",
  proximos_7: "Próximos 7 días",
  proximos_30: "Próximos 30 días",
  sin_fecha: "Sin fecha",
};

const BUCKET_DESCRIPTIONS: Record<Bucket, string> = {
  vencidas: "Actividades cuya fecha ya pasó. Resolvelas primero.",
  hoy: "Para hacer hoy.",
  proximos_7: "Agenda de la semana.",
  proximos_30: "Próximas cuatro semanas.",
  sin_fecha: "Actividades sin fecha asignada: poneles una para no perderlas.",
};

function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

// Semáforo de atraso por actividad: gris realizada/cancelada · rojo vencida ·
// amarillo hoy · verde futura.
function atrasoDotClass(
  fecha: string,
  estado: ActivityStatus,
  today: string,
): string {
  if (estado === "realizada" || estado === "cancelada") return "bg-slate-500";
  if (!isValidISODate(fecha)) return "bg-slate-500";
  const d = diffInDays(fecha, today);
  if (d < 0) return "bg-rose-400";
  if (d === 0) return "bg-amber-400";
  return "bg-emerald-400";
}

function bucketForActivity(fecha: string, today: string): Bucket {
  if (!isValidISODate(fecha)) return "sin_fecha";
  const days = diffInDays(fecha, today);
  if (days < 0) return "vencidas";
  if (days === 0) return "hoy";
  if (days <= 7) return "proximos_7";
  if (days <= 30) return "proximos_30";
  // Más allá de 30 días lo agrupamos junto a "próximos 30" para no perderlo de vista.
  return "proximos_30";
}

type AgendaRow = {
  actividad: ProspectActivity;
  prospect: CompanyProspect;
  semaforo: ProspectTrafficLight;
  bucket: Bucket;
};

type RangoFiltro = "" | Bucket;

const RANGO_OPCIONES: { value: RangoFiltro; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "vencidas", label: "Vencidas" },
  { value: "hoy", label: "Hoy" },
  { value: "proximos_7", label: "Próximos 7 días" },
  { value: "proximos_30", label: "Próximos 30 días" },
  { value: "sin_fecha", label: "Sin fecha" },
];

type Filtros = {
  busqueda: string;
  tipo: ActivityType | "";
  estado: ActivityStatus | "";
  responsable: string;
  rango: RangoFiltro;
};

const filtrosIniciales: Filtros = {
  busqueda: "",
  tipo: "",
  estado: "",
  responsable: "",
  rango: "",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export default function ProspeccionAgendaPage() {
  const { prospects, isHydrated } = useProspeccion();
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciales);

  const today = todayISO();

  const filasBase = useMemo<AgendaRow[]>(() => {
    if (!isHydrated) return [];
    const rows: AgendaRow[] = [];
    for (const prospect of prospects) {
      const semaforo = getProspectTrafficLight(prospect, today);
      for (const actividad of prospect.actividades) {
        if (actividad.estado !== "pendiente" && actividad.estado !== "vencida") {
          continue;
        }
        rows.push({
          actividad,
          prospect,
          semaforo,
          bucket: bucketForActivity(actividad.fecha, today),
        });
      }
    }
    return rows.sort((a, b) => {
      const af = isValidISODate(a.actividad.fecha) ? a.actividad.fecha : "9999-12-31";
      const bf = isValidISODate(b.actividad.fecha) ? b.actividad.fecha : "9999-12-31";
      return af.localeCompare(bf);
    });
  }, [prospects, isHydrated, today]);

  const responsables = useMemo(() => {
    const set = new Set<string>();
    for (const row of filasBase) {
      if (row.actividad.responsable) set.add(row.actividad.responsable);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [filasBase]);

  const filtradas = useMemo<AgendaRow[]>(() => {
    const term = normalize(filtros.busqueda);
    return filasBase.filter((row) => {
      if (term && !normalize(row.prospect.nombre).includes(term)) return false;
      if (filtros.tipo && row.actividad.tipo !== filtros.tipo) return false;
      if (filtros.estado && row.actividad.estado !== filtros.estado) return false;
      if (filtros.responsable && row.actividad.responsable !== filtros.responsable) {
        return false;
      }
      if (filtros.rango && row.bucket !== filtros.rango) return false;
      return true;
    });
  }, [filasBase, filtros]);

  const conteos = useMemo(() => {
    const base: Record<Bucket, number> = {
      vencidas: 0,
      hoy: 0,
      proximos_7: 0,
      proximos_30: 0,
      sin_fecha: 0,
    };
    for (const row of filtradas) base[row.bucket] += 1;
    return base;
  }, [filtradas]);

  const grupos = useMemo(() => {
    return BUCKET_ORDER.map((bucket) => ({
      bucket,
      rows: filtradas.filter((row) => row.bucket === bucket),
    })).filter((grupo) => grupo.rows.length > 0);
  }, [filtradas]);

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.tipo !== "" ||
    filtros.estado !== "" ||
    filtros.responsable !== "" ||
    filtros.rango !== "";

  if (!isHydrated) {
    return (
      <AppShell>
        <div className="space-y-6">
          <ProspeccionTabs />
          <p className="text-sm text-slate-400">Cargando agenda…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <ProspeccionTabs />

        <GuiaUso>
          La agenda muestra lo que debe hacerse para que ninguna oportunidad quede
          parada. Toda oportunidad activa debería tener una próxima acción definida.
        </GuiaUso>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Vencidas"
            value={conteos.vencidas.toLocaleString("es-AR")}
            hint={conteos.vencidas > 0 ? "Requieren acción" : "Al día"}
            trend={conteos.vencidas > 0 ? "down" : "up"}
          />
          <StatCard label="Hoy" value={conteos.hoy.toLocaleString("es-AR")} />
          <StatCard
            label="Próximos 7 días"
            value={conteos.proximos_7.toLocaleString("es-AR")}
          />
          <StatCard
            label="Próximos 30 días"
            value={conteos.proximos_30.toLocaleString("es-AR")}
          />
          <StatCard
            label="Sin fecha"
            value={conteos.sin_fecha.toLocaleString("es-AR")}
            hint={conteos.sin_fecha > 0 ? "Asigná una fecha" : undefined}
          />
        </div>

        <SectionCard
          title="Agenda de próximas actividades"
          description="Filtrá por tipo, estado, responsable o rango de fechas"
          action={
            <Link href="/prospeccion-empresas/agenda/nueva" className={primaryCtaClass}>
              Nueva actividad
            </Link>
          }
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) =>
              setFiltros((prev) => ({ ...prev, busqueda }))
            }
            placeholder="Buscar por empresa…"
            onLimpiar={hayFiltros ? () => setFiltros(filtrosIniciales) : undefined}
          >
            <FilterField label="Tipo de actividad">
              <FilterSelect
                value={filtros.tipo}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    tipo: e.target.value as ActivityType | "",
                  }))
                }
              >
                <option value="">Todos los tipos</option>
                {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ACTIVITY_TYPE_LABELS[tipo]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Estado">
              <FilterSelect
                value={filtros.estado}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    estado: e.target.value as ActivityStatus | "",
                  }))
                }
              >
                <option value="">Todos los estados</option>
                {(["pendiente", "vencida"] as ActivityStatus[]).map((estado) => (
                  <option key={estado} value={estado}>
                    {ACTIVITY_STATUS_LABELS[estado]}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Responsable">
              <FilterSelect
                value={filtros.responsable}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, responsable: e.target.value }))
                }
              >
                <option value="">Todos los responsables</option>
                {responsables.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Rango de fechas">
              <FilterSelect
                value={filtros.rango}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    rango: e.target.value as RangoFiltro,
                  }))
                }
              >
                {RANGO_OPCIONES.map((op) => (
                  <option key={op.value || "todas"} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
          </ConsultaToolbar>

          <div className="mt-6">
            {filtradas.length === 0 ? (
              <EstadoVacioConsulta
                titulo="No hay actividades para mostrar"
                descripcion={
                  hayFiltros
                    ? "Probá con otros filtros o limpialos para ver toda la agenda."
                    : "Toda oportunidad activa debería tener una próxima acción. Empezá creando una."
                }
                action={
                  hayFiltros ? undefined : (
                    <Link
                      href="/prospeccion-empresas/agenda/nueva"
                      className={primaryCtaClass}
                    >
                      Nueva actividad
                    </Link>
                  )
                }
              />
            ) : (
              <div className="space-y-6">
                {grupos.map((grupo) => (
                  <AgendaGrupo
                    key={grupo.bucket}
                    bucket={grupo.bucket}
                    rows={grupo.rows}
                  />
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

function AgendaGrupo({ bucket, rows }: { bucket: Bucket; rows: AgendaRow[] }) {
  const today = todayISO();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">
          {BUCKET_LABELS[bucket]}{" "}
          <span className="text-slate-500">({rows.length})</span>
        </h3>
        <p className="text-xs text-slate-500">{BUCKET_DESCRIPTIONS[bucket]}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Rubro</th>
              <th className="px-3 py-2 font-medium">Actividad</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Atraso</th>
              <th className="px-3 py-2 font-medium">Semáforo</th>
              <th className="px-3 py-2 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map(({ actividad, prospect, semaforo }) => (
              <tr
                key={`${prospect.id}-${actividad.id}`}
                className="border-t border-slate-800"
              >
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {isValidISODate(actividad.fecha)
                    ? formatProspectDate(actividad.fecha)
                    : "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">
                  {actividad.hora ?? "—"}
                </td>
                <td className="px-3 py-2.5 font-medium">{prospect.nombre}</td>
                <td className="px-3 py-2.5 text-slate-400">
                  {RUBRO_LABELS[prospect.rubro]}
                </td>
                <td className="px-3 py-2.5">
                  {ACTIVITY_TYPE_LABELS[actividad.tipo]}
                </td>
                <td className="px-3 py-2.5 text-slate-400">
                  {actividad.responsable ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      actividad.estado === "vencida"
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-slate-700/60 text-slate-300"
                    }`}
                  >
                    {ACTIVITY_STATUS_LABELS[actividad.estado]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${atrasoDotClass(
                      actividad.fecha,
                      actividad.estado,
                      today,
                    )}`}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <TrafficLightDot value={semaforo} />
                </td>
                <td className="px-3 py-2.5 text-right">
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
    </div>
  );
}
