"use client";

import { useState, type ReactNode } from "react";
import {
  estadoInvestigacionLabel,
  type EstadoInvestigacion,
} from "@/lib/inteligencia-mercado/types";

// Paleta premium alineada con la landing /encuesta: superficie #081726,
// tarjetas #0d2236, acentos verde Pickup4x4, bordes sutiles.
export const SURFACE = "#081726";
export const CARD = "#0d2236";

export const primaryCtaClass =
  "inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#06140f] shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryBtnClass =
  "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08]";

export const actionBtnClass =
  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07]";

export const dangerBtnClass =
  "rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20";

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0a1d2e] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

export const selectClass =
  "min-h-[2.5rem] rounded-xl border border-white/10 bg-[#0a1d2e] px-3 text-sm text-white transition focus:border-emerald-500/60 focus:outline-none";

/** KPI premium (reemplazo local de StatCard, sin tocar el compartido). */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d2236] p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl"
      />
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-sm text-emerald-300/80">{hint}</p> : null}
    </article>
  );
}

/** Panel premium (reemplazo local de SectionCard, sin tocar el compartido). */
export function PanelCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d2236] shadow-[0_18px_50px_-28px_rgba(0,0,0,0.8)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

const estadoBadgeClass: Record<EstadoInvestigacion, string> = {
  borrador: "bg-slate-500/20 text-slate-300",
  activa: "bg-emerald-500/15 text-emerald-300",
  cerrada: "bg-amber-500/15 text-amber-200",
};

export function EstadoBadge({ estado }: { estado: EstadoInvestigacion }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estadoBadgeClass[estado]}`}
    >
      {estadoInvestigacionLabel[estado]}
    </span>
  );
}

export function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
          className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
            active === tab.id
              ? "bg-emerald-500/15 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Panel para compartir la encuesta: link, WhatsApp, email y QR. */
export function SharePanel({ slug }: { slug: string }) {
  const [copiado, setCopiado] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/encuesta/${slug}`
      : `/encuesta/${slug}`;

  const mensaje = `Te invitamos a una breve entrevista (3-5 min) sobre el mercado 4x4: ${url}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  const email = `mailto:?subject=${encodeURIComponent(
    "Encuesta Pickup 4x4",
  )}&body=${encodeURIComponent(mensaje)}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    url,
  )}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={url}
            className={`${inputClass} font-mono text-xs`}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" onClick={() => void copiar()} className={secondaryBtnClass}>
            {copiado ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={actionBtnClass}
          >
            Compartir por WhatsApp
          </a>
          <a href={email} className={actionBtnClass}>
            Compartir por email
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer" className={actionBtnClass}>
            Abrir encuesta
          </a>
        </div>
        <p className="text-xs text-slate-500">
          El QR se genera con un servicio externo (api.qrserver.com) a partir del
          link público.
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr}
        alt={`Código QR para ${url}`}
        width={120}
        height={120}
        className="h-[120px] w-[120px] shrink-0 self-start rounded-lg border border-white/10 bg-white p-1"
      />
    </div>
  );
}
