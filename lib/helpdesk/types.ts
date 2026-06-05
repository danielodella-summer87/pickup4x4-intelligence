/** Estados posibles de un ticket de mesa de ayuda. */
export type HelpDeskTicketStatus =
  | "nuevo"
  | "en_revision"
  | "en_proceso"
  | "resuelto"
  | "cerrado";

/** Prioridades posibles de un ticket de mesa de ayuda. */
export type HelpDeskTicketPriority = "baja" | "media" | "alta" | "critica";

/** Tipos posibles de un ticket de mesa de ayuda. */
export type HelpDeskTicketType = "error" | "mejora" | "sugerencia" | "consulta";

/** Módulos del sistema sobre los que puede tratar un ticket. */
export type HelpDeskTicketModule =
  | "Dashboard"
  | "Clientes"
  | "Ventas"
  | "Artículos"
  | "Vehículos"
  | "Distribuidor"
  | "Solicitudes"
  | "Oportunidades"
  | "Importar"
  | "General";

/** Ticket de mesa de ayuda persistido en el navegador. */
export interface HelpDeskTicket {
  id: string;
  title: string;
  description: string;
  status: HelpDeskTicketStatus;
  priority: HelpDeskTicketPriority;
  type: HelpDeskTicketType;
  module: HelpDeskTicketModule;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  screenshotUrl?: string;
}

export type CreateHelpDeskTicketInput = {
  title: string;
  description: string;
  type: HelpDeskTicketType;
  priority: HelpDeskTicketPriority;
  module: HelpDeskTicketModule;
  createdBy?: string;
  screenshotUrl?: string;
};

export const HELPDESK_STATUSES: HelpDeskTicketStatus[] = [
  "nuevo",
  "en_revision",
  "en_proceso",
  "resuelto",
  "cerrado",
];

export const HELPDESK_PRIORITIES: HelpDeskTicketPriority[] = [
  "baja",
  "media",
  "alta",
  "critica",
];

export const HELPDESK_TYPES: HelpDeskTicketType[] = [
  "error",
  "mejora",
  "sugerencia",
  "consulta",
];

export const HELPDESK_MODULES: HelpDeskTicketModule[] = [
  "Dashboard",
  "Clientes",
  "Ventas",
  "Artículos",
  "Vehículos",
  "Distribuidor",
  "Solicitudes",
  "Oportunidades",
  "Importar",
  "General",
];

export const helpDeskStatusLabel: Record<HelpDeskTicketStatus, string> = {
  nuevo: "Nuevo",
  en_revision: "En revisión",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

export const helpDeskPriorityLabel: Record<HelpDeskTicketPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export const helpDeskTypeLabel: Record<HelpDeskTicketType, string> = {
  error: "Error",
  mejora: "Mejora",
  sugerencia: "Sugerencia",
  consulta: "Consulta",
};
