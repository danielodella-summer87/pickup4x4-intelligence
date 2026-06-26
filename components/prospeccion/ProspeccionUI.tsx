"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type {
  ProspectPriority,
  ProspectStage,
  ProspectTrafficLight,
} from "@/lib/models/prospeccion";
import {
  PRIORITY_LABELS,
  RUBRO_LABELS,
  STAGE_LABELS,
  TRAFFIC_LIGHT_LABELS,
  type NextActivityState,
} from "@/lib/prospeccion/helpers";
import type { ProspectRubro } from "@/lib/models/prospeccion";

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";

// ───────────────────────────────────────────────────────── Semáforo

const trafficDotColor: Record<ProspectTrafficLight, string> = {
  verde: "bg-emerald-400",
  amarillo: "bg-amber-400",
  rojo: "bg-rose-400",
  gris: "bg-slate-500",
};

const trafficBadgeColor: Record<ProspectTrafficLight, string> = {
  verde: "bg-emerald-500/15 text-emerald-300",
  amarillo: "bg-amber-500/15 text-amber-300",
  rojo: "bg-rose-500/15 text-rose-300",
  gris: "bg-slate-700/60 text-slate-300",
};

export function TrafficLightDot({ value }: { value: ProspectTrafficLight }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${trafficDotColor[value]}`}
      title={TRAFFIC_LIGHT_LABELS[value]}
      aria-label={TRAFFIC_LIGHT_LABELS[value]}
    />
  );
}

export function TrafficLightBadge({ value }: { value: ProspectTrafficLight }) {
  return (
    <span className={`${badgeBase} ${trafficBadgeColor[value]}`}>
      <span className={`h-2 w-2 rounded-full ${trafficDotColor[value]}`} />
      {TRAFFIC_LIGHT_LABELS[value]}
    </span>
  );
}

// ───────────────────────────────────────────────────────── Etapa

function stageColor(stage: ProspectStage): string {
  if (stage === "ganada") return "bg-emerald-500/15 text-emerald-300";
  if (stage === "perdida") return "bg-rose-500/15 text-rose-300";
  if (stage === "sin_oportunidad") return "bg-slate-700/60 text-slate-400";
  if (stage === "propuesta_enviada" || stage === "seguimiento_negociacion") {
    return "bg-sky-500/15 text-sky-300";
  }
  return "bg-slate-700/60 text-slate-300";
}

export function StageBadge({ value }: { value: ProspectStage }) {
  return <span className={`${badgeBase} ${stageColor(value)}`}>{STAGE_LABELS[value]}</span>;
}

// ───────────────────────────────────────────────────────── Prioridad

const priorityColor: Record<ProspectPriority, string> = {
  alta: "bg-rose-500/15 text-rose-300",
  media: "bg-amber-500/15 text-amber-300",
  baja: "bg-slate-700/60 text-slate-300",
};

export function PriorityBadge({ value }: { value: ProspectPriority }) {
  return (
    <span className={`${badgeBase} ${priorityColor[value]}`}>
      {PRIORITY_LABELS[value]}
    </span>
  );
}

// ───────────────────────────────────────────────────────── Rubro

export function RubroBadge({ value }: { value: ProspectRubro }) {
  return (
    <span className={`${badgeBase} bg-indigo-500/15 text-indigo-300`}>
      {RUBRO_LABELS[value]}
    </span>
  );
}

// ─────────────────────────────────────────── Estado de próxima actividad

const nextActivityColor: Record<NextActivityState, string> = {
  sin_actividad: "bg-rose-500/15 text-rose-300",
  vencida: "bg-rose-500/15 text-rose-300",
  hoy: "bg-amber-500/15 text-amber-300",
  proxima_7: "bg-sky-500/15 text-sky-300",
  futura: "bg-slate-700/60 text-slate-300",
};

const nextActivityLabel: Record<NextActivityState, string> = {
  sin_actividad: "Sin próxima actividad",
  vencida: "Vencida",
  hoy: "Hoy",
  proxima_7: "Esta semana",
  futura: "Programada",
};

export function NextActivityBadge({ state }: { state: NextActivityState }) {
  return (
    <span className={`${badgeBase} ${nextActivityColor[state]}`}>
      {nextActivityLabel[state]}
    </span>
  );
}

// ───────────────────────────────────────────────────────── Sub-navegación

const tabs = [
  { href: "/prospeccion-empresas", label: "Oportunidades" },
  { href: "/prospeccion-empresas/agenda", label: "Agenda" },
  { href: "/prospeccion-empresas/propuestas", label: "Propuestas" },
  { href: "/prospeccion-empresas/configuracion", label: "Configuración" },
];

export function ProspeccionTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active =
          tab.href === "/prospeccion-empresas"
            ? pathname === tab.href ||
              (pathname.startsWith("/prospeccion-empresas/") &&
                !pathname.startsWith("/prospeccion-empresas/agenda") &&
                !pathname.startsWith("/prospeccion-empresas/propuestas") &&
                !pathname.startsWith("/prospeccion-empresas/configuracion"))
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ───────────────────────────────── Sección colapsable con contador

/**
 * Tarjeta de sección colapsable (mismo look que SectionCard). Muestra un
 * contador opcional junto al título y un CTA de acción visible solo al expandir.
 */
export function CollapsibleSection({
  title,
  count,
  countLabel,
  description,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  /** Contador simple: muestra "(count)". */
  count?: number;
  /** Etiqueta de contador libre (tiene prioridad), ej "1 de 12". */
  countLabel?: string;
  description?: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-900/40">
      <header
        className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
          open ? "border-b border-slate-700/60" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          <span className="min-w-0">
            <h2 className="text-base font-semibold text-white">
              {title}
              {countLabel ? (
                <span className="font-normal text-slate-400"> ({countLabel})</span>
              ) : typeof count === "number" ? (
                <span className="font-normal text-slate-400"> ({count})</span>
              ) : null}
            </h2>
            {description && open ? (
              <span className="mt-1 block text-sm text-slate-400">{description}</span>
            ) : null}
          </span>
        </button>
        {open && action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {open ? <div className="p-5">{children}</div> : null}
    </section>
  );
}

// ───────────────────────────────────── Bloque de ayuda / capacitación

export function GuiaUso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-5 py-4 text-sm leading-relaxed text-slate-300">
      {children}
    </div>
  );
}
