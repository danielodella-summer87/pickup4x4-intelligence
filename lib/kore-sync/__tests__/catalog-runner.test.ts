import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KoreError } from "../../kore/errors.ts";
import { KORE_ARTICULO_FIELDS } from "../../kore/articulos.ts";
import {
  ARTICLE_SOURCE_FIELDS,
  EXPECTED_REQUESTS,
  KORE_IDENTITY_CONFLICT,
  KORE_FULL_SNAPSHOT_SCOPE,
  RECONCILIATION_METHOD,
  SyncAbort,
  analyzeArticleIdentity,
  analyzeFamilies,
  differingSourceFields,
  legacyComparableCode,
  runCatalogShadowSync,
} from "../catalog-runner.ts";
import { sourceVariantKey } from "../hash.ts";
import { articuloEntity } from "../rows.ts";
import { KORE_SHADOW_TABLES } from "../types.ts";
import { FakeCatalogSource, FakeLegacyReader, MemoryShadowStore, articulo, clock, familia, sampleCatalog } from "./helpers.ts";

async function run(source = new FakeCatalogSource(sampleCatalog()), store = new MemoryShadowStore(), legacy?: FakeLegacyReader, now = clock()) {
  const result = await runCatalogShadowSync({ source, store, legacy, now });
  return { result, source, store };
}

describe("shadow sync catálogo (full snapshot): flujo completo", () => {
  it("crea sync run con source/operation_group/sync_mode y termina completed", async () => {
    const { result, store } = await run();
    assert.equal(result.status, "completed");
    assert.equal(result.errorCategory, null);
    const saved = store.runs.get(result.runId)!;
    assert.deepEqual([saved.source, saved.operation_group, saved.sync_mode, saved.status], ["kore", "catalog", "shadow_snapshot", "completed"]);
    assert.ok(saved.completed_at);
    assert.equal(result.metrics.strategy, "full_snapshot");
  });

  it("exactamente 4 llamadas: taxonomía una vez cada una + artículos global una vez; sin iteración por familia", async () => {
    const { result, source } = await run();
    assert.deepEqual(source.calls, ["ListarFamilias", "ListarGrupos", "ListarSubgrupos", "ListarArticulos"]);
    assert.equal(source.snapshotCalls, 1);
    assert.equal(EXPECTED_REQUESTS, 4);
    assert.deepEqual(result.metrics.network, { expectedRequests: 4, actualRequests: 4, requestsSucceeded: 4, requestsFailed: 0 });
    assert.ok(!("families" in result.metrics), "sin métricas de iteración por familia");
  });

  it("familia blank no bloquea: sus artículos entran en el snapshot y el run es completed", async () => {
    const { result, store } = await run();
    assert.equal(result.metrics.taxonomy.blankFamilies, 1);
    assert.equal(result.metrics.articles.blankFamilyArticles, 1);
    assert.equal(result.metrics.articles.snapshotComplete, true);
    assert.ok(store.rows("kore_articulos").some((row) => row.codigo_unico === "SINT-BLANK-1" && row.codigo_familia === ""));
  });

  it("persiste RAW + NORMALIZED de las 4 entidades con conteos created y alcance FULL_SNAPSHOT", async () => {
    const { result, store } = await run();
    assert.equal(store.rows("kore_raw_familias").length, 3);
    assert.equal(store.rows("kore_grupos").length, 3);
    assert.equal(store.rows("kore_subgrupos").length, 3);
    assert.equal(store.rows("kore_raw_articulos").length, 5);
    assert.equal(store.rows("kore_articulos").length, 5);
    assert.deepEqual(result.metrics.persistence.raw, { created: 14, updated: 0, unchanged: 0 });
    assert.deepEqual(result.metrics.persistence.normalized, { created: 14, updated: 0, unchanged: 0 });
    assert.ok(store.rows("kore_raw_articulos").every((row) => row.request_codigo_familia === KORE_FULL_SNAPSHOT_SCOPE));
  });

  it("RAW preserva raw + normalizado; NORMALIZED referencia raw_id; sin columnas de otros dominios", async () => {
    const { store } = await run();
    const raw = store.rows("kore_raw_articulos").find((r) => r.codigo_unico === "SINT-A-1")!;
    assert.equal(raw.codigo_unico_raw, "SINT-A-1".padEnd(22));
    assert.equal(raw.codigo_familia_raw, "F1".padEnd(6));
    const normalized = store.rows("kore_articulos").find((r) => r.codigo_unico === "SINT-A-1")!;
    assert.equal(normalized.raw_id, raw.id);
    assert.equal(normalized.source_key, JSON.stringify(["SINT-A-1"]));
    assert.match(String(normalized.content_hash), /^[0-9a-f]{64}$/);
    for (const forbidden of ["marca", "modelo", "stock", "precio", "imagen", "lote", "ventas"]) {
      // controla_stock es un flag real de KORE (CONTROLASTOCK), no una cantidad de stock.
      assert.ok(!Object.keys(normalized).some((key) => key !== "controla_stock" && key.includes(forbidden)), `columna ${forbidden} no permitida`);
    }
  });

  it("relaciones: MATCHED / PARTIAL / UNMATCHED por nivel, sin inventar códigos", async () => {
    const data = sampleCatalog();
    data.articulos.push(articulo("SINT-Z-1", "FZ", "GZ", "SZ"));
    const { result, store } = await run(new FakeCatalogSource(data));
    const r = result.metrics.relations;
    assert.deepEqual([r.matched, r.partial, r.unmatched], [2, 3, 1]);
    assert.deepEqual([r.familyMatched, r.familyUnmatched, r.familyAbsent], [5, 1, 0]);
    assert.deepEqual([r.groupMatched, r.groupUnmatched, r.groupAbsent], [2, 3, 1]);
    assert.deepEqual([r.subgroupMatched, r.subgroupUnmatched, r.subgroupAbsent], [2, 2, 2]);
    const sinTaxonomia = store.rows("kore_articulos").find((row) => row.codigo_unico === "SINT-Z-1")!;
    assert.deepEqual([sinTaxonomia.familia_id, sinTaxonomia.grupo_id, sinTaxonomia.subgrupo_id, sinTaxonomia.codigo_familia], [null, null, null, "FZ"]);
    assert.equal(result.status, "completed", "taxonomía desconocida no rechaza el artículo");
    assert.equal(result.metrics.taxonomy.orphanGrupos, 1);
    assert.equal(result.metrics.taxonomy.orphanSubgrupos, 1);
  });
});

