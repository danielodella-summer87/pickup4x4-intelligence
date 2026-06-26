// Helpers puros (sin React) para enlaces accionables de contacto del módulo
// Prospección Empresas. País por defecto: Uruguay (+598).
//
// Los datos vienen sucios de los Excel ("26046660", "092 02 24 65", "29160208",
// "099 123 456", a veces con texto), así que se normaliza de forma tolerante: se
// prioriza no descartar datos útiles (el operador valida desde la ficha).

export interface NormalizedPhone {
  /** Forma local sin 0 inicial ni código de país (ej "99123456"). */
  local: string;
  /** Formato E.164 internacional (ej "+59899123456"). */
  e164: string;
  /** Forma para wa.me, sin "+" (ej "59899123456"). */
  wa: string;
}

/**
 * Normaliza un teléfono uruguayo a formas local / E.164 / wa.me.
 * Devuelve null si el dato no tiene dígitos suficientes para ser un teléfono.
 */
export function normalizeUruguayPhone(raw: string): NormalizedPhone | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  // Menos de 6 dígitos originales => basura, no es un teléfono.
  if (digits.length < 6) return null;

  let local = digits;
  // Quitar código de país si viene incluido.
  if (local.startsWith("598")) local = local.slice(3);
  // Quitar 0 inicial (prefijo nacional / de celular).
  if (local.startsWith("0")) local = local.slice(1);

  // Si tras limpiar quedó vacío, no sirve.
  if (local.length === 0) return null;

  return {
    local,
    e164: `+598${local}`,
    wa: `598${local}`,
  };
}

/**
 * ¿El número parece un celular uruguayo? (local de 8 dígitos que empieza en 9).
 */
export function isLikelyMobilePhone(raw: string): boolean {
  const normalized = normalizeUruguayPhone(raw);
  if (!normalized) return false;
  return normalized.local.length === 8 && normalized.local.startsWith("9");
}

/**
 * Formato legible del teléfono a partir de su forma local.
 * Si no se puede normalizar, devuelve el valor original sin tocar.
 */
export function formatDisplayPhone(raw: string): string {
  const normalized = normalizeUruguayPhone(raw);
  if (!normalized) return raw;

  const { local } = normalized;
  // Celular: 9XXXXXXX (8 díg) => "09X XXX XXX".
  if (local.length === 8 && local.startsWith("9")) {
    return `0${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  // Fijo de 8 dígitos => "XXXX XXXX".
  if (local.length === 8) {
    return `${local.slice(0, 4)} ${local.slice(4)}`;
  }
  // 7 dígitos => "XXX XXXX".
  if (local.length === 7) {
    return `${local.slice(0, 3)} ${local.slice(3)}`;
  }
  // Otros largos: devolver local sin más formato.
  return local;
}

/**
 * URL `tel:` (fijo o celular). null si el dato no es un teléfono válido.
 */
export function buildTelUrl(raw: string): string | null {
  const normalized = normalizeUruguayPhone(raw);
  if (!normalized) return null;
  return `tel:${normalized.e164}`;
}

/**
 * URL de WhatsApp (wa.me). Solo si parece celular; si no, null.
 */
export function buildWhatsappUrl(raw: string): string | null {
  if (!isLikelyMobilePhone(raw)) return null;
  const normalized = normalizeUruguayPhone(raw);
  if (!normalized) return null;
  return `https://wa.me/${normalized.wa}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * URL `mailto:`. null si el email no pasa una validación básica.
 */
export function buildMailtoUrl(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!EMAIL_RE.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

/** Arma la query de búsqueda agregando ", Uruguay" si no menciona el país. */
function buildAddressQuery(direccion: string, extra?: string): string | null {
  const dir = (direccion ?? "").trim();
  if (!dir) return null;
  let query = [dir, (extra ?? "").trim()].filter(Boolean).join(", ");
  if (!/uruguay/i.test(query)) query = `${query}, Uruguay`;
  return query;
}

/**
 * URL de Google Maps para una dirección. null si no hay dirección.
 */
export function buildGoogleMapsUrl(
  direccion: string,
  extra?: string,
): string | null {
  const query = buildAddressQuery(direccion, extra);
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * URL de Waze (con navegación) para una dirección. null si no hay dirección.
 */
export function buildWazeUrl(direccion: string, extra?: string): string | null {
  const query = buildAddressQuery(direccion, extra);
  if (!query) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}
