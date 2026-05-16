"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { useSolicitudes } from "@/contexts/SolicitudesContext";
import type { SolicitudLocal, SolicitudLocalEstado } from "@/lib/models/solicitud";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryBtnClass =
  "rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700";

const estadoLabel: Record<SolicitudLocalEstado, string> = {
  nueva: "Nueva",
  en_revision: "En revisión",
  enviada: "Enviada",
  descartada: "Descartada",
};

const estadoBadgeClass: Record<SolicitudLocalEstado, string> = {
  nueva: "bg-sky-500/15 text-sky-300",
  en_revision: "bg-amber-500/15 text-amber-300",
  enviada: "bg-emerald-500/15 text-emerald-300",
  descartada: "bg-slate-500/20 text-slate-400",
};

const ESTADOS_ORDEN: SolicitudLocalEstado[] = [
  "nueva",
  "en_revision",
  "enviada",
  "descartada",
];

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function contarPorEstado(solicitudes: SolicitudLocal[]) {
  const counts: Record<SolicitudLocalEstado, number> = {
    nueva: 0,
    en_revision: 0,
    enviada: 0,
    descartada: 0,
  };
  for (const s of solicitudes) {
    counts[s.estado] += 1;
  }
  return counts;
}

function SolicitudCard({
  solicitud,
  onEstadoChange,
  onEliminar,
}: {
  solicitud: SolicitudLocal;
  onEstadoChange: (estado: SolicitudLocalEstado) => void;
  onEliminar: () => void;
}) {
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-950/50">
      <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{solicitud.nombre}</p>
            <p className="mt-1 text-sm text-slate-400">
              {solicitud.telefono || "Sin teléfono"} · {solicitud.marcaVehiculo}{" "}
              {solicitud.modeloVehiculo}
            </p>
            <p className="mt-1 text-xs text-slate-500">{formatFecha(solicitud.fecha)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estadoBadgeClass[solicitud.estado]}`}
            >
              {estadoLabel[solicitud.estado]}
            </span>
            <span className="rounded-lg bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
              {solicitud.articulos.length} artículo
              {solicitud.articulos.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </summary>

      <div className="border-t border-slate-800 px-4 pb-5 pt-4 sm:px-5">
        {solicitud.observaciones ? (
          <p className="text-sm text-slate-400">
            <span className="font-medium text-slate-300">Observaciones: </span>
            {solicitud.observaciones}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Sin observaciones.</p>
        )}

        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Artículos solicitados
        </p>
        <ul className="mt-2 space-y-2">
          {solicitud.articulos.map((articulo) => (
            <li
              key={articulo.codigoUnico}
              className="rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-sm"
            >
              <p className="text-slate-200">{articulo.descripcion}</p>
              <p className="font-mono text-xs text-slate-500">{articulo.codigoUnico}</p>
              {(articulo.categoria || articulo.rubro) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[articulo.categoria, articulo.rubro].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Estado
            <select
              value={solicitud.estado}
              onChange={(e) =>
                onEstadoChange(e.target.value as SolicitudLocalEstado)
              }
              className="min-h-[2.5rem] rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white"
            >
              {ESTADOS_ORDEN.map((estado) => (
                <option key={estado} value={estado}>
                  {estadoLabel[estado]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onEliminar} className={secondaryBtnClass}>
            Eliminar
          </button>
        </div>
      </div>
    </details>
  );
}

export default function SolicitudesPage() {
  const { solicitudes, isHydrated, updateSolicitudEstado, deleteSolicitud } =
    useSolicitudes();

  const conteos = useMemo(() => contarPorEstado(solicitudes), [solicitudes]);

  const ordenadas = useMemo(
    () =>
      [...solicitudes].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      ),
    [solicitudes],
  );

  return (
    <AppShell
      moduleTitle="Solicitudes de presupuesto"
      moduleDescription="Solicitudes generadas en el mostrador táctil de este navegador."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Nuevas" value={String(conteos.nueva)} trend="neutral" />
          <StatCard
            label="En revisión"
            value={String(conteos.en_revision)}
            trend="neutral"
          />
          <StatCard label="Enviadas" value={String(conteos.enviada)} trend="up" />
          <StatCard
            label="Descartadas"
            value={String(conteos.descartada)}
            trend="down"
          />
        </div>

        <SectionCard
          title="Listado de solicitudes"
          description={
            isHydrated
              ? `${solicitudes.length} solicitud${solicitudes.length === 1 ? "" : "es"} guardada${solicitudes.length === 1 ? "" : "s"} localmente`
              : "Cargando…"
          }
        >
          {!isHydrated ? (
            <p className="text-sm text-slate-500">Cargando solicitudes…</p>
          ) : ordenadas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-10 text-center">
              <p className="text-base font-medium text-slate-300">
                Todavía no hay solicitudes
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Creá una desde el mostrador táctil: elegí vehículo, accesorios y
                guardá la solicitud.
              </p>
              <Link href="/distribuidor" className={`${primaryCtaClass} mt-6 inline-flex`}>
                Ir al mostrador táctil
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {ordenadas.map((solicitud) => (
                <li key={solicitud.id}>
                  <SolicitudCard
                    solicitud={solicitud}
                    onEstadoChange={(estado) =>
                      updateSolicitudEstado(solicitud.id, estado)
                    }
                    onEliminar={() => deleteSolicitud(solicitud.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
