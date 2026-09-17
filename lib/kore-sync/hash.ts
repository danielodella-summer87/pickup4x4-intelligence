import { createHash } from "node:crypto";

/**
 * Hash de contenido determinístico (SHA-256) sobre JSON canónico.
 *
 * - Claves de objetos ordenadas lexicográficamente (el orden de campos no importa).
 * - Solo contenido source de la fila: el llamador NO debe incluir timestamps,
 *   sync_run_id ni metadata variable.
 * - Nunca loguear la entrada.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): Json {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: número no finito");
      return Object.is(value, -0) ? 0 : value;
    case "object": {
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(value as object).sort()) {
        const item = (value as Record<string, unknown>)[key];
        if (item === undefined) throw new TypeError("canonicalJson: undefined no permitido");
        out[key] = canonicalize(item);
      }
      return out;
    }
    default:
      throw new TypeError("canonicalJson: tipo no soportado");
  }
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Clave natural serializada (JSON array de valores normalizados). */
export function sourceKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

/**
 * Identidad de una VARIANTE source (source_key + contenido). No afirma que sea otra entidad.
 * content_hash tiene largo fijo (64 hex), así que la concatenación es inequívoca.
 * Debe coincidir con la migración 202609170002:
 *   encode(sha256(convert_to(content_hash || E'\n' || source_key, 'UTF8')), 'hex')
 */
export function sourceVariantKey(key: string, hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new TypeError("sourceVariantKey: content_hash inválido");
  return createHash("sha256").update(`${hash}\n${key}`, "utf8").digest("hex");
}
