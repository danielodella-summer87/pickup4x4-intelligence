/**
 * Acceso a campañas comerciales en Supabase (service role).
 * Solo se importa desde Route Handlers (app/api/campaigns/*).
 */
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  DbCommercialCampaign,
  DbCommercialCampaignItem,
  DbCommercialCampaignResult,
} from "@/lib/supabase/types";
import type {
  CampaignFullDTO,
  CampaignItemDTO,
  CampaignMetaDTO,
  CampaignResultDTO,
  CampaignSummaryDTO,
} from "@/lib/campanas/campaign-types";

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errorMessage: string };

function fail(status: number, errorMessage: string): { ok: false; status: number; errorMessage: string } {
  return { ok: false, status, errorMessage };
}

function friendly(message: string): string {
  if (/relation .* does not exist/i.test(message) || /could not find the table/i.test(message)) {
    return "Las tablas de campañas no existen en Supabase. Ejecutá la migración 202606170001_create_commercial_campaigns.sql.";
  }
  return message;
}

// --- Mapeos DB → DTO ----------------------------------------------------------

function campaignRowToSummary(
  row: DbCommercialCampaign,
  itemsCount: number,
  resultsCount: number,
): CampaignSummaryDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    preset: row.preset,
    description: row.description,
    objective: row.objective,
    status: row.status,
    filters: row.filters_json ?? null,
    qualitySummary: row.quality_summary_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemsCount,
    resultsCount,
  };
}

function itemRowToDTO(row: DbCommercialCampaignItem): CampaignItemDTO {
  return {
    inputCode: row.input_code,
    inputDescription: row.input_description,
    inputCategory: row.input_category,
    inputBrandModel: row.input_brand_model,
    observations: row.observations,
    matchedArticleCode: row.matched_article_code,
    matchedArticleDescription: row.matched_article_description,
    validationStatus: row.validation_status,
    matchConfidence: row.match_confidence,
    source: row.source,
    raw: row.raw_json ?? null,
  };
}

function resultRowToDTO(row: DbCommercialCampaignResult): CampaignResultDTO {
  return {
    customerNumber: row.customer_number,
    customerName: row.customer_name,
    fantasyName: row.fantasy_name,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    locality: row.locality,
    articleCode: row.article_code,
    articleDescription: row.article_description,
    saleDate: row.sale_date,
    saleAgeMonths: row.sale_age_months,
    invoiceNumber: row.invoice_number,
    compatibleVehicle: row.compatible_vehicle,
    matchConfidence: row.match_confidence,
    suggestedAction: row.suggested_action,
    observations: row.observations,
    raw: row.raw_json ?? null,
  };
}

// --- Mapeos DTO → DB insert ---------------------------------------------------

function metaToCampaignInsert(meta: CampaignMetaDTO) {
  return {
    name: meta.name,
    type: meta.type,
    preset: meta.preset,
    description: meta.description,
    objective: meta.objective,
    status: meta.status,
    filters_json: (meta.filters ?? null) as DbCommercialCampaign["filters_json"],
    quality_summary_json: (meta.qualitySummary ?? null) as DbCommercialCampaign["quality_summary_json"],
  };
}

function itemDtoToInsert(campaignId: string, dto: CampaignItemDTO) {
  return {
    campaign_id: campaignId,
    input_code: dto.inputCode,
    input_description: dto.inputDescription,
    input_category: dto.inputCategory,
    input_brand_model: dto.inputBrandModel,
    observations: dto.observations,
    matched_article_code: dto.matchedArticleCode,
    matched_article_description: dto.matchedArticleDescription,
    validation_status: dto.validationStatus,
    match_confidence: dto.matchConfidence,
    source: dto.source,
    raw_json: (dto.raw ?? null) as DbCommercialCampaignItem["raw_json"],
  };
}

function resultDtoToInsert(campaignId: string, dto: CampaignResultDTO) {
  return {
    campaign_id: campaignId,
    customer_number: dto.customerNumber,
    customer_name: dto.customerName,
    fantasy_name: dto.fantasyName,
    email: dto.email,
    phone: dto.phone,
    whatsapp: dto.whatsapp,
    locality: dto.locality,
    article_code: dto.articleCode,
    article_description: dto.articleDescription,
    sale_date: dto.saleDate,
    sale_age_months: dto.saleAgeMonths,
    invoice_number: dto.invoiceNumber,
    compatible_vehicle: dto.compatibleVehicle,
    match_confidence: dto.matchConfidence,
    suggested_action: dto.suggestedAction,
    observations: dto.observations,
    raw_json: (dto.raw ?? null) as DbCommercialCampaignResult["raw_json"],
  };
}

