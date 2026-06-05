import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbHelpdeskTicket, Database } from "@/lib/supabase/types";
import {
  HELPDESK_MODULES,
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  HELPDESK_TYPES,
  type CreateHelpDeskTicketInput,
  type HelpDeskTicket,
  type HelpDeskTicketStatus,
} from "@/lib/helpdesk/types";

function logHelpdesk(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[Helpdesk] ${message}`, detail);
    } else {
      console.info(`[Helpdesk] ${message}`);
    }
  }
}

function friendlySupabaseError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("helpdesk_tickets") &&
    (lower.includes("does not exist") ||
      lower.includes("no existe") ||
      lower.includes("schema cache"))
  ) {
    return "La tabla helpdesk_tickets no existe en Supabase. Ejecutá el SQL de migración manualmente en el SQL Editor antes de usar la mesa de ayuda.";
  }
  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "Sin permisos para acceder a helpdesk_tickets. Verificá las políticas RLS en Supabase.";
  }
  return message;
}

function isValidDbRow(row: DbHelpdeskTicket): boolean {
  return (
    HELPDESK_STATUSES.includes(row.status as HelpDeskTicket["status"]) &&
    HELPDESK_PRIORITIES.includes(row.priority as HelpDeskTicket["priority"]) &&
    HELPDESK_TYPES.includes(row.type as HelpDeskTicket["type"]) &&
    HELPDESK_MODULES.includes(row.module as HelpDeskTicket["module"])
  );
}

export function dbRowToHelpDeskTicket(row: DbHelpdeskTicket): HelpDeskTicket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as HelpDeskTicket["status"],
    priority: row.priority as HelpDeskTicket["priority"],
    type: row.type as HelpDeskTicket["type"],
    module: row.module as HelpDeskTicket["module"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.screenshot_url ? { screenshotUrl: row.screenshot_url } : {}),
  };
}

function createInputToDbInsert(
  input: CreateHelpDeskTicketInput,
): Database["public"]["Tables"]["helpdesk_tickets"]["Insert"] {
  const createdBy = input.createdBy?.trim();
  const screenshotUrl = input.screenshotUrl?.trim();

  return {
    title: input.title.trim(),
    description: input.description.trim(),
    status: "nuevo",
    priority: input.priority,
    type: input.type,
    module: input.module,
    created_by: createdBy || null,
    screenshot_url: screenshotUrl || null,
  };
}

export async function loadHelpDeskTickets(): Promise<{
  ok: boolean;
  tickets: HelpDeskTicket[];
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      tickets: [],
      errorMessage:
        "Supabase no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) en .env.local.",
    };
  }

  const client = createSupabaseBrowserClient();
  if (!client) {
    return {
      ok: false,
      tickets: [],
      errorMessage: "No se pudo inicializar el cliente de Supabase.",
    };
  }

  const { data, error } = await client
    .from("helpdesk_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    logHelpdesk("Error cargando tickets", error);
    return {
      ok: false,
      tickets: [],
      errorMessage: friendlySupabaseError(error.message),
    };
  }

  const tickets = (data ?? [])
    .filter((row): row is DbHelpdeskTicket => isValidDbRow(row as DbHelpdeskTicket))
    .map((row) => dbRowToHelpDeskTicket(row));

  logHelpdesk("Tickets cargados", { count: tickets.length });
  return { ok: true, tickets };
}

export async function addHelpDeskTicket(
  input: CreateHelpDeskTicketInput,
): Promise<{
  ok: boolean;
  ticket?: HelpDeskTicket;
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      errorMessage:
        "Supabase no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.",
    };
  }

  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, errorMessage: "No se pudo inicializar el cliente de Supabase." };
  }

  const { data, error } = await client
    .from("helpdesk_tickets")
    .insert(createInputToDbInsert(input))
    .select("*")
    .single();

  if (error) {
    logHelpdesk("Error creando ticket", error);
    return { ok: false, errorMessage: friendlySupabaseError(error.message) };
  }

  if (!data || !isValidDbRow(data as DbHelpdeskTicket)) {
    return { ok: false, errorMessage: "El ticket creado no tiene un formato válido." };
  }

  const ticket = dbRowToHelpDeskTicket(data as DbHelpdeskTicket);
  logHelpdesk("Ticket creado", { id: ticket.id });
  return { ok: true, ticket };
}

export async function updateHelpDeskTicketStatus(
  id: string,
  status: HelpDeskTicketStatus,
): Promise<{
  ok: boolean;
  ticket?: HelpDeskTicket;
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      errorMessage:
        "Supabase no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.",
    };
  }

  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, errorMessage: "No se pudo inicializar el cliente de Supabase." };
  }

  const { data, error } = await client
    .from("helpdesk_tickets")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logHelpdesk("Error actualizando ticket", error);
    return { ok: false, errorMessage: friendlySupabaseError(error.message) };
  }

  if (!data || !isValidDbRow(data as DbHelpdeskTicket)) {
    return { ok: false, errorMessage: "El ticket actualizado no tiene un formato válido." };
  }

  const ticket = dbRowToHelpDeskTicket(data as DbHelpdeskTicket);
  logHelpdesk("Estado actualizado", { id, status });
  return { ok: true, ticket };
}

/** Ticket demo solo para referencia visual en desarrollo; no se persiste en Supabase. */
export function buildDemoHelpDeskTicket(): HelpDeskTicket {
  const now = new Date().toISOString();
  return {
    id: "demo-ticket",
    title: "Ejemplo: filtro por cliente en Ventas sin resultados",
    description:
      "En Ventas, al filtrar por cliente no aparecen resultados aunque el cliente existe. Pasa con clientes cargados desde el Excel KORE.",
    status: "nuevo",
    priority: "media",
    type: "error",
    module: "Ventas",
    createdAt: now,
    updatedAt: now,
    createdBy: "Demo",
  };
}