describe("shadow sync catálogo: idempotencia, missing y fallos", () => {
  it("segundo run sin cambios: 0 duplicados, unchanged, first_seen preservado, last_seen y run actualizados", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    const first = await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const before = store.rows("kore_articulos").map((row) => ({ ...row }));
    const second = await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    assert.equal(second.result.status, "completed");
    assert.deepEqual(second.result.metrics.persistence.raw, { created: 0, updated: 0, unchanged: 14 });
    assert.deepEqual(second.result.metrics.persistence.normalized, { created: 0, updated: 0, unchanged: 14 });
    assert.equal(store.rows("kore_articulos").length, 5);
    for (const after of store.rows("kore_articulos")) {
      const prev = before.find((row) => row.source_key === after.source_key)!;
      assert.equal(after.id, prev.id);
      assert.equal(after.first_seen_at, prev.first_seen_at);
      assert.notEqual(after.last_seen_at, prev.last_seen_at);
      assert.equal(after.last_sync_run_id, second.result.runId);
      assert.notEqual(after.last_sync_run_id, first.result.runId);
      assert.equal(after.missing_since, null);
    }
  });

  it("filas parciales previas (run por familia fallido) se reutilizan: unchanged + created, sin duplicar", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    const parcial = sampleCatalog();
    parcial.articulos = parcial.articulos.slice(0, 2);
    await run(new FakeCatalogSource(parcial), store, undefined, now);
    const idsBefore = new Map(store.rows("kore_articulos").map((row) => [row.source_key, row.id]));
    const full = await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    assert.deepEqual(full.result.metrics.persistence.perTable.kore_raw_articulos, { created: 3, updated: 0, unchanged: 2 });
    assert.equal(store.rows("kore_articulos").length, 5);
    for (const [key, id] of idsBefore) assert.equal(store.rows("kore_articulos").find((row) => row.source_key === key)!.id, id);
  });

  it("contenido cambiado → nueva variante RAW (la anterior queda missing); NORMALIZED updated en la misma fila", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const changed = sampleCatalog();
    changed.articulos[0] = articulo("SINT-A-1", "F1", "G1", "S1", "ARTICULO SINT RENOMBRADO");
    const second = await run(new FakeCatalogSource(changed), store, undefined, now);
    assert.equal(second.result.status, "completed");
    assert.deepEqual(second.result.metrics.persistence.perTable.kore_raw_articulos, { created: 1, updated: 0, unchanged: 4 });
    const variants = store.rows("kore_raw_articulos").filter((row) => row.codigo_unico === "SINT-A-1");
    assert.equal(variants.length, 2);
    assert.equal(variants.filter((row) => row.missing_since !== null).length, 1);
    assert.deepEqual(second.result.metrics.persistence.perTable.kore_articulos, { created: 0, updated: 1, unchanged: 4 });
    const normalized = store.rows("kore_articulos").filter((row) => row.codigo_unico === "SINT-A-1");
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].raw_id, variants.find((row) => row.missing_since === null)!.id);
  });

  it("snapshot completo exitoso → artículos ausentes reciben missing_since (sin borrado físico)", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const reduced = sampleCatalog();
    reduced.articulos = reduced.articulos.filter((a) => a.codigoUnico !== "000123");
    const second = await run(new FakeCatalogSource(reduced), store, undefined, now);
    assert.equal(second.result.metrics.missing.articlesMissingEvaluated, true);
    assert.equal(second.result.metrics.missing.markedPerTable.kore_articulos, 1);
    assert.equal(store.rows("kore_articulos").length, 5);
    assert.ok(store.rows("kore_articulos").find((row) => row.codigo_unico === "000123")!.missing_since);
  });

  it("taxonomía ausente en snapshot completo → missing_since; reaparece → se limpia", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const reduced = sampleCatalog();
    reduced.grupos = reduced.grupos.filter((g) => g.codigoFamilia !== "FX");
    const second = await run(new FakeCatalogSource(reduced), store, undefined, now);
    assert.equal(second.result.metrics.missing.markedPerTable.kore_grupos, 1);
    assert.ok(store.rows("kore_grupos").find((row) => row.codigo_familia === "FX")!.missing_since);
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    assert.equal(store.rows("kore_grupos").find((row) => row.codigo_familia === "FX")!.missing_since, null);
  });

  it("falla del snapshot → failed, sin marcar missing de artículos ni tocar artículos existentes", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const failing = new FakeCatalogSource(sampleCatalog());
    failing.failSnapshot = new KoreError({ kind: "timeout", message: "timeout simulado" });
    const second = await run(failing, store, undefined, now);
    assert.equal(second.result.status, "failed");
    assert.equal(second.result.errorCategory, "KORE_TIMEOUT");
    assert.equal(second.result.metrics.missing.articlesMissingEvaluated, false);
    assert.equal(second.result.metrics.missing.markedPerTable.kore_articulos, undefined);
    assert.ok(store.rows("kore_articulos").every((row) => row.missing_since === null));
    assert.equal(second.result.metrics.reconciliation, null);
  });

  it("respuesta > 25 MB simulada → failed KORE_SNAPSHOT_TOO_LARGE, sin fallback ni reintento", async () => {
    const source = new FakeCatalogSource(sampleCatalog());
    source.failSnapshot = new KoreError({ kind: "response_too_large", message: "Respuesta KORE supera el máximo" });
    const { result, store } = await run(source);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCategory, "KORE_SNAPSHOT_TOO_LARGE");
    assert.equal(source.snapshotCalls, 1);
    assert.equal(source.attempts, 4);
    assert.equal(store.rows("kore_articulos").length, 0);
  });

  it("falla de taxonomía → failed sin persistir ni pedir artículos", async () => {
    const source = new FakeCatalogSource(sampleCatalog());
    source.failTaxonomy = "grupos";
    const { result, store } = await run(source);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCategory, "KORE_TIMEOUT");
    assert.equal(source.snapshotCalls, 0);
    assert.equal(store.rows("kore_raw_familias").length, 0);
  });

  it("falla de persistencia de artículos → failed (no oculto como completed)", async () => {
    const store = new MemoryShadowStore();
    store.failUpsertOn = "kore_raw_articulos";
    const { result } = await run(undefined, store);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCategory, "PERSISTENCE_ERROR");
    assert.equal(result.metrics.missing.articlesMissingEvaluated, false);
  });

  it("requests reales distintas de 4 → failed REQUEST_COUNT_MISMATCH sin persistir artículos", async () => {
    const source = new FakeCatalogSource(sampleCatalog());
    const original = source.listArticulosFullSnapshot;
    source.listArticulosFullSnapshot = () => {
      source.attempts++; // request extra no presupuestada
      return original();
    };
    const { result, store } = await run(source);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCategory, "REQUEST_COUNT_MISMATCH");
    assert.equal(store.rows("kore_articulos").length, 0);
  });
});

