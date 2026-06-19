import { NextResponse } from "next/server";
import { replaceResults } from "@/lib/campanas/campaign-server";
import type { CampaignResultDTO } from "@/lib/campanas/campaign-types";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  const { id } = await params;
  let body: { results?: CampaignResultDTO[] };
  try {
    body = (await request.json()) as { results?: CampaignResultDTO[] };
  } catch {
    return NextResponse.json({ ok: false, errorMessage: "JSON inválido." }, { status: 400 });
  }

  const result = await replaceResults(id, body.results ?? []);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errorMessage: result.errorMessage }, { status: result.status });
  }
  return NextResponse.json({ ok: true, count: result.data.count });
}
