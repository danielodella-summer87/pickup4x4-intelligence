/**
 * Export de UNA respuesta a PDF (botón "PDF" en el tab Respuestas del panel).
 * Usa jsPDF + jspdf-autotable (ya instalados, mismo patrón que
 * lib/prospeccion/pdf-export.ts). Misma lógica que el modal Ver: recorre
 * todasLasPreguntas(investigacion) en orden, no solo lo contestado.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  esRespuestaVacia,
  respuestaJerarquicaLegible,
  todasLasPreguntas,
  type Investigacion,
  type Respuesta,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

function valorLegible(valor: RespuestaValor | undefined): string {
  if (esRespuestaVacia(valor)) return "Sin respuesta";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.join(", ");
  if (valor && typeof valor === "object") return respuestaJerarquicaLegible(valor);
  return String(valor);
}

function fechaLegible(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Genera el PDF de una respuesta: todas las preguntas de la investigación, en orden. */
export function buildRespuestaPdfBlob(
  investigacion: Investigacion | null,
  respuesta: Respuesta,
): Blob {
  const preguntas = investigacion ? todasLasPreguntas(investigacion) : [];
  const idsConPregunta = new Set(preguntas.map((p) => p.id));
  // Preguntas guardadas que ya no están en la definición vigente (igual que el modal Ver).
  const extras = Object.keys(respuesta.respuestas).filter(
    (qid) => !idsConPregunta.has(qid),
  );

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text("Respuesta de encuesta", 10, 14);

  doc.setFontSize(9);
  doc.setTextColor(90);
  const meta = [
    `Investigación: ${investigacion?.titulo ?? respuesta.investigacionSlug}`,
    `Distribuidor: ${respuesta.distribuidorNombre || "—"}`,
    `Empresa: ${respuesta.empresa || "—"}`,
    `Departamento: ${respuesta.departamento || "—"}`,
    `Fecha: ${fechaLegible(respuesta.createdAt)}`,
  ];
  meta.forEach((line, i) => doc.text(line, 10, 21 + i * 5));
  doc.setTextColor(20);

  let startY = 21 + meta.length * 5 + 4;

  if (!investigacion) {
    doc.setFontSize(8);
    doc.setTextColor(150, 110, 20);
    doc.text(
      "No se encontró la definición de esta investigación; se muestran los datos guardados tal cual.",
      10,
      startY,
    );
    doc.setTextColor(20);
    startY += 5;
  }

  const body: string[][] = preguntas.map((p) => [
    p.titulo,
    valorLegible(respuesta.respuestas[p.id]),
  ]);
  for (const qid of extras) {
    body.push([qid, valorLegible(respuesta.respuestas[qid])]);
  }
  if (respuesta.comentarioLibre) {
    body.push(["Comentario libre", respuesta.comentarioLibre]);
  }

  if (body.length === 0) {
    doc.setFontSize(10);
    doc.text("Sin preguntas para mostrar.", 10, startY);
  } else {
    autoTable(doc, {
      startY,
      head: [["Pregunta", "Respuesta"]],
      body,
      styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: { 0: { cellWidth: 70 } },
      margin: { left: 10, right: 10 },
    });
  }

  return doc.output("blob");
}

/** Nombre de archivo: respuesta-{slug-investigacion}-{nombre-o-id}.pdf */
export function nombreArchivoRespuestaPdf(respuesta: Respuesta): string {
  const base = respuesta.distribuidorNombre || respuesta.empresa || respuesta.id;
  return `respuesta-${respuesta.investigacionSlug}-${slugificar(base)}.pdf`;
}

/** Genera y descarga el PDF de una respuesta (sin abrir ningún modal). */
export function descargarRespuestaPdf(
  investigacion: Investigacion | null,
  respuesta: Respuesta,
): void {
  const blob = buildRespuestaPdfBlob(investigacion, respuesta);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoRespuestaPdf(respuesta);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
