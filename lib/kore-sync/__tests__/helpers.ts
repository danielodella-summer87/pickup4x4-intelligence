import { KoreError } from "../../kore/errors.ts";
import { isKoreShadowTable } from "../types.ts";
import type {
  ArticleIdentityStatus,
  ExistingArticleVariant,
  ExistingIdentityConflict,
  ExistingNormalizedArticle,
  ExistingRow,
  IdentityConflictStatus,
  KoreArticulo,
  KoreCatalogSource,
  KoreEntityTable,
  KoreFamilia,
  KoreGrupo,
  KoreSubgrupo,
  LegacyCatalogReader,
  NewSyncRun,
  ShadowRow,
  ShadowStore,
  SyncRunPatch,
  UpsertConflictColumn,
} from "../types.ts";

/**
 * Store en memoria con la misma semántica que Supabase:
 * - upsert por columna de conflicto (source_key; RAW de artículos: source_variant_key);
 * - unique (source_key, content_hash) en kore_raw_articulos;
 * - check de consistencia identity_status en kore_articulos (migración 202609170002);
 * - todas las filas de un upsert con el mismo set de columnas (payload PostgREST uniforme).
 */
export class MemoryShadowStore implements ShadowStore {
  readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly runs = new Map<string, Omit<NewSyncRun, "status"> & Partial<Omit<SyncRunPatch, "status">> & { status: string }>();
  readonly writes: string[] = [];
  failUpsertOn: KoreEntityTable | null = null;
  private seq = 0;

