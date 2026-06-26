"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import {
  CollapsibleSection,
  GuiaUso,
  NextActivityBadge,
  PriorityBadge,
  ProspeccionTabs,
  StageBadge,
  TrafficLightBadge,
} from "@/components/prospeccion/ProspeccionUI";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import {
  type ActivityStatus,
  type ActivityType,
  type CompanyProspect,
  type FleetVehicleType,
  type ProposalChannel,
  type ProposalStatus,
  type ProspectActivity,
  type ProspectContact,
  type ProspectContactArea,
  type ProspectContactStatus,
  type ProspectNeed,
  type ProspectNeedAvailability,
  type ProspectOrgType,
  type ProspectPriority,
  type ProspectProposal,
  type ProspectRubro,
  type ProspectSource,
  type ProspectStage,
  type TriState,
} from "@/lib/models/prospeccion";
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  CONTACT_AREA_LABELS,
  CONTACT_STATUS_LABELS,
  NEED_AVAILABILITY_LABELS,
  ORG_TYPE_LABELS,
  PRIORITY_LABELS,
  PROPOSAL_STATUS_LABELS,
  RUBRO_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  TRI_STATE_LABELS,
  formatProspectDate,
  getNextActivityStatus,
  getProspectTrafficLight,
  suggestProspectPriority,
  todayISO,
} from "@/lib/prospeccion/helpers";
import {
  buildGoogleMapsUrl,
  buildMailtoUrl,
  buildTelUrl,
  buildWazeUrl,
  buildWhatsappUrl,
  formatDisplayPhone,
  normalizeUruguayPhone,
} from "@/lib/prospeccion/contact-links";
import { ProductNeedField } from "@/components/prospeccion/ProductNeedField";

// ───────────────────────────────────────────── Clases compartidas

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 [color-scheme:dark] focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const selectClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none";
const textareaClass = `${inputClass} min-h-[5rem]`;
const primaryCta =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const secondaryButton =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";
const smallButton =
  "rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800";
const miniLink =
  "inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-slate-800";

// Acciones de teléfono (Llamar / WhatsApp) para un valor de teléfono dado.
function PhoneActions({ value }: { value?: string }) {
  if (!value || !value.trim()) return null;
  const tel = buildTelUrl(value);
  const wa = buildWhatsappUrl(value);
  const dudoso = normalizeUruguayPhone(value) === null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-400">{formatDisplayPhone(value)}</span>
      {tel ? (
        <a href={tel} className={miniLink}>
          Llamar
        </a>
      ) : null}
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={miniLink}>
          WhatsApp
        </a>
      ) : null}
      {dudoso ? (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
          Revisar
        </span>
      ) : null}
    </span>
  );
}

// Fila de acciones de contacto (teléfono, whatsapp, email) bajo un contacto.
function ContactActions({ c }: { c: ProspectContact }) {
  const mailto = c.email ? buildMailtoUrl(c.email) : null;
  const hasPhone = Boolean(c.telefono && c.telefono.trim());
  const hasWa = Boolean(c.whatsapp && c.whatsapp.trim() && c.whatsapp !== c.telefono);
  if (!hasPhone && !hasWa && !mailto) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 pt-3">
      {hasPhone ? <PhoneActions value={c.telefono} /> : null}
      {hasWa ? <PhoneActions value={c.whatsapp} /> : null}
      {mailto ? (
        <a href={mailto} className={miniLink}>
          Email
        </a>
      ) : null}
    </div>
  );
}

// Enlaces de mapa para una dirección (Google Maps / Waze).
function AddressActions({ direccion, extra }: { direccion?: string; extra: string }) {
  if (!direccion || !direccion.trim()) return null;
  const maps = buildGoogleMapsUrl(direccion, extra);
  const waze = buildWazeUrl(direccion, extra);
  if (!maps && !waze) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {maps ? (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={miniLink}>
          Google Maps
        </a>
      ) : null}
      {waze ? (
        <a href={waze} target="_blank" rel="noopener noreferrer" className={miniLink}>
          Waze
        </a>
      ) : null}
    </div>
  );
}

