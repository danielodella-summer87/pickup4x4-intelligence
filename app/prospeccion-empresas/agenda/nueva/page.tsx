"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  ActivityStatus,
  ActivityType,
  ProspectActivity,
} from "@/lib/models/prospeccion";
import { ACTIVITY_TYPE_LABELS, todayISO } from "@/lib/prospeccion/helpers";

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const selectClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none";
const textareaClass = `${inputClass} min-h-[5rem]`;
const labelClass = "mb-1 block text-xs font-medium text-slate-500";
const primaryCta =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const secondaryButton =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";

const ESTADO_VALUES: ActivityStatus[] = [
  "pendiente",
  "realizada",
  "vencida",
  "cancelada",
];
const ESTADO_LABELS: Record<ActivityStatus, string> = {
  pendiente: "Pendiente",
  realizada: "Realizada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

function NuevaActividadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prospects, isHydrated, addActivity, catalogos } = useProspeccion();

  const tiposActividad = useMemo(() => {
    const activos = catalogos.tiposActividad.filter((t) => t.activo);
    if (activos.length > 0) return activos;
    return (Object.entries(ACTIVITY_TYPE_LABELS) as [ActivityType, string][]).map(
      ([id, nombre], i) => ({ id, nombre, orden: i + 1, activo: true }),
    );
  }, [catalogos.tiposActividad]);

  const empresasOrdenadas = useMemo(
    () => [...prospects].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [prospects],
  );

  const [empresaId, setEmpresaId] = useState(
    () => searchParams.get("empresa") ?? "",
  );
  const [tipo, setTipo] = useState<string>(() => tiposActividad[0]?.id ?? "llamada");
  const [fecha, setFecha] = useState(() => todayISO());
  const [hora, setHora] = useState("");
  const [lugar, setLugar] = useState("");
  const [participantes, setParticipantes] = useState("");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState<ActivityStatus>("pendiente");
  const [resultadoEsperado, setResultadoEsperado] = useState("");
  const [resultadoObtenido, setResultadoObtenido] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isHydrated) {
    return <p className="text-sm text-slate-400">Cargando…</p>;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!empresaId) {
      setError("Elegí la empresa asociada a la actividad.");
      return;
    }
    const actividad: Omit<ProspectActivity, "id"> = {
      tipo: tipo as ActivityType,
      fecha,
      hora: hora || undefined,
      lugar: lugar.trim() || undefined,
      participantes: participantes.trim() || undefined,
      responsable: responsable.trim() || undefined,
      estado,
      resultadoEsperado: resultadoEsperado.trim() || undefined,
      resultadoObtenido: resultadoObtenido.trim() || undefined,
      notas: notas.trim() || undefined,
    };
    addActivity(empresaId, actividad);
    router.push("/prospeccion-empresas/agenda");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionCard
        title="Datos de la actividad"
        description="Definí el próximo paso y a qué empresa pertenece."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClass}>Empresa asociada *</span>
            <select
              className={selectClass}
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">Elegí una empresa…</option>
              {empresasOrdenadas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Tipo de actividad</span>
            <select
              className={selectClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {tiposActividad.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Estado</span>
            <select
              className={selectClass}
              value={estado}
              onChange={(e) => setEstado(e.target.value as ActivityStatus)}
            >
              {ESTADO_VALUES.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Fecha</span>
            <input
              type="date"
              className={inputClass}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Hora</span>
            <input
              type="time"
              className={inputClass}
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Lugar</span>
            <input
              className={inputClass}
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Oficina, obra, planta…"
            />
          </label>

          <label className="block">
            <span className={labelClass}>Participantes</span>
            <input
              className={inputClass}
              value={participantes}
              onChange={(e) => setParticipantes(e.target.value)}
              placeholder="Quiénes se suman"
            />
          </label>

          <label className="block">
            <span className={labelClass}>Responsable</span>
            <input
              className={inputClass}
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Resultado esperado</span>
            <input
              className={inputClass}
              value={resultadoEsperado}
              onChange={(e) => setResultadoEsperado(e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Resultado obtenido</span>
            <input
              className={inputClass}
              value={resultadoObtenido}
              onChange={(e) => setResultadoObtenido(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={labelClass}>Notas</span>
            <textarea
              className={textareaClass}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-rose-300">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" className={primaryCta}>
            Crear actividad
          </button>
          <Link href="/prospeccion-empresas/agenda" className={secondaryButton}>
            Cancelar
          </Link>
        </div>
      </SectionCard>
    </form>
  );
}

export default function NuevaActividadPage() {
  return (
    <AppShell
      moduleTitle="Nueva actividad"
      moduleDescription="Agendá el próximo paso de una oportunidad"
    >
      <Suspense fallback={<p className="text-sm text-slate-400">Cargando…</p>}>
        <NuevaActividadForm />
      </Suspense>
    </AppShell>
  );
}
