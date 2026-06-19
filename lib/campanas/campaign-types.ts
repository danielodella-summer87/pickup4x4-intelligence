/**
 * Contrato de datos entre el cliente (pantalla) y las API routes de campañas.
 * Módulo puro: sin React ni Supabase, importable desde ambos lados.
 *
 * Las columnas estructuradas sirven para reportes/SQL; `raw` guarda el objeto
 * original de la pantalla para un roundtrip fiel al reabrir la campaña.
 */

export type CampaignMetaDTO = {
  name: string;
  type: string | null;
  preset: string | null;
  description: string | null;
  objective: string | null;
  status: string;
  filters: unknown | null;
  qualitySummary: unknown | null;
};

export type CampaignItemDTO = {
  inputCode: string | null;
  inputDescription: string | null;
  inputCategory: string | null;
  inputBrandModel: string | null;
  observations: string | null;
  matchedArticleCode: string | null;
  matchedArticleDescription: string | null;
  validationStatus: string | null;
  matchConfidence: string | null;
  source: string | null;
  raw: unknown;
};

export type CampaignResultDTO = {
  customerNumber: string | null;
  customerName: string | null;
  fantasyName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  locality: string | null;
  articleCode: string | null;
  articleDescription: string | null;
  saleDate: string | null;
  saleAgeMonths: number | null;
  invoiceNumber: string | null;
  compatibleVehicle: string | null;
  matchConfidence: string | null;
  suggestedAction: string | null;
  observations: string | null;
  raw: unknown;
};

export type CampaignSummaryDTO = CampaignMetaDTO & {
  id: string;
  createdAt: string;
  updatedAt: string;
  itemsCount: number;
  resultsCount: number;
};

export type CampaignFullDTO = {
  campaign: CampaignSummaryDTO;
  items: CampaignItemDTO[];
  results: CampaignResultDTO[];
};