  private table(name: string): Map<string, Record<string, unknown>> {
    if (!isKoreShadowTable(name)) throw new Error(`escritura fuera de tablas kore_*: ${name}`);
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  rows(name: KoreEntityTable): Record<string, unknown>[] {
    return [...this.table(name).values()];
  }

  async createRun(run: NewSyncRun): Promise<string> {
    const id = `run-${++this.seq}`;
    this.writes.push("kore_sync_runs");
    this.runs.set(id, { ...run });
    return id;
  }

  async finishRun(id: string, patch: SyncRunPatch): Promise<void> {
    this.writes.push("kore_sync_runs");
    this.runs.set(id, { ...this.runs.get(id)!, ...patch });
  }

  async loadIndex(name: KoreEntityTable): Promise<Map<string, ExistingRow>> {
    const index = new Map<string, ExistingRow>();
    for (const row of this.table(name).values()) {
      index.set(String(row.source_key), { id: String(row.id), contentHash: row.content_hash === null ? null : String(row.content_hash), firstSeenAt: String(row.first_seen_at) });
    }
    return index;
  }

  async loadArticleVariantIndex(): Promise<Map<string, ExistingArticleVariant>> {
    const index = new Map<string, ExistingArticleVariant>();
    for (const row of this.table("kore_raw_articulos").values()) {
      index.set(String(row.source_variant_key), {
        id: String(row.id),
        sourceKey: String(row.source_key),
        contentHash: String(row.content_hash),
        firstSeenAt: String(row.first_seen_at),
        observedOccurrences: Number(row.observed_occurrences),
      });
    }
    return index;
  }

  async loadArticleIndex(): Promise<Map<string, ExistingNormalizedArticle>> {
    const index = new Map<string, ExistingNormalizedArticle>();
    for (const row of this.table("kore_articulos").values()) {
      index.set(String(row.source_key), {
        id: String(row.id),
        contentHash: row.content_hash === null ? null : String(row.content_hash),
        firstSeenAt: String(row.first_seen_at),
        identityStatus: (row.identity_status ?? "resolved") as ArticleIdentityStatus,
        identityConflictSince: (row.identity_conflict_since ?? null) as string | null,
      });
    }
    return index;
  }

  async loadIdentityConflictIndex(): Promise<Map<string, ExistingIdentityConflict>> {
    const index = new Map<string, ExistingIdentityConflict>();
    for (const row of this.table("kore_article_identity_conflicts").values()) {
      index.set(String(row.source_key), { id: String(row.id), firstSeenAt: String(row.first_seen_at), status: row.status as IdentityConflictStatus });
    }
    return index;
  }

  async upsertRows(name: KoreEntityTable, rows: readonly ShadowRow[], onConflict: UpsertConflictColumn = "source_key"): Promise<Map<string, string>> {
    if (this.failUpsertOn === name) throw new Error("fallo simulado de persistencia");
    this.writes.push(name);
    const columns = rows.length > 0 ? Object.keys(rows[0]).sort().join(",") : "";
    for (const row of rows) {
      if (Object.keys(row).sort().join(",") !== columns) throw new Error(`upsert ${name}: columnas no uniformes`);
      if (name === "kore_articulos") assertArticleIdentityConsistency(row);
    }
    const t = this.table(name);
    const ids = new Map<string, string>();
    for (const row of rows) {
      const conflictValue = String(row[onConflict]);
      const existing = t.get(conflictValue);
      if (name === "kore_raw_articulos") {
        for (const [otherKey, other] of t) {
          if (otherKey !== conflictValue && other.source_key === row.source_key && other.content_hash === row.content_hash) throw new Error("unique (source_key, content_hash) violado");
        }
      }
      const id = existing ? String(existing.id) : `${name}-${++this.seq}`;
      t.set(conflictValue, { ...(existing ?? { created_at: row.updated_at }), ...row, id });
      ids.set(conflictValue, id);
    }
    return ids;
  }

  async markMissing(name: KoreEntityTable, runColumn: "sync_run_id" | "last_sync_run_id", runId: string, at: string): Promise<number> {
    this.writes.push(name);
    let marked = 0;
    for (const row of this.table(name).values()) {
      if (row[runColumn] !== runId && row.missing_since === null) {
        row.missing_since = at;
        marked++;
      }
    }
    return marked;
  }
}

/** Réplica del check kore_articulos_identity_consistency_check. */
function assertArticleIdentityConsistency(row: Record<string, unknown>): void {
  const contentColumns = ["raw_id", "content_hash", "descripcion", "observaciones"];
  if (row.identity_status === "resolved") {
    if (row.identity_conflict_since !== null || contentColumns.some((column) => row[column] === null || row[column] === undefined)) {
      throw new Error("check identity (resolved) violado");
    }
    return;
  }
  if (row.identity_status === "conflict") {
    const mustBeNull = [...contentColumns, "codigo_familia", "codigo_grupo", "codigo_subgrupo", "familia_id", "grupo_id", "subgrupo_id", "basico", "minimo", "exento", "deshabilitado", "controla_stock"];
    if (!row.identity_conflict_since || mustBeNull.some((column) => row[column] !== null)) throw new Error("check identity (conflict) violado");
    return;
  }
  throw new Error("identity_status inválido");
}

export type CatalogData = {
  familias: KoreFamilia[];
  grupos: KoreGrupo[];
  subgrupos: KoreSubgrupo[];
  articulos: KoreArticulo[];
};

/** Fuente KORE falsa: cuenta requests; puede fallar en una operación de taxonomía o en el snapshot. */
export class FakeCatalogSource implements KoreCatalogSource {
  attempts = 0;
  snapshotCalls = 0;
  readonly calls: string[] = [];
  failTaxonomy: "familias" | "grupos" | "subgrupos" | null = null;
  failSnapshot: KoreError | null = null;
  data: CatalogData;

  constructor(data: CatalogData) {
    this.data = data;
  }

  private call<T>(name: string, failure: KoreError | null, value: () => T): Promise<T> {
    this.attempts++;
    this.calls.push(name);
    if (failure) return Promise.reject(failure);
    return Promise.resolve(structuredClone(value()));
  }

  private taxonomyFailure(name: "familias" | "grupos" | "subgrupos"): KoreError | null {
    return this.failTaxonomy === name ? new KoreError({ kind: "timeout", message: "timeout simulado" }) : null;
  }

