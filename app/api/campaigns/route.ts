import { NextResponse } from "next/server";
import { createCampaign, listCampaigns } from "@/lib/campanas/campaign-server";
import type { CampaignMetaDTO } from "@/lib/campanas/campaign-types";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

export async function GET() {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  const result = await listCampaigns();
  if (!result.ok) {
    return NextResponse.json({ ok: false, errorMessage: result.errorMessage }, { status: result.status });
  }
  return NextResponse.json({ ok: true, campaigns: result.data });
}

export async function POST(request: Request) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  let meta: CampaignMetaDTO;
  try {
    meta = (await request.json()) as CampaignMetaDTO;
  } catch {
    return NextResponse.json({ ok: false, errorMessage: "JSON inválido." }, { status: 400 });
  }

  const result = await createCampaign(meta);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errorMessage: result.errorMessage }, { status: result.status });
  }
  return NextResponse.json({ ok: true, campaign: result.data });
}
