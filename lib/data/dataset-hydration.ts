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

export type LegacyOrigin = "supabase" | "excel-session" | "excel-local";

export type DatasetStatus = "loading" | "ready" | "empty" | "error";

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
