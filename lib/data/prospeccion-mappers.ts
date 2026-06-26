// Mappers DB (snake_case) ↔ modelo (camelCase) del módulo Prospección Empresas.
// Modelo híbrido: columnas base + JSONB para los bloques anidados.

import {
  emptyFleetProfile,
  emptyProviderProfile,
  type CompanyProspect,
  type FleetProfile,
  type ProductOpportunity,
  type ProductOpportunityPotential,
  type ProductOpportunityStatus,
  type ProspectActivity,
  type ProspectContact,
  type ProspectNeed,
  type ProspectOrgType,
  type ProspectPriority,
  type ProspectProposal,
  type ProspectRubro,
  type ProspectSource,
  type ProspectStage,
} from "@/lib/models/prospeccion";
import {
  canonicalProspectKey,
  getProspectTrafficLight,
} from "@/lib/prospeccion/helpers";
import type {
  DbProspeccionEmpresa,
  DbProspeccionNecesidadProducto,
} from "@/lib/supabase/types";

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function obj<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as T)
    : fallback;
}

type ProspectMeta = {
  categoriaSugerida?: string;
  creadoEn?: string;
  actualizadoEn?: string;
  ultimoContacto?: string;
};

export function prospectToDbRow(p: CompanyProspect): DbProspeccionEmpresa {
  const meta: ProspectMeta = {
    categoriaSugerida: p.categoriaSugerida,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
    ultimoContacto: p.ultimoContacto,
  };
  return {
    id: p.id,
    nombre: p.nombre,
    nombre_canonico: canonicalProspectKey(p.nombre),
    rubro: p.rubro,
    subrubro: p.subrubro ?? null,
    tipo_organizacion: p.tipoOrganizacion,
    direccion: p.direccion ?? null,
    departamento: p.departamento ?? null,
    ciudad: p.ciudad ?? null,
    localidad: p.localidad ?? null,
    web: p.web ?? null,
    fuente: p.fuente,
    etapa: p.etapa,
    prioridad: p.prioridad,
    semaforo: getProspectTrafficLight(p),
    es_sugerida: Boolean(p.esSugerida),
    requiere_revision: Boolean(p.revisar),
    flota: p.flota,
    proveedor: p.proveedor,
    necesidades: p.necesidades,
    contactos: p.contactos,
    actividades: p.actividades,
    propuestas: p.propuestas,
    observaciones: p.observaciones ?? null,
    meta,
  };
}

export function dbRowToProspect(row: DbProspeccionEmpresa): CompanyProspect {
  const meta = obj<ProspectMeta>(row.meta, {});
  return {
    id: row.id,
    nombre: row.nombre,
    rubro: (row.rubro ?? "otro") as ProspectRubro,
    subrubro: row.subrubro ?? undefined,
    tipoOrganizacion: (row.tipo_organizacion ?? "privada") as ProspectOrgType,
    direccion: row.direccion ?? undefined,
    localidad: row.localidad ?? undefined,
    ciudad: row.ciudad ?? undefined,
    departamento: row.departamento ?? undefined,
    web: row.web ?? undefined,
    observaciones: row.observaciones ?? undefined,
    fuente: (row.fuente ?? "manual") as ProspectSource,
    esSugerida: row.es_sugerida || undefined,
    categoriaSugerida: meta.categoriaSugerida,
    revisar: row.requiere_revision || undefined,
    etapa: (row.etapa ?? "lead_detectado") as ProspectStage,
    prioridad: (row.prioridad ?? "media") as ProspectPriority,
    contactos: arr<ProspectContact>(row.contactos),
    flota: obj<FleetProfile>(row.flota, emptyFleetProfile()),
    proveedor: obj(row.proveedor, emptyProviderProfile()),
    necesidades: arr<ProspectNeed>(row.necesidades),
    propuestas: arr<ProspectProposal>(row.propuestas),
    actividades: arr<ProspectActivity>(row.actividades),
    creadoEn: meta.creadoEn ?? row.created_at?.slice(0, 10) ?? "",
    actualizadoEn: meta.actualizadoEn ?? row.updated_at?.slice(0, 10) ?? "",
    ultimoContacto: meta.ultimoContacto,
  };
}

export function productOpportunityToDbRow(
  o: ProductOpportunity,
): DbProspeccionNecesidadProducto {
  const empresas = o.empresaSolicitante ? [o.empresaSolicitante] : [];
  return {
    id: o.id,
    producto: o.producto,
    rubro: o.rubro ?? null,
    menciones: o.menciones,
    potencial: o.potencial,
    estado: o.estado,
    empresas,
    observaciones: o.comentario ?? null,
  };
}

export function dbRowToProductOpportunity(
  row: DbProspeccionNecesidadProducto,
): ProductOpportunity {
  const empresas = arr<string>(row.empresas);
  return {
    id: row.id,
    producto: row.producto,
    rubro: (row.rubro ?? undefined) as ProductOpportunity["rubro"],
    empresaSolicitante: empresas[0],
    menciones: typeof row.menciones === "number" ? row.menciones : 1,
    potencial: (row.potencial ?? "medio") as ProductOpportunityPotential,
    comentario: row.observaciones ?? undefined,
    estado: (row.estado ?? "idea") as ProductOpportunityStatus,
  };
}
