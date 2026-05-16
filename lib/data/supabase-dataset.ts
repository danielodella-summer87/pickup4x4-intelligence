import type { PickupDataset } from "@/lib/excel/build-dataset";
import type { ActivePickupData } from "@/lib/data/pickup-data";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";
import type { SupabaseDatasetSaveResult } from "@/lib/data/supabase-dataset-server";

export type { SupabaseDatasetSaveResult, SupabaseDatasetLoadResult } from "@/lib/data/supabase-dataset-server";

export { slimDatasetForLocalStorage } from "@/lib/data/excel-dataset-persistence";

function logImport(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[SupabaseImport] ${message}`, detail);
  } else {
    console.info(`[SupabaseImport] ${message}`);
  }
}

function logImportError(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.error(`[SupabaseImport] ${message}`, detail);
  } else {
    console.error(`[SupabaseImport] ${message}`);
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

type ImportApiResponse = SupabaseDatasetSaveResult & {
  httpStatus?: number;
};

function recommendationForFailure(
  httpStatus: number,
  errorMessage: string,
): string {
  if (httpStatus === 503) {
    return "Configurá NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local o Vercel y redeploy.";
  }
  if (httpStatus === 400) {
    return "Generá el dataset interno de nuevo y verificá que los 3 Excel tengan datos válidos.";
  }
  const lower = errorMessage.toLowerCase();
  if (lower.includes("permission") || lower.includes("42501") || lower.includes("denied")) {
    return "Supabase rechazó la inserción. Revisá permisos GRANT en las tablas o la service role.";
  }
  if (lower.includes("payload") || lower.includes("too large")) {
    return "El dataset es muy grande para una sola petición. Contactá soporte o reducí el volumen de prueba.";
  }
  return "Supabase rechazó la inserción. Revisá permisos, columnas del esquema o service role.";
}

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
  logImport("GET /api/supabase/load-dataset");

  try {
    const res = await fetch("/api/supabase/load-dataset", {
      method: "GET",
      cache: "no-store",
    });

    const body = (await res.json()) as LoadApiResponse;
    logImport("respuesta load status", res.status);
    logImport("respuesta load body", body);

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
      logImport("Supabase vacío (ok sin dataset)");
      return {
        ok: true,
        dataset: null,
        oportunidades: [],
        generatedAt: null,
      };
    }

    logImport("dataset recibido", {
      clientes: body.dataset.clientes?.length,
      ventas: body.dataset.ventas?.length,
      articulos: body.dataset.articulos?.length,
      aplicaciones: body.dataset.aplicaciones?.length,
    });

    return {
      ok: true,
      dataset: body.dataset,
      oportunidades: body.oportunidades ?? [],
      generatedAt: body.generatedAt ? new Date(body.generatedAt) : null,
      importacionId: body.importacionId,
    };
  } catch (error) {
    logImportError("error load", error);
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
): Promise<SupabaseDatasetSaveResult> {
  const emptyCounts = {
    clientes: 0,
    ventas: 0,
    articulos: 0,
    aplicaciones: 0,
    oportunidades: 0,
  };

  logImport("enviando dataset", {
    clientes: dataset.clientes.length,
    ventas: dataset.ventas.length,
    ventaItems: dataset.ventaItems.length,
    articulos: dataset.articulos.length,
    aplicaciones: dataset.aplicaciones.length,
    generatedAt: generatedAt.toISOString(),
  });

  try {
    const res = await fetch("/api/supabase/import-dataset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset,
        generatedAt: generatedAt.toISOString(),
      }),
    });

    logImport("respuesta status", res.status);

    let body: ImportApiResponse;
    const rawText = await res.text();
    try {
      body = JSON.parse(rawText) as ImportApiResponse;
    } catch (parseError) {
      logImportError("respuesta body no es JSON", rawText.slice(0, 500));
      return {
        ok: false,
        counts: emptyCounts,
        httpStatus: res.status,
        errorMessage: `Respuesta inválida del servidor (HTTP ${res.status})`,
        technicalDetail: rawText.slice(0, 300) || "Body vacío",
        recommendation: recommendationForFailure(res.status, ""),
        durationMs: 0,
      };
    }

    logImport("respuesta body", body);

    const httpStatus = body.httpStatus ?? res.status;

    if (!res.ok || body.ok !== true) {
      const errorMessage =
        body.errorMessage ?? `Error HTTP ${httpStatus} al guardar en Supabase`;
      logImportError("error", { httpStatus, errorMessage, body });
      return {
        ok: false,
        counts: body.counts ?? emptyCounts,
        httpStatus,
        errorMessage,
        technicalDetail: body.technicalDetail ?? errorMessage,
        recommendation:
          body.recommendation ?? recommendationForFailure(httpStatus, errorMessage),
        durationMs: body.durationMs ?? 0,
      };
    }

    const total =
      (body.counts?.clientes ?? 0) +
      (body.counts?.ventas ?? 0) +
      (body.counts?.articulos ?? 0) +
      (body.counts?.aplicaciones ?? 0);

    if (total === 0) {
      logImportError("error", "API respondió ok pero sin filas insertadas");
      return {
        ok: false,
        counts: body.counts ?? emptyCounts,
        httpStatus,
        errorMessage: "La API no reportó filas insertadas",
        technicalDetail: JSON.stringify(body.counts),
        recommendation: recommendationForFailure(500, ""),
        durationMs: body.durationMs ?? 0,
      };
    }

    return {
      ok: true,
      importacionId: body.importacionId,
      counts: body.counts ?? emptyCounts,
      httpStatus,
      durationMs: body.durationMs ?? 0,
    };
  } catch (error) {
    logImportError("error", error);
    const message =
      error instanceof Error ? error.message : "Error de red al guardar en Supabase";
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage: message,
      technicalDetail: error instanceof Error ? error.stack?.slice(0, 400) : undefined,
      recommendation: recommendationForFailure(0, message),
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
