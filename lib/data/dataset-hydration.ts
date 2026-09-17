/**
 * Decisión de hidratación del dataset legacy (KORE-27). Pura y testeable.
 *
 * Orden: Supabase → Excel de la sesión → Excel persistido localmente (IndexedDB/localStorage).
 * Si nada tiene datos:
 *   - Supabase respondió sin error → "empty" (LEGACY_EMPTY): estado explícito, SIN mock.
 *   - Supabase falló               → "error" (LEGACY_UNAVAILABLE): estado explícito, SIN mock.
 *
 * mock solo existe como fuente explícita (lib/data/sources.ts); nunca es resultado de esta
 * función. Tampoco borra ni limpia nada.
 */

import type { DataMode, DomainSources } from "./sources.ts";

export type LegacyOrigin = "supabase" | "excel-session" | "excel-local";

/** `unauthenticated`: no hay sesión, así que no se pide ni se muestra ningún dataset. */
export type DatasetStatus = "loading" | "ready" | "empty" | "error" | "unauthenticated";

/** Entradas que deciden qué hace la hidratación del dataset (KORE-31). */
export type HydrationPhase = {
  isAuthenticated: boolean;
  configOk: boolean;
  mode: DataMode | null;
};

export type HydrationAction =
  /** Sin sesión: limpiar el estado (nada privado queda visible) y NO pedir datos. */
  | "clear-unauthenticated"
  /** Configuración de fuentes inválida: error explícito, sin datos. */
  | "config-error"
  /** Fuente mock explícita: datos de ejemplo, sin request al servidor. */
  | "mock-ready"
  /** legacy o mixed con sesión: cargar desde el servidor. */
  | "load-from-server";

/**
 * Decide la acción de hidratación. Es pura y determinística: la misma fase da la misma
 * acción, así que usarla como dependencia del efecto no genera loops ni requests repetidas.
 *
 * Sin sesión no se hace ninguna request (evita el 401 previo al login que quedaba pegado)
 * y el estado privado anterior se descarta (logout).
 */
export function resolveHydrationAction(phase: HydrationPhase): HydrationAction {
  if (!phase.isAuthenticated) return "clear-unauthenticated";
  if (!phase.configOk) return "config-error";
  return phase.mode === "mock" ? "mock-ready" : "load-from-server";
}

export type LegacyHydrationInput = {
  supabase: { ok: boolean; hasDataset: boolean; errorMessage?: string | null };
  hasSessionExcel: boolean;
  hasLocalExcel: boolean;
};

export type LegacyHydrationDecision =
  | { status: "ready"; origin: LegacyOrigin }
  | { status: "empty"; reason: "LEGACY_EMPTY" }
  | { status: "error"; reason: "LEGACY_UNAVAILABLE"; errorMessage: string };

export function resolveLegacyHydration(input: LegacyHydrationInput): LegacyHydrationDecision {
  if (input.supabase.ok && input.supabase.hasDataset) return { status: "ready", origin: "supabase" };
  if (input.hasSessionExcel) return { status: "ready", origin: "excel-session" };
  if (input.hasLocalExcel) return { status: "ready", origin: "excel-local" };
  if (!input.supabase.ok) {
    return { status: "error", reason: "LEGACY_UNAVAILABLE", errorMessage: input.supabase.errorMessage || "No se pudo cargar la fuente legacy" };
  }
  return { status: "empty", reason: "LEGACY_EMPTY" };
}

/** Respuesta del loader del servidor, ya parseada (solo lo necesario para decidir). */
export type ServerLoadResponse = {
  httpOk: boolean;
  ok: boolean;
  status: "ready" | "empty" | "error" | null;
  errorCode: string | null;
  hasDataset: boolean;
  provenanceSources: DomainSources | null;
  errorMessage: string | null;
};

export type ServerLoadOutcome =
  /** Aplicar el dataset del servidor. persistSessionCopy solo en legacy puro. */
  | { kind: "apply"; source: "supabase" | "mixed"; persistSessionCopy: boolean }
  /** Estado final explícito: sin copias locales, sin legacy, sin mock. */
  | { kind: "final"; status: "empty" | "error"; code: string; message: string | null }
  /** Solo legacy puro: continuar con la cadena legacy (Excel de sesión / local). */
  | { kind: "continue-legacy"; supabaseOk: boolean; errorMessage: string | null };

/**
 * Decide qué hacer con la respuesta del servidor (KORE-28).
 *
 * - La procedencia del servidor debe coincidir con la configuración del cliente; si no,
 *   error explícito (SOURCE_CONFIG_MISMATCH).
 * - mixed (catálogo KORE): nunca se usan copias Excel locales/sesión (serían catálogo legacy
 *   oculto). Error → error, vacío → empty.
 * - legacy: comportamiento KORE-27 (Supabase → Excel sesión → Excel local → empty/error).
 */
export function resolveServerLoadOutcome(mode: Exclude<DataMode, "mock">, clientSources: DomainSources, response: ServerLoadResponse): ServerLoadOutcome {
  const matches = (sources: DomainSources) =>
    sources.catalog === clientSources.catalog &&
    sources.sales === clientSources.sales &&
    sources.customers === clientSources.customers &&
    sources.applications === clientSources.applications;

  if (response.provenanceSources && !matches(response.provenanceSources)) {
    return { kind: "final", status: "error", code: "SOURCE_CONFIG_MISMATCH", message: "La procedencia informada por el servidor no coincide con la configuración de la app." };
  }

  const success = response.httpOk && response.ok && response.hasDataset && response.status !== "empty" && response.status !== "error";

  if (mode === "mixed") {
    if (!response.provenanceSources) {
      return { kind: "final", status: "error", code: "PROVENANCE_MISSING", message: "El servidor no informó la procedencia del dataset mixto." };
    }
    if (success) return { kind: "apply", source: "mixed", persistSessionCopy: false };
    if (response.ok && response.status === "empty") {
      return { kind: "final", status: "empty", code: response.errorCode ?? "KORE_CATALOG_EMPTY", message: null };
    }
    return { kind: "final", status: "error", code: response.errorCode ?? "LOAD_FAILED", message: response.errorMessage };
  }

  if (success) return { kind: "apply", source: "supabase", persistSessionCopy: true };
  return {
    kind: "continue-legacy",
    supabaseOk: response.httpOk && response.ok,
    errorMessage: response.httpOk && response.ok ? null : response.errorMessage,
  };
}