describe("shadow sync catálogo: identidad de artículos (KORE-26: variantes y cuarentena)", () => {
  const conflictVariant = () => articulo("SINT-A-1", "F1", "G1", "S1", "OTRA DESCRIPCION SINT");
  const withConflict = () => {
    const data = sampleCatalog();
    data.articulos.push(conflictVariant());
    return data;
  };
  const byKey = (store: MemoryShadowStore, table: "kore_raw_articulos" | "kore_articulos" | "kore_article_identity_conflicts", code: string) =>
    store.rows(table).filter((row) => row.source_key === JSON.stringify([code]));
  const counts = (result: { metrics: { articles: Record<string, unknown> } }) => {
    const a = result.metrics.articles;
    return [a.articleRowsReceived, a.distinctArticleKeys, a.duplicateArticleKeys, a.exactDuplicateRows, a.conflictingDuplicateKeys, a.rawVariantsPersisted, a.resolvedNormalizedKeys, a.conflictNormalizedKeys];
  };

  it("A: una source_key / una variante → RAW 1 variante, NORMALIZED resolved, run completed", async () => {
    const { result, store } = await run();
    assert.equal(result.status, "completed");
    assert.deepEqual(counts(result), [5, 5, 0, 0, 0, 5, 5, 0]);
    for (const raw of store.rows("kore_raw_articulos")) {
      assert.equal(raw.observed_occurrences, 1);
      assert.equal(raw.source_variant_key, sourceVariantKey(String(raw.source_key), String(raw.content_hash)));
    }
    for (const normalized of store.rows("kore_articulos")) {
      assert.equal(normalized.identity_status, "resolved");
      assert.equal(normalized.identity_conflict_since, null);
      assert.ok(normalized.raw_id);
    }
    assert.equal(store.rows("kore_article_identity_conflicts").length, 0);
    assert.deepEqual(result.metrics.identity.conflicts, []);
  });

  it("B: filas exactamente duplicadas → una variante RAW con observed_occurrences = 2, NORMALIZED resolved", async () => {
    const data = sampleCatalog();
    data.articulos.push(articulo("SINT-A-1", "F1", "G1", "S1"));
    const { result, store } = await run(new FakeCatalogSource(data));
    assert.equal(result.status, "completed");
    assert.equal(result.errorCategory, null);
    assert.deepEqual(counts(result), [6, 5, 1, 1, 0, 5, 5, 0]);
    const raws = byKey(store, "kore_raw_articulos", "SINT-A-1");
    assert.equal(raws.length, 1);
    assert.equal(raws[0].observed_occurrences, 2);
    const [normalized] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.equal(normalized.identity_status, "resolved");
    assert.equal(normalized.raw_id, raws[0].id);
  });

  it("C: variantes conflictivas → 2 variantes RAW, conflicto open, NORMALIZED conflict sin variante elegida, run partial (no failed)", async () => {
    const { result, store } = await run(new FakeCatalogSource(withConflict()));
    assert.equal(result.status, "partial");
    assert.equal(result.errorCategory, KORE_IDENTITY_CONFLICT);
    assert.deepEqual(counts(result), [6, 5, 1, 0, 1, 6, 4, 1]);
    assert.equal(result.metrics.articles.snapshotComplete, true);
    assert.equal(result.metrics.missing.articlesMissingEvaluated, true);

    const raws = byKey(store, "kore_raw_articulos", "SINT-A-1");
    assert.equal(raws.length, 2, "se preservan TODAS las variantes");
    assert.notEqual(raws[0].content_hash, raws[1].content_hash);
    assert.ok(raws.every((raw) => raw.observed_occurrences === 1 && raw.missing_since === null));

    const conflicts = store.rows("kore_article_identity_conflicts");
    assert.equal(conflicts.length, 1);
    assert.deepEqual([conflicts[0].status, conflicts[0].resolved_at, conflicts[0].variant_count, conflicts[0].differing_fields], ["open", null, 2, ["DESCRIPCION"]]);
    assert.equal(conflicts[0].last_sync_run_id, result.runId);
    for (const forbidden of ["descripcion", "observaciones", "payload", "codigo_unico", "codigo_familia"]) assert.ok(!(forbidden in conflicts[0]), `conflicto no guarda ${forbidden}`);

    const [normalized] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.equal(normalized.identity_status, "conflict");
    assert.ok(normalized.identity_conflict_since);
    for (const column of ["raw_id", "content_hash", "descripcion", "observaciones", "codigo_familia", "familia_id", "grupo_id", "subgrupo_id", "basico", "controla_stock"]) {
      assert.equal(normalized[column], null, `${column} no se elige de ninguna variante`);
    }
    assert.equal(store.rows("kore_articulos").filter((row) => row.identity_status === "resolved").length, 4);

    const r = result.metrics.relations;
    assert.equal(r.matched + r.partial + r.unmatched, 4, "relaciones solo para claves resolved");
    assert.deepEqual(result.metrics.identity.conflicts, [{ variantCount: 2, differingFieldNames: ["DESCRIPCION"] }]);
    const serialized = JSON.stringify(result.metrics);
    assert.ok(!serialized.includes("SINT-A-1") && !serialized.includes("OTRA DESCRIPCION"), "métricas sin claves ni valores");
  });

  it("D: conflicto repetido en el próximo run → misma fila, first_seen preservado, last_seen/run/variant_count actualizados", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    const first = await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    const [conflictBefore] = store.rows("kore_article_identity_conflicts").map((row) => ({ ...row }));
    const [normalizedBefore] = byKey(store, "kore_articulos", "SINT-A-1").map((row) => ({ ...row }));

    const data = withConflict();
    data.articulos.push({ ...articulo("SINT-A-1", "F1", "G1", "S1"), observaciones: "OBS SINT" });
    const second = await run(new FakeCatalogSource(data), store, undefined, now);

    assert.equal(second.result.status, "partial");
    const conflicts = store.rows("kore_article_identity_conflicts");
    assert.equal(conflicts.length, 1, "no se duplica el conflicto");
    assert.equal(conflicts[0].id, conflictBefore.id);
    assert.equal(conflicts[0].first_seen_at, conflictBefore.first_seen_at);
    assert.notEqual(conflicts[0].last_seen_at, conflictBefore.last_seen_at);
    assert.equal(conflicts[0].last_sync_run_id, second.result.runId);
    assert.notEqual(conflicts[0].last_sync_run_id, first.result.runId);
    assert.deepEqual([conflicts[0].variant_count, conflicts[0].differing_fields], [3, ["DESCRIPCION", "OBSERVACIONES"]]);
    assert.deepEqual([second.result.metrics.identity.conflictsNew, second.result.metrics.identity.conflictsRepeated], [0, 1]);

    const [normalizedAfter] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.equal(normalizedAfter.id, normalizedBefore.id);
    assert.equal(normalizedAfter.first_seen_at, normalizedBefore.first_seen_at);
    assert.equal(normalizedAfter.identity_conflict_since, normalizedBefore.identity_conflict_since);
    assert.equal(byKey(store, "kore_raw_articulos", "SINT-A-1").length, 3);
    assert.deepEqual(second.result.metrics.persistence.perTable.kore_raw_articulos, { created: 1, updated: 0, unchanged: 6 });
  });

  it("E: conflicto que desaparece → CONFLICT_NO_LONGER_REPRODUCED, sigue open y en cuarentena (sin resolución automática)", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    const [conflictBefore] = store.rows("kore_article_identity_conflicts").map((row) => ({ ...row }));

    const second = await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    assert.equal(second.result.status, "partial");
    assert.equal(second.result.errorCategory, KORE_IDENTITY_CONFLICT);
    assert.equal(second.result.metrics.identity.conflictNoLongerReproduced, 1);
    assert.deepEqual(second.result.metrics.identity.conflicts, []);
    assert.equal(second.result.metrics.articles.conflictingDuplicateKeys, 0);
    assert.equal(second.result.metrics.articles.conflictNormalizedKeys, 1);

    const [conflict] = store.rows("kore_article_identity_conflicts");
    assert.deepEqual([conflict.status, conflict.resolved_at, conflict.last_seen_at], ["open", null, conflictBefore.last_seen_at]);
    const [normalized] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.equal(normalized.identity_status, "conflict", "no se infiere qué variante quedó correcta");
    assert.equal(normalized.missing_since, null);

    const raws = byKey(store, "kore_raw_articulos", "SINT-A-1");
    assert.equal(raws.length, 2);
    assert.equal(raws.filter((raw) => raw.missing_since === null).length, 1, "la variante no observada queda missing (sin borrado)");
  });

  it("E2: conflicto open cuya clave desaparece del snapshot → no reproducido y NORMALIZED missing", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    const reduced = sampleCatalog();
    reduced.articulos = reduced.articulos.filter((a) => a.codigoUnico !== "SINT-A-1");
    const second = await run(new FakeCatalogSource(reduced), store, undefined, now);
    assert.equal(second.result.metrics.identity.conflictNoLongerReproduced, 1);
    assert.equal(second.result.status, "completed", "sin claves presentes en cuarentena");
    const [normalized] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.ok(normalized.missing_since);
    assert.equal(normalized.identity_status, "conflict");
    assert.equal(store.rows("kore_article_identity_conflicts")[0].status, "open");
  });

  it("F: source_key ausente en snapshot completo → missing normal en NORMALIZED y RAW (sin borrado físico)", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const reduced = sampleCatalog();
    reduced.articulos = reduced.articulos.filter((a) => a.codigoUnico !== "000123");
    const second = await run(new FakeCatalogSource(reduced), store, undefined, now);
    assert.equal(second.result.status, "completed");
    assert.deepEqual([second.result.metrics.missing.markedPerTable.kore_articulos, second.result.metrics.missing.markedPerTable.kore_raw_articulos], [1, 1]);
    assert.ok(byKey(store, "kore_articulos", "000123")[0].missing_since);
    assert.ok(byKey(store, "kore_raw_articulos", "000123")[0].missing_since);
    assert.equal(store.rows("kore_articulos").length, 5);
  });

  it("G: clave conflictiva PRESENTE no es missing; fila resolved previa pasa a conflict (misma fila, first_seen preservado)", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    const [before] = byKey(store, "kore_articulos", "SINT-A-1").map((row) => ({ ...row }));
    assert.equal(before.identity_status, "resolved");

    const second = await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    assert.equal(second.result.status, "partial");
    assert.equal(second.result.metrics.missing.markedPerTable.kore_articulos, 0);
    assert.equal(second.result.metrics.missing.markedPerTable.kore_raw_articulos, 0);
    const [after] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.deepEqual([after.id, after.first_seen_at, after.missing_since, after.identity_status, after.raw_id, after.descripcion], [before.id, before.first_seen_at, null, "conflict", null, null]);
    assert.equal(after.last_sync_run_id, second.result.runId);
    assert.deepEqual(second.result.metrics.persistence.perTable.kore_articulos, { created: 0, updated: 1, unchanged: 4 });
    assert.ok(byKey(store, "kore_raw_articulos", "SINT-A-1").every((raw) => raw.missing_since === null));
  });

  it("conflicto resolved explícitamente que reaparece → se reabre (open, resolved_at null), sin duplicar", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    const [conflict] = store.rows("kore_article_identity_conflicts");
    Object.assign(conflict, { status: "resolved", resolved_at: now() });
    const second = await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    const conflicts = store.rows("kore_article_identity_conflicts");
    assert.equal(conflicts.length, 1);
    assert.deepEqual([conflicts[0].id, conflicts[0].status, conflicts[0].resolved_at], [conflict.id, "open", null]);
    assert.equal(second.result.metrics.identity.conflictsReopened, 1);
  });

  it("conflicto resolved explícitamente + una sola variante → NORMALIZED vuelve a materializarse resolved", async () => {
    const store = new MemoryShadowStore();
    const now = clock();
    await run(new FakeCatalogSource(withConflict()), store, undefined, now);
    Object.assign(store.rows("kore_article_identity_conflicts")[0], { status: "resolved", resolved_at: now() });
    const second = await run(new FakeCatalogSource(sampleCatalog()), store, undefined, now);
    assert.equal(second.result.status, "completed");
    assert.equal(second.result.metrics.identity.conflictNoLongerReproduced, 0);
    const [normalized] = byKey(store, "kore_articulos", "SINT-A-1");
    assert.deepEqual([normalized.identity_status, normalized.identity_conflict_since], ["resolved", null]);
    assert.ok(normalized.raw_id && normalized.descripcion);
  });

  it("analyzeArticleIdentity: agrupa por source_key y content_hash; preserva todas las variantes en orden", () => {
    const base = articulo("SINT-X", "F1", null, null);
    const analysis = analyzeArticleIdentity([
      base,
      { ...base, codigoUnicoRaw: ` ${base.codigoUnicoRaw}` },
      articulo("SINT-Y", "F1", null, null),
      articulo("SINT-Y", "F1", null, null),
      { ...base },
      articulo("SINT-Z", "F1", null, null),
    ]);
    assert.deepEqual(
      [analysis.distinctArticleKeys, analysis.duplicateArticleKeys, analysis.exactDuplicateRows, analysis.conflictingDuplicateKeys, analysis.rawVariants],
      [3, 2, 2, 1, 4],
    );
    const [x, y, z] = analysis.keys;
    assert.deepEqual(x.variants.map((v) => v.occurrences), [2, 1]);
    assert.deepEqual(x.differingFields, ["CODIGOUNICO"], "padding raw distinto → mismo field source");
    assert.deepEqual([y.variants.length, y.variants[0].occurrences, y.differingFields], [1, 2, []]);
    assert.deepEqual([z.variants.length, z.differingFields], [1, []]);
  });

  it("differingSourceFields: solo nombres de los 11 fields source, en orden del contrato", () => {
    assert.deepEqual([...ARTICLE_SOURCE_FIELDS], [...KORE_ARTICULO_FIELDS]);
    const a = articulo("SINT-Q", "F1", "G1", "S1");
    const b = { ...a, basico: 0 as const, codigoGrupo: "G2", codigoGrupoRaw: "G2".padEnd(6), observaciones: "X" };
    const fields = differingSourceFields([{ entity: articuloEntity(a) }, { entity: articuloEntity(b) }]);
    assert.deepEqual(fields, ["CODIGOGRUPO", "BASICO", "OBSERVACIONES"]);
  });

  it("analyzeFamilies: duplicado idéntico se registra; conflicto falla; blank contado", () => {
    assert.deepEqual(analyzeFamilies([familia("F1"), familia("F1"), familia(""), familia("F2")]), { blankFamilies: 1, duplicateFamilyKeys: 1 });
    assert.throws(() => analyzeFamilies([familia("F1"), familia("F1", "OTRA")]), (error) => error instanceof SyncAbort && error.category === "CONFLICTING_DUPLICATE_FAMILY");
  });
});

