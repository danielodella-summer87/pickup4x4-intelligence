/**
 * Export de respuestas de UNA investigación a CSV / Excel.
 *
 * Cliente: se dispara desde el dashboard de la encuesta. `xlsx` (ya instalado)
 * se carga por import dinámico para no sumarlo al bundle inicial de la ruta.
 * No toca DB, esquema ni loaders: opera sobre la data ya cargada en memoria.
 */
import {
  respuestaJerarquicaLegible,
  todasLasPreguntas,
  type Investigacion,
  type Respuesta,
  type RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

export type FormatoExport = "csv" | "xlsx";

function valorLegible(valor: RespuestaValor | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.join(", ");
  if (typeof valor === "object") return respuestaJerarquicaLegible(valor);
  return String(valor);
}

function fechaLegible(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Matriz [encabezados, ...filas] lista para una hoja de cálculo. */
export function buildAoa(
  inv: Investigacion,
  respuestas: Respuesta[],
): string[][] {
  const preguntas = todasLasPreguntas(inv);
  const headers = [
    "Fecha",
    "Distribuidor",
    "Empresa",
    "Departamento",
    "Contacto",
    ...preguntas.map((p) => p.titulo),
    "Comentario libre",
  ];

  // Orden cronológico ascendente (los loaders traen desc).
  const ordenadas = [...respuestas].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const filas = ordenadas.map((r) => [
    fechaLegible(r.createdAt),
    r.distribuidorNombre ?? "",
    r.empresa ?? "",
    r.departamento ?? "",
    r.contacto ?? "",
    ...preguntas.map((p) => valorLegible(r.respuestas[p.id])),
    r.comentarioLibre ?? "",
  ]);

  return [headers, ...filas];
}

function nombreArchivo(inv: Investigacion, ext: FormatoExport): string {
  const fecha = new Date().toISOString().slice(0, 10);
  const slug = inv.slug || "investigacion";
  return `inteligencia-mercado_${slug}_${fecha}.${ext}`;
}

/** Genera y descarga el archivo (solo la investigación indicada). */
export async function exportInvestigacion(
  inv: Investigacion,
  respuestas: Respuesta[],
  formato: FormatoExport,
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa = buildAoa(inv, respuestas);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Respuestas");
  XLSX.writeFile(wb, nombreArchivo(inv, formato), { bookType: formato });
}
