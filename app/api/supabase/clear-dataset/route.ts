import { NextResponse } from "next/server";
import { clearSupabaseDatasetServer } from "@/lib/data/supabase-dataset-server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";

export async function POST() {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, errorMessage: "Supabase service role no configurado" },
      { status: 503 },
    );
  }

  const result = await clearSupabaseDatasetServer();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
