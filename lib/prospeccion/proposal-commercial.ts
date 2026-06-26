// Contenido comercial de una propuesta + generación de PDF comercial.
//
// Una "propuesta" en este módulo es una propuesta comercial real que se envía
// a la empresa. Acá se arma el contenido (encabezado, introducción, necesidad
// detectada, productos, argumento, monto, próximo paso) de forma pura para que
// la previsualización en pantalla y el PDF muestren EXACTAMENTE lo mismo.
//
// Importante: las notas internas NO forman parte del contenido comercial ni del
// PDF. Se exponen aparte (campo `notasInternas`) sólo para la vista interna.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  CompanyProspect,
  ProposalProductItem,
  ProspectProposal,
} from "@/lib/models/prospeccion";
import {
  NEED_AVAILABILITY_LABELS,
  PROPOSAL_STATUS_LABELS,
  RUBRO_LABELS,
  fleetSummary,
  formatProspectDate,
} from "@/lib/prospeccion/helpers";
import { downloadPdf, reportDateStamp } from "@/lib/prospeccion/pdf-export";

/** Datos de contacto del emisor para el pie comercial del PDF. */
export const PICKUP_COMMERCIAL_CONTACT = {
  empresa: "Pickup 4x4",
  // La app todavía no tiene datos de contacto cargados (teléfono/email).
  // Hasta que existan, usamos un texto genérico.
  equipo: "Equipo comercial Pickup 4x4",
} as const;

/** Línea de producto ya calculada para previsualización / PDF. */
export interface ProposalContentItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ProposalCommercialContent {
  header: {
    titulo: string;
    empresa: string;
    rubro: string;
    ubicacion: string;
    fecha: string;
    version: string;
    estado: string;
  };
  intro: string;
  /** Líneas de la necesidad detectada (sin notas internas). */
  necesidad: string[];
  /** Productos / soluciones propuestas (tabla comercial). */
  items: ProposalContentItem[];
  /** Total calculado de la propuesta (suma de subtotales o monto manual). */
  total: number;
  /** Líneas del argumento comercial. */
  argumento: string[];
  /** Monto estimado formateado o leyenda de pendiente. */
  monto: string;
  /** Próximo paso sugerido según estado. */
  proximoPaso: string;
  /** Notas internas: SÓLO para vista interna, nunca para el PDF comercial. */
  notasInternas?: string;
}

/** Subtotal de una línea (cantidad * precio unitario). */
export function itemSubtotal(item: ProposalProductItem): number {
  return (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
}

/** Total calculado de una propuesta a partir de sus ítems estructurados. */
export function proposalItemsTotal(proposal: ProspectProposal): number {
  return (proposal.items ?? []).reduce((sum, it) => sum + itemSubtotal(it), 0);
}

/** Formatea un importe en USD (es-UY). */
export function formatMoneyUSD(value: number): string {
  return `USD ${value.toLocaleString("es-UY")}`;
}

function rubroLabel(p: CompanyProspect): string {
  const base = RUBRO_LABELS[p.rubro] ?? p.rubro;
  return p.subrubro ? `${base} / ${p.subrubro}` : base;
}

function ubicacionLabel(p: CompanyProspect): string {
  return [p.localidad, p.departamento].filter(Boolean).join(" / ") || "—";
}

function montoLabel(total: number): string {
  if (total > 0) return formatMoneyUSD(total);
  return "Pendiente de cotización.";
}

/**
 * Normaliza los productos de una propuesta a líneas calculadas.
 * Prioriza `items` estructurados; si no hay, cae al texto libre legacy
 * (`productos`) con cantidad 1 y precio 0, para no perder propuestas previas.
 */
function contentItems(proposal: ProspectProposal): ProposalContentItem[] {
  if (proposal.items && proposal.items.length > 0) {
    return proposal.items
      .filter((it) => it.nombre.trim())
      .map((it) => {
        const cantidad = Number(it.cantidad) || 0;
        const precioUnitario = Number(it.precioUnitario) || 0;
        return {
          nombre: it.codigo ? `${it.nombre} (${it.codigo})` : it.nombre,
          cantidad,
          precioUnitario,
          subtotal: cantidad * precioUnitario,
        };
      });
  }
  return proposal.productos
    .map((s) => s.trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, cantidad: 1, precioUnitario: 0, subtotal: 0 }));
}

