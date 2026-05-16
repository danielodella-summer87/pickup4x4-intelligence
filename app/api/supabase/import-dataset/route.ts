import { NextResponse } from "next/server";
import { saveDatasetToSupabaseServer } from "@/lib/data/supabase-dataset-server";
import type { PickupDataset } from "@/lib/excel/build-dataset";
import { isValidPickupDataset } from "@/lib/data/excel-dataset-persistence";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";

export const maxDuration = 60;

type ImportBody = {
  dataset?: unknown;
  generatedAt?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        errorMessage:
          "SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL no configurados en Vercel",
      },
      { status: 503 },
    );
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json(
      { ok: false, errorMessage: "Cuerpo JSON inválido" },
      { status: 400 },
    );
  }

  if (!isValidPickupDataset(body.dataset)) {
    return NextResponse.json(
      { ok: false, errorMessage: "Dataset inválido o incompleto" },
      { status: 400 },
    );
  }

  const generatedAt = body.generatedAt ? new Date(body.generatedAt) : new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    return NextResponse.json(
      { ok: false, errorMessage: "generatedAt inválido" },
      { status: 400 },
    );
  }

  const dataset = body.dataset as PickupDataset;

  try {
    const result = await saveDatasetToSupabaseServer(dataset, generatedAt);

    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[SupabaseImport] Error en route", error);
    return NextResponse.json(
      {
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Error interno al importar",
      },
      { status: 500 },
    );
  }
}
