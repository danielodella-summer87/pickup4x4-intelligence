"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  EstadoBadge,
  PanelCard,
  Tabs,
  SharePanel,
  actionBtnClass,
  dangerBtnClass,
  formatFecha,
  inputClass,
  primaryCtaClass,
  secondaryBtnClass,
  selectClass,
} from "@/components/inteligencia-mercado/ui";
import { CommandCenter } from "@/components/inteligencia-mercado/CommandCenter";
import { ListaInvestigaciones } from "@/components/inteligencia-mercado/ListaInvestigaciones";
import { exportInvestigacion } from "@/lib/inteligencia-mercado/export";
import { InvestigacionFormModal } from "@/components/inteligencia-mercado/InvestigacionFormModal";
import {
  deleteInvestigacion,
  loadInvestigaciones,
  loadRespuestas,
  saveInvestigacion,
  setEstadoInvestigacion,
} from "@/lib/inteligencia-mercado/storage";
import {
  computeComentarios,
  computeOportunidades,
  computeTendencias,
} from "@/lib/inteligencia-mercado/aggregations";
import {
  todasLasPreguntas,
  type Investigacion,
  type Respuesta,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

type TabId =
  | "resumen"
  | "investigaciones"
  | "respuestas"
  | "tendencias"
  | "oportunidades"
  | "comentarios";

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "investigaciones", label: "Investigaciones" },
  { id: "respuestas", label: "Respuestas" },
  { id: "tendencias", label: "Tendencias" },
  { id: "oportunidades", label: "Oportunidades" },
  { id: "comentarios", label: "Comentarios" },
];

function valorLegible(valor: RespuestaValor): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}

