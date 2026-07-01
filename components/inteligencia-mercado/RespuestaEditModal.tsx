"use client";

import { useState } from "react";
import {
  DEPARTAMENTOS_URUGUAY,
  esRespuestaVacia,
  todasLasPreguntas,
  type Investigacion,
  type Pregunta,
  type Respuesta,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";
import {
  formatFecha,
  inputClass,
  primaryCtaClass,
  secondaryBtnClass,
  selectClass,
} from "@/components/inteligencia-mercado/ui";

const OTRO = "__otro__";

/** Separa la selección "de lista" del texto libre "Otro" ya guardado. */
function inicializarEdicion(
  preguntas: Pregunta[],
  respuestasActuales: Record<string, RespuestaValor>,
): { answers: Record<string, RespuestaValor>; otros: Record<string, string> } {
  const answers: Record<string, RespuestaValor> = {};
  const otros: Record<string, string> = {};

  for (const p of preguntas) {
    const valor = respuestasActuales[p.id];
    if (valor === undefined) continue;

    if (p.permiteOtro && p.tipo === "opcion_unica") {
      const opciones = p.opciones ?? [];
      if (typeof valor === "string" && valor !== "" && !opciones.includes(valor)) {
        answers[p.id] = OTRO;
        otros[p.id] = valor;
        continue;
      }
    }

    if (p.permiteOtro && p.tipo === "opcion_multiple" && Array.isArray(valor)) {
      const opciones = p.opciones ?? [];
      const base = valor.filter((v) => opciones.includes(v));
      const extra = valor.filter((v) => !opciones.includes(v));
      answers[p.id] = base;
      if (extra.length > 0) otros[p.id] = extra.join(", ");
      continue;
    }

    answers[p.id] = valor;
  }

  return { answers, otros };
}

/** Snapshot estable (mismo orden de preguntas siempre) para detectar cambios sin guardar. */
function snapshot(
  preguntas: Pregunta[],
  distribuidorNombre: string,
  departamento: string,
  respuestas: Record<string, RespuestaValor>,
): string {
  return JSON.stringify({
    distribuidorNombre: distribuidorNombre.trim(),
    departamento: departamento.trim(),
    respuestas: preguntas.map((p) => [p.id, respuestas[p.id] ?? null]),
  });
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
        active
          ? "border-emerald-400/60 bg-emerald-500/15 text-white"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function EditorPregunta({
  pregunta,
  valor,
  otroTexto,
  onChange,
  onOtroChange,
}: {
  pregunta: Pregunta;
  valor: RespuestaValor | undefined;
  otroTexto: string;
  onChange: (valor: RespuestaValor) => void;
  onOtroChange: (texto: string) => void;
}) {
  const opciones = pregunta.opciones ?? [];

  switch (pregunta.tipo) {
    case "texto_corto":
      return (
        <input
          type="text"
          value={typeof valor === "string" ? valor : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={pregunta.placeholder ?? ""}
          className={inputClass}
        />
      );

    case "texto_largo":
      return (
        <textarea
          value={typeof valor === "string" ? valor : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputClass}
        />
      );

    case "numero":
      return (
        <input
          type="number"
          value={typeof valor === "number" ? valor : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className={inputClass}
        />
      );

    case "si_no":
      return (
        <div className="flex gap-2">
          {["Sí", "No"].map((opt) => (
            <ToggleButton key={opt} active={valor === opt} onClick={() => onChange(opt)}>
              {opt}
            </ToggleButton>
          ))}
        </div>
      );

    case "escala": {
      const { min, max } = pregunta.escala ?? { min: 1, max: 5 };
      const pasos: number[] = [];
      for (let i = min; i <= max; i += 1) pasos.push(i);
      return (
        <div className="flex flex-wrap gap-2">
          {pasos.map((n) => (
            <ToggleButton key={n} active={valor === n} onClick={() => onChange(n)}>
              {n}
            </ToggleButton>
          ))}
        </div>
      );
    }

    case "opcion_unica": {
      const enLista = typeof valor === "string" && opciones.includes(valor);
      const otroActivo = valor === OTRO || (typeof valor === "string" && valor !== "" && !enLista);
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {opciones.map((opt) => (
              <ToggleButton key={opt} active={valor === opt} onClick={() => onChange(opt)}>
                {opt}
              </ToggleButton>
            ))}
            {pregunta.permiteOtro ? (
              <ToggleButton active={otroActivo} onClick={() => onChange(OTRO)}>
                Otro…
              </ToggleButton>
            ) : null}
          </div>
          {pregunta.permiteOtro && otroActivo ? (
            <input
              type="text"
              value={otroTexto}
              onChange={(e) => onOtroChange(e.target.value)}
              placeholder="Especificá"
              className={inputClass}
            />
          ) : null}
        </div>
      );
    }

    case "opcion_multiple": {
      const seleccion = Array.isArray(valor) ? valor : [];
      const toggle = (opt: string) => {
        onChange(
          seleccion.includes(opt)
            ? seleccion.filter((v) => v !== opt)
            : [...seleccion, opt],
        );
      };
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {opciones.map((opt) => (
              <ToggleButton key={opt} active={seleccion.includes(opt)} onClick={() => toggle(opt)}>
                {opt}
              </ToggleButton>
            ))}
          </div>
          {pregunta.permiteOtro ? (
            <input
              type="text"
              value={otroTexto}
              onChange={(e) => onOtroChange(e.target.value)}
              placeholder="Otro (especificá)"
              className={inputClass}
            />
          ) : null}
        </div>
      );
    }

    default:
      return null;
  }
}

export type RespuestaEditPatch = {
  distribuidorNombre: string | null;
  departamento: string | null;
  respuestas: Record<string, RespuestaValor>;
};

export function RespuestaEditModal({
  respuesta,
  investigacion,
  saving,
  onSave,
  onCancel,
}: {
  respuesta: Respuesta;
  investigacion: Investigacion | null;
  saving: boolean;
  onSave: (patch: RespuestaEditPatch) => void;
  onCancel: () => void;
}) {
  const preguntas = investigacion ? todasLasPreguntas(investigacion) : [];
  const [distribuidorNombre, setDistribuidorNombre] = useState(
    respuesta.distribuidorNombre ?? "",
  );
  const [departamento, setDepartamento] = useState(respuesta.departamento ?? "");
  const [edicion, setEdicion] = useState(() =>
    inicializarEdicion(preguntas, respuesta.respuestas),
  );
  const [snapshotInicial] = useState(() =>
    snapshot(preguntas, respuesta.distribuidorNombre ?? "", respuesta.departamento ?? "", respuesta.respuestas),
  );

  function setAnswer(id: string, valor: RespuestaValor) {
    setEdicion((prev) => ({ ...prev, answers: { ...prev.answers, [id]: valor } }));
  }

  function setOtro(id: string, texto: string) {
    setEdicion((prev) => ({ ...prev, otros: { ...prev.otros, [id]: texto } }));
  }

  function valorEfectivo(p: Pregunta): RespuestaValor | undefined {
    const valor = edicion.answers[p.id];
    if (!p.permiteOtro) return valor;
    const otro = edicion.otros[p.id]?.trim();
    if (p.tipo === "opcion_unica") {
      return valor === OTRO ? otro || "" : valor;
    }
    if (p.tipo === "opcion_multiple") {
      const base = Array.isArray(valor) ? valor : [];
      return otro ? [...base, otro] : base;
    }
    return valor;
  }

  function respuestasFinalesActuales(): Record<string, RespuestaValor> {
    const respuestasFinales: Record<string, RespuestaValor> = {};
    for (const p of preguntas) {
      const valor = valorEfectivo(p);
      if (!esRespuestaVacia(valor) && valor !== undefined) {
        respuestasFinales[p.id] = valor;
      }
    }
    return respuestasFinales;
  }

  function hayCambiosSinGuardar(): boolean {
    const actual = snapshot(preguntas, distribuidorNombre, departamento, respuestasFinalesActuales());
    return actual !== snapshotInicial;
  }

  function handleVolver() {
    if (
      hayCambiosSinGuardar() &&
      typeof window !== "undefined" &&
      !window.confirm("Tenés cambios sin guardar. ¿Salir sin guardarlos?")
    ) {
      return;
    }
    onCancel();
  }

  function handleGuardar() {
    onSave({
      distribuidorNombre: distribuidorNombre.trim() || null,
      departamento: departamento.trim() || null,
      respuestas: respuestasFinalesActuales(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020910]/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar respuesta"
    >
      <div className="my-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#0d2236]">
        <div className="shrink-0 border-b border-white/[0.08] p-5 sm:p-6">
          <h2 className="text-base font-semibold text-white">Editar respuesta</h2>
          <p className="mt-1 text-sm text-slate-400">
            {investigacion?.titulo ?? respuesta.investigacionSlug} ·{" "}
            {formatFecha(respuesta.createdAt)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Nombre / distribuidor
              <input
                type="text"
                value={distribuidorNombre}
                onChange={(e) => setDistribuidorNombre(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Departamento
              <select
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className={`mt-1 w-full ${selectClass}`}
              >
                <option value="">Sin especificar</option>
                {DEPARTAMENTOS_URUGUAY.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!investigacion ? (
            <p className="mt-5 text-sm text-amber-300">
              No se encontró la definición de esta investigación; solo se pueden
              corregir el nombre y el departamento.
            </p>
          ) : preguntas.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">
              Esta investigación no tiene preguntas para editar.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {preguntas.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {p.titulo}
                  </p>
                  <div className="mt-2">
                    <EditorPregunta
                      pregunta={p}
                      valor={edicion.answers[p.id]}
                      otroTexto={edicion.otros[p.id] ?? ""}
                      onChange={(v) => setAnswer(p.id, v)}
                      onOtroChange={(t) => setOtro(p.id, t)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-white/[0.08] p-4">
          <button type="button" onClick={handleVolver} className={secondaryBtnClass}>
            ← Volver al listado
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleGuardar}
            className={`${primaryCtaClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