const RUBRO_VALUES = Object.keys(RUBRO_LABELS) as ProspectRubro[];
const ORG_VALUES = Object.keys(ORG_TYPE_LABELS) as ProspectOrgType[];
const SOURCE_VALUES = Object.keys(SOURCE_LABELS) as ProspectSource[];
const PRIORITY_VALUES: ProspectPriority[] = ["alta", "media", "baja"];
const TRI_VALUES: TriState[] = ["si", "no", "no_se_sabe"];
const VEHICLE_VALUES: FleetVehicleType[] = [
  "pickups",
  "camionetas",
  "camiones",
  "utilitarios",
  "autos",
  "vans",
  "maquinaria",
  "otros",
];
const AREA_VALUES = Object.keys(CONTACT_AREA_LABELS) as ProspectContactArea[];
const CONTACT_STATUS_VALUES = Object.keys(
  CONTACT_STATUS_LABELS,
) as ProspectContactStatus[];
const ACTIVITY_TYPE_VALUES = Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[];
const ACTIVITY_STATUS_VALUES = Object.keys(
  ACTIVITY_STATUS_LABELS,
) as ActivityStatus[];
const NEED_VALUES = Object.keys(
  NEED_AVAILABILITY_LABELS,
) as ProspectNeedAvailability[];

// Badge que distingue claramente lo disponible de lo "no disponible / futuro".
const NEED_BADGE: Record<
  ProspectNeedAvailability,
  { label: string; cls: string }
> = {
  disponible: { label: "Disponible", cls: "bg-emerald-500/15 text-emerald-300" },
  a_desarrollar: {
    label: "No disponible · a desarrollar",
    cls: "bg-amber-500/15 text-amber-300",
  },
  no_disponible: {
    label: "No disponible actualmente",
    cls: "bg-rose-500/15 text-rose-300",
  },
  estrategica: {
    label: "Oportunidad futura",
    cls: "bg-sky-500/15 text-sky-300",
  },
};
const PROPOSAL_STATUS_VALUES = Object.keys(
  PROPOSAL_STATUS_LABELS,
) as ProposalStatus[];
const CHANNEL_VALUES: ProposalChannel[] = [
  "email",
  "whatsapp",
  "reunion",
  "impresa",
  "otro",
];

