import {
  HELPDESK_MODULES,
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  HELPDESK_TYPES,
  type CreateHelpDeskTicketInput,
  type HelpDeskTicket,
  type HelpDeskTicketStatus,
} from "@/lib/helpdesk/types";

const STORAGE_KEY = "pickup4x4:helpdesk-tickets";
const STORAGE_VERSION = 1;

type PersistedHelpDeskPayload = {
  version: number;
  tickets: HelpDeskTicket[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidHelpDeskTicket(value: unknown): value is HelpDeskTicket {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.title !== "string") return false;
  if (typeof value.description !== "string") return false;
  if (typeof value.createdAt !== "string") return false;
  if (typeof value.updatedAt !== "string") return false;
  if (!HELPDESK_STATUSES.includes(value.status as HelpDeskTicket["status"])) {
    return false;
  }
  if (
    !HELPDESK_PRIORITIES.includes(value.priority as HelpDeskTicket["priority"])
  ) {
    return false;
  }
  if (!HELPDESK_TYPES.includes(value.type as HelpDeskTicket["type"])) {
    return false;
  }
  if (!HELPDESK_MODULES.includes(value.module as HelpDeskTicket["module"])) {
    return false;
  }
  if (value.createdBy !== undefined && typeof value.createdBy !== "string") {
    return false;
  }
  if (
    value.screenshotUrl !== undefined &&
    typeof value.screenshotUrl !== "string"
  ) {
    return false;
  }
  return true;
}

function generateTicketId(): string {
  return `tk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildDemoTicket(): HelpDeskTicket {
  const now = new Date().toISOString();
  return {
    id: generateTicketId(),
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

export function saveHelpDeskTickets(tickets: HelpDeskTicket[]): void {
  if (typeof window === "undefined") return;

  const payload: PersistedHelpDeskPayload = {
    version: STORAGE_VERSION,
    tickets,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}

/**
 * Carga los tickets desde localStorage.
 * Si no hay datos guardados, crea un ticket demo inicial y lo persiste.
 */
export function loadHelpDeskTickets(): HelpDeskTicket[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = [buildDemoTicket()];
      saveHelpDeskTickets(seeded);
      return seeded;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.tickets)
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      const seeded = [buildDemoTicket()];
      saveHelpDeskTickets(seeded);
      return seeded;
    }

    const valid = parsed.tickets.filter(isValidHelpDeskTicket);
    if (valid.length !== parsed.tickets.length) {
      saveHelpDeskTickets(valid);
    }
    return valid;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

/** Construye un ticket nuevo a partir del formulario (no persiste). */
export function buildHelpDeskTicket(
  input: CreateHelpDeskTicketInput,
): HelpDeskTicket {
  const now = new Date().toISOString();
  const createdBy = input.createdBy?.trim();
  const screenshotUrl = input.screenshotUrl?.trim();

  return {
    id: generateTicketId(),
    title: input.title.trim(),
    description: input.description.trim(),
    status: "nuevo",
    priority: input.priority,
    type: input.type,
    module: input.module,
    createdAt: now,
    updatedAt: now,
    ...(createdBy ? { createdBy } : {}),
    ...(screenshotUrl ? { screenshotUrl } : {}),
  };
}

/** Agrega un ticket y persiste el listado resultante. */
export function addHelpDeskTicket(
  tickets: HelpDeskTicket[],
  input: CreateHelpDeskTicketInput,
): HelpDeskTicket[] {
  const next = [buildHelpDeskTicket(input), ...tickets];
  saveHelpDeskTickets(next);
  return next;
}

/** Cambia el estado de un ticket y persiste el listado resultante. */
export function updateHelpDeskTicketStatus(
  tickets: HelpDeskTicket[],
  id: string,
  status: HelpDeskTicketStatus,
): HelpDeskTicket[] {
  const next = tickets.map((ticket) =>
    ticket.id === id
      ? { ...ticket, status, updatedAt: new Date().toISOString() }
      : ticket,
  );
  saveHelpDeskTickets(next);
  return next;
}
