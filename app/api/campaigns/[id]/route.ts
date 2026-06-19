import { NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/lib/campanas/campaign-server";
import type { CampaignMetaDTO } from "@/lib/campanas/campaign-types";
import { validateSupabaseServiceEnv } from "@/lib/supabase/validate-service-env";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  const { id } = await params;
  const result = await getCampaign(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errorMessage: result.errorMessage }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}

export async function PATCH(request: Request, { params }: Context) {
  const envCheck = validateSupabaseServiceEnv();
  if (!envCheck.ok) {
    return NextResponse.json({ ok: false, errorMessage: envCheck.message }, { status: 503 });
  }

  const { id } = await params;
  let meta: CampaignMetaDTO;
  try {
    meta = (await request.json()) as CampaignMetaDTO;
  } catch {
    return NextResponse.json({ ok: false, errorMessage: "JSON inválido." }, { status: 400 });
  }

  const result = await updateCampaign(id, meta);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errorMessage: result.errorMessage }, { status: result.status });
  }
  return NextResponse.json({ ok: true, campaign: result.data });
}