export default function InteligenciaMercadoPage() {
  const [investigaciones, setInvestigaciones] = useState<Investigacion[]>([]);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("resumen");
  const [selectedId, setSelectedId] = useState<string>("");

  // Resumen: investigación elegida para ver su dashboard (null = lista de entrada)
  // y vista global comparativa opcional.
  const [dashInvId, setDashInvId] = useState<string | null>(null);
  const [vistaGlobal, setVistaGlobal] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Investigacion | null>(null);
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState<Respuesta | null>(null);

  // Filtros tab respuestas
  const [busqueda, setBusqueda] = useState("");
  const [filtroInvestigacion, setFiltroInvestigacion] = useState("");
  const [filtroDepartamento, setFiltroDepartamento] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const [invRes, respRes] = await Promise.all([
      loadInvestigaciones(),
      loadRespuestas(),
    ]);

    if (!invRes.ok) {
      setLoadError(invRes.errorMessage);
      setInvestigaciones([]);
      setRespuestas([]);
      setIsLoading(false);
      return;
    }
    setInvestigaciones(invRes.investigaciones);
    setRespuestas(respRes.ok ? respRes.respuestas : []);
    if (!respRes.ok) setActionError(respRes.errorMessage);

    setSelectedId((prev) => {
      if (prev && invRes.investigaciones.some((i) => i.id === prev)) return prev;
      const activa = invRes.investigaciones.find((i) => i.estado === "activa");
      return activa?.id ?? invRes.investigaciones[0]?.id ?? "";
    });

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const investigacionById = useMemo(() => {
    const map = new Map<string, Investigacion>();
    for (const inv of investigaciones) map.set(inv.id, inv);
    return map;
  }, [investigaciones]);

  const selected = selectedId ? investigacionById.get(selectedId) ?? null : null;

  const respuestasSeleccionadas = useMemo(
    () => respuestas.filter((r) => r.investigacionId === selectedId),
    [respuestas, selectedId],
  );

  // Dashboard por investigación (independiente del selector de los tabs analíticos).
  const dashInv = dashInvId ? investigacionById.get(dashInvId) ?? null : null;
  const dashRespuestas = useMemo(
    () => (dashInvId ? respuestas.filter((r) => r.investigacionId === dashInvId) : []),
    [respuestas, dashInvId],
  );

  const departamentosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of respuestas) if (r.departamento) set.add(r.departamento);
    return Array.from(set).sort();
  }, [respuestas]);

  const respuestasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return respuestas.filter((r) => {
      if (filtroInvestigacion && r.investigacionId !== filtroInvestigacion) {
        return false;
      }
      if (filtroDepartamento && r.departamento !== filtroDepartamento) {
        return false;
      }
      if (q) {
        const haystack = [
          r.distribuidorNombre,
          r.empresa,
          r.departamento,
          r.comentarioLibre,
          ...Object.values(r.respuestas).map(valorLegible),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [respuestas, busqueda, filtroInvestigacion, filtroDepartamento]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  async function handleGuardar(inv: Investigacion) {
    setActionError(null);
    setSaving(true);
    const result = await saveInvestigacion(inv);
    setSaving(false);
    if (!result.ok) {
      setActionError(result.errorMessage);
      return;
    }
    setModalAbierto(false);
    setEditando(null);
    await refresh();
    setSelectedId(inv.id);
  }

  async function handleEstado(inv: Investigacion, estado: Investigacion["estado"]) {
    setActionError(null);
    const result = await setEstadoInvestigacion(inv.id, estado);
    if (!result.ok) {
      setActionError(result.errorMessage);
      return;
    }
    await refresh();
  }

  async function handleEliminar(inv: Investigacion) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `¿Eliminar "${inv.titulo}" y todas sus respuestas? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setActionError(null);
    const result = await deleteInvestigacion(inv.id);
    if (!result.ok) {
      setActionError(result.errorMessage);
      return;
    }
    await refresh();
  }

  // ── Render ──────────────────────────────────────────────────────────────-

  return (
    <AppShell
      moduleTitle="Inteligencia de Mercado"
      moduleDescription="Investigaciones continuas con la red de distribuidores: capturá conocimiento del mercado para decidir mejor."
    >
      <div className="relative -m-4 min-h-[calc(100vh-8.5rem)] bg-[#081726] p-4 sm:-m-6 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]"
        />
        <div className="relative space-y-6">
        {loadError ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4" role="alert">
            <p className="text-sm font-medium text-rose-200">
              No se pudo cargar Inteligencia de Mercado
            </p>
            <p className="mt-2 text-sm text-rose-100/80">{loadError}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className={`${secondaryBtnClass} mt-4`}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {actionError && !loadError ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" role="alert">
            <p className="text-sm text-amber-100">{actionError}</p>
          </div>
        ) : null}

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {isLoading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : (
          <>
            {/* ── Resumen · Command Center por investigación ── */}
            {tab === "resumen" ? (
              vistaGlobal ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Vista global comparativa
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Todas las investigaciones agregadas. Para análisis por
                        encuesta, volvé a la lista.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVistaGlobal(false)}
                      className={secondaryBtnClass}
                    >
                      ← Volver
                    </button>
                  </div>
                  <CommandCenter
                    investigaciones={investigaciones}
                    respuestas={respuestas}
                    scope="global"
                  />
                </div>
              ) : dashInv ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDashInvId(null)}
                        className={secondaryBtnClass}
                      >
                        ← Volver
                      </button>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {dashInv.titulo}
                        </h2>
                        <p className="text-xs text-slate-500">
                          Dashboard de esta investigación
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={dashInv.id}
                        onChange={(e) => setDashInvId(e.target.value)}
                        className={selectClass}
                        aria-label="Cambiar de investigación"
                      >
                        {investigaciones.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.titulo}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          void exportInvestigacion(dashInv, dashRespuestas, "csv")
                        }
                        disabled={dashRespuestas.length === 0}
                        className={`${actionBtnClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Exportar CSV
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void exportInvestigacion(dashInv, dashRespuestas, "xlsx")
                        }
                        disabled={dashRespuestas.length === 0}
                        className={`${actionBtnClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Excel
                      </button>
                      {investigaciones.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setVistaGlobal(true)}
                          className={actionBtnClass}
                        >
                          Vista global
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <CommandCenter
                    investigaciones={[dashInv]}
                    respuestas={dashRespuestas}
                    scope="investigacion"
                  />
                </div>
              ) : (
                <ListaInvestigaciones
                  investigaciones={investigaciones}
                  respuestas={respuestas}
                  onSelect={setDashInvId}
                  onVerGlobal={() => setVistaGlobal(true)}
                />
              )
            ) : null}

            {/* ── Investigaciones ── */}
            {tab === "investigaciones" ? (
              <PanelCard
                title="Investigaciones"
                description={`${investigaciones.length} en total`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(null);
                      setModalAbierto(true);
                    }}
                    className={primaryCtaClass}
                  >
                    + Nueva investigación
                  </button>
                }
              >
                {investigaciones.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Aún no hay investigaciones. Creá la primera con el botón de arriba.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {investigaciones.map((inv) => {
                      const conteo = respuestas.filter(
                        (r) => r.investigacionId === inv.id,
                      ).length;
                      return (
                        <li
                          key={inv.id}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-white">{inv.titulo}</p>
                                <EstadoBadge estado={inv.estado} />
                              </div>
                              <p className="mt-1 text-sm text-slate-400">{inv.descripcion}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                /encuesta/{inv.slug} · {inv.bloques.length} bloque(s) ·{" "}
                                {todasLasPreguntas(inv).length} pregunta(s) · {conteo}{" "}
                                respuesta(s)
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditando(inv);
                                  setModalAbierto(true);
                                }}
                                className={actionBtnClass}
                              >
                                Editar
                              </button>
                              {inv.estado !== "activa" ? (
                                <button
                                  type="button"
                                  onClick={() => void handleEstado(inv, "activa")}
                                  className={actionBtnClass}
                                >
                                  Activar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleEstado(inv, "cerrada")}
                                  className={actionBtnClass}
                                >
                                  Cerrar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleEliminar(inv)}
                                className={dangerBtnClass}
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                          {inv.estado === "activa" ? (
                            <div className="mt-4 border-t border-white/[0.08] pt-4">
                              <SharePanel slug={inv.slug} />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PanelCard>
            ) : null}

            {/* ── Respuestas ── */}
            {tab === "respuestas" ? (
              <PanelCard
                title="Respuestas"
                description={`${respuestasFiltradas.length} de ${respuestas.length}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar…"
                    className={`${inputClass} max-w-xs`}
                  />
                  <select
                    value={filtroInvestigacion}
                    onChange={(e) => setFiltroInvestigacion(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Todas las investigaciones</option>
                    {investigaciones.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.titulo}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filtroDepartamento}
                    onChange={(e) => setFiltroDepartamento(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Todos los departamentos</option>
                    {departamentosDisponibles.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-5">
                  {respuestasFiltradas.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No hay respuestas para los filtros actuales.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {respuestasFiltradas.map((r) => {
                        const inv = investigacionById.get(r.investigacionId);
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => setDetalle(r)}
                              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.025] p-4 text-left transition hover:border-white/20"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-white">
                                  {r.distribuidorNombre || r.empresa || "Anónimo"}
                                  {r.departamento ? (
                                    <span className="text-slate-500"> · {r.departamento}</span>
                                  ) : null}
                                </p>
                                <span className="text-xs text-slate-500">
                                  {formatFecha(r.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {inv?.titulo ?? r.investigacionSlug} ·{" "}
                                {Object.keys(r.respuestas).length} respuesta(s)
                                {r.comentarioLibre ? " · con comentario" : ""}
                              </p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </PanelCard>
            ) : null}

            {/* ── Tabs analíticas: selector de investigación ── */}
            {tab === "tendencias" || tab === "oportunidades" || tab === "comentarios" ? (
              <PanelCard
                title={
                  tab === "tendencias"
                    ? "Tendencias"
                    : tab === "oportunidades"
                      ? "Oportunidades"
                      : "Comentarios"
                }
                description="Análisis sobre la investigación seleccionada."
                action={
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className={selectClass}
                  >
                    {investigaciones.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.titulo}
                      </option>
                    ))}
                  </select>
                }
              >
                {!selected ? (
                  <p className="text-sm text-slate-500">
                    Seleccioná una investigación.
                  </p>
                ) : respuestasSeleccionadas.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Todavía no hay respuestas para esta investigación.
                  </p>
                ) : tab === "tendencias" ? (
                  <TendenciasView inv={selected} respuestas={respuestasSeleccionadas} />
                ) : tab === "oportunidades" ? (
                  <OportunidadesView inv={selected} respuestas={respuestasSeleccionadas} />
                ) : (
                  <ComentariosView inv={selected} respuestas={respuestasSeleccionadas} />
                )}
              </PanelCard>
            ) : null}
          </>
        )}
        </div>
      </div>

      {modalAbierto ? (
        <InvestigacionFormModal
          initial={editando}
          saving={saving}
          onSave={(inv) => void handleGuardar(inv)}
          onCancel={() => {
            setModalAbierto(false);
            setEditando(null);
          }}
        />
      ) : null}

      {detalle ? (
        <RespuestaDetalleModal
          respuesta={detalle}
          investigacion={investigacionById.get(detalle.investigacionId) ?? null}
          onClose={() => setDetalle(null)}
        />
      ) : null}
    </AppShell>
  );
}

// ── Vistas analíticas ─────────────────────────────────────────────────────-

function TendenciasView({
  inv,
  respuestas,
}: {
  inv: Investigacion;
  respuestas: Respuesta[];
}) {
  const grupos = computeTendencias(inv, respuestas);
  if (grupos.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos para agrupar todavía.</p>;
  }
  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.etiqueta}>
          <h3 className="text-sm font-semibold text-emerald-300">{grupo.label}</h3>
          <div className="mt-2 space-y-4">
            {grupo.preguntas.map((p) => (
              <div key={p.preguntaId}>
                <p className="text-sm text-slate-300">{p.preguntaTitulo}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {p.menciones.slice(0, 12).map((m) => (
                    <li
                      key={m.termino}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200"
                    >
                      {m.termino}
                      <span className="ml-1.5 font-semibold text-emerald-300">{m.conteo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OportunidadesView({
  inv,
  respuestas,
}: {
  inv: Investigacion;
  respuestas: Respuesta[];
}) {
  const grupos = computeOportunidades(inv, respuestas);
  if (grupos.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Esta investigación no tiene preguntas etiquetadas como oportunidad,
        necesidad, importación, idea o empresa, o aún no hay respuestas.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
        <GrupoOportunidadCard key={grupo.etiqueta} grupo={grupo} />
      ))}
    </div>
  );
}

const ENTRADAS_PREVIEW = 3;

function GrupoOportunidadCard({
  grupo,
}: {
  grupo: ReturnType<typeof computeOportunidades>[number];
}) {
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido
    ? grupo.entradas
    : grupo.entradas.slice(0, ENTRADAS_PREVIEW);
  const restantes = grupo.entradas.length - visibles.length;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-emerald-300">{grupo.label}</h3>
        <span className="text-xs text-slate-500">
          {grupo.entradas.length} mención(es)
        </span>
      </div>

      {/* Resumen: términos repetidos (siempre visible) */}
      {grupo.repetidos.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {grupo.repetidos.slice(0, 10).map((m) => (
            <li
              key={m.termino}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-200"
            >
              {m.termino}
              <span className="ml-1.5 font-semibold">×{m.conteo}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Entradas (colapsadas por defecto) */}
      <ul className="mt-3 space-y-2">
        {visibles.map((e, idx) => (
          <li
            key={`${grupo.etiqueta}-${idx}`}
            className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"
          >
            <p className="text-sm text-slate-200">{e.texto}</p>
            <p className="mt-1 text-xs text-slate-500">
              {e.distribuidor || "Anónimo"}
              {e.departamento ? ` · ${e.departamento}` : ""} · {formatFecha(e.fecha)}
            </p>
          </li>
        ))}
      </ul>

      {grupo.entradas.length > ENTRADAS_PREVIEW ? (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className={`${secondaryBtnClass} mt-3`}
        >
          {expandido ? "Ver menos" : `Ver todas (${restantes} más)`}
        </button>
      ) : null}
    </div>
  );
}

function ComentariosView({
  inv,
  respuestas,
}: {
  inv: Investigacion;
  respuestas: Respuesta[];
}) {
  const comentarios = computeComentarios(inv, respuestas);
  if (comentarios.length === 0) {
    return <p className="text-sm text-slate-500">Sin comentarios todavía.</p>;
  }
  return (
    <ul className="space-y-3">
      {comentarios.map((c) => (
        <li key={c.id} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
          <p className="text-sm text-slate-200">{c.texto}</p>
          <p className="mt-2 text-xs text-slate-500">
            {c.origen} · {c.distribuidor || "Anónimo"}
            {c.departamento ? ` · ${c.departamento}` : ""} · {formatFecha(c.fecha)}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ── Modal detalle de respuesta ───────────────────────────────────────────-

function RespuestaDetalleModal({
  respuesta,
  investigacion,
  onClose,
}: {
  respuesta: Respuesta;
  investigacion: Investigacion | null;
  onClose: () => void;
}) {
  const preguntas = investigacion ? todasLasPreguntas(investigacion) : [];
  const tituloById = new Map(preguntas.map((p) => [p.id, p.titulo]));
  const entradas = Object.entries(respuesta.respuestas);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020910]/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de respuesta"
    >
      <div className="my-4 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0d2236] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {respuesta.distribuidorNombre || respuesta.empresa || "Respuesta anónima"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {investigacion?.titulo ?? respuesta.investigacionSlug} ·{" "}
              {formatFecha(respuesta.createdAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className={secondaryBtnClass}>
            Cerrar
          </button>
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          {(respuesta.empresa || respuesta.departamento || respuesta.contacto) ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 text-xs text-slate-400">
              {respuesta.empresa ? <p>Empresa: {respuesta.empresa}</p> : null}
              {respuesta.departamento ? <p>Departamento: {respuesta.departamento}</p> : null}
              {respuesta.contacto ? <p>Contacto: {respuesta.contacto}</p> : null}
            </div>
          ) : null}
        </dl>

        <div className="mt-4 space-y-3">
          {entradas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin respuestas a preguntas.</p>
          ) : (
            entradas.map(([qid, valor]) => (
              <div key={qid} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {tituloById.get(qid) ?? qid}
                </p>
                <p className="mt-1 text-sm text-slate-200">{valorLegible(valor)}</p>
              </div>
            ))
          )}
          {respuesta.comentarioLibre ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">
                Comentario libre
              </p>
              <p className="mt-1 text-sm text-slate-200">{respuesta.comentarioLibre}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