describe("shadow sync catálogo: reconciliación y aislamiento", () => {
  it("reconciliación con la normalización REAL del importer legacy (whitespace colapsado + trim, case-sensitive)", async () => {
    const data = sampleCatalog();
    data.articulos.push(articulo("SINT  DOBLE  ESPACIO", "F1", null, null));
    const { result } = await run(new FakeCatalogSource(data), undefined, new FakeLegacyReader(["SINT-A-1", "000123", "SINT DOBLE ESPACIO", "sint-b-1", "LEGACY-ONLY", ""]));
    assert.deepEqual(result.metrics.reconciliation, {
      available: true,
      comparisonMethod: RECONCILIATION_METHOD,
      koreArticles: 6,
      legacyArticles: 5,
      intersection: 3,
      koreOnly: 3,
      legacyOnly: 2,
    });
    assert.equal(legacyComparableCode("  A \t B  "), "A B");
  });

  it("reconciliación no disponible no falla el run", async () => {
    const { result } = await run(undefined, undefined, new FakeLegacyReader(null));
    assert.equal(result.status, "completed");
    assert.equal(result.metrics.reconciliation?.available, false);
  });

  it("solo escribe en tablas kore_* (ninguna tabla legacy)", async () => {
    const { store } = await run();
    assert.ok(store.writes.length > 0);
    assert.ok(store.writes.every((table) => (KORE_SHADOW_TABLES as readonly string[]).includes(table)));
  });
});
