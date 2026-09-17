import { contentHash, sourceKey } from "./hash.ts";
import type { KoreArticulo, KoreFamilia, KoreGrupo, KoreSubgrupo, ShadowRow } from "./types.ts";

/**
 * Proyecciones source → filas shadow.
 *
 * RAW: todos los campos del modelo lib/kore (raw + normalizado), sin transformar.
 * NORMALIZED: trim, relaciones materializadas por código; sin inferencias
 * comerciales ni columnas de otros dominios (marca/modelo, stock, precio, imagen…).
 *
 * El content_hash se calcula SOLO sobre el contenido source de cada capa.
 */

export type EntityRows = {
  key: string;
  rawContent: Record<string, unknown>;
  normalizedContent: Record<string, unknown>;
};

export function familiaEntity(item: KoreFamilia): EntityRows {
  return {
    key: sourceKey([item.codigoFamilia]),
    rawContent: {
      codigo_familia: item.codigoFamilia,
      codigo_familia_raw: item.codigoFamiliaRaw,
      descripcion: item.descripcion,
      descripcion_raw: item.descripcionRaw,
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
    normalizedContent: {
      codigo_familia: item.codigoFamilia,
      descripcion: item.descripcion.trim(),
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
  };
}

export function grupoEntity(item: KoreGrupo): EntityRows {
  return {
    key: sourceKey([item.codigoFamilia, item.codigoGrupo]),
    rawContent: {
      codigo_familia: item.codigoFamilia,
      codigo_familia_raw: item.codigoFamiliaRaw,
      codigo_grupo: item.codigoGrupo,
      codigo_grupo_raw: item.codigoGrupoRaw,
      descripcion: item.descripcion,
      descripcion_raw: item.descripcionRaw,
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
    normalizedContent: {
      codigo_familia: item.codigoFamilia,
      codigo_grupo: item.codigoGrupo,
      descripcion: item.descripcion.trim(),
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
  };
}

export function subgrupoEntity(item: KoreSubgrupo): EntityRows {
  return {
    key: sourceKey([item.codigoFamilia, item.codigoGrupo, item.codigoSubgrupo]),
    rawContent: {
      codigo_familia: item.codigoFamilia,
      codigo_familia_raw: item.codigoFamiliaRaw,
      codigo_grupo: item.codigoGrupo,
      codigo_grupo_raw: item.codigoGrupoRaw,
      codigo_subgrupo: item.codigoSubgrupo,
      codigo_subgrupo_raw: item.codigoSubgrupoRaw,
      descripcion: item.descripcion,
      descripcion_raw: item.descripcionRaw,
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
    normalizedContent: {
      codigo_familia: item.codigoFamilia,
      codigo_grupo: item.codigoGrupo,
      codigo_subgrupo: item.codigoSubgrupo,
      descripcion: item.descripcion.trim(),
      descuento_maximo: item.descuentoMaximo,
      autonumerado: item.autonumerado,
    },
  };
}

export function articuloEntity(item: KoreArticulo): EntityRows {
  return {
    key: sourceKey([item.codigoUnico]),
    rawContent: {
      codigo_unico: item.codigoUnico,
      codigo_unico_raw: item.codigoUnicoRaw,
      codigo_familia: item.codigoFamilia,
      codigo_familia_raw: item.codigoFamiliaRaw,
      codigo_grupo: item.codigoGrupo,
      codigo_grupo_raw: item.codigoGrupoRaw,
      codigo_subgrupo: item.codigoSubgrupo,
      codigo_subgrupo_raw: item.codigoSubgrupoRaw,
      descripcion: item.descripcion,
      basico: item.basico,
      minimo: item.minimo,
      exento: item.exento,
      deshabilitado: item.deshabilitado,
      controla_stock: item.controlaStock,
      observaciones: item.observaciones,
    },
    normalizedContent: {
      codigo_unico: item.codigoUnico,
      codigo_familia: item.codigoFamilia,
      codigo_grupo: item.codigoGrupo,
      codigo_subgrupo: item.codigoSubgrupo,
      descripcion: item.descripcion.trim(),
      observaciones: item.observaciones.trim(),
      basico: item.basico,
      minimo: item.minimo,
      exento: item.exento,
      deshabilitado: item.deshabilitado,
      controla_stock: item.controlaStock,
    },
  };
}

export type Traceability = {
  runId: string;
  now: string;
  existing: { id: string; contentHash: string | null; firstSeenAt: string } | undefined;
};

export type RowOutcome = "created" | "updated" | "unchanged";

export function outcomeFor(existingHash: string | null | undefined, hash: string): RowOutcome {
  if (existingHash === undefined) return "created";
  return existingHash === hash ? "unchanged" : "updated";
}

/** Fila RAW con trazabilidad. first_seen_at se preserva; missing_since se limpia al observar. */
export function rawRow(content: Record<string, unknown>, key: string, trace: Traceability, extra: Record<string, unknown> = {}): { row: ShadowRow; hash: string; outcome: RowOutcome } {
  const hash = contentHash(content);
  return {
    hash,
    outcome: outcomeFor(trace.existing?.contentHash, hash),
    row: {
      ...content,
      ...extra,
      source_key: key,
      content_hash: hash,
      sync_run_id: trace.runId,
      first_seen_at: trace.existing?.firstSeenAt ?? trace.now,
      last_seen_at: trace.now,
      missing_since: null,
      updated_at: trace.now,
    },
  };
}

/** Fila NORMALIZED con referencia al RAW actual y relaciones materializadas. */
export function normalizedRow(
  content: Record<string, unknown>,
  key: string,
  rawId: string,
  trace: Traceability,
  relations: Record<string, string | null> = {},
): { row: ShadowRow; hash: string; outcome: RowOutcome } {
  // Las relaciones por id no entran al hash (son locales a Supabase); los códigos sí.
  const hash = contentHash(content);
  return {
    hash,
    outcome: outcomeFor(trace.existing?.contentHash, hash),
    row: {
      ...content,
      ...relations,
      source_key: key,
      content_hash: hash,
      raw_id: rawId,
      last_sync_run_id: trace.runId,
      first_seen_at: trace.existing?.firstSeenAt ?? trace.now,
      last_seen_at: trace.now,
      missing_since: null,
      updated_at: trace.now,
    },
  };
}