function proximoPasoLabel(proposal: ProspectProposal): string {
  switch (proposal.estado) {
    case "enviada":
    case "en_revision":
      return "Hacer seguimiento de respuesta.";
    case "aceptada":
      return "Coordinar entrega, instalación o facturación.";
    case "rechazada":
      return "Registrar motivo de pérdida y oportunidad futura.";
    case "no_iniciada":
    case "en_preparacion":
    default:
      return "Completar productos y monto antes de enviar.";
  }
}

/** Construye el contenido comercial (puro) de una propuesta. */
export function buildProposalContent(
  prospect: CompanyProspect,
  proposal: ProspectProposal,
): ProposalCommercialContent {
  const rubro = rubroLabel(prospect);
  const items = contentItems(proposal);
  const productos = items.map((it) => it.nombre);
  // Total: suma de subtotales si hay ítems con precio; si no, monto manual.
  const itemsTotal = items.reduce((s, it) => s + it.subtotal, 0);
  const total =
    itemsTotal > 0
      ? itemsTotal
      : typeof proposal.montoEstimado === "number"
        ? proposal.montoEstimado
        : 0;

  const intro =
    `En base al perfil de ${prospect.nombre}, su rubro ${rubro} y las ` +
    "oportunidades detectadas para flotas, cuadrillas o vehículos de trabajo, " +
    "preparamos una propuesta comercial orientada a mejorar equipamiento, " +
    "seguridad y operación.";

  // Necesidad detectada: armada con datos estructurados disponibles.
  // (Las notas internas quedan fuera, según la regla comercial.)
  const necesidad: string[] = [];
  necesidad.push(`Rubro: ${rubro}.`);
  const flota = fleetSummary(prospect);
  if (flota && flota !== "No se sabe") necesidad.push(`Flota: ${flota}.`);
  const proveedor = prospect.proveedor.proveedorActual?.trim();
  if (proveedor) necesidad.push(`Proveedor actual: ${proveedor}.`);
  if (productos.length > 0) {
    necesidad.push(`Productos de interés: ${productos.join(", ")}.`);
  }
  const noDisponibles = prospect.necesidades
    .filter((n) => n.disponibilidad !== "disponible")
    .map(
      (n) =>
        `${n.descripcion.trim()} (${NEED_AVAILABILITY_LABELS[n.disponibilidad]})`,
    )
    .filter((s) => s && !s.startsWith("("));
  if (noDisponibles.length > 0) {
    necesidad.push(`Necesidades a cubrir: ${noDisponibles.join("; ")}.`);
  }

  const argumento: string[] = [
    "Esta propuesta busca abrir una oportunidad comercial con foco en " +
      "disponibilidad, instalación, reposición y soporte para vehículos de trabajo.",
  ];
  if (prospect.prioridad === "alta" || prospect.prioridad === "media") {
    argumento.push(
      "Por el nivel de prioridad asignado, esta oportunidad requiere " +
        "seguimiento comercial cercano.",
    );
  }

  return {
    header: {
      titulo: "Propuesta comercial Pickup 4x4",
      empresa: prospect.nombre,
      rubro,
      ubicacion: ubicacionLabel(prospect),
      fecha: formatProspectDate(reportDateStamp()),
      version: `v${proposal.version}`,
      estado: PROPOSAL_STATUS_LABELS[proposal.estado],
    },
    intro,
    necesidad,
    items,
    total,
    argumento,
    monto: montoLabel(total),
    proximoPaso: proximoPasoLabel(proposal),
    notasInternas: proposal.notas?.trim() || undefined,
  };
}

function slugifyEmpresa(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "empresa"
  );
}

/** Nombre del archivo PDF: propuesta-pickup4x4-[empresa]-v[version]-YYYY-MM-DD.pdf */
export function proposalPdfFilename(
  prospect: CompanyProspect,
  proposal: ProspectProposal,
): string {
  const empresa = slugifyEmpresa(prospect.nombre);
  return `propuesta-pickup4x4-${empresa}-v${proposal.version}-${reportDateStamp()}.pdf`;
}

