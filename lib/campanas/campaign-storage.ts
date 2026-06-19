/**
 * Cliente de persistencia de campañas (browser): fetch a las API routes +
 * mapeo entre los tipos de la pantalla y los DTO de la API.
 *
 * El roundtrip fiel se logra guardando el objeto original de la pantalla en
 * `raw`; al reabrir se reconstruye desde ahí. Las columnas estructuradas quedan
 * disponibles para reportes/SQL.
 */
import type {
  CampaignArticuloInput,
  CampaignArticuloValidado,
  CampaignFiltros,
  CampaignMeta,
  ClienteCandidato,
} from "@/lib/campanas/articulos-campaign";
import { isVentaFechaConfiable } from "@/lib/models/venta-fecha";
import type {
  CampaignFullDTO,
  CampaignItemDTO,
  CampaignMetaDTO,
  CampaignResultDTO,
  CampaignSummaryDTO,
} from "@/lib/campanas/campaign-types";

// --- Mapeos pantalla → DTO ----------------------------------------------------

function sourceFromId(id: string): string {
  if (id.startsWith("manual-")) return "manual";
  if (id.startsWith("cat-")) return "catalogo";
  if (id.startsWith("art-")) return "excel";
  return "guardado";
}

export function metaToDTO(
  meta: CampaignMeta,
  options: {
    preset: string | null;
    filtros: CampaignFiltros;
    qualitySummary: unknown | null;
    status?: string;
  },
): CampaignMetaDTO {
  return {
    name: meta.nombre.trim() || "Campaña sin nombre",
    type: meta.tipo,
    preset: options.preset,
    description: meta.descripcion.trim() || null,
    objective: meta.descripcion.trim() || null,
    status: options.status ?? "draft",
    filters: options.filtros,
    qualitySummary: options.qualitySummary ?? null,
  };
}

export function validadoToItemDTO(v: CampaignArticuloValidado): CampaignItemDTO {
  const brandModel = [v.marca, v.modelo].filter(Boolean).join(" ").trim();
  const matchConfidence =
    v.estado === "validado_codigo"
      ? "Alta"
      : v.estado === "validado_descripcion"
        ? "Media"
        : null;
  return {
    inputCode: v.codigo.trim() || null,
    inputDescription: v.descripcion.trim() || null,
    inputCategory: v.categoria.trim() || null,
    inputBrandModel: brandModel || null,
    observations: v.observaciones.trim() || null,
    matchedArticleCode: v.codigoCatalogo ?? null,
    matchedArticleDescription: v.descripcionCatalogo ?? null,
    validationStatus: v.estado,
    matchConfidence,
    source: sourceFromId(v.id),
    raw: {
      codigo: v.codigo,
      descripcion: v.descripcion,
      categoria: v.categoria,
      marca: v.marca,
      modelo: v.modelo,
      observaciones: v.observaciones,
      codigoTapa: v.codigoTapa ?? "",
    },
  };
}

export function candidatoToResultDTO(c: ClienteCandidato): CampaignResultDTO {
  return {
    customerNumber: c.numeroCuenta,
    customerName: c.cliente,
    fantasyName: c.cliente !== c.razonSocial ? c.cliente : null,
    email: c.email,
    phone: c.telefono,
    whatsapp: null,
    locality: c.localidad,
    articleCode: c.codigoArticulo,
    articleDescription: c.articuloComprado,
    saleDate: isVentaFechaConfiable(c.fechaCompra) ? c.fechaCompra : null,
    saleAgeMonths: c.antiguedadMeses,
    invoiceNumber: c.comprobante,
    compatibleVehicle: c.vehiculos.length > 0 ? c.vehiculos.join(" | ") : null,
    matchConfidence: c.confianzaMatch,
    suggestedAction: c.accionSugerida,
    observations: c.observaciones.join("; ") || null,
    raw: c,
  };
}

// --- Mapeos DTO → pantalla ----------------------------------------------------

type ItemRaw = Partial<Omit<CampaignArticuloInput, "id">>;

