// Acceso anon-directo a Supabase para Prospección Empresas (patrón helpdesk/solicitudes).
// CRUD desde el browser con la clave pública; RLS con políticas anon (prototipo interno).
// Todas las funciones devuelven { ok, ... } y nunca lanzan: el contexto las usa
// fire-and-forget y conserva localStorage como cache/fallback.

import {
  dbRowToProductOpportunity,
  dbRowToProspect,
  productOpportunityToDbRow,
  prospectToDbRow,
} from "@/lib/data/prospeccion-mappers";
import type {
  CompanyProspect,
  ProductOpportunity,
  ProspectCatalogItem,
  ProspectCatalogKind,
  ProspectCatalogos,
  ProspectDepartamento,
} from "@/lib/models/prospeccion";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  DbProspeccionCatalogo,
  DbProspeccionDepartamento,
} from "@/lib/supabase/types";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; errorMessage: string };

// Solo estos catálogos tienen tabla en Supabase. "estados_producto" persiste
// localmente (sin tabla), por eso queda fuera de este mapa.
const CATALOG_TABLES: Partial<
  Record<
    ProspectCatalogKind,
    "prospeccion_rubros" | "prospeccion_etapas" | "prospeccion_tipos_actividad"
  >
> = {
  rubros: "prospeccion_rubros",
  etapas: "prospeccion_etapas",
  tipos_actividad: "prospeccion_tipos_actividad",
};

// ───────────────────────────────────────────────── Prospects

export async function loadProspeccionFromSupabase(): Promise<
  | Ok<{ prospects: CompanyProspect[]; productOpportunities: ProductOpportunity[] }>
  | Err
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, errorMessage: "Supabase no configurado" };
  }
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };

  const [empresasRes, oppsRes] = await Promise.all([
    client.from("prospeccion_empresas").select("*").order("nombre", { ascending: true }),
    client.from("prospeccion_necesidades_producto").select("*"),
  ]);

  if (empresasRes.error) {
    return { ok: false, errorMessage: empresasRes.error.message };
  }

  const prospects = (empresasRes.data ?? []).map(dbRowToProspect);
  const productOpportunities = (oppsRes.data ?? []).map(dbRowToProductOpportunity);
  return { ok: true, prospects, productOpportunities };
}

export async function upsertProspectoInSupabase(
  prospect: CompanyProspect,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };
  const { error } = await client
    .from("prospeccion_empresas")
    .upsert(prospectToDbRow(prospect), { onConflict: "id" });
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

export async function deleteProspectoFromSupabase(
  id: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };
  const { error } = await client.from("prospeccion_empresas").delete().eq("id", id);
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

// ───────────────────────────────────── Oportunidades de producto

export async function upsertNecesidadProductoInSupabase(
  opp: ProductOpportunity,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };
  const { error } = await client
    .from("prospeccion_necesidades_producto")
    .upsert(productOpportunityToDbRow(opp), { onConflict: "id" });
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

export async function deleteNecesidadProductoFromSupabase(
  id: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };
  const { error } = await client
    .from("prospeccion_necesidades_producto")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

// ───────────────────────────────────────────────── Catálogos

function dbToCatalogItem(row: DbProspeccionCatalogo): ProspectCatalogItem {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion ?? undefined,
    orden: row.orden,
    activo: row.activo,
  };
}

export async function loadCatalogosFromSupabase(): Promise<
  Ok<{ catalogos: ProspectCatalogos }> | Err
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, errorMessage: "Supabase no configurado" };
  }
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };

  const [rubros, etapas, tipos, deptos] = await Promise.all([
    client.from("prospeccion_rubros").select("*").order("orden", { ascending: true }),
    client.from("prospeccion_etapas").select("*").order("orden", { ascending: true }),
    client.from("prospeccion_tipos_actividad").select("*").order("orden", { ascending: true }),
    client.from("prospeccion_departamentos").select("*").order("orden", { ascending: true }),
  ]);

  if (rubros.error && etapas.error && tipos.error && deptos.error) {
    return { ok: false, errorMessage: rubros.error.message };
  }

  const catalogos: ProspectCatalogos = {
    rubros: (rubros.data ?? []).map(dbToCatalogItem),
    etapas: (etapas.data ?? []).map(dbToCatalogItem),
    tiposActividad: (tipos.data ?? []).map(dbToCatalogItem),
    // Estados de producto no tienen tabla; se resuelven en el contexto (local).
    estadosProducto: [],
    departamentos: (deptos.data ?? []).map(
      (d: DbProspeccionDepartamento): ProspectDepartamento => ({
        id: d.id,
        nombre: d.nombre,
        orden: d.orden,
        activo: d.activo,
      }),
    ),
  };
  return { ok: true, catalogos };
}

export async function upsertCatalogoItemInSupabase(
  kind: ProspectCatalogKind,
  item: ProspectCatalogItem,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const table = CATALOG_TABLES[kind];
  if (!table) {
    // estados_producto no tiene tabla; persiste localmente desde el contexto.
    return { ok: false, errorMessage: "Catálogo sin tabla remota" };
  }
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };
  const row: DbProspeccionCatalogo = {
    id: item.id,
    nombre: item.nombre,
    descripcion: item.descripcion ?? null,
    orden: item.orden,
    activo: item.activo,
    meta: {},
  };
  const { error } = await client.from(table).upsert(row, { onConflict: "id" });
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}
