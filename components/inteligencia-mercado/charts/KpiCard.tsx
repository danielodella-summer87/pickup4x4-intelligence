"use client";

import { CHART } from "./theme";
import { Sparkline } from "./Sparkline";

export type KpiTono = "neutral" | "positivo" | "alerta";

export type KpiDelta = {
  /** Variación absoluta (positiva o negativa). */
  valor: number;
  /** Variación porcentual; null si el período previo era 0. */
  pct: number | null;
};

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  delta?: KpiDelta;
  spark?: number[];
  /** Tarjeta protagonista (número más grande + anillo de acento). */
  destacado?: boolean;
  /** Valor no numérico (ej. fecha): usa una tipografía más chica. */
  compact?: boolean;
  /** Color del sparkline / acento. Por defecto, azul de datos. */
  tono?: KpiTono;
};

function deltaColor(valor: number): string {
  // Verde solo positivo, rojo solo negativo (regla de color).
  if (valor > 0) return CHART.positive;
  if (valor < 0) return CHART.danger;
  return CHART.textMuted;
}

function flecha(valor: number): string {
  if (valor > 0) return "↑";
  if (valor < 0) return "↓";
  return "→";
}

/**
 * KPI ejecutivo. Número grande, delta semántico (verde alza / rojo caída) y
 * sparkline opcional. `destacado` lo convierte en la métrica estrella.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  spark,
  destacado = false,
  compact = false,
  tono = "neutral",
}: KpiCardProps) {
  const sparkColor =
    tono === "positivo"
      ? CHART.positive
      : tono === "alerta"
        ? CHART.alert
        : CHART.data;

  return (
    <article
      className={[
        "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-[#0d2236] p-5",
        destacado
          ? "border-sky-400/25 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_18px_50px_-30px_rgba(56,189,248,0.45)]"
          : "border-white/[0.07]",
      ].join(" ")}
    >
      {destacado ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl"
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-2">
        <p
          title={label}
          className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase leading-tight tracking-normal text-slate-400"
        >
          {label}
        </p>
        {delta ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
            style={{
              color: deltaColor(delta.valor),
              backgroundColor: `${deltaColor(delta.valor)}1f`,
            }}
          >
            {flecha(delta.valor)}{" "}
            {delta.pct === null
              ? `${delta.valor > 0 ? "+" : ""}${delta.valor}`
              : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`}
          </span>
        ) : null}
      </div>

      <p
        className={[
          "relative mt-2 font-semibold tracking-tight text-white tabular-nums",
          destacado ? "text-4xl sm:text-5xl" : compact ? "text-xl" : "text-3xl",
        ].join(" ")}
      >
        {value}
      </p>

      {hint ? (
        <p className="relative mt-1 text-sm text-slate-400">{hint}</p>
      ) : null}

      {spark && spark.length > 1 ? (
        <div className="relative mt-auto pt-4">
          <Sparkline
            data={spark}
            width={destacado ? 220 : 130}
            height={destacado ? 44 : 34}
            color={sparkColor}
            showDot
          />
        </div>
      ) : null}
    </article>
  );
}
