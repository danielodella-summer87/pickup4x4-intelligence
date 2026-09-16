/**
 * Persistencia local del dataset de Auditoría de Catálogo.
 *
 * Dominio y almacenamiento propios: clave versionada distinta de
 * `pickup4x4:excel-dataset` (ventas/clientes/artículos). Nunca se mezclan.
 */
import type { CatalogProduct } from "@/lib/catalog-audit/types";

export const CATALOG_AUDIT_STORAGE_KEY = "pickup4x4_catalog_audit_v1";
const STORAGE_VERSION = 1;

export type CatalogAuditPersistedPayload = {
  version: number;
  savedAt: string;
  products: CatalogProduct[];
};

export type CatalogAuditSaveResult = {
  ok: boolean;
  errorMessage?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isValidCatalogAuditPayload(
  value: unknown,
): value is CatalogAuditPersistedPayload {
  if (!isRecord(value)) return false;
  if (value.version !== STORAGE_VERSION) return false;
  if (typeof value.savedAt !== "string") return false;
  if (Number.isNaN(Date.parse(value.savedAt))) return false;
  if (!Array.isArray(value.products)) return false;
  return true;
}

function writePayload(products: CatalogProduct[]): CatalogAuditSaveResult {
  if (typeof window === "undefined") {
    return { ok: false, errorMessage: "No disponible en el servidor." };
  }

  const payload: CatalogAuditPersistedPayload = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    products,
  };

  try {
    window.localStorage.setItem(CATALOG_AUDIT_STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.code === 22);
    return {
      ok: false,
      errorMessage: isQuota
        ? "El catálogo es demasiado grande para localStorage del navegador."
        : "No se pudo guardar el catálogo en localStorage.",
    };
  }
}

/** Guarda (sobrescribe) el dataset actual de auditoría de catálogo. */
export function saveCatalogAuditDataset(
  products: CatalogProduct[],
): CatalogAuditSaveResult {
  return writePayload(products);
}

/** Carga el dataset persistido, si existe y es válido. */
export function loadCatalogAuditDataset(): CatalogAuditPersistedPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CATALOG_AUDIT_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidCatalogAuditPayload(parsed)) {
      window.localStorage.removeItem(CATALOG_AUDIT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(CATALOG_AUDIT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Reemplaza el dataset completo por uno nuevo (ej. tras confirmar una importación). */
export function replaceCatalogAuditDataset(
  products: CatalogProduct[],
): CatalogAuditSaveResult {
  return writePayload(products);
}

/** Limpia el dataset persistido de auditoría de catálogo (no afecta otros dominios). */
export function clearCatalogAuditDataset(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CATALOG_AUDIT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
