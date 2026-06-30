"use client";

import { useState } from "react";
import {
  EstadoBadge,
  PanelCard,
  SharePanel,
  primaryCtaClass,
  secondaryBtnClass,
} from "@/components/inteligencia-mercado/ui";
import { computeResumenInvestigacion } from "@/lib/inteligencia-mercado/command-center";
import type { Investigacion, Respuesta } from "@/lib/inteligencia-mercado/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <p className="truncate text-lg font-semibold tabular-nums text-white">
        {value}
      </p>
      <p
        title={label}
        className="truncate text-[10px] uppercase tracking-wide text-slate-500"
      >
        {label}
      </p>
    </div>
  );
}

function TarjetaInvestigacion({
  inv,
  respuestas,
  onSelect,
}: {
  inv: Investigacion;
  respuestas: Respuesta[];
  onSelect: (id: string) => void;
}) {
  const [compartir, setCompartir] = useState(false);
  const r = computeResumenInvestigacion(inv, respuestas);

  const ultimaDate = r.ultima ? new Date(r.ultima) : null;
  const ultimaCorta =
    ultimaDate && !Number.isNaN(ultimaDate.getTime())
      ? ultimaDate.toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })
      : "—";

  return (
    <li className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#0d2236] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-white">{inv.titulo}</h3>
        <EstadoBadge estado={inv.estado} />
      </div>
      {inv.descripcion ? (
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{inv.descripcion}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Respuestas" value={String(r.respuestas)} />
        <Stat label="Distrib." value={String(r.distribuidores)} />
        <Stat label="Deptos" value={String(r.departamentos)} />
        <Stat label="Última" value={ultimaCorta} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(inv.id)}
          className={primaryCtaClass}
        >
          Ver dashboard
        </button>
        <button
          type="button"
          onClick={() => setCompartir((v) => !v)}
          className={secondaryBtnClass}
        >
          {compartir ? "Ocultar" : "Compartir encuesta"}
        </button>
      </div>

      {compartir ? (
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <SharePanel slug={inv.slug} />
        </div>
      ) : null}
    </li>
  );
}

export function ListaInvestigaciones({
  investigaciones,
  respuestas,
  onSelect,
  onVerGlobal,
}: {
  investigaciones: Investigacion[];
  respuestas: Respuesta[];
  onSelect: (id: string) => void;
  onVerGlobal: () => void;
}) {
  if (investigaciones.length === 0) {
    return (
      <PanelCard
        title="Investigaciones de Mercado"
        description="Tu panel ejecutivo de inteligencia de mercado."
      >
        <p className="text-sm text-slate-400">
          Todavía no hay investigaciones. Creá la primera en la pestaña{" "}
          <span className="text-slate-200">Investigaciones</span> para empezar a
          capturar señales del mercado.
        </p>
      </PanelCard>
    );
  }

  // Activas primero, luego por título.
  const ordenadas = [...investigaciones].sort((a, b) => {
    if (a.estado === "activa" && b.estado !== "activa") return -1;
    if (b.estado === "activa" && a.estado !== "activa") return 1;
    return a.titulo.localeCompare(b.titulo);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Investigaciones de Mercado
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Elegí una investigación para ver su dashboard. Cada encuesta tiene su
            propio panel; reenviarla suma respuestas al mismo dashboard.
          </p>
        </div>
        {investigaciones.length > 1 ? (
          <button type="button" onClick={onVerGlobal} className={secondaryBtnClass}>
            Vista global comparativa
          </button>
        ) : null}
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {ordenadas.map((inv) => (
          <TarjetaInvestigacion
            key={inv.id}
            inv={inv}
            respuestas={respuestas}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}