/**
 * Genera el PDF comercial de la propuesta como Blob. Documento orientado al
 * cliente: sin controles del sistema, sin "registro interno" y SIN notas internas.
 */
export function buildProposalPdfBlob(
  prospect: CompanyProspect,
  proposal: ProspectProposal,
): Blob {
  const c = buildProposalContent(prospect, proposal);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 16;
  const right = 16;
  const maxW = pageW - left - right;
  let y = 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = 20;
    }
  };

  const paragraph = (text: string, size = 10, gap = 5) => {
    doc.setFontSize(size);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    ensureSpace(lines.length * (size * 0.45) + gap);
    doc.text(lines, left, y);
    y += lines.length * (size * 0.45) + gap;
  };

  const sectionTitle = (text: string) => {
    ensureSpace(10);
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.text(text, left, y);
    doc.setFont("helvetica", "normal");
    y += 6;
  };

  // ── Encabezado
  doc.setFontSize(18);
  doc.setTextColor(15);
  doc.setFont("helvetica", "bold");
  doc.text(c.header.titulo, left, y);
  doc.setFont("helvetica", "normal");
  y += 9;

  doc.setFontSize(10);
  doc.setTextColor(80);
  const headerLines = [
    `Empresa destinataria: ${c.header.empresa}`,
    `Rubro: ${c.header.rubro}`,
    `Localidad / departamento: ${c.header.ubicacion}`,
    `Fecha: ${c.header.fecha}`,
    `Versión de propuesta: ${c.header.version}`,
    `Estado: ${c.header.estado}`,
  ];
  headerLines.forEach((line) => {
    doc.text(line, left, y);
    y += 5;
  });
  doc.setTextColor(40);
  y += 3;
  doc.setDrawColor(200);
  doc.line(left, y, pageW - right, y);
  y += 7;

  // ── Introducción comercial
  sectionTitle("Introducción");
  paragraph(c.intro);

  // ── Necesidad detectada
  sectionTitle("Necesidad detectada");
  if (c.necesidad.length > 0) {
    c.necesidad.forEach((n) => paragraph(`• ${n}`, 10, 2));
    y += 3;
  } else {
    paragraph("Sin datos suficientes para detallar la necesidad.");
  }

  // ── Productos / soluciones propuestas
  sectionTitle("Productos / soluciones propuestas");
  if (c.items.length > 0) {
    ensureSpace(10);
    const hasPrices = c.items.some((it) => it.subtotal > 0);
    autoTable(doc, {
      startY: y,
      head: [["Producto", "Cantidad", "Precio unitario", "Subtotal"]],
      body: c.items.map((it) => [
        it.nombre,
        String(it.cantidad),
        it.precioUnitario > 0 ? formatMoneyUSD(it.precioUnitario) : "—",
        it.subtotal > 0 ? formatMoneyUSD(it.subtotal) : "—",
      ]),
      foot: hasPrices
        ? [["", "", "Total estimado", formatMoneyUSD(c.total)]]
        : undefined,
      styles: { fontSize: 10, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      margin: { left, right },
    });
    const after = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable;
    y = (after?.finalY ?? y) + 7;
  } else {
    paragraph("Todavía no se cargaron productos para esta propuesta.");
  }

  // ── Argumento comercial
  sectionTitle("Argumento comercial");
  c.argumento.forEach((a) => paragraph(a));

  // ── Monto estimado / Total
  sectionTitle("Monto estimado");
  paragraph(c.monto);

  // ── Próximo paso
  sectionTitle("Próximo paso");
  paragraph(c.proximoPaso);

  // ── Pie comercial (sin notas internas)
  ensureSpace(20);
  y = Math.max(y, pageH - 24);
  doc.setDrawColor(200);
  doc.line(left, y, pageW - right, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.setFont("helvetica", "bold");
  doc.text(PICKUP_COMMERCIAL_CONTACT.empresa, left, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text(PICKUP_COMMERCIAL_CONTACT.equipo, left, y);

  return doc.output("blob");
}

/** Genera y descarga el PDF comercial de la propuesta. */
export function exportProposalPdf(
  prospect: CompanyProspect,
  proposal: ProspectProposal,
): void {
  const blob = buildProposalPdfBlob(prospect, proposal);
  downloadPdf(blob, proposalPdfFilename(prospect, proposal));
}
