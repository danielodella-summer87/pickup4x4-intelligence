"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  CreateProspectInput,
  ProspectOrgType,
  ProspectPriority,
  ProspectRubro,
  ProspectSource,
  ProspectStage,
} from "@/lib/models/prospeccion";
import {
  ORG_TYPE_LABELS,
  PRIORITY_LABELS,
  RUBRO_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/prospeccion/helpers";

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";

const selectClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none";

const textareaClass =
  "min-h-[5rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryButtonClass =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";

const initialForm: CreateProspectInput = {
  nombre: "",
  rubro: "constructora",
  subrubro: "",
  tipoOrganizacion: "privada",
  localidad: "",
  ciudad: "",
  departamento: "",
  direccion: "",
  web: "",
  observaciones: "",
  fuente: "manual",
  etapa: "lead_detectado",
  prioridad: "media",
  esSugerida: false,
  categoriaSugerida: "",
};

const rubroOptions = Object.keys(RUBRO_LABELS) as ProspectRubro[];
const orgTypeOptions = Object.keys(ORG_TYPE_LABELS) as ProspectOrgType[];
const sourceOptions = Object.keys(SOURCE_LABELS) as ProspectSource[];
const priorityOptions = Object.keys(PRIORITY_LABELS) as ProspectPriority[];

export default function NuevaOportunidadPage() {
  const router = useRouter();
  const { createProspect } = useProspeccion();
  const [form, setForm] = useState<CreateProspectInput>(initialForm);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof CreateProspectInput>(
    key: K,
    value: CreateProspectInput[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre de la empresa es obligatorio.");
      return;
    }
    setError(null);
    const created = createProspect(form);
    router.push(`/prospeccion-empresas/${created.id}`);
  }

  return (
    <AppShell
      moduleTitle="Nueva oportunidad"
      moduleDescription="Cargá una empresa para empezar a prospectarla"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Datos de la empresa">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelClass}>Nombre de la empresa *</span>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => updateField("nombre", e.target.value)}
                placeholder="Ej: Constructora del Sur S.A."
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Rubro</span>
              <select
                value={form.rubro}
                onChange={(e) =>
                  updateField("rubro", e.target.value as ProspectRubro)
                }
                className={selectClass}
              >
                {rubroOptions.map((value) => (
                  <option key={value} value={value}>
                    {RUBRO_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Subrubro</span>
              <input
                type="text"
                value={form.subrubro ?? ""}
                onChange={(e) => updateField("subrubro", e.target.value)}
                placeholder="Ej: Obra civil"
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Tipo de organización</span>
              <select
                value={form.tipoOrganizacion}
                onChange={(e) =>
                  updateField(
                    "tipoOrganizacion",
                    e.target.value as ProspectOrgType,
                  )
                }
                className={selectClass}
              >
                {orgTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {ORG_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Fuente</span>
              <select
                value={form.fuente ?? "manual"}
                onChange={(e) =>
                  updateField("fuente", e.target.value as ProspectSource)
                }
                className={selectClass}
              >
                {sourceOptions.map((value) => (
                  <option key={value} value={value}>
                    {SOURCE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Localidad</span>
              <input
                type="text"
                value={form.localidad ?? ""}
                onChange={(e) => updateField("localidad", e.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Ciudad</span>
              <input
                type="text"
                value={form.ciudad ?? ""}
                onChange={(e) => updateField("ciudad", e.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Departamento</span>
              <input
                type="text"
                value={form.departamento ?? ""}
                onChange={(e) => updateField("departamento", e.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Dirección</span>
              <input
                type="text"
                value={form.direccion ?? ""}
                onChange={(e) => updateField("direccion", e.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Web</span>
              <input
                type="text"
                value={form.web ?? ""}
                onChange={(e) => updateField("web", e.target.value)}
                placeholder="ejemplo.com.uy"
                className={inputClass}
              />
            </label>

            <label>
              <span className={labelClass}>Etapa</span>
              <select
                value={form.etapa ?? "lead_detectado"}
                onChange={(e) =>
                  updateField("etapa", e.target.value as ProspectStage)
                }
                className={selectClass}
              >
                {STAGE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {STAGE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Prioridad</span>
              <select
                value={form.prioridad ?? "media"}
                onChange={(e) =>
                  updateField("prioridad", e.target.value as ProspectPriority)
                }
                className={selectClass}
              >
                {priorityOptions.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className={labelClass}>Observaciones generales</span>
              <textarea
                value={form.observaciones ?? ""}
                onChange={(e) => updateField("observaciones", e.target.value)}
                placeholder="Notas iniciales sobre la empresa, contexto, posibles necesidades…"
                className={textareaClass}
              />
            </label>

            <div className="sm:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.esSugerida ?? false}
                  onChange={(e) => updateField("esSugerida", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-emerald-500"
                />
                Empresa sugerida por estrategia
              </label>

              {form.esSugerida ? (
                <label className="block">
                  <span className={labelClass}>Categoría sugerida</span>
                  <input
                    type="text"
                    value={form.categoriaSugerida ?? ""}
                    onChange={(e) =>
                      updateField("categoriaSugerida", e.target.value)
                    }
                    placeholder="Ej: Contratistas de fibra óptica"
                    className={inputClass}
                  />
                </label>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm font-medium text-rose-400">{error}</p>
          ) : null}
        </SectionCard>

        <div className="flex items-center gap-3">
          <button type="submit" className={primaryButtonClass}>
            Crear oportunidad
          </button>
          <Link href="/prospeccion-empresas" className={secondaryButtonClass}>
            Cancelar
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
