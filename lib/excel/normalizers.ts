/**
 * Normalizadores conservadores para valores crudos de Excel.
 * No inventan datos: devuelven undefined / null cuando no hay valor usable.
 */

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function normalizeText(value: unknown): string | undefined {
  if (isBlank(value)) return undefined;
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeCode(value: unknown): string | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  return text;
}

/**
 * Preserva el código original del Excel (sin re-formatear numéricos con decimales).
 */
export function normalizeCodigoUnico(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  return normalizeCode(value);
}

export function normalizeNumber(value: unknown): number | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeInteger(value: unknown): number | undefined {
  const num = normalizeNumber(value);
  if (num === undefined) return undefined;
  return Math.trunc(num);
}

/**
 * Acepta serial Excel, ISO, dd/mm/yyyy y dd-mm-yyyy.
 * Devuelve ISO YYYY-MM-DD o undefined.
 */
export function normalizeDate(value: unknown): string | undefined {
  if (isBlank(value)) return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(date.getTime())) return toIsoDate(date);
  }

  const text = normalizeText(value);
  if (!text) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) return toIsoDate(date);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);

  return undefined;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Importes ARS: quita $ y separadores locales. */
export function normalizeCurrency(value: unknown): number | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value)
    .trim()
    .replace(/[^\d,.\-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizePhone(value: unknown): string | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  const digits = text.replace(/[^\d+]/g, "");
  return digits.length > 0 ? digits : undefined;
}

export function normalizeBoolean(
  value: unknown,
  truthy: string[] = ["si", "sí", "true", "1", "activo", "s"],
): boolean | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();
  if (truthy.includes(text)) return true;
  if (["no", "false", "0", "inactivo", "n"].includes(text)) return false;
  return undefined;
}

export function normalizeClienteEstado(
  value: unknown,
): "activo" | "inactivo" | "dormido" | "en_seguimiento" | undefined {
  const text = normalizeText(value)?.toLowerCase();
  if (!text) return undefined;

  if (text.includes("dorm")) return "dormido";
  if (text.includes("seguim")) return "en_seguimiento";
  if (text.includes("inact") || text.includes("baja")) return "inactivo";
  if (text.includes("act")) return "activo";

  return undefined;
}

export function normalizeTipoComprobante(
  value: unknown,
): "factura" | "remito" | "nota_credito" | "otro" | undefined {
  const text = normalizeText(value)?.toLowerCase();
  if (!text) return undefined;

  if (text.includes("fact")) return "factura";
  if (text.includes("remit")) return "remito";
  if (text.includes("credito") || text.includes("crédito") || text.includes("nc"))
    return "nota_credito";

  return "otro";
}