  listFamilias = () => this.call("ListarFamilias", this.taxonomyFailure("familias"), () => this.data.familias);
  listGrupos = () => this.call("ListarGrupos", this.taxonomyFailure("grupos"), () => this.data.grupos);
  listSubgrupos = () => this.call("ListarSubgrupos", this.taxonomyFailure("subgrupos"), () => this.data.subgrupos);

  listArticulosFullSnapshot = (): Promise<KoreArticulo[]> => {
    this.snapshotCalls++;
    return this.call("ListarArticulos", this.failSnapshot, () => this.data.articulos);
  };

  requestsAttempted = () => this.attempts;
}

export class FakeLegacyReader implements LegacyCatalogReader {
  private readonly codes: string[] | null;
  constructor(codes: string[] | null) {
    this.codes = codes;
  }
  async loadLegacyArticleCodes(): Promise<string[] | null> {
    return this.codes;
  }
}

const pad = (value: string, width: number) => value.padEnd(width);

export function familia(code: string, descripcion = `FAMILIA SINT ${code}`): KoreFamilia {
  return { codigoFamilia: code, codigoFamiliaRaw: pad(code, 6), descripcion, descripcionRaw: pad(descripcion, 30), descuentoMaximo: 0, autonumerado: null };
}

export function grupo(f: string, g: string, descripcion = `GRUPO SINT ${f}-${g}`): KoreGrupo {
  return { codigoFamilia: f, codigoFamiliaRaw: pad(f, 6), codigoGrupo: g, codigoGrupoRaw: pad(g, 6), descripcion, descripcionRaw: pad(descripcion, 30), descuentoMaximo: null, autonumerado: null };
}

export function subgrupo(f: string, g: string, s: string, descripcion = `SUBGRUPO SINT ${f}-${g}-${s}`): KoreSubgrupo {
  return {
    codigoFamilia: f,
    codigoFamiliaRaw: pad(f, 6),
    codigoGrupo: g,
    codigoGrupoRaw: pad(g, 6),
    codigoSubgrupo: s,
    codigoSubgrupoRaw: pad(s, 6),
    descripcion,
    descripcionRaw: pad(descripcion, 30),
    descuentoMaximo: null,
    autonumerado: null,
  };
}

export function articulo(code: string, f: string | null, g: string | null, s: string | null, descripcion = `ARTICULO SINT ${code}`): KoreArticulo {
  return {
    codigoUnico: code,
    codigoUnicoRaw: pad(code, 22),
    codigoFamilia: f,
    codigoFamiliaRaw: f === null ? null : pad(f, 6),
    codigoGrupo: g,
    codigoGrupoRaw: g === null ? null : pad(g, 6),
    codigoSubgrupo: s,
    codigoSubgrupoRaw: s === null ? null : pad(s, 6),
    descripcion,
    basico: 1,
    minimo: 0,
    exento: 0,
    deshabilitado: 0,
    controlaStock: 1,
    observaciones: "",
  };
}

/** Catálogo sintético: 2 familias + blank, 3 grupos (1 huérfano), 3 subgrupos (1 huérfano), 5 artículos. */
export function sampleCatalog(): CatalogData {
  return {
    familias: [familia("F1"), familia("F2"), familia("")],
    grupos: [grupo("F1", "G1"), grupo("F2", "G1"), grupo("FX", "G9")],
    subgrupos: [subgrupo("F1", "G1", "S1"), subgrupo("F2", "G1", "S1"), subgrupo("F1", "GX", "S9")],
    articulos: [
      articulo("SINT-A-1", "F1", "G1", "S1"),
      articulo("SINT-A-2", "F1", "GZ", null),
      articulo("000123", "F1", null, null),
      articulo("SINT-B-1", "F2", "G1", "S1"),
      articulo("SINT-BLANK-1", "", "", ""),
    ],
  };
}

export function clock(start = Date.parse("2099-01-01T00:00:00.000Z")) {
  let t = start;
  return () => new Date((t += 1000)).toISOString();
}
