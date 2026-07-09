"use client";

import { useMemo, useState } from "react";
import {
  DEPARTAMENTOS_URUGUAY,
  esRespuestaVacia,
  GIRO_OPCIONES,
  type Bloque,
  type InvestigacionPublica,
  type OpcionJerarquica,
  type Pregunta,
  type RespuestaJerarquica,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

// Landing pública independiente del app shell. Estética premium mobile-first:
// fondo azul muy oscuro, campos crema (texto negro) y acentos verde Pickup4x4.
// Cada paso se siente como una conversación, no como un formulario tradicional.

const OTRO = "__otro__";

// ── Tokens visuales ─────────────────────────────────────────────────────────
const cardClass =
  "rounded-3xl border border-white/[0.06] bg-[#0d2236] p-6 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.8)] sm:p-8";

const btnPrimary =
  "rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-[#06140f] shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-60";

const btnSecondary =
  "rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-base font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50";

type Step =
  | { kind: "intro" }
  | { kind: "identidad" }
  | { kind: "bloque"; bloque: Bloque }
  | { kind: "final" };

type Identidad = {
  distribuidorNombre: string;
  cargo: string;
  empresa: string;
  giro: string;
  giroOtro: string;
  departamento: string;
  contacto: string;
};

// Campos de texto: crema sobre fondo oscuro, texto negro. Destacan y son cómodos
// de completar desde el celular.
const inputClass =
  "w-full rounded-2xl border border-black/10 bg-[#F6F1E7] px-5 py-4 text-base text-neutral-900 placeholder:text-neutral-500 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

function ChoiceButton({
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
      className={`w-full rounded-2xl border px-5 py-4 text-left text-base transition ${
        active
          ? "border-emerald-400/60 bg-emerald-500/15 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
          : "border-white/10 bg-white/[0.03] text-slate-100 hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

/** Chip (píldora) para opción múltiple: se distingue de las listas de opción única. */
function ChipButton({
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
      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition ${
        active
          ? "border-emerald-400/70 bg-emerald-500/20 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
          : "border-white/15 bg-white/[0.05] text-slate-100 hover:border-white/30 hover:bg-white/[0.1]"
      }`}
    >
      {children}
    </button>
  );
}

function PreguntaInput({
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
  const opciones = (pregunta.opciones as string[] | undefined) ?? [];

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
          placeholder={pregunta.placeholder ?? "Escribí tu respuesta…"}
          rows={4}
          className={inputClass}
        />
      );

    case "numero":
      return (
        <input
          type="number"
          inputMode="numeric"
          value={typeof valor === "number" ? valor : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder={pregunta.placeholder ?? ""}
          className={inputClass}
        />
      );

    case "si_no":
      return (
        <div className="grid grid-cols-2 gap-3">
          {["Sí", "No"].map((opt) => (
            <ChoiceButton
              key={opt}
              active={valor === opt}
              onClick={() => onChange(opt)}
            >
              {opt}
            </ChoiceButton>
          ))}
        </div>
      );

    case "escala": {
      const { min, max, etiquetaMin, etiquetaMax } = pregunta.escala ?? {
        min: 1,
        max: 5,
      };
      const pasos = [];
      for (let i = min; i <= max; i += 1) pasos.push(i);
      return (
        <div>
          <div className="flex flex-wrap gap-2">
            {pasos.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                aria-pressed={valor === n}
                className={`h-14 min-w-[3.25rem] flex-1 rounded-2xl border text-base font-semibold transition ${
                  valor === n
                    ? "border-emerald-400/60 bg-emerald-500/20 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                    : "border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25 hover:bg-white/[0.06]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {etiquetaMin || etiquetaMax ? (
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{etiquetaMin}</span>
              <span>{etiquetaMax}</span>
            </div>
          ) : null}
        </div>
      );
    }

    case "opcion_unica": {
      const enLista = typeof valor === "string" && opciones.includes(valor);
      const otroActivo = valor === OTRO || (typeof valor === "string" && !enLista && valor !== "");
      return (
        <div className="space-y-2">
          {opciones.map((opt) => (
            <ChoiceButton
              key={opt}
              active={valor === opt}
              onClick={() => onChange(opt)}
            >
              {opt}
            </ChoiceButton>
          ))}
          {pregunta.permiteOtro ? (
            <>
              <ChoiceButton active={otroActivo} onClick={() => onChange(OTRO)}>
                Otro…
              </ChoiceButton>
              {otroActivo ? (
                <input
                  type="text"
                  value={otroTexto}
                  onChange={(e) => onOtroChange(e.target.value)}
                  placeholder="Especificá"
                  className={inputClass}
                  autoFocus
                />
              ) : null}
            </>
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
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {opciones.map((opt) => (
              <ChipButton
                key={opt}
                active={seleccion.includes(opt)}
                onClick={() => toggle(opt)}
              >
                {opt}
              </ChipButton>
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

    case "jerarquico": {
      const opcionesJerarquicas = (pregunta.opciones as OpcionJerarquica[] | undefined) ?? [];
      const seleccion: RespuestaJerarquica =
        valor && typeof valor === "object" && !Array.isArray(valor)
          ? (valor as RespuestaJerarquica)
          : {};

      const togglePadre = (padre: string) => {
        if (padre in seleccion) {
          const { [padre]: _omit, ...resto } = seleccion;
          onChange(resto);
        } else {
          onChange({ ...seleccion, [padre]: [] });
        }
      };

      const toggleHijo = (padre: string, hijo: string) => {
        const actuales = seleccion[padre] ?? [];
        const nuevos = actuales.includes(hijo)
          ? actuales.filter((h) => h !== hijo)
          : [...actuales, hijo];
        onChange({ ...seleccion, [padre]: nuevos });
      };

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {opcionesJerarquicas.map((op) => (
              <ChipButton
                key={op.valor}
                active={op.valor in seleccion}
                onClick={() => togglePadre(op.valor)}
              >
                {op.valor}
              </ChipButton>
            ))}
          </div>
          {opcionesJerarquicas
            .filter((op) => op.valor in seleccion && (op.hijos?.length ?? 0) > 0)
            .map((op) => (
              <div
                key={op.valor}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {op.valor}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(op.hijos ?? []).map((hijo) => (
                    <ChipButton
                      key={hijo}
                      active={(seleccion[op.valor] ?? []).includes(hijo)}
                      onClick={() => toggleHijo(op.valor, hijo)}
                    >
                      {hijo}
                    </ChipButton>
                  ))}
                </div>
              </div>
            ))}
        </div>
      );
    }

    default:
      return null;
  }
}

export function EncuestaInterview({
  investigacion,
  preview = false,
}: {
  investigacion: InvestigacionPublica;
  /** Vista previa desde el panel admin: no guarda respuestas reales. */
  preview?: boolean;
}) {
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [{ kind: "intro" }];
    if (investigacion.capturaDistribuidor) list.push({ kind: "identidad" });
    for (const bloque of investigacion.bloques) {
      if (bloque.preguntas.length > 0) list.push({ kind: "bloque", bloque });
    }
    list.push({ kind: "final" });
    return list;
  }, [investigacion]);

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, RespuestaValor>>({});
  const [otros, setOtros] = useState<Record<string, string>>({});
  const [identidad, setIdentidad] = useState<Identidad>({
    distribuidorNombre: "",
    cargo: "",
    empresa: "",
    giro: "",
    giroOtro: "",
    departamento: "",
    contacto: "",
  });
  const [comentarioLibre, setComentarioLibre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const step = steps[stepIndex];
  // El primer paso (intro) no cuenta para la barra de progreso.
  const progreso = Math.round((stepIndex / (steps.length - 1)) * 100);

  function setAnswer(preguntaId: string, valor: RespuestaValor) {
    setAnswers((prev) => ({ ...prev, [preguntaId]: valor }));
  }

  /** Valor efectivo combinando "Otro". */
  function valorEfectivo(pregunta: Pregunta): RespuestaValor | undefined {
    const valor = answers[pregunta.id];
    if (!pregunta.permiteOtro) return valor;
    const otro = otros[pregunta.id]?.trim();
    if (pregunta.tipo === "opcion_unica") {
      if (valor === OTRO) return otro ?? "";
      return valor;
    }
    if (pregunta.tipo === "opcion_multiple") {
      const base = Array.isArray(valor) ? valor : [];
      return otro ? [...base, otro] : base;
    }
    return valor;
  }

  function validarPasoActual(): string | null {
    if (step.kind !== "bloque") return null;
    for (const pregunta of step.bloque.preguntas) {
      if (pregunta.requerida && esRespuestaVacia(valorEfectivo(pregunta))) {
        return `Por favor completá: "${pregunta.titulo}".`;
      }
    }
    return null;
  }

  function avanzar() {
    const problema = validarPasoActual();
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function retroceder() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  async function enviar() {
    if (preview) return; // Defensa extra: en preview nunca se envía nada.
    setEnviando(true);
    setError(null);

    const respuestasFinales: Record<string, RespuestaValor> = {};
    for (const bloque of investigacion.bloques) {
      for (const pregunta of bloque.preguntas) {
        const valor = valorEfectivo(pregunta);
        if (!esRespuestaVacia(valor) && valor !== undefined) {
          respuestasFinales[pregunta.id] = valor;
        }
      }
    }

    const giroFinal =
      identidad.giro === "Otros" ? identidad.giroOtro || null : identidad.giro || null;

    try {
      const res = await fetch(
        `/api/encuestas/${encodeURIComponent(investigacion.slug)}/respuestas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distribuidorNombre: identidad.distribuidorNombre || null,
            cargo: identidad.cargo || null,
            empresa: identidad.empresa || null,
            giro: giroFinal,
            departamento: identidad.departamento || null,
            contacto: identidad.contacto || null,
            respuestas: respuestasFinales,
            comentarioLibre: comentarioLibre || null,
            meta: {
              userAgent:
                typeof navigator !== "undefined" ? navigator.userAgent : null,
            },
          }),
        },
      );
      const data = (await res.json()) as { ok: boolean; errorMessage?: string };
      if (!res.ok || !data.ok) {
        setError(data.errorMessage ?? "No se pudo enviar tu respuesta.");
        setEnviando(false);
        return;
      }
      setEnviado(true);
    } catch {
      setError("No se pudo conectar. Revisá tu conexión e intentá de nuevo.");
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="relative min-h-screen bg-[#081726] text-slate-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]"
        />
        <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-300 ring-1 ring-emerald-400/30">
            ✓
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-white">¡Listo!</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            {investigacion.agradecimiento || "Gracias por tu participación."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#081726] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-32 pt-10">
        {preview ? (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
          >
            <strong className="font-semibold">Vista previa (modo admin).</strong>{" "}
            Las respuestas no se guardan.
          </div>
        ) : null}
        {/* Encabezado + progreso */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Pickup 4x4 · Voz del distribuidor
          </p>
          <h1 className="mt-1.5 text-xl font-semibold text-white">
            {investigacion.titulo}
          </h1>
          {step.kind !== "intro" ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
                <span>
                  Paso {stepIndex} de {steps.length - 1}
                </span>
                <span>{progreso}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progreso}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1">
          {step.kind === "intro" ? (
            <div className={cardClass}>
            <p className="text-base leading-relaxed text-slate-300">
              {investigacion.descripcion}
            </p>
            {investigacion.intro ? (
              <p className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">
                {investigacion.intro}
              </p>
            ) : null}
            <p className="mt-5 text-sm text-slate-400">⏱️ 3 a 4 minutos</p>
          </div>
        ) : null}

        {step.kind === "identidad" ? (
          <div className={`${cardClass} space-y-5`}>
            <h2 className="text-lg font-medium text-white">
              Contanos quién sos <span className="text-slate-500">(opcional)</span>
            </h2>
            <label className="block text-sm text-slate-300">
              Tu nombre
              <input
                type="text"
                value={identidad.distribuidorNombre}
                onChange={(e) =>
                  setIdentidad({ ...identidad, distribuidorNombre: e.target.value })
                }
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Cargo <span className="text-slate-500">(opcional)</span>
              <input
                type="text"
                value={identidad.cargo}
                onChange={(e) =>
                  setIdentidad({ ...identidad, cargo: e.target.value })
                }
                placeholder="Ej: Dueño, encargado, vendedor…"
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Empresa / comercio
              <input
                type="text"
                value={identidad.empresa}
                onChange={(e) =>
                  setIdentidad({ ...identidad, empresa: e.target.value })
                }
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Giro <span className="text-slate-500">(opcional)</span>
              <select
                value={identidad.giro}
                onChange={(e) =>
                  setIdentidad({ ...identidad, giro: e.target.value })
                }
                className={`mt-1.5 ${inputClass}`}
              >
                <option value="">Seleccioná…</option>
                {GIRO_OPCIONES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {identidad.giro === "Otros" ? (
                <input
                  type="text"
                  value={identidad.giroOtro}
                  onChange={(e) =>
                    setIdentidad({ ...identidad, giroOtro: e.target.value })
                  }
                  placeholder="Especificá el giro"
                  className={`mt-2 ${inputClass}`}
                  autoFocus
                />
              ) : null}
            </label>
            <label className="block text-sm text-slate-300">
              Departamento
              <select
                value={identidad.departamento}
                onChange={(e) =>
                  setIdentidad({ ...identidad, departamento: e.target.value })
                }
                className={`mt-1.5 ${inputClass}`}
              >
                <option value="">Seleccioná…</option>
                {DEPARTAMENTOS_URUGUAY.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Email o teléfono <span className="text-slate-500">(opcional)</span>
              <input
                type="text"
                value={identidad.contacto}
                onChange={(e) =>
                  setIdentidad({ ...identidad, contacto: e.target.value })
                }
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
          </div>
        ) : null}

        {step.kind === "bloque" ? (
          <div className={cardClass}>
            <div className="mb-7">
              <h2 className="text-xl font-bold tracking-tight text-amber-300">
                {step.bloque.titulo}
              </h2>
              {step.bloque.descripcion ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {step.bloque.descripcion}
                </p>
              ) : null}
            </div>
            <div className="space-y-8 divide-y divide-white/[0.07]">
              {step.bloque.preguntas.map((pregunta, index) => (
                <div key={pregunta.id} className={index > 0 ? "pt-8" : ""}>
                  <p className="mb-3 text-base font-semibold leading-snug text-sky-300">
                    {pregunta.titulo}
                    {pregunta.requerida ? (
                      <span className="text-emerald-400"> *</span>
                    ) : null}
                  </p>
                  {pregunta.descripcion ? (
                    <p className="mb-3 text-sm text-slate-500">
                      {pregunta.descripcion}
                    </p>
                  ) : null}
                  <PreguntaInput
                    pregunta={pregunta}
                    valor={answers[pregunta.id]}
                    otroTexto={otros[pregunta.id] ?? ""}
                    onChange={(valor) => setAnswer(pregunta.id, valor)}
                    onOtroChange={(texto) =>
                      setOtros((prev) => ({ ...prev, [pregunta.id]: texto }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step.kind === "final" ? (
          <div className={`${cardClass} space-y-5`}>
            <h2 className="text-lg font-semibold text-white">
              {investigacion.comentarioFinalTitulo ||
                "¿Algo más que quieras agregar?"}
            </h2>
            <p className="text-sm text-slate-400">
              Muchas veces el mayor valor aparece acá. Contanos lo que quieras:
              ideas, alertas, oportunidades, lo que sea.
            </p>
            <textarea
              value={comentarioLibre}
              onChange={(e) => setComentarioLibre(e.target.value)}
              rows={6}
              placeholder="Escribí libremente…"
              className={inputClass}
            />
          </div>
        ) : null}
      </div>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            {error}
          </div>
        ) : null}

        {/* Barra de acciones fija */}
        <div className="fixed inset-x-0 bottom-0 border-t border-white/[0.06] bg-[#081726]/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={retroceder}
                disabled={enviando}
                className={btnSecondary}
              >
                Atrás
              </button>
            ) : null}
            {step.kind === "intro" ? (
              <button
                type="button"
                onClick={avanzar}
                className={`flex-1 ${btnPrimary}`}
              >
                Comenzar
              </button>
            ) : step.kind === "final" ? (
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={enviando || preview}
                title={preview ? "Envío deshabilitado en vista previa." : undefined}
                className={`flex-1 ${btnPrimary}`}
              >
                {preview ? "Envío deshabilitado (preview)" : enviando ? "Enviando…" : "Enviar respuestas"}
              </button>
            ) : (
              <button
                type="button"
                onClick={avanzar}
                className={`flex-1 ${btnPrimary}`}
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
