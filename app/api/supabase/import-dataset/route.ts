import { NextResponse } from "next/server";
import {
  saveDatasetToSupabaseServer,
  validateDatasetCountsForImport,
} from "@/lib/data/supabase-dataset-server";
import type { PickupDataset } from "@/lib/excel/build-dataset";
import { isValidPickupDataset } from "@/lib/data/excel-dataset-persistence";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

type ImportBody = {
  dataset?: unknown;
  generatedAt?: string;
};

function logApi(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[API ImportDataset] ${message}`, detail);
  } else {
    console.info(`[API ImportDataset] ${message}`);
  }
}

function errorResponse(
  status: number,
  errorMessage: string,
  technicalDetail?: string,
  recommendation?: string,
) {
  return NextResponse.json(
    {
      ok: false,
      errorMessage,
      technicalDetail: technicalDetail ?? errorMessage,
      recommendation:
        recommendation ??
        "Supabase rechazó la inserción. Revisá permisos, columnas o service role.",
      httpStatus: status,
      counts: {
        clientes: 0,
        ventas: 0,
        articulos: 0,
        aplicaciones: 0,
        oportunidades: 0,
      },
      durationMs: 0,
    },
    { status },
  );
}

export async function POST(request: Request) {
  logApi("recibido");

  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    logApi("error", envCheck.message);
    return errorResponse(
      503,
      envCheck.message,
      `Variables faltantes: ${envCheck.missing.join(", ")}`,
      "Agregá NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel → Settings → Environment Variables y redeploy.",
    );
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch (error) {
    logApi("error", error);
    return errorResponse(
      400,
      "Cuerpo JSON inválido",
      error instanceof Error ? error.message : "No se pudo parsear el body",
      "El dataset es demasiado grande o el POST está corrupto. Probá de nuevo.",
    );
  }

  if (!isValidPickupDataset(body.dataset)) {
    logApi("error", "isValidPickupDataset falló");
    return errorResponse(
      400,
      "Dataset inválido o incompleto (estructura)",
      "Faltan arrays requeridos (clientes, ventas, articulos, aplicaciones, etc.).",
      "Generá el dataset interno de nuevo antes de guardar en Supabase.",
    );
  }

  const dataset = body.dataset as PickupDataset;

  const countsCheck = validateDatasetCountsForImport(dataset);
  if (!countsCheck.ok) {
    logApi("error", countsCheck);
    return errorResponse(
      400,
      countsCheck.errorMessage,
      countsCheck.technicalDetail,
      "Generá el dataset desde los 3 Excel y verificá que haya filas válidas en cada archivo.",
    );
  }

  logApi("conteos recibidos", {
    clientes: dataset.clientes.length,
    ventas: dataset.ventas.length,
    ventaItems: dataset.ventaItems.length,
    articulos: dataset.articulos.length,
    aplicaciones: dataset.aplicaciones.length,
  });

  const generatedAt = body.generatedAt ? new Date(body.generatedAt) : new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    return errorResponse(400, "generatedAt inválido");
  }

  try {
    const result = await saveDatasetToSupabaseServer(dataset, generatedAt);

    if (!result.ok) {
      logApi("error", result);
      return NextResponse.json(
        { ...result, httpStatus: 500, ok: false },
        { status: 500 },
      );
    }

    logApi("éxito", result.counts);
    return NextResponse.json({ ...result, httpStatus: 200, ok: true });
  } catch (error) {
    logApi("error", error);
    const message = error instanceof Error ? error.message : "Error interno al importar";
    return errorResponse(
      500,
      message,
      error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      "Supabase rechazó la inserción. Revisá permisos, columnas o service role.",
    );
  }
}
