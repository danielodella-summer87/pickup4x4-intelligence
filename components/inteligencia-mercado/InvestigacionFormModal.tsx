"use client";

import { useState } from "react";
import {
  ESTADOS_INVESTIGACION,
  ETIQUETAS_PREGUNTA,
  TIPOS_PREGUNTA,
  estadoInvestigacionLabel,
  etiquetaLabel,
  tipoPreguntaLabel,
  type Bloque,
  type EtiquetaPregunta,
  type Investigacion,
  type Pregunta,
  type TipoPregunta,
} from "@/lib/inteligencia-mercado/types";
import {
  actionBtnClass,
  dangerBtnClass,
  inputClass,
  primaryCtaClass,
  secondaryBtnClass,
  selectClass,
} from "@/components/inteligencia-mercado/ui";

function uid(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${rnd}`;
}

export function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const TIPOS_CON_OPCIONES: TipoPregunta[] = ["opcion_unica", "opcion_multiple"];

// "jerarquico" todavía no tiene editor visual (padres/hijos se definen por
// migración/seed). Se oculta del selector para no dejar crear una pregunta
// jerárquica sin forma de cargarle opciones desde el panel.
const TIPOS_PREGUNTA_EDITABLES = TIPOS_PREGUNTA.filter((t) => t !== "jerarquico");

export function nuevaInvestigacion(): Investigacion {
  const now = new Date().toISOString();
  return {
    id: uid("inv"),
    slug: "",
    titulo: "",
    descripcion: "",
    estado: "borrador",
    intro:
      "Esta es una entrevista breve (3 a 5 minutos). Nos interesa tu experiencia real del mercado.",
    agradecimiento: "¡Gracias por compartir tu visión!",
    capturaDistribuidor: true,
    comentarioFinalTitulo: "Comentario libre: lo que quieras agregar",
    bloques: [],
    meta: {},
    createdAt: now,
    updatedAt: now,
  };
}

function nuevoBloque(): Bloque {
  return { id: uid("b"), titulo: "Nuevo bloque", descripcion: "", preguntas: [] };
}

function nuevaPregunta(): Pregunta {
  return { id: uid("q"), tipo: "texto_largo", titulo: "", requerida: false };
}

export function InvestigacionFormModal({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Investigacion | null;
  onSave: (inv: Investigacion) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [inv, setInv] = useState<Investigacion>(initial ?? nuevaInvestigacion());
  const [slugEditado, setSlugEditado] = useState(Boolean(initial));

  const totalPreguntas = inv.bloques.reduce((n, b) => n + b.preguntas.length, 0);
  const puedeGuardar =
    inv.titulo.trim().length > 0 && inv.slug.trim().length > 0;

  function patch(p: Partial<Investigacion>) {
    setInv((prev) => ({ ...prev, ...p }));
  }

  function setTitulo(titulo: string) {
    setInv((prev) => ({
      ...prev,
      titulo,
      slug: slugEditado ? prev.slug : slugify(titulo),
    }));
  }

  function updateBloque(id: string, p: Partial<Bloque>) {
    setInv((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b) => (b.id === id ? { ...b, ...p } : b)),
    }));
  }

  function removeBloque(id: string) {
    setInv((prev) => ({
      ...prev,
      bloques: prev.bloques.filter((b) => b.id !== id),
    }));
  }

  function moveBloque(index: number, dir: -1 | 1) {
    setInv((prev) => {
      const bloques = [...prev.bloques];
      const target = index + dir;
      if (target < 0 || target >= bloques.length) return prev;
      [bloques[index], bloques[target]] = [bloques[target], bloques[index]];
      return { ...prev, bloques };
    });
  }

  function addPregunta(bloqueId: string) {
    setInv((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b) =>
        b.id === bloqueId ? { ...b, preguntas: [...b.preguntas, nuevaPregunta()] } : b,
      ),
    }));
  }

  function updatePregunta(bloqueId: string, qId: string, p: Partial<Pregunta>) {
    setInv((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b) =>
        b.id === bloqueId
          ? {
              ...b,
              preguntas: b.preguntas.map((q) =>
                q.id === qId ? { ...q, ...p } : q,
              ),
            }
          : b,
      ),
    }));
  }

  function removePregunta(bloqueId: string, qId: string) {
    setInv((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b) =>
        b.id === bloqueId
          ? { ...b, preguntas: b.preguntas.filter((q) => q.id !== qId) }
          : b,
      ),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020910]/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Editar investigación" : "Nueva investigación"}
    >
      <div className="my-4 w-full max-w-3xl rounded-xl border border-white/10 bg-[#0d2236] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {initial ? "Editar investigación" : "Nueva investigación"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {inv.bloques.length} bloque{inv.bloques.length === 1 ? "" : "s"} ·{" "}
              {totalPreguntas} pregunta{totalPreguntas === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Datos generales */}
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Título
              <input
                type="text"
                value={inv.titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Estado del mercado 4x4"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Slug (URL pública)
              <input
                type="text"
                value={inv.slug}
                onChange={(e) => {
                  setSlugEditado(true);
                  patch({ slug: slugify(e.target.value) });
                }}
                placeholder="estado-mercado-4x4"
                className={`mt-1 ${inputClass} font-mono text-xs`}
              />
            </label>
          </div>

          <label className="block text-sm text-slate-300">
            Descripción
            <textarea
              value={inv.descripcion}
              onChange={(e) => patch({ descripcion: e.target.value })}
              rows={2}
              className={`mt-1 ${inputClass}`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Texto de bienvenida
              <textarea
                value={inv.intro}
                onChange={(e) => patch({ intro: e.target.value })}
                rows={3}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Mensaje de agradecimiento
              <textarea
                value={inv.agradecimiento}
                onChange={(e) => patch({ agradecimiento: e.target.value })}
                rows={3}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Título del comentario final
              <input
                type="text"
                value={inv.comentarioFinalTitulo}
                onChange={(e) => patch({ comentarioFinalTitulo: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Estado
              <select
                value={inv.estado}
                onChange={(e) =>
                  patch({ estado: e.target.value as Investigacion["estado"] })
                }
                className={`mt-1 w-full ${selectClass}`}
              >
                {ESTADOS_INVESTIGACION.map((estado) => (
                  <option key={estado} value={estado}>
                    {estadoInvestigacionLabel[estado]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={inv.capturaDistribuidor}
              onChange={(e) => patch({ capturaDistribuidor: e.target.checked })}
              className="h-4 w-4 rounded border-white/15 bg-[#0a1d2e] accent-emerald-500"
            />
            Pedir datos del distribuidor (nombre, empresa, departamento)
          </label>
        </div>

        {/* Bloques */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Bloques y preguntas</h3>
            <button
              type="button"
              onClick={() => patch({ bloques: [...inv.bloques, nuevoBloque()] })}
              className={actionBtnClass}
            >
              + Agregar bloque
            </button>
          </div>

          {inv.bloques.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] p-6 text-center text-sm text-slate-500">
              Agregá bloques (ej: Mercado, Marcas, Productos) y dentro de cada uno
              las preguntas. Podés sumar nuevas preguntas en cualquier momento.
            </p>
          ) : null}

          {inv.bloques.map((bloque, bIndex) => (
            <div
              key={bloque.id}
              className="rounded-lg border border-white/10 bg-white/[0.025] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={bloque.titulo}
                  onChange={(e) => updateBloque(bloque.id, { titulo: e.target.value })}
                  placeholder="Título del bloque"
                  className={`${inputClass} flex-1 font-medium`}
                />
                <button
                  type="button"
                  onClick={() => moveBloque(bIndex, -1)}
                  disabled={bIndex === 0}
                  className={`${actionBtnClass} disabled:opacity-30`}
                  aria-label="Subir bloque"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveBloque(bIndex, 1)}
                  disabled={bIndex === inv.bloques.length - 1}
                  className={`${actionBtnClass} disabled:opacity-30`}
                  aria-label="Bajar bloque"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeBloque(bloque.id)}
                  className={dangerBtnClass}
                >
                  Eliminar
                </button>
              </div>
              <input
                type="text"
                value={bloque.descripcion ?? ""}
                onChange={(e) =>
                  updateBloque(bloque.id, { descripcion: e.target.value })
                }
                placeholder="Descripción del bloque (opcional)"
                className={`mt-2 ${inputClass} text-xs`}
              />

              <div className="mt-3 space-y-3">
                {bloque.preguntas.map((pregunta) => (
                  <div
                    key={pregunta.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
                  >
                    <input
                      type="text"
                      value={pregunta.titulo}
                      onChange={(e) =>
                        updatePregunta(bloque.id, pregunta.id, {
                          titulo: e.target.value,
                        })
                      }
                      placeholder="Texto de la pregunta"
                      className={inputClass}
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-400">
                        Tipo
                        <select
                          value={pregunta.tipo}
                          onChange={(e) =>
                            updatePregunta(bloque.id, pregunta.id, {
                              tipo: e.target.value as TipoPregunta,
                            })
                          }
                          className={`mt-1 w-full ${selectClass}`}
                        >
                          {TIPOS_PREGUNTA_EDITABLES.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipoPreguntaLabel[tipo]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-400">
                        Etiqueta (analítica)
                        <select
                          value={pregunta.etiqueta ?? ""}
                          onChange={(e) =>
                            updatePregunta(bloque.id, pregunta.id, {
                              etiqueta: (e.target.value || undefined) as
                                | EtiquetaPregunta
                                | undefined,
                            })
                          }
                          className={`mt-1 w-full ${selectClass}`}
                        >
                          <option value="">Sin etiqueta</option>
                          {ETIQUETAS_PREGUNTA.map((etiqueta) => (
                            <option key={etiqueta} value={etiqueta}>
                              {etiquetaLabel[etiqueta]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {TIPOS_CON_OPCIONES.includes(pregunta.tipo) ? (
                      <label className="mt-2 block text-xs text-slate-400">
                        Opciones (una por línea)
                        <textarea
                          value={(pregunta.opciones ?? []).join("\n")}
                          onChange={(e) =>
                            updatePregunta(bloque.id, pregunta.id, {
                              opciones: e.target.value
                                .split("\n")
                                .map((o) => o.trim())
                                .filter(Boolean),
                            })
                          }
                          rows={3}
                          className={`mt-1 ${inputClass} text-xs`}
                        />
                      </label>
                    ) : null}

                    {pregunta.tipo === "escala" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs text-slate-400">
                          Mín
                          <input
                            type="number"
                            value={pregunta.escala?.min ?? 1}
                            onChange={(e) =>
                              updatePregunta(bloque.id, pregunta.id, {
                                escala: {
                                  min: Number(e.target.value),
                                  max: pregunta.escala?.max ?? 5,
                                  etiquetaMin: pregunta.escala?.etiquetaMin,
                                  etiquetaMax: pregunta.escala?.etiquetaMax,
                                },
                              })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label className="text-xs text-slate-400">
                          Máx
                          <input
                            type="number"
                            value={pregunta.escala?.max ?? 5}
                            onChange={(e) =>
                              updatePregunta(bloque.id, pregunta.id, {
                                escala: {
                                  min: pregunta.escala?.min ?? 1,
                                  max: Number(e.target.value),
                                  etiquetaMin: pregunta.escala?.etiquetaMin,
                                  etiquetaMax: pregunta.escala?.etiquetaMax,
                                },
                              })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="mt-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        <input
                          type="checkbox"
                          checked={Boolean(pregunta.requerida)}
                          onChange={(e) =>
                            updatePregunta(bloque.id, pregunta.id, {
                              requerida: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-white/15 bg-[#0a1d2e] accent-emerald-500"
                        />
                        Obligatoria
                      </label>
                      <button
                        type="button"
                        onClick={() => removePregunta(bloque.id, pregunta.id)}
                        className={dangerBtnClass}
                      >
                        Quitar pregunta
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addPregunta(bloque.id)}
                  className={actionBtnClass}
                >
                  + Agregar pregunta
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
          <button type="button" onClick={onCancel} className={secondaryBtnClass}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar || saving}
            onClick={() => onSave(inv)}
            className={primaryCtaClass}
          >
            {saving ? "Guardando…" : "Guardar investigación"}
          </button>
        </div>
      </div>
    </div>
  );
}
