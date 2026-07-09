"use client";

import { computeCalidadRma } from "@/lib/inteligencia-mercado/calidad-rma";
import type { Investigacion, Respuesta } from "@/lib/inteligencia-mercado/types";
import { formatFecha } from "@/components/inteligencia-mercado/ui";

function SeccionCard({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-emerald-300">{titulo}</h3>
      {descripcion ? <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function BarraPorcentaje({ titulo, porcentaje }: { titulo: string; porcentaje: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm text-slate-200">
        <span>{titulo}</span>
        <span className="font-semibold text-emerald-300">{porcentaje}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500/70"
          style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }}
        />
      </div>
    </div>
  );
}

function MencionChips({ menciones }: { menciones: { termino: string; conteo: number }[] }) {
  if (menciones.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos todavía.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {menciones.slice(0, 12).map((m) => (
        <li
          key={m.termino}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200"
        >
          {m.termino}
          <span className="ml-1.5 font-semibold text-emerald-300">{m.conteo}</span>
        </li>
      ))}
    </ul>
  );
}

export function CalidadRmaView({
  inv,
  respuestas,
}: {
  inv: Investigacion;
  respuestas: Respuesta[];
}) {
  const data = computeCalidadRma(inv, respuestas);

  return (
    <div className="space-y-4">
      {/* ── Resumen ejecutivo ── */}
      <SeccionCard titulo="Resumen ejecutivo">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-2xl font-semibold text-white">{data.resumen.totalRespuestas}</p>
            <p className="text-xs text-slate-500">Respuestas</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-rose-300">{data.resumen.alertas}</p>
            <p className="text-xs text-slate-500">Alertas de riesgo</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-amber-300">{data.resumen.recomendaciones}</p>
            <p className="text-xs text-slate-500">Recomendaciones activas</p>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {formatFecha(data.resumen.primeraRespuesta)} — {formatFecha(data.resumen.ultimaRespuesta)}
            </p>
            <p className="text-xs text-slate-500">Período cubierto</p>
          </div>
        </div>
        {data.resumen.porArea.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Respuestas por área/rol</p>
            <MencionChips menciones={data.resumen.porArea} />
          </div>
        ) : null}
      </SeccionCard>

      {/* ── Acciones recomendadas ── */}
      <SeccionCard
        titulo="Acciones recomendadas"
        descripcion="Reglas simples sobre umbrales de % de respuestas — ver lib/inteligencia-mercado/calidad-rma.ts."
      >
        {data.accionesRecomendadas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ninguna regla superó su umbral con los datos y filtros actuales.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.accionesRecomendadas.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border p-3 ${
                  a.tipo === "alerta"
                    ? "border-rose-500/40 bg-rose-500/10"
                    : "border-amber-500/30 bg-amber-500/[0.06]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${a.tipo === "alerta" ? "text-rose-200" : "text-amber-200"}`}>
                    {a.tipo === "alerta" ? "⚠ " : ""}
                    {a.titulo}
                  </p>
                  <span className="text-xs text-slate-400">
                    {a.porcentaje}% (umbral {a.umbral}%)
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{a.motivo}</p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-200">
                  {a.acciones.map((accion) => (
                    <li key={accion}>{accion}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </SeccionCard>

      {/* ── Top 5 errores detectados ── */}
      <SeccionCard titulo="Top 5 errores detectados">
        {data.top5Errores.length === 0 ? (
          <p className="text-sm text-slate-500">Sin datos todavía.</p>
        ) : (
          <div className="space-y-3">
            {data.top5Errores.map((e) => (
              <BarraPorcentaje key={e.titulo} titulo={e.titulo} porcentaje={e.porcentaje} />
            ))}
          </div>
        )}
      </SeccionCard>

      {/* ── Origen probable del error ── */}
      <SeccionCard titulo="Origen probable del error" descripcion="% de respuestas de cada área/rol que reportó al menos un problema.">
        {data.origenProbable.length === 0 ? (
          <p className="text-sm text-slate-500">Sin datos todavía.</p>
        ) : (
          <div className="space-y-3">
            {data.origenProbable.map((o) => (
              <BarraPorcentaje
                key={o.area}
                titulo={`${o.area} (${o.totalRespuestas} respuesta(s))`}
                porcentaje={o.porcentajeConProblema}
              />
            ))}
          </div>
        )}
      </SeccionCard>

      {/* ── Impacto comercial ── */}
      <SeccionCard titulo="Impacto comercial" descripcion="Consecuencia más frecuente de cotizaciones incompletas.">
        <MencionChips menciones={data.impactoComercial} />
      </SeccionCard>

      {/* ── Causas de RMA ── */}
      <SeccionCard titulo="Causas de RMA">
        <MencionChips menciones={data.causasRma} />
      </SeccionCard>

      {/* ── Problemas de instalación ── */}
      <SeccionCard titulo="Problemas de instalación">
        <div className="space-y-3">
          {data.problemasInstalacion.map((p) => (
            <BarraPorcentaje key={p.titulo} titulo={p.titulo} porcentaje={p.porcentaje} />
          ))}
        </div>
      </SeccionCard>

      {/* ── Cortes de comunicación interna ── */}
      <SeccionCard
        titulo="Cortes de comunicación interna"
        descripcion={`${data.comunicacionInterna.porcentajeRegularOPeor}% calificó la comunicación como Regular o peor.`}
      >
        <MencionChips menciones={data.comunicacionInterna.distribucion} />
      </SeccionCard>

      {/* ── Puntos críticos del proceso ── */}
      <SeccionCard titulo="Puntos críticos del proceso">
        <div className="space-y-3">
          {data.puntosCriticos.map((p) => (
            <BarraPorcentaje key={p.titulo} titulo={p.titulo} porcentaje={p.porcentaje} />
          ))}
        </div>
      </SeccionCard>
    </div>
  );
}
