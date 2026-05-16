import type { PickupDataset } from "@/lib/excel/build-dataset";
import type { ActivePickupData } from "@/lib/data/pickup-data";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";

export type {
  SupabaseDatasetSaveResult,
  SupabaseDatasetLoadResult,
} from "@/lib/data/supabase-dataset-server";

export { slimDatasetForLocalStorage } from "@/lib/data/excel-dataset-persistence";

function logLoad(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[SupabaseLoad] ${message}`, detail);
    } else {
      console.info(`[SupabaseLoad] ${message}`);
    }
  }
}

type LoadApiResponse = {
  ok: boolean;
  dataset: PickupDataset | null;
  activeData: ActivePickupData | null;
  oportunidades: OportunidadDetectada[];
  generatedAt: string | null;
  importacionId?: string;
  errorMessage?: string;
};

type ImportApiResponse = {
  ok: boolean;
  importacionId?: string;
  counts?: {
    clientes: number;
    ventas: number;
    articulos: number;
    aplicaciones: number;
    oportunidades: number;
  };
  errorMessage?: string;
  durationMs?: number;
};

/**
 * Carga el dataset desde la API server-side (service role).
 */
export async function loadDatasetFromSupabase(): Promise<{
  ok: boolean;
  dataset: PickupDataset | null;
  oportunidades: OportunidadDetectada[];
  generatedAt: Date | null;
  importacionId?: string;
  errorMessage?: string;
}> {
  logLoad("Solicitando GET /api/supabase/load-dataset");

  try {
    const res = await fetch("/api/supabase/load-dataset", {
      method: "GET",
      cache: "no-store",
    });

    const body = (await res.json()) as LoadApiResponse;

    if (!res.ok || !body.ok) {
      return {
        ok: false,
        dataset: null,
        oportunidades: [],
        generatedAt: null,
        errorMessage: body.errorMessage ?? `HTTP ${res.status}`,
      };
    }

    if (!body.dataset) {
      logLoad("Supabase vacío");
      return {
        ok: true,
        dataset: null,
        oportunidades: [],
        generatedAt: null,
      };
    }

    return {
      ok: true,
      dataset: body.dataset,
      oportunidades: body.oportunidades ?? [],
      generatedAt: body.generatedAt ? new Date(body.generatedAt) : null,
      importacionId: body.importacionId,
    };
  } catch (error) {
    return {
      ok: false,
      dataset: null,
      oportunidades: [],
      generatedAt: null,
      errorMessage: error instanceof Error ? error.message : "Error de red al cargar Supabase",
    };
  }
}

/**
 * Guarda el dataset vía API server-side (service role, chunks).
 */
export async function saveDatasetToSupabase(
  dataset: PickupDataset,
  generatedAt: Date,
): Promise<import("@/lib/data/supabase-dataset-server").SupabaseDatasetSaveResult> {
  const emptyCounts = {
    clientes: 0,
    ventas: 0,
    articulos: 0,
    aplicaciones: 0,
    oportunidades: 0,
  };

  try {
    const res = await fetch("/api/supabase/import-dataset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset,
        generatedAt: generatedAt.toISOString(),
      }),
    });

    const body = (await res.json()) as ImportApiResponse;

    if (!res.ok || !body.ok) {
      return {
        ok: false,
        counts: body.counts ?? emptyCounts,
        errorMessage: body.errorMessage ?? `HTTP ${res.status}`,
        durationMs: body.durationMs ?? 0,
      };
    }

    return {
      ok: true,
      importacionId: body.importacionId,
      counts: body.counts ?? emptyCounts,
      durationMs: body.durationMs ?? 0,
    };
  } catch (error) {
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage:
        error instanceof Error ? error.message : "Error de red al guardar en Supabase",
      durationMs: 0,
    };
  }
}

export async function clearSupabaseDataset(): Promise<{
  ok: boolean;
  errorMessage?: string;
}> {
  try {
    const res = await fetch("/api/supabase/clear-dataset", { method: "POST" });
    const body = (await res.json()) as { ok: boolean; errorMessage?: string };
    return { ok: body.ok, errorMessage: body.errorMessage };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Error al limpiar Supabase",
    };
  }
}