// ───────────────────────────────────────────── Inputs etiquetados

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function genLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function commaJoin(arr: string[]): string {
  return arr.join(", ");
}
function commaSplit(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────────────────────────── Página

export default function ProspectFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { prospects, isHydrated, updateProspect, deleteProspect, catalogos, saveState } =
    useProspeccion();
  const original = useMemo(
    () => prospects.find((p) => p.id === id),
    [prospects, id],
  );

  const [draft, setDraft] = useState<CompanyProspect | null>(null);
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Inicializa / resincroniza el borrador al cambiar de oportunidad. Ajustar el
  // estado durante el render (patrón recomendado por React para resetear estado
  // cuando cambia una prop) evita el efecto y el setState sincrónico en effect.
  if (original && syncedId !== original.id) {
    setSyncedId(original.id);
    setDraft(structuredCloneSafe(original));
  }

  if (!isHydrated) {
    return (
      <AppShell moduleTitle="Oportunidad">
        <p className="text-sm text-slate-400">Cargando ficha…</p>
      </AppShell>
    );
  }

  if (!original || !draft) {
    return (
      <AppShell moduleTitle="Oportunidad no encontrada">
        <div className="space-y-4">
          <ProspeccionTabs />
          <SectionCard title="Oportunidad no encontrada">
            <p className="text-sm text-slate-400">
              La oportunidad solicitada no existe o fue eliminada.
            </p>
            <Link href="/prospeccion-empresas" className={`mt-4 inline-block ${secondaryButton}`}>
              Volver al listado
            </Link>
          </SectionCard>
        </div>
      </AppShell>
    );
  }

  const semaforo = getProspectTrafficLight(draft);
  const next = getNextActivityStatus(draft);
  const sugerida = suggestProspectPriority(draft);

  // Opciones desde catálogo editable cuando hay; si no, los label maps por defecto.
  const rubrosActivos = catalogos.rubros.filter((r) => r.activo);
  const rubroOptions =
    rubrosActivos.length > 0
      ? rubrosActivos.map((r) => ({ value: r.id, label: r.nombre }))
      : RUBRO_VALUES.map((r) => ({ value: r, label: RUBRO_LABELS[r] }));
  const etapasActivas = catalogos.etapas.filter((s) => s.activo);
  const etapaOptions =
    etapasActivas.length > 0
      ? etapasActivas.map((s) => ({ value: s.id, label: s.nombre }))
      : STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] }));
  const direccionExtra = [draft.ciudad, draft.localidad, draft.departamento]
    .filter(Boolean)
    .join(", ");

  function set<K extends keyof CompanyProspect>(key: K, value: CompanyProspect[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setGuardado(false);
  }
  function setFlota<K extends keyof CompanyProspect["flota"]>(
    key: K,
    value: CompanyProspect["flota"][K],
  ) {
    setDraft((d) => (d ? { ...d, flota: { ...d.flota, [key]: value } } : d));
    setGuardado(false);
  }
  function setProveedor<K extends keyof CompanyProspect["proveedor"]>(
    key: K,
    value: CompanyProspect["proveedor"][K],
  ) {
    setDraft((d) =>
      d ? { ...d, proveedor: { ...d.proveedor, [key]: value } } : d,
    );
    setGuardado(false);
  }

  function handleGuardar() {
    if (!draft) return;
    // updateProspect preserva id/creadoEn y refresca actualizadoEn.
    updateProspect(draft.id, draft);
    setGuardado(true);
  }

  function handleEliminar() {
    if (
      window.confirm(
        `¿Eliminar la oportunidad "${draft?.nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      deleteProspect(id);
      router.push("/prospeccion-empresas");
    }
  }

  // ── Helpers de arrays
  function updateContacto(index: number, changes: Partial<ProspectContact>) {
    set(
      "contactos",
      draft!.contactos.map((c, i) => (i === index ? { ...c, ...changes } : c)),
    );
  }
  function addContacto() {
    set("contactos", [
      ...draft!.contactos,
      { id: genLocalId("c"), nombre: "", estado: "no_contactado" },
    ]);
  }
  function removeContacto(index: number) {
    set("contactos", draft!.contactos.filter((_, i) => i !== index));
  }

  function updateNeed(index: number, changes: Partial<ProspectNeed>) {
    set(
      "necesidades",
      draft!.necesidades.map((n, i) => (i === index ? { ...n, ...changes } : n)),
    );
  }
  function addNeed() {
    set("necesidades", [
      ...draft!.necesidades,
      { id: genLocalId("n"), descripcion: "", disponibilidad: "disponible" },
    ]);
  }
  function removeNeed(index: number) {
    set("necesidades", draft!.necesidades.filter((_, i) => i !== index));
  }

  function updateActividad(index: number, changes: Partial<ProspectActivity>) {
    set(
      "actividades",
      draft!.actividades.map((a, i) => (i === index ? { ...a, ...changes } : a)),
    );
  }
  function addActividad() {
    set("actividades", [
      ...draft!.actividades,
      {
        id: genLocalId("act"),
        tipo: "llamada",
        fecha: todayISO(),
        estado: "pendiente",
        responsable: "",
      },
    ]);
  }
  function removeActividad(index: number) {
    set("actividades", draft!.actividades.filter((_, i) => i !== index));
  }

  function updatePropuesta(index: number, changes: Partial<ProspectProposal>) {
    set(
      "propuestas",
      draft!.propuestas.map((pr, i) => (i === index ? { ...pr, ...changes } : pr)),
    );
  }
  function addPropuesta() {
    const nextVersion =
      Math.max(0, ...draft!.propuestas.map((p) => p.version)) + 1;
    set("propuestas", [
      ...draft!.propuestas,
      {
        id: genLocalId("prop"),
        fechaCreacion: todayISO(),
        estado: "en_preparacion",
        version: nextVersion,
        productos: [],
      },
    ]);
  }
  function removePropuesta(index: number) {
    set("propuestas", draft!.propuestas.filter((_, i) => i !== index));
  }

  // Ignora `actualizadoEn` (se refresca al guardar) al comparar borrador vs original.
  const tieneCambios =
    JSON.stringify({ ...draft, actualizadoEn: "" }) !==
    JSON.stringify({ ...original, actualizadoEn: "" });

  return (
    <AppShell moduleTitle={draft.nombre} moduleDescription="Ficha de oportunidad B2B">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProspeccionTabs />
          <Link href="/prospeccion-empresas" className={secondaryButton}>
            ← Volver al listado
          </Link>
        </div>

        {/* Resumen / estado */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 px-5 py-4">
          <TrafficLightBadge value={semaforo} />
          <StageBadge value={draft.etapa} />
          <PriorityBadge value={draft.prioridad} />
          {draft.revisar ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              Revisar
            </span>
          ) : null}
          <NextActivityBadge state={next.state} />
          {next.activity ? (
            <span className="text-xs text-slate-400">
              Próximo paso: {ACTIVITY_TYPE_LABELS[next.activity.tipo]} ·{" "}
              {formatProspectDate(next.activity.fecha)}
            </span>
          ) : (
            <span className="text-xs text-rose-300">
              Esta oportunidad no tiene próxima actividad definida.
            </span>
          )}
        </div>

        <GuiaUso>
          Completá primero <strong>flota</strong>, <strong>referente</strong> y{" "}
          <strong>próxima actividad</strong>. Con esos tres datos la oportunidad ya
          puede gestionarse comercialmente. Recordá guardar los cambios al terminar.
        </GuiaUso>

        {/* A. Empresa */}
        <CollapsibleSection
          title="Datos de empresa"
          description="Identificación y origen de la oportunidad."
          defaultOpen
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre de empresa">
              <input
                className={inputClass}
                value={draft.nombre}
                onChange={(e) => set("nombre", e.target.value)}
              />
            </Field>
            <Field label="Rubro">
              <select
                className={selectClass}
                value={draft.rubro}
                onChange={(e) => set("rubro", e.target.value as ProspectRubro)}
              >
                {rubroOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subrubro">
              <input
                className={inputClass}
                value={draft.subrubro ?? ""}
                onChange={(e) => set("subrubro", e.target.value || undefined)}
              />
            </Field>
            <Field label="Tipo de organización">
              <select
                className={selectClass}
                value={draft.tipoOrganizacion}
                onChange={(e) =>
                  set("tipoOrganizacion", e.target.value as ProspectOrgType)
                }
              >
                {ORG_VALUES.map((o) => (
                  <option key={o} value={o}>
                    {ORG_TYPE_LABELS[o]}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Field label="Dirección">
                <input
                  className={inputClass}
                  value={draft.direccion ?? ""}
                  onChange={(e) => set("direccion", e.target.value || undefined)}
                />
              </Field>
              <AddressActions direccion={draft.direccion} extra={direccionExtra} />
            </div>
            <Field label="Localidad">
              <input
                className={inputClass}
                value={draft.localidad ?? ""}
                onChange={(e) => set("localidad", e.target.value || undefined)}
              />
            </Field>
            <Field label="Ciudad">
              <input
                className={inputClass}
                value={draft.ciudad ?? ""}
                onChange={(e) => set("ciudad", e.target.value || undefined)}
              />
            </Field>
            <Field label="Departamento">
              <select
                className={selectClass}
                value={draft.departamento ?? ""}
                onChange={(e) => set("departamento", e.target.value || undefined)}
              >
                <option value="">Sin departamento</option>
                {catalogos.departamentos.map((d) => (
                  <option key={d.id} value={d.nombre}>
                    {d.nombre}
                  </option>
                ))}
                {draft.departamento &&
                !catalogos.departamentos.some((d) => d.nombre === draft.departamento) ? (
                  <option value={draft.departamento}>{draft.departamento}</option>
                ) : null}
              </select>
            </Field>
            <Field label="Web">
              <input
                className={inputClass}
                value={draft.web ?? ""}
                onChange={(e) => set("web", e.target.value || undefined)}
              />
            </Field>
            <Field label="Fuente">
              <select
                className={selectClass}
                value={draft.fuente}
                onChange={(e) => set("fuente", e.target.value as ProspectSource)}
              >
                {SOURCE_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Etapa">
              <select
                className={selectClass}
                value={draft.etapa}
                onChange={(e) => set("etapa", e.target.value as ProspectStage)}
              >
                {etapaOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Prioridad (sugerida: ${PRIORITY_LABELS[sugerida]})`}>
              <select
                className={selectClass}
                value={draft.prioridad}
                onChange={(e) => set("prioridad", e.target.value as ProspectPriority)}
              >
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={Boolean(draft.esSugerida)}
                onChange={(e) => set("esSugerida", e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950"
              />
              <span className="text-sm text-slate-300">Empresa sugerida</span>
            </label>
          </div>
          <div className="mt-4">
            <Field label="Observaciones generales">
              <textarea
                className={textareaClass}
                value={draft.observaciones ?? ""}
                onChange={(e) => set("observaciones", e.target.value || undefined)}
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* B. Contactos */}
        <CollapsibleSection
          title="Contactos"
          count={draft.contactos.length}
          description="Derivadores y referente final de compras / flota / mantenimiento / logística."
          action={
            <button type="button" onClick={addContacto} className={smallButton}>
              ＋ Agregar contacto
            </button>
          }
        >
          {draft.contactos.length === 0 ? (
            <p className="text-sm text-slate-500">Sin contactos cargados.</p>
          ) : (
            <div className="space-y-4">
              {draft.contactos.map((c, i) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-700 bg-slate-950/40 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Nombre">
                      <input
                        className={inputClass}
                        value={c.nombre}
                        onChange={(e) => updateContacto(i, { nombre: e.target.value })}
                      />
                    </Field>
                    <Field label="Cargo">
                      <input
                        className={inputClass}
                        value={c.cargo ?? ""}
                        onChange={(e) =>
                          updateContacto(i, { cargo: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="Área">
                      <select
                        className={selectClass}
                        value={c.area ?? ""}
                        onChange={(e) =>
                          updateContacto(i, {
                            area: (e.target.value || undefined) as
                              | ProspectContactArea
                              | undefined,
                          })
                        }
                      >
                        <option value="">Sin definir</option>
                        {AREA_VALUES.map((a) => (
                          <option key={a} value={a}>
                            {CONTACT_AREA_LABELS[a]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Teléfono">
                      <input
                        className={inputClass}
                        value={c.telefono ?? ""}
                        onChange={(e) =>
                          updateContacto(i, { telefono: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="WhatsApp">
                      <input
                        className={inputClass}
                        value={c.whatsapp ?? ""}
                        onChange={(e) =>
                          updateContacto(i, { whatsapp: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        className={inputClass}
                        value={c.email ?? ""}
                        onChange={(e) =>
                          updateContacto(i, { email: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="Horario recomendado">
                      <input
                        className={inputClass}
                        value={c.horarioRecomendado ?? ""}
                        onChange={(e) =>
                          updateContacto(i, {
                            horarioRecomendado: e.target.value || undefined,
                          })
                        }
                      />
                    </Field>
                    <Field label="Estado del contacto">
                      <select
                        className={selectClass}
                        value={c.estado}
                        onChange={(e) =>
                          updateContacto(i, {
                            estado: e.target.value as ProspectContactStatus,
                          })
                        }
                      >
                        {CONTACT_STATUS_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {CONTACT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(c.esDerivador)}
                        onChange={(e) =>
                          updateContacto(i, { esDerivador: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                      />
                      Derivador
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(c.esReferenteFinal)}
                        onChange={(e) =>
                          updateContacto(i, { esReferenteFinal: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                      />
                      Referente final
                    </label>
                    <button
                      type="button"
                      onClick={() => removeContacto(i)}
                      className="ml-auto text-xs font-medium text-slate-500 hover:text-rose-300"
                    >
                      Quitar contacto
                    </button>
                  </div>
                  <ContactActions c={c} />
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* C. Flota */}
        <CollapsibleSection
          title="Flota"
          description="Composición y uso de la flota de la empresa."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Flota propia">
              <TriSelect value={draft.flota.flotaPropia} onChange={(v) => setFlota("flotaPropia", v)} />
            </Field>
            <Field label="Flota tercerizada">
              <TriSelect
                value={draft.flota.flotaTercerizada}
                onChange={(v) => setFlota("flotaTercerizada", v)}
              />
            </Field>
            <Field label="Modelo mixto">
              <TriSelect value={draft.flota.modeloMixto} onChange={(v) => setFlota("modeloMixto", v)} />
            </Field>
            <Field label="Alquiladora / proveedor de flota">
              <input
                className={inputClass}
                value={draft.flota.proveedorFlotaActual ?? ""}
                onChange={(e) =>
                  setFlota("proveedorFlotaActual", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Cantidad estimada de vehículos">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={draft.flota.cantidadVehiculos ?? ""}
                onChange={(e) =>
                  setFlota(
                    "cantidadVehiculos",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field label="Próxima renovación de flota">
              <TriSelect
                value={draft.flota.proximaRenovacion}
                onChange={(v) => setFlota("proximaRenovacion", v)}
              />
            </Field>
            <Field label="Fecha estimada de renovación">
              <input
                type="date"
                className={inputClass}
                value={draft.flota.fechaEstimadaRenovacion ?? ""}
                onChange={(e) =>
                  setFlota("fechaEstimadaRenovacion", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Marcas / modelos conocidos">
              <input
                className={inputClass}
                value={draft.flota.marcasModelos ?? ""}
                onChange={(e) => setFlota("marcasModelos", e.target.value || undefined)}
              />
            </Field>
            <Field label="Usos (separados por coma)">
              <input
                className={inputClass}
                value={commaJoin(draft.flota.usos)}
                onChange={(e) => setFlota("usos", commaSplit(e.target.value))}
                placeholder="herramientas, escaleras, cuadrillas, obra…"
              />
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium text-slate-500">
              Tipo de vehículos
            </span>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_VALUES.map((v) => {
                const activo = draft.flota.tiposVehiculo.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setFlota(
                        "tiposVehiculo",
                        activo
                          ? draft.flota.tiposVehiculo.filter((t) => t !== v)
                          : [...draft.flota.tiposVehiculo, v],
                      )
                    }
                    className={
                      activo
                        ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium capitalize text-emerald-300"
                        : "rounded-full border border-slate-700 px-3 py-1 text-xs font-medium capitalize text-slate-400 hover:bg-slate-800"
                    }
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <Field label="Observaciones de flota">
              <textarea
                className={textareaClass}
                value={draft.flota.observaciones ?? ""}
                onChange={(e) => setFlota("observaciones", e.target.value || undefined)}
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* D. Proveedor / competencia */}
        <CollapsibleSection
          title="Proveedor actual y competencia"
          description="Con quién compran hoy, quién decide y dónde está la oportunidad de entrada."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tiene proveedor actual">
              <TriSelect
                value={draft.proveedor.tieneProveedorActual}
                onChange={(v) => setProveedor("tieneProveedorActual", v)}
              />
            </Field>
            <Field label="Proveedor actual">
              <input
                className={inputClass}
                value={draft.proveedor.proveedorActual ?? ""}
                onChange={(e) =>
                  setProveedor("proveedorActual", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Competidores (separados por coma)">
              <input
                className={inputClass}
                value={commaJoin(draft.proveedor.competidores)}
                onChange={(e) =>
                  setProveedor("competidores", commaSplit(e.target.value))
                }
              />
            </Field>
            <Field label="Frecuencia de compra">
              <input
                className={inputClass}
                value={draft.proveedor.frecuenciaCompra ?? ""}
                onChange={(e) =>
                  setProveedor("frecuenciaCompra", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Quién decide">
              <input
                className={inputClass}
                value={draft.proveedor.quienDecide ?? ""}
                onChange={(e) =>
                  setProveedor("quienDecide", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Quién recomienda">
              <input
                className={inputClass}
                value={draft.proveedor.quienRecomienda ?? ""}
                onChange={(e) =>
                  setProveedor("quienRecomienda", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Quién usa los vehículos">
              <input
                className={inputClass}
                value={draft.proveedor.quienUsa ?? ""}
                onChange={(e) => setProveedor("quienUsa", e.target.value || undefined)}
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Condiciones conocidas del acuerdo">
              <textarea
                className={textareaClass}
                value={draft.proveedor.condicionesConocidas ?? ""}
                onChange={(e) =>
                  setProveedor("condicionesConocidas", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Riesgos comerciales">
              <textarea
                className={textareaClass}
                value={draft.proveedor.riesgosComerciales ?? ""}
                onChange={(e) =>
                  setProveedor("riesgosComerciales", e.target.value || undefined)
                }
              />
            </Field>
            <Field label="Oportunidades de entrada">
              <textarea
                className={textareaClass}
                value={draft.proveedor.oportunidadesEntrada ?? ""}
                onChange={(e) =>
                  setProveedor("oportunidadesEntrada", e.target.value || undefined)
                }
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* E. Necesidades / productos no disponibles */}
        <CollapsibleSection
          title="Necesidades y productos no disponibles"
          count={draft.necesidades.length}
          description="Productos que podrían necesitar. Marcá los que Pickup 4x4 NO tiene como “no disponible” u “oportunidad futura”: esas alimentan el bloque global de oportunidades de producto, con trazabilidad a esta empresa."
          action={
            <button type="button" onClick={addNeed} className={smallButton}>
              ＋ Agregar necesidad
            </button>
          }
        >
          {draft.necesidades.length === 0 ? (
            <p className="text-sm text-slate-500">Sin necesidades relevadas.</p>
          ) : (
            <div className="space-y-3">
              {draft.necesidades.map((n, i) => (
                <div
                  key={n.id}
                  className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div className="sm:col-span-2 lg:col-span-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${NEED_BADGE[n.disponibilidad].cls}`}
                    >
                      {NEED_BADGE[n.disponibilidad].label}
                    </span>
                  </div>
                  <Field label="Necesidad / producto">
                    <ProductNeedField
                      value={n.descripcion}
                      onChange={(v) => updateNeed(i, { descripcion: v })}
                    />
                  </Field>
                  <Field label="Recomendado Pickup 4x4">
                    <input
                      className={inputClass}
                      value={n.recomendadoPickup ?? ""}
                      onChange={(e) =>
                        updateNeed(i, { recomendadoPickup: e.target.value || undefined })
                      }
                    />
                  </Field>
                  <Field label="Disponibilidad">
                    <select
                      className={selectClass}
                      value={n.disponibilidad}
                      onChange={(e) =>
                        updateNeed(i, {
                          disponibilidad: e.target.value as ProspectNeedAvailability,
                        })
                      }
                    >
                      {NEED_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {NEED_AVAILABILITY_LABELS[v]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <Field label="Comentario">
                      <input
                        className={inputClass}
                        value={n.comentario ?? ""}
                        onChange={(e) =>
                          updateNeed(i, { comentario: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => removeNeed(i)}
                      className="mb-2 shrink-0 text-xs font-medium text-slate-500 hover:text-rose-300"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* F. Propuestas */}
        <CollapsibleSection
          title="Propuestas"
          count={draft.propuestas.length}
          description="Historial de propuestas generadas y enviadas a esta empresa."
          action={
            <button type="button" onClick={addPropuesta} className={smallButton}>
              ＋ Nueva propuesta
            </button>
          }
        >
          {draft.propuestas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin propuestas todavía.</p>
          ) : (
            <div className="space-y-3">
              {draft.propuestas.map((pr, i) => (
                <div
                  key={pr.id}
                  className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <Field label="Versión">
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      value={pr.version}
                      onChange={(e) =>
                        updatePropuesta(i, { version: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Estado">
                    <select
                      className={selectClass}
                      value={pr.estado}
                      onChange={(e) =>
                        updatePropuesta(i, { estado: e.target.value as ProposalStatus })
                      }
                    >
                      {PROPOSAL_STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {PROPOSAL_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monto estimado (USD)">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={pr.montoEstimado ?? ""}
                      onChange={(e) =>
                        updatePropuesta(i, {
                          montoEstimado: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </Field>
                  <Field label="Medio de envío">
                    <select
                      className={selectClass}
                      value={pr.medioEnvio ?? ""}
                      onChange={(e) =>
                        updatePropuesta(i, {
                          medioEnvio: (e.target.value || undefined) as
                            | ProposalChannel
                            | undefined,
                        })
                      }
                    >
                      <option value="">Sin definir</option>
                      {CHANNEL_VALUES.map((ch) => (
                        <option key={ch} value={ch}>
                          {ch}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha de envío">
                    <input
                      type="date"
                      className={inputClass}
                      value={pr.fechaEnvio ?? ""}
                      onChange={(e) =>
                        updatePropuesta(i, { fechaEnvio: e.target.value || undefined })
                      }
                    />
                  </Field>
                  <Field label="Productos (separados por coma)">
                    <input
                      className={inputClass}
                      value={commaJoin(pr.productos)}
                      onChange={(e) =>
                        updatePropuesta(i, { productos: commaSplit(e.target.value) })
                      }
                    />
                  </Field>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Field label="Notas">
                      <input
                        className={inputClass}
                        value={pr.notas ?? ""}
                        onChange={(e) =>
                          updatePropuesta(i, { notas: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => removePropuesta(i)}
                      className="mb-2 shrink-0 text-xs font-medium text-slate-500 hover:text-rose-300"
                    >
                      Quitar
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 sm:col-span-4">
                    Creada el {formatProspectDate(pr.fechaCreacion)}. El archivo PDF
                    asociado se habilitará en la fase de persistencia real.
                  </p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* G + H. Actividades */}
        <CollapsibleSection
          title="Actividades e historial"
          count={draft.actividades.length}
          description="Toda oportunidad activa debe tener una próxima actividad. Marcá como realizada para conservar el historial."
          action={
            <button type="button" onClick={addActividad} className={smallButton}>
              ＋ Nueva actividad
            </button>
          }
        >
          {draft.actividades.length === 0 ? (
            <p className="text-sm text-rose-300">
              Sin actividades. Agregá una próxima acción para no perder la oportunidad.
            </p>
          ) : (
            <div className="space-y-3">
              {[...draft.actividades]
                .map((a, i) => ({ a, i }))
                .sort((x, y) => x.a.fecha.localeCompare(y.a.fecha))
                .map(({ a, i }) => (
                  <div
                    key={a.id}
                    className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <Field label="Tipo">
                      <select
                        className={selectClass}
                        value={a.tipo}
                        onChange={(e) =>
                          updateActividad(i, { tipo: e.target.value as ActivityType })
                        }
                      >
                        {ACTIVITY_TYPE_VALUES.map((t) => (
                          <option key={t} value={t}>
                            {ACTIVITY_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Fecha de actividad">
                      <input
                        type="date"
                        className={inputClass}
                        value={a.fecha}
                        onChange={(e) => updateActividad(i, { fecha: e.target.value })}
                      />
                    </Field>
                    <Field label="Hora (opcional)">
                      <input
                        type="time"
                        className={inputClass}
                        value={a.hora ?? ""}
                        onChange={(e) =>
                          updateActividad(i, { hora: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="Estado">
                      <select
                        className={selectClass}
                        value={a.estado}
                        onChange={(e) =>
                          updateActividad(i, {
                            estado: e.target.value as ActivityStatus,
                          })
                        }
                      >
                        {ACTIVITY_STATUS_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {ACTIVITY_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Responsable">
                      <input
                        className={inputClass}
                        value={a.responsable ?? ""}
                        onChange={(e) =>
                          updateActividad(i, { responsable: e.target.value || undefined })
                        }
                      />
                    </Field>
                    <Field label="Resultado esperado">
                      <input
                        className={inputClass}
                        value={a.resultadoEsperado ?? ""}
                        onChange={(e) =>
                          updateActividad(i, {
                            resultadoEsperado: e.target.value || undefined,
                          })
                        }
                      />
                    </Field>
                    <Field label="Resultado obtenido">
                      <input
                        className={inputClass}
                        value={a.resultadoObtenido ?? ""}
                        onChange={(e) =>
                          updateActividad(i, {
                            resultadoObtenido: e.target.value || undefined,
                          })
                        }
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <Field label="Notas">
                        <input
                          className={inputClass}
                          value={a.notas ?? ""}
                          onChange={(e) =>
                            updateActividad(i, { notas: e.target.value || undefined })
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => removeActividad(i)}
                        className="mb-2 shrink-0 text-xs font-medium text-slate-500 hover:text-rose-300"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Barra de acciones */}
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/90 px-5 py-4 backdrop-blur">
          <button type="button" onClick={handleGuardar} className={primaryCta}>
            Guardar cambios
          </button>
          {saveState === "guardando" ? (
            <span className="text-sm text-sky-300">Guardando en Supabase…</span>
          ) : saveState === "error" ? (
            <span className="text-sm text-rose-300">
              Error al guardar (queda local).
            </span>
          ) : tieneCambios ? (
            <span className="text-sm text-amber-300">Cambios sin guardar.</span>
          ) : guardado || saveState === "guardado" ? (
            <span className="text-sm text-emerald-300">
              {saveState === "guardado" ? "Guardado ✓" : "Cambios guardados."}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleEliminar}
            className="ml-auto text-sm font-medium text-slate-500 hover:text-rose-300"
          >
            Eliminar oportunidad
          </button>
        </div>
      </div>
    </AppShell>
  );
}

// ───────────────────────────────────────────── Auxiliares

function TriSelect({
  value,
  onChange,
}: {
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value as TriState)}
    >
      {TRI_VALUES.map((t) => (
        <option key={t} value={t}>
          {TRI_STATE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

/** Clona evitando depender de structuredClone en entornos viejos. */
function structuredCloneSafe(value: CompanyProspect): CompanyProspect {
  return JSON.parse(JSON.stringify(value)) as CompanyProspect;
}
