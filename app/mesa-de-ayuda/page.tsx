"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import {
  addHelpDeskTicket,
  loadHelpDeskTickets,
  updateHelpDeskTicketStatus,
} from "@/lib/helpdesk/supabaseStorage";
import {
  HELPDESK_MODULES,
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  HELPDESK_TYPES,
  helpDeskPriorityLabel,
  helpDeskStatusLabel,
  helpDeskTypeLabel,
  type CreateHelpDeskTicketInput,
  type HelpDeskTicket,
  type HelpDeskTicketModule,
  type HelpDeskTicketPriority,
  type HelpDeskTicketStatus,
  type HelpDeskTicketType,
} from "@/lib/helpdesk/types";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryBtnClass =
  "rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700";

const selectClass =
  "min-h-[2.5rem] rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600";

const statusBadgeClass: Record<HelpDeskTicketStatus, string> = {
  nuevo: "bg-sky-500/15 text-sky-300",
  en_revision: "bg-amber-500/15 text-amber-300",
  en_proceso: "bg-cyan-500/15 text-cyan-300",
  resuelto: "bg-emerald-500/15 text-emerald-300",
  cerrado: "bg-slate-500/20 text-slate-400",
};

const priorityBadgeClass: Record<HelpDeskTicketPriority, string> = {
  baja: "bg-slate-500/20 text-slate-400",
  media: "bg-sky-500/15 text-sky-300",
  alta: "bg-amber-500/15 text-amber-200",
  critica: "bg-rose-500/15 text-rose-300",
};

const typeBadgeClass: Record<HelpDeskTicketType, string> = {
  error: "bg-rose-500/10 text-rose-300",
  mejora: "bg-cyan-500/10 text-cyan-300",
  sugerencia: "bg-violet-500/15 text-violet-300",
  consulta: "bg-slate-500/20 text-slate-300",
};

type EstadoFiltro = HelpDeskTicketStatus | "todos";
type PrioridadFiltro = HelpDeskTicketPriority | "todas";
type TipoFiltro = HelpDeskTicketType | "todos";

