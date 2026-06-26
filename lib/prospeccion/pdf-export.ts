// Exportación y compartido de PDF para Prospección Empresas.
// Usa jsPDF + jspdf-autotable (ya instalados). Genera el PDF como Blob para
// poder (a) descargarlo o (b) compartirlo como archivo vía Web Share API.
// WhatsApp NO recibe el archivo automáticamente: en celular el menú nativo de
// "Compartir" permite elegir WhatsApp y adjuntar el PDF; en desktop sin soporte,
// se descarga y se avisa para adjuntarlo a mano.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  CompanyProspect,
  ProspectActivity,
} from "@/lib/models/prospeccion";
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  PRIORITY_LABELS,
  RUBRO_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  TRAFFIC_LIGHT_LABELS,
  diffInDays,
  fleetSummary,
  formatProspectDate,
  getNextActivityStatus,
  getProspectTrafficLight,
  referenteNombre,
  todayISO,
} from "@/lib/prospeccion/helpers";

/** Fecha de hoy YYYY-MM-DD para nombres de archivo y metadatos. */
export function reportDateStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function atrasoLabel(actividad: ProspectActivity, today: string): string {
  if (actividad.estado === "realizada" || actividad.estado === "cancelada") {
    return "Cerrada";
  }
  if (!isValidISODate(actividad.fecha)) return "Sin fecha";
  const d = diffInDays(actividad.fecha, today);
  if (d < 0) return "Vencida";
  if (d === 0) return "Hoy";
  return "Futura";
}

interface TableSpec {
  heading: string;
  meta: string[];
  headers: string[];
  body: string[][];
  landscape?: boolean;
}

/** Construye el documento jsPDF con una tabla y lo devuelve como Blob. */
function buildTableBlob(spec: TableSpec): Blob {
  const doc = new jsPDF({
    orientation: spec.landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFontSize(13);
  doc.text(spec.heading, 10, 12);

  doc.setFontSize(8);
  doc.setTextColor(90);
  spec.meta.forEach((line, i) => doc.text(line, 10, 18 + i * 4));
  doc.setTextColor(20);

  autoTable(doc, {
    startY: 18 + spec.meta.length * 4 + 2,
    head: [spec.headers],
    body: spec.body,
    styles: { fontSize: 7.5, cellPadding: 1.3, overflow: "linebreak" },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 8, right: 8 },
  });

  return doc.output("blob");
}

interface ProspectsPdfOpts {
  totalGeneral?: number;
  filtrosActivos?: boolean;
}

/** Genera el PDF del listado de oportunidades (ya filtrado) como Blob. */
export function buildProspectsPdfBlob(
  rows: CompanyProspect[],
  opts: ProspectsPdfOpts = {},
): Blob {
  const headers = [
    "Empresa", "Rubro", "Localidad / Depto.", "Etapa", "Semáforo", "Prioridad",
    "Flota", "Referente", "Próx. actividad", "Fecha próx.", "Fuente", "Revisar",
  ];
  const body = rows.map((p) => {
    const next = getNextActivityStatus(p);
    const loc =
      [p.localidad, p.departamento].filter(Boolean).join(" / ") || "—";
    return [
      p.nombre,
      RUBRO_LABELS[p.rubro],
      loc,
      STAGE_LABELS[p.etapa],
      TRAFFIC_LIGHT_LABELS[getProspectTrafficLight(p)],
      PRIORITY_LABELS[p.prioridad],
      fleetSummary(p),
      referenteNombre(p) ?? "—",
      next.activity ? ACTIVITY_TYPE_LABELS[next.activity.tipo] : "—",
      next.activity ? formatProspectDate(next.activity.fecha) : "—",
      SOURCE_LABELS[p.fuente],
      p.revisar ? "Sí" : "No",
    ];
  });
  const stamp = reportDateStamp();
  const totalLinea =
    opts.filtrosActivos && typeof opts.totalGeneral === "number"
      ? `Oportunidades exportadas: ${rows.length} de ${opts.totalGeneral} (con filtros)`
      : `Oportunidades exportadas: ${rows.length}`;
  return buildTableBlob({
    heading: "Prospección Empresas",
    meta: [`Generado: ${formatProspectDate(stamp)}`, totalLinea],
    headers,
    body,
    landscape: true,
  });
}

export interface AgendaPdfRow {
  actividad: ProspectActivity;
  prospect: CompanyProspect;
}

/** Genera el PDF de la agenda (ya filtrada) como Blob. */
export function buildAgendaPdfBlob(
  rows: AgendaPdfRow[],
  opts: { totalGeneral?: number } = {},
): Blob {
  const today = todayISO();
  const headers = [
    "Fecha", "Hora", "Empresa", "Rubro", "Actividad", "Responsable", "Estado",
    "Atraso", "Lugar", "Notas",
  ];
  const body = rows.map(({ actividad, prospect }) => [
    isValidISODate(actividad.fecha) ? formatProspectDate(actividad.fecha) : "—",
    actividad.hora || "Sin hora",
    prospect.nombre,
    RUBRO_LABELS[prospect.rubro],
    ACTIVITY_TYPE_LABELS[actividad.tipo],
    actividad.responsable ?? "—",
    ACTIVITY_STATUS_LABELS[actividad.estado],
    atrasoLabel(actividad, today),
    actividad.lugar ?? "—",
    actividad.notas ?? "—",
  ]);
  const stamp = reportDateStamp();
  const totalLinea =
    typeof opts.totalGeneral === "number"
      ? `Actividades exportadas: ${rows.length} de ${opts.totalGeneral}`
      : `Actividades exportadas: ${rows.length}`;
  return buildTableBlob({
    heading: "Agenda Prospección Empresas",
    meta: [`Generado: ${formatProspectDate(stamp)}`, totalLinea],
    headers,
    body,
    landscape: true,
  });
}

// ───────────────────────────────────── Descarga y compartido

/** Descarga un Blob PDF con el nombre indicado. */
export function downloadPdf(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ShareWithFiles = { files?: File[]; title?: string; text?: string };

/** ¿El navegador puede compartir este archivo vía Web Share API? */
export function canSharePdfFile(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data: ShareWithFiles) => boolean;
  };
  return typeof nav.canShare === "function" && nav.canShare({ files: [file] });
}

/**
 * Comparte un PDF como archivo (menú nativo → WhatsApp, etc.). Si el navegador
 * no soporta compartir archivos, hace fallback: descarga + aviso para adjuntar
 * el PDF manualmente.
 */
export async function sharePdfFile(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          share?: (data: ShareWithFiles) => Promise<void>;
        })
      : undefined;

  if (nav && canSharePdfFile(file) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title, text });
      return;
    } catch (err) {
      // Usuario canceló el diálogo → no hacemos fallback.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Otro error → seguimos al fallback de descarga.
    }
  }

  downloadPdf(blob, filename);
  if (typeof window !== "undefined") {
    window.alert(
      "No se puede compartir el PDF automáticamente desde este navegador. Se descargó el archivo para que lo adjuntes manualmente en WhatsApp.",
    );
  }
}