// --- Operaciones --------------------------------------------------------------

export async function listCampaigns(): Promise<ServerResult<CampaignSummaryDTO[]>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");

  const { data: campaigns, error } = await supabase
    .from("commercial_campaigns")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return fail(500, friendly(error.message));

  const [{ data: items }, { data: results }] = await Promise.all([
    supabase.from("commercial_campaign_items").select("campaign_id"),
    supabase.from("commercial_campaign_results").select("campaign_id"),
  ]);

  const itemsCount = new Map<string, number>();
  for (const row of items ?? []) {
    itemsCount.set(row.campaign_id, (itemsCount.get(row.campaign_id) ?? 0) + 1);
  }
  const resultsCount = new Map<string, number>();
  for (const row of results ?? []) {
    resultsCount.set(row.campaign_id, (resultsCount.get(row.campaign_id) ?? 0) + 1);
  }

  return {
    ok: true,
    data: (campaigns ?? []).map((c) =>
      campaignRowToSummary(c, itemsCount.get(c.id) ?? 0, resultsCount.get(c.id) ?? 0),
    ),
  };
}

export async function getCampaign(id: string): Promise<ServerResult<CampaignFullDTO>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");

  const { data: campaign, error } = await supabase
    .from("commercial_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, friendly(error.message));
  if (!campaign) return fail(404, "Campaña no encontrada.");

  const [{ data: items, error: itemsError }, { data: results, error: resultsError }] =
    await Promise.all([
      supabase
        .from("commercial_campaign_items")
        .select("*")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("commercial_campaign_results")
        .select("*")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
    ]);
  if (itemsError) return fail(500, friendly(itemsError.message));
  if (resultsError) return fail(500, friendly(resultsError.message));

  const itemDtos = (items ?? []).map(itemRowToDTO);
  const resultDtos = (results ?? []).map(resultRowToDTO);

  return {
    ok: true,
    data: {
      campaign: campaignRowToSummary(campaign, itemDtos.length, resultDtos.length),
      items: itemDtos,
      results: resultDtos,
    },
  };
}

export async function createCampaign(
  meta: CampaignMetaDTO,
): Promise<ServerResult<CampaignSummaryDTO>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");
  if (!meta.name?.trim()) return fail(400, "La campaña necesita un nombre.");

  const { data, error } = await supabase
    .from("commercial_campaigns")
    .insert(metaToCampaignInsert(meta))
    .select("*")
    .single();
  if (error || !data) return fail(500, friendly(error?.message ?? "No se pudo crear la campaña."));

  return { ok: true, data: campaignRowToSummary(data, 0, 0) };
}

export async function updateCampaign(
  id: string,
  meta: CampaignMetaDTO,
): Promise<ServerResult<CampaignSummaryDTO>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");

  const { data, error } = await supabase
    .from("commercial_campaigns")
    .update(metaToCampaignInsert(meta))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return fail(500, friendly(error.message));
  if (!data) return fail(404, "Campaña no encontrada.");

  return { ok: true, data: campaignRowToSummary(data, 0, 0) };
}

export async function replaceItems(
  id: string,
  items: CampaignItemDTO[],
): Promise<ServerResult<{ count: number }>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");

  const { error: deleteError } = await supabase
    .from("commercial_campaign_items")
    .delete()
    .eq("campaign_id", id);
  if (deleteError) return fail(500, friendly(deleteError.message));

  if (items.length > 0) {
    const { error: insertError } = await supabase
      .from("commercial_campaign_items")
      .insert(items.map((dto) => itemDtoToInsert(id, dto)));
    if (insertError) return fail(500, friendly(insertError.message));
  }

  return { ok: true, data: { count: items.length } };
}

export async function replaceResults(
  id: string,
  results: CampaignResultDTO[],
): Promise<ServerResult<{ count: number }>> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return fail(503, "Supabase no está configurado (service role).");

  const { error: deleteError } = await supabase
    .from("commercial_campaign_results")
    .delete()
    .eq("campaign_id", id);
  if (deleteError) return fail(500, friendly(deleteError.message));

  if (results.length > 0) {
    const { error: insertError } = await supabase
      .from("commercial_campaign_results")
      .insert(results.map((dto) => resultDtoToInsert(id, dto)));
    if (insertError) return fail(500, friendly(insertError.message));
  }

  return { ok: true, data: { count: results.length } };
}