export function itemDTOToInput(dto: CampaignItemDTO, index: number): CampaignArticuloInput {
  const raw = (dto.raw ?? {}) as ItemRaw;
  return {
    id: `saved-${index}`,
    codigo: raw.codigo ?? dto.inputCode ?? "",
    descripcion: raw.descripcion ?? dto.inputDescription ?? "",
    categoria: raw.categoria ?? dto.inputCategory ?? "",
    marca: raw.marca ?? "",
    modelo: raw.modelo ?? "",
    observaciones: raw.observaciones ?? dto.observations ?? "",
    codigoTapa: raw.codigoTapa ?? "",
  };
}

export function resultDTOToCandidato(dto: CampaignResultDTO): ClienteCandidato {
  if (dto.raw && typeof dto.raw === "object") {
    return dto.raw as ClienteCandidato;
  }
  // Reconstrucción mínima desde columnas estructuradas (si faltara raw).
  const confianza = dto.matchConfidence === "Alta" ? "Alta" : "Media";
  return {
    numeroCuenta: dto.customerNumber ?? "",
    cliente: dto.customerName ?? dto.customerNumber ?? "",
    razonSocial: dto.customerName ?? dto.customerNumber ?? "",
    email: dto.email,
    telefono: dto.phone,
    localidad: dto.locality,
    vendedor: null,
    articuloComprado: dto.articleDescription ?? "",
    codigoArticulo: dto.articleCode ?? "",
    fechaCompra: dto.saleDate ?? "sin-fecha",
    fechaCompraDisplay: dto.saleDate ?? "Sin fecha",
    fechaConfiable: Boolean(dto.saleDate),
    antiguedadMeses: dto.saleAgeMonths,
    comprobante: dto.invoiceNumber,
    vehiculos: dto.compatibleVehicle ? dto.compatibleVehicle.split(" | ") : [],
    vehiculoIdentificado: Boolean(dto.compatibleVehicle),
    confianzaMatch: confianza,
    comprasTotales: 1,
    articulosDistintos: 1,
    multiplesCompras: false,
    accionSugerida: dto.suggestedAction ?? "",
    observaciones: dto.observations ? dto.observations.split("; ") : [],
  };
}

// --- Fetch helpers ------------------------------------------------------------

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; errorMessage: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errorMessage?: string };
    return body.errorMessage ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export async function apiListCampaigns(): Promise<ApiResult<CampaignSummaryDTO[]>> {
  try {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as { campaigns: CampaignSummaryDTO[] };
    return { ok: true, data: body.campaigns };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}

export async function apiGetCampaign(id: string): Promise<ApiResult<CampaignFullDTO>> {
  try {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as CampaignFullDTO & { ok: boolean };
    return { ok: true, data: { campaign: body.campaign, items: body.items, results: body.results } };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}

export async function apiCreateCampaign(
  meta: CampaignMetaDTO,
): Promise<ApiResult<CampaignSummaryDTO>> {
  try {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as { campaign: CampaignSummaryDTO };
    return { ok: true, data: body.campaign };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}

export async function apiUpdateCampaign(
  id: string,
  meta: CampaignMetaDTO,
): Promise<ApiResult<CampaignSummaryDTO>> {
  try {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as { campaign: CampaignSummaryDTO };
    return { ok: true, data: body.campaign };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}

export async function apiSaveItems(
  id: string,
  items: CampaignItemDTO[],
): Promise<ApiResult<{ count: number }>> {
  try {
    const res = await fetch(`/api/campaigns/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as { count: number };
    return { ok: true, data: { count: body.count } };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}

export async function apiSaveResults(
  id: string,
  results: CampaignResultDTO[],
): Promise<ApiResult<{ count: number }>> {
  try {
    const res = await fetch(`/api/campaigns/${id}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    if (!res.ok) return { ok: false, errorMessage: await readError(res) };
    const body = (await res.json()) as { count: number };
    return { ok: true, data: { count: body.count } };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Error de red." };
  }
}
