"use client";

import { useMemo, type ReactNode } from "react";
import { PanelCard, SharePanel, formatFecha } from "@/components/inteligencia-mercado/ui";
import {
  AreaTrend,
  BarChart,
  CHART,
  DonutChart,
  KpiCard,
  RankingBars,
} from "@/components/inteligencia-mercado/charts";
import { computeCommandCenter } from "@/lib/inteligencia-mercado/command-center";
import type { Investigacion, Respuesta } from "@/lib/inteligencia-mercado/types";

/** Celda de la grilla de 12 columnas. */
function Cell({ span, children }: { span: string; children: ReactNode }) {
  return <div className={`col-span-12 ${span}`}>{children}</div>;
}

export function CommandCenter({
  investigaciones,
  respuestas,
  scope = "global",
}: {
  investigaciones: Investigacion[];
  respuestas: Respuesta[];
  scope?: "global" | "investigacion";
}) {
  const data = useMemo(
    () => computeCommandCenter(investigaciones, respuestas, scope),
    [investigaciones, respuestas, scope],
  );

  const esInvestigacion = scope === "investigacion";

  if (investigaciones.length === 0) {
    return (
      <PanelCard
        title="Command Center"
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

  const k = data.kpis;
  const activas = investigaciones.filter((i) => i.estado === "activa");

  const ultima = k.ultimaRespuesta ? new Date(k.ultimaRespuesta) : null;
  const ultimaValida = ultima && !Number.isNaN(ultima.getTime()) ? ultima : null;
  const ultimaFecha = ultimaValida
    ? ultimaValida.toLocaleDateString("es-UY", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "—";
  const ultimaHora = ultimaValida
    ? ultimaValida.toLocaleTimeString("es-UY", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ── FILA 1 · KPIs ejecutivos ─────────────────────────────────────── */}
      <Cell span="sm:col-span-6 lg:col-span-4">
        <KpiCard
          label="Respuestas"
          value={String(k.totalRespuestas)}
          delta={k.deltaRespuestas}
          spark={k.sparkRespuestas}
          hint={`${k.respuestas7d} en los últimos 7 días`}
          destacado
        />
      </Cell>
      <Cell span="col-span-6 lg:col-span-2">
        <KpiCard
          label="Distribuidores"
          value={String(k.distribuidoresUnicos)}
          hint="participantes únicos"
        />
      </Cell>
      <Cell span="col-span-6 lg:col-span-2">
        {esInvestigacion && data.completitud ? (
          <KpiCard
            label="Preguntas respondidas"
            value={`${data.completitud.promedio} / ${data.completitud.totalPreguntas}`}
            hint={`${data.completitud.pct}% completas`}
            compact
            tono={data.completitud.pct >= 70 ? "positivo" : "neutral"}
          />
        ) : (
          <KpiCard
            label="Activas"
            value={String(k.investigacionesActivas)}
            hint={`de ${k.totalInvestigaciones} investigaciones`}
            tono={k.investigacionesActivas > 0 ? "positivo" : "neutral"}
          />
        )}
      </Cell>
      <Cell span="col-span-6 lg:col-span-2">
        <KpiCard
          label="Departamentos"
          value={String(k.departamentosCubiertos)}
          hint="cubiertos (de 19)"
        />
      </Cell>
      <Cell span="col-span-6 lg:col-span-2">
        <KpiCard
          label="Última respuesta"
          value={ultimaFecha}
          hint={ultimaHora ?? "sin respuestas aún"}
          compact
        />
      </Cell>

      {/* ── FILA 2 · Evolución temporal + composición ────────────────────── */}
      <Cell span="lg:col-span-8">
        <PanelCard
          title="Evolución de respuestas"
          description={
            data.evolucion.bucket === "semana"
              ? "Volumen por semana"
              : "Volumen por día"
          }
        >
          <AreaTrend puntos={data.evolucion.puntos} />
        </PanelCard>
      </Cell>
      <Cell span="lg:col-span-4">
        {esInvestigacion ? (
          data.preguntaClave ? (
            <PanelCard
              title="Pregunta clave"
              description={data.preguntaClave.titulo}
            >
              <DonutChart
                data={data.preguntaClave.distribucion}
                centroLabel="respuestas"
              />
            </PanelCard>
          ) : (
            <PanelCard
              title="Distribución por departamento"
              description="Dónde respondió la red"
            >
              <DonutChart
                data={data.porDepartamento.map((d) => ({
                  label: d.label,
                  valor: d.valor,
                }))}
                centroLabel="respuestas"
              />
            </PanelCard>
          )
        ) : (
          <PanelCard
            title="Por investigación"
            description="Participación de cada encuesta"
          >
            <DonutChart data={data.porInvestigacion} centroLabel="respuestas" />
          </PanelCard>
        )}
      </Cell>

      {/* ── FILA 3 · Rankings + barras ───────────────────────────────────── */}
      <Cell span="lg:col-span-6">
        <PanelCard
          title="Cobertura por departamento"
          description="Dónde se concentra la red"
        >
          <RankingBars data={data.porDepartamento} max={8} sufijo="" />
        </PanelCard>
      </Cell>
      <Cell span="lg:col-span-6">
        <PanelCard
          title="Tendencias del mercado"
          description="Términos más mencionados"
        >
          {data.tendencias.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin menciones suficientes para detectar tendencias todavía.
            </p>
          ) : (
            <BarChart
              data={data.tendencias.slice(0, 8).map((t) => ({
                label: t.termino,
                valor: t.conteo,
              }))}
            />
          )}
        </PanelCard>
      </Cell>

      {/* ── FILA 4 · Oportunidades resumidas ─────────────────────────────── */}
      <Cell span="">
        <PanelCard
          title="Oportunidades ejecutivas"
          description="Señales de demanda agregadas por categoría"
        >
          {data.oportunidades.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay preguntas etiquetadas como oportunidad/necesidad/idea
              con respuestas.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.oportunidades.map((o) => (
                <div
                  key={o.etiqueta}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{o.label}</h3>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                      style={{
                        color: CHART.positive,
                        backgroundColor: `${CHART.positive}1f`,
                      }}
                    >
                      {o.total}
                    </span>
                  </div>
                  <div className="mt-3">
                    {o.repetidos.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {o.total} mención(es), sin términos repetidos.
                      </p>
                    ) : (
                      <RankingBars
                        data={o.repetidos.map((m) => ({
                          label: m.termino,
                          valor: m.conteo,
                        }))}
                        max={4}
                        color={CHART.series[1]}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </Cell>

      {/* ── FILA 5 · Comentarios + actividad reciente ────────────────────── */}
      <Cell span="lg:col-span-6">
        <PanelCard
          title="Comentarios relevantes"
          description="La voz del distribuidor"
        >
          {data.comentarios.length === 0 ? (
            <p className="text-sm text-slate-500">Sin comentarios todavía.</p>
          ) : (
            <ul className="space-y-3">
              {data.comentarios.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"
                >
                  <p className="text-sm text-slate-200">“{c.texto}”</p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {c.distribuidor || "Anónimo"}
                    {c.departamento ? ` · ${c.departamento}` : ""} ·{" "}
                    {formatFecha(c.fecha)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </Cell>
      <Cell span="lg:col-span-6">
        <PanelCard
          title="Actividad reciente"
          description="Últimas respuestas recibidas"
        >
          {data.actividad.length === 0 ? (
            <p className="text-sm text-slate-500">Sin actividad todavía.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.actividad.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">
                      {a.distribuidor}
                      {a.departamento ? (
                        <span className="text-slate-500"> · {a.departamento}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {a.investigacion}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatFecha(a.fecha)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </Cell>

      {/* ── Share rápido ─────────────────────────────────────────────────── */}
      {esInvestigacion && investigaciones[0] ? (
        <Cell span="">
          <PanelCard
            title="Compartir encuesta"
            description="Reenviá esta encuesta para seguir sumando respuestas a este dashboard."
          >
            <SharePanel slug={investigaciones[0].slug} />
          </PanelCard>
        </Cell>
      ) : activas.length > 0 ? (
        <Cell span="">
          <PanelCard
            title="Investigaciones activas"
            description="Compartí las encuestas abiertas con la red."
          >
            <ul className="grid gap-4 lg:grid-cols-2">
              {activas.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4"
                >
                  <p className="font-medium text-white">{inv.titulo}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {respuestas.filter((r) => r.investigacionId === inv.id).length}{" "}
                    respuesta(s)
                  </p>
                  <div className="mt-3">
                    <SharePanel slug={inv.slug} />
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        </Cell>
      ) : null}
    </div>
  );
}