const FORM_INICIAL: CreateHelpDeskTicketInput = {
  title: "",
  description: "",
  type: "error",
  priority: "media",
  module: "General",
  screenshotUrl: "",
};

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function TicketCard({
  ticket,
  onStatusChange,
}: {
  ticket: HelpDeskTicket;
  onStatusChange: (status: HelpDeskTicketStatus) => void;
}) {
  const destacado = ticket.priority === "alta" || ticket.priority === "critica";

  return (
    <article
      className={`rounded-xl border bg-slate-950/50 p-4 sm:p-5 ${
        destacado ? "border-amber-500/40" : "border-slate-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{ticket.title}</p>
          <p className="mt-1 text-sm text-slate-400">{ticket.description}</p>
          {ticket.screenshotUrl ? (
            <a
              href={ticket.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block break-all text-xs text-sky-300 underline-offset-2 hover:underline"
            >
              {ticket.screenshotUrl}
            </a>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Creado: {formatFecha(ticket.createdAt)} · Actualizado:{" "}
            {formatFecha(ticket.updatedAt)}
            {ticket.createdBy ? ` · Por: ${ticket.createdBy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[ticket.status]}`}
          >
            {helpDeskStatusLabel[ticket.status]}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass[ticket.priority]}`}
          >
            Prioridad {helpDeskPriorityLabel[ticket.priority]}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass[ticket.type]}`}
          >
            {helpDeskTypeLabel[ticket.type]}
          </span>
          <span className="rounded-lg bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
            {ticket.module}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-4">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Estado
          <select
            value={ticket.status}
            onChange={(e) =>
              onStatusChange(e.target.value as HelpDeskTicketStatus)
            }
            className={selectClass}
          >
            {HELPDESK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {helpDeskStatusLabel[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

function NuevoTicketModal({
  onSave,
  onCancel,
}: {
  onSave: (input: CreateHelpDeskTicketInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CreateHelpDeskTicketInput>(FORM_INICIAL);

  const puedeGuardar =
    form.title.trim().length > 0 && form.description.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!puedeGuardar) return;
    onSave(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo ticket de mesa de ayuda"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-white">Nuevo ticket</h2>
        <p className="mt-1 text-sm text-slate-400">
          Describí el problema o la idea con el mayor detalle posible.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm text-slate-300">
            Título
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Resumen corto del ticket"
              className={`mt-1 ${inputClass}`}
              autoFocus
            />
          </label>

          <label className="block text-sm text-slate-300">
            Descripción
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Qué pasó, en qué pantalla y qué esperabas que pasara"
              rows={4}
              className={`mt-1 ${inputClass}`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm text-slate-300">
              Tipo
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value as HelpDeskTicketType,
                  })
                }
                className={`mt-1 w-full ${selectClass}`}
              >
                {HELPDESK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {helpDeskTypeLabel[type]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Prioridad
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priority: e.target.value as HelpDeskTicketPriority,
                  })
                }
                className={`mt-1 w-full ${selectClass}`}
              >
                {HELPDESK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {helpDeskPriorityLabel[priority]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Módulo
              <select
                value={form.module}
                onChange={(e) =>
                  setForm({
                    ...form,
                    module: e.target.value as HelpDeskTicketModule,
                  })
                }
                className={`mt-1 w-full ${selectClass}`}
              >
                {HELPDESK_MODULES.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm text-slate-300">
            URL o captura (opcional)
            <input
              type="text"
              value={form.screenshotUrl}
              onChange={(e) =>
                setForm({ ...form, screenshotUrl: e.target.value })
              }
              placeholder="https://…"
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className={secondaryBtnClass}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!puedeGuardar}
            className={`${primaryCtaClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Guardar ticket
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MesaDeAyudaPage() {
  const [tickets, setTickets] = useState<HelpDeskTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [prioridadFiltro, setPrioridadFiltro] =
    useState<PrioridadFiltro>("todas");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [verCerrados, setVerCerrados] = useState(false);

  const refreshTickets = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const result = await loadHelpDeskTickets();
    if (!result.ok) {
      setLoadError(result.errorMessage ?? "No se pudieron cargar los tickets.");
      setTickets([]);
    } else {
      setTickets(result.tickets);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshTickets();
  }, [refreshTickets]);

  const visibles = useMemo(() => {
    return tickets
      .filter((ticket) => {
        if (
          ticket.status === "cerrado" &&
          !verCerrados &&
          estadoFiltro !== "cerrado"
        ) {
          return false;
        }
        if (estadoFiltro !== "todos" && ticket.status !== estadoFiltro) {
          return false;
        }
        if (prioridadFiltro !== "todas" && ticket.priority !== prioridadFiltro) {
          return false;
        }
        if (tipoFiltro !== "todos" && ticket.type !== tipoFiltro) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [tickets, estadoFiltro, prioridadFiltro, tipoFiltro, verCerrados]);

  async function handleCrearTicket(input: CreateHelpDeskTicketInput) {
    setActionError(null);
    setIsSaving(true);

    const result = await addHelpDeskTicket(input);
    setIsSaving(false);

    if (!result.ok || !result.ticket) {
      setActionError(result.errorMessage ?? "No se pudo crear el ticket.");
      return;
    }

    setTickets((prev) => [result.ticket!, ...prev]);
    setModalAbierto(false);
  }

  async function handleStatusChange(id: string, status: HelpDeskTicketStatus) {
    setActionError(null);

    const previous = tickets;
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === id
          ? { ...ticket, status, updatedAt: new Date().toISOString() }
          : ticket,
      ),
    );

    const result = await updateHelpDeskTicketStatus(id, status);
    if (!result.ok || !result.ticket) {
      setTickets(previous);
      setActionError(
        result.errorMessage ?? "No se pudo actualizar el estado del ticket.",
      );
      return;
    }

    setTickets((prev) =>
      prev.map((ticket) => (ticket.id === id ? result.ticket! : ticket)),
    );
  }

  return (
    <AppShell
      moduleTitle="Mesa de ayuda"
      moduleDescription="Tickets de sugerencias, errores y mejoras para Pickup 4x4 Intelligence."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5">
          <p className="text-sm text-slate-300">
            Usá esta mesa de ayuda para registrar errores, ideas o mejoras
            detectadas durante el uso del sistema. Cuanto más concreto sea el
            ticket, más fácil será priorizarlo.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Ejemplo: En Ventas, al filtrar por cliente no aparecen resultados
            aunque el cliente existe.
          </p>
        </div>

        {loadError ? (
          <div
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 sm:p-5"
            role="alert"
          >
            <p className="text-sm font-medium text-rose-200">
              No se pudieron cargar los tickets desde Supabase
            </p>
            <p className="mt-2 text-sm text-rose-100/80">{loadError}</p>
            <p className="mt-2 text-xs text-rose-200/70">
              Si aún no aplicaste la migración SQL, ejecutala manualmente en el
              SQL Editor de Supabase antes de probar esta pantalla.
            </p>
            <button
              type="button"
              onClick={() => void refreshTickets()}
              className={`${secondaryBtnClass} mt-4`}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {actionError && !loadError ? (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
            role="alert"
          >
            <p className="text-sm text-amber-100">{actionError}</p>
          </div>
        ) : null}

        <SectionCard
          title="Tickets"
          description={
            isLoading
              ? "Cargando…"
              : `${visibles.length} de ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} visible${visibles.length === 1 ? "" : "s"}`
          }
          action={
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              disabled={Boolean(loadError) || isLoading}
              className={`${primaryCtaClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              + Nuevo ticket
            </button>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Estado
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
                className={selectClass}
              >
                <option value="todos">Todos</option>
                {HELPDESK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {helpDeskStatusLabel[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-400">
              Prioridad
              <select
                value={prioridadFiltro}
                onChange={(e) =>
                  setPrioridadFiltro(e.target.value as PrioridadFiltro)
                }
                className={selectClass}
              >
                <option value="todas">Todas</option>
                {HELPDESK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {helpDeskPriorityLabel[priority]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-400">
              Tipo
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
                className={selectClass}
              >
                <option value="todos">Todos</option>
                {HELPDESK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {helpDeskTypeLabel[type]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={verCerrados}
                onChange={(e) => setVerCerrados(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-emerald-500"
              />
              Ver cerrados
            </label>
          </div>

          <div className="mt-5">
            {isLoading ? (
              <p className="text-sm text-slate-500">Cargando tickets…</p>
            ) : loadError ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-10 text-center">
                <p className="text-base font-medium text-slate-300">
                  Tickets no disponibles
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Revisá la configuración de Supabase y que la tabla{" "}
                  <code className="text-slate-400">helpdesk_tickets</code> exista
                  en la base de datos.
                </p>
              </div>
            ) : visibles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-10 text-center">
                <p className="text-base font-medium text-slate-300">
                  No hay tickets para mostrar
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {tickets.length === 0
                    ? "Creá el primer ticket con el botón “+ Nuevo ticket”."
                    : "Ningún ticket coincide con los filtros actuales. Probá ajustarlos o activá “Ver cerrados”."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {visibles.map((ticket) => (
                  <li key={ticket.id}>
                    <TicketCard
                      ticket={ticket}
                      onStatusChange={(status) =>
                        handleStatusChange(ticket.id, status)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>
      </div>

      {modalAbierto ? (
        <NuevoTicketModal
          onSave={(input) => void handleCrearTicket(input)}
          onCancel={() => setModalAbierto(false)}
        />
      ) : null}

      {isSaving ? (
        <p className="sr-only" aria-live="polite">
          Guardando ticket…
        </p>
      ) : null}
    </AppShell>
  );
}
