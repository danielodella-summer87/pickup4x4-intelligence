/**
 * Loader solo-lectura de la campaña de recambio PERSISTIDA en Supabase.
 * /campanas la consulta vía las API routes existentes (service role): lista campañas, ubica la de
 * preset "recambio" y trae su detalle. No recalcula; sólo lee la campaña ya guardada.
 *
 * Para (re)generar la campaña persistida:
 *   1) node scripts/build-campania.cjs        (computa la base + public/data/recambio.json)
 *   2) node scripts/seed-campania-supabase.cjs (la persiste en Supabase, misma identidad)
 */

export type RecambioItem = {
  prioridad: string;
  cuenta: string;
  razonSocial: string;
  productoActual: string;
  ultimaCompra: string;
  mesesDesdeUltima: number;
  productoSugerido: string;
  recomendacion: string;
  estadoContactabilidad: string;
  vendedor: string;
  zona: string;
  esCandidato: boolean;
  listoParaTrabajar: boolean;
};

export type RecambioResumen = {
  total: number;
  alta: number;
  media: number;
  baja: number;
  noContactar: number;
  listasParaTrabajar: number;
  frenadasPorContacto: number;
};

export type RecambioData = {
  campaignId: string;
  nombre: string;
  generadoEl: string;
  resumen: RecambioResumen;
  items: RecambioItem[];
};

export type RecambioLoadResult =
  | { ok: true; data: RecambioData }
  | { ok: false; missing: boolean; errorMessage: string };

const PRESET = "recambio";

type CampaignSummary = { id: string; name: string; preset: string | null };
type CampaignResult = {
  customerNumber: string | null;
  customerName: string | null;
  articleDescription: string | null;
  saleDate: string | null;
  saleAgeMonths: number | null;
  matchConfidence: string | null;
  suggestedAction: string | null;
  locality: string | null;
  raw: unknown;
};

// Reconstruye un item desde el roundtrip fiel (raw); si faltara, cae a las columnas estructuradas.
function toItem(r: CampaignResult): RecambioItem {
  const raw = (r.raw ?? {}) as Partial<RecambioItem>;
  return {
    prioridad: raw.prioridad ?? r.matchConfidence ?? "",
    cuenta: raw.cuenta ?? r.customerNumber ?? "",
    razonSocial: raw.razonSocial ?? r.customerName ?? "",
    productoActual: raw.productoActual ?? r.articleDescription ?? "",
    ultimaCompra: raw.ultimaCompra ?? r.saleDate ?? "",
    mesesDesdeUltima: raw.mesesDesdeUltima ?? r.saleAgeMonths ?? 0,
    productoSugerido: raw.productoSugerido ?? "",
    recomendacion: raw.recomendacion ?? r.suggestedAction ?? "",
    estadoContactabilidad: raw.estadoContactabilidad ?? "",
    vendedor: raw.vendedor ?? "",
    zona: raw.zona ?? r.locality ?? "",
    esCandidato: raw.esCandidato ?? false,
    listoParaTrabajar: raw.listoParaTrabajar ?? false,
  };
}

const EMPTY_HINT =
  "Todavía no hay campaña de recambio persistida. Generala con: node scripts/build-campania.cjs && node scripts/seed-campania-supabase.cjs";

export async function loadRecambio(): Promise<RecambioLoadResult> {
  try {
    const listRes = await fetch("/api/campaigns", { cache: "no-store" });
    if (!listRes.ok) {
      const body = await listRes.json().catch(() => ({}));
      return { ok: false, missing: false, errorMessage: body.errorMessage ?? `Error ${listRes.status} al listar campañas.` };
    }
    const list = (await listRes.json()) as { campaigns?: CampaignSummary[] };
    const summary = (list.campaigns ?? []).find((c) => c.preset === PRESET);
    if (!summary) {
      return { ok: false, missing: true, errorMessage: EMPTY_HINT };
    }

    const fullRes = await fetch(`/api/campaigns/${summary.id}`, { cache: "no-store" });
    if (!fullRes.ok) {
      const body = await fullRes.json().catch(() => ({}));
      return { ok: false, missing: false, errorMessage: body.errorMessage ?? `Error ${fullRes.status} al abrir la campaña.` };
    }
    const full = (await fullRes.json()) as {
      campaign: { id: string; name: string; qualitySummary?: { generadoEl?: string; resumen?: RecambioResumen } };
      results: CampaignResult[];
    };

    const qs = full.campaign.qualitySummary ?? {};
    if (!qs.resumen) {
      return { ok: false, missing: false, errorMessage: "La campaña persistida no tiene resumen (regenerá con el seed)." };
    }

    return {
      ok: true,
      data: {
        campaignId: full.campaign.id,
        nombre: full.campaign.name,
        generadoEl: qs.generadoEl ?? "",
        resumen: qs.resumen,
        items: (full.results ?? []).map(toItem),
      },
    };
  } catch (error) {
    return {
      ok: false,
      missing: false,
      errorMessage: error instanceof Error ? error.message : "Error de red al leer la campaña.",
    };
  }
}
