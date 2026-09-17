import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { KoreError } from "../../kore/errors.ts";
import { listKoreArticulos } from "../../kore/service.ts";
import { KORE_SYNC_SNAPSHOT_MAX_RESPONSE_BYTES, listKoreArticulosFullSnapshotForSync } from "../../kore/sync-only.ts";
import { childElements, firstChildElement, parseXml } from "../../kore/xml.ts";
import { KORE_IDENTITY_CONFLICT, runCatalogShadowSync } from "../catalog-runner.ts";
import { canonicalJson, contentHash, sourceKey, sourceVariantKey } from "../hash.ts";
import { ShadowSyncEnvError, validateShadowSyncEnv } from "../env.ts";
import { createKoreCatalogSource } from "../kore-source.ts";
import { createSupabaseShadowStore } from "../supabase-store.ts";
import { MemoryShadowStore, articulo, clock } from "./helpers.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FAKE_SECRET = "FAKE-not-a-real-key_0000";
const FAKE_SERVICE_ROLE = "FAKE-service-role-not-real";
const VALID_ENV = {
  KORE_BASE_URL: "http://kore.test.invalid/KoreStandard.asmx",
  KORE_COMPANY_NUMBER: "999",
  KORE_SECRET_KEY: FAKE_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: "https://project.test.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "FAKE-publishable",
  SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_ROLE,
};

describe("content hash", () => {
  it("SHA-256 estable e independiente del orden de campos", () => {
    const a = contentHash({ b: 1, a: "x", c: null });
    const b = contentHash({ c: null, a: "x", b: 1 });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("cambia si cambia el contenido source (incluido el padding raw)", () => {
    const base = articulo("SINT-1", "F1", null, null);
    assert.notEqual(contentHash(base), contentHash({ ...base, codigoUnicoRaw: "SINT-1" }));
  });

  it("rechaza valores no serializables de forma estable", () => {
    assert.throws(() => canonicalJson({ a: undefined }));
    assert.throws(() => canonicalJson({ a: Number.NaN }));
    assert.equal(canonicalJson({ z: -0 }), '{"z":0}');
  });

  it("source_key es un JSON array (sin ambigüedad de separadores)", () => {
    assert.notEqual(sourceKey(["a|b", "c"]), sourceKey(["a", "b|c"]));
  });

  it("source_variant_key = sha256(content_hash + LF + source_key), idéntico a la fórmula SQL de la migración 002", () => {
    const key = sourceKey(["SINT-V"]);
    const hash = contentHash({ a: 1 });
    const expected = createHash("sha256").update(`${hash}\n${key}`, "utf8").digest("hex");
    assert.equal(sourceVariantKey(key, hash), expected);
    assert.notEqual(sourceVariantKey(key, contentHash({ a: 2 })), expected);
    assert.notEqual(sourceVariantKey(sourceKey(["SINT-W"]), hash), expected);
    assert.throws(() => sourceVariantKey(key, "no-hash"));
    const sql = readFileSync(join(REPO, "supabase/migrations/202609170002_kore_article_identity_conflicts.sql"), "utf8");
    const formula = "encode(sha256(convert_to(content_hash || E'\\n' || source_key, 'UTF8')), 'hex')";
    assert.equal(sql.split(formula).length - 1, 2, "backfill y check usan la misma fórmula");
  });
});

describe("env del runner (fail closed, sin valores en mensajes)", () => {
  it("válido", () => {
    const env = validateShadowSyncEnv(VALID_ENV);
    assert.equal(env.supabaseUrl, VALID_ENV.NEXT_PUBLIC_SUPABASE_URL);
  });

  for (const key of ["KORE_SECRET_KEY", "KORE_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    it(`falta ${key} → error que nombra la variable, sin valores`, () => {
      const env = { ...VALID_ENV, [key]: "" };
      assert.throws(() => validateShadowSyncEnv(env), (error: Error) => error.message.includes(key) && !error.message.includes(FAKE_SECRET) && !error.message.includes(FAKE_SERVICE_ROLE));
    });
  }

  it("service role igual a la clave pública → error", () => {
    assert.throws(() => validateShadowSyncEnv({ ...VALID_ENV, SUPABASE_SERVICE_ROLE_KEY: "FAKE-publishable" }), ShadowSyncEnvError);
  });

  it("service role expuesta como NEXT_PUBLIC_ → error", () => {
    assert.throws(() => validateShadowSyncEnv({ ...VALID_ENV, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "x" }), ShadowSyncEnvError);
  });

  it("Supabase URL no https → error", () => {
    assert.throws(() => validateShadowSyncEnv({ ...VALID_ENV, NEXT_PUBLIC_SUPABASE_URL: "http://project.test.invalid" }), ShadowSyncEnvError);
  });
});

describe("fuente KORE real (sin red): cuenta POST y respeta límites de lib/kore", () => {
  const fixture = (name: string) => readFileSync(join(REPO, "lib/kore/__fixtures__", name), "utf8");
  const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });

  it("sync completa real = exactamente 4 POST; ListarArticulos global sin tags de filtro", async () => {
    const bodies: Record<string, string> = {
      ListarFamilias: fixture("listar-familias.ok.xml"),
      ListarGrupos: fixture("listar-grupos.ok.xml"),
      ListarSubgrupos: fixture("listar-subgrupos.ok.xml"),
      ListarArticulos: fixture("listar-articulos.duplicate-codigo.xml"),
    };
    const actions: string[] = [];
    let articulosData: string[] = [];
    const source = createKoreCatalogSource(VALID_ENV, async (_url, init) => {
      const action = String((init.headers as Record<string, string>).SOAPAction).replace(/"|http:\/\/tempuri\.org\//g, "");
      actions.push(action);
      if (action === "ListarArticulos") {
        const data = childElements(firstChildElement(firstChildElement(firstChildElement(parseXml(String(init.body)), "Body")!, "ListarArticulos")!, "doc")!)[0];
        articulosData = childElements(data).map((child) => child.name);
      }
      return xml(bodies[action]);
    });
    await source.listFamilias();
    await source.listGrupos();
    await source.listSubgrupos();
    const articulos = await source.listArticulosFullSnapshot();
    assert.deepEqual(actions, ["ListarFamilias", "ListarGrupos", "ListarSubgrupos", "ListarArticulos"]);
    assert.equal(source.requestsAttempted(), 4);
    assert.deepEqual(articulosData, ["NroEmpresa", "SecretKey"], "sin filtros: snapshot global documentado");
    assert.equal(articulos.length, 5, "parser permanente preserva codigoUnico repetidos");
  });

  it("end-to-end sin red (XML → parser → runner → store): duplicado exacto colapsa, conflicto queda en cuarentena, run partial", async () => {
    const bodies: Record<string, string> = {
      ListarFamilias: fixture("listar-familias.ok.xml"),
      ListarGrupos: fixture("listar-grupos.ok.xml"),
      ListarSubgrupos: fixture("listar-subgrupos.ok.xml"),
      ListarArticulos: fixture("listar-articulos.duplicate-codigo.xml"),
    };
    const source = createKoreCatalogSource(VALID_ENV, async (_url, init) =>
      xml(bodies[String((init.headers as Record<string, string>).SOAPAction).replace(/"|http:\/\/tempuri\.org\//g, "")]),
    );
    const store = new MemoryShadowStore();
    const result = await runCatalogShadowSync({ source, store, now: clock() });
    assert.equal(result.status, "partial");
    assert.equal(result.errorCategory, KORE_IDENTITY_CONFLICT);
    assert.equal(result.metrics.network.actualRequests, 4);
    const a = result.metrics.articles;
    assert.deepEqual([a.articleRowsReceived, a.exactDuplicateRows, a.conflictingDuplicateKeys, a.conflictNormalizedKeys, a.snapshotComplete], [5, 1, 1, 1, true]);
    assert.equal(a.rawVariantsPersisted, store.rows("kore_raw_articulos").length);
    assert.equal(a.resolvedNormalizedKeys + a.conflictNormalizedKeys, store.rows("kore_articulos").length);
    assert.equal(store.rows("kore_article_identity_conflicts").length, 1);
    assert.deepEqual(result.metrics.identity.conflicts.map((conflict) => conflict.variantCount), [2]);
  });

  it("SYNC_ONLY_FULL_SNAPSHOT: tope de 25 MB (solo puede bajarse) → response_too_large, 1 request, sin reintento", async () => {
    assert.equal(KORE_SYNC_SNAPSHOT_MAX_RESPONSE_BYTES, 25 * 1024 * 1024);
    let calls = 0;
    const error = await listKoreArticulosFullSnapshotForSync({
      env: VALID_ENV,
      maxResponseBytes: 64,
      fetchImpl: async () => {
        calls++;
        return xml(fixture("listar-articulos.ok.xml"));
      },
    }).then(
      () => assert.fail("se esperaba response_too_large"),
      (e: unknown) => e,
    );
    assert.ok(error instanceof KoreError && error.kind === "response_too_large");
    assert.equal(calls, 1);
  });

  it("API interactiva listKoreArticulos sigue rechazando la consulta sin filtros antes de salir a red", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return xml(fixture("listar-articulos.ok.xml"));
    };
    for (const filters of [{}, { codigoFamilia: "" }, { codigoFamilia: "   " }]) {
      await assert.rejects(listKoreArticulos(filters, { env: VALID_ENV, fetchImpl }), /requires at least one filter/);
    }
    assert.equal(calls, 0);
  });
});

describe("aislamiento", () => {
  it("el store Supabase rechaza tablas fuera de kore_* antes de tocar el cliente", async () => {
    const client = new Proxy({}, { get: () => assert.fail("no debe usar el cliente") }) as never;
    const store = createSupabaseShadowStore(client);
    await assert.rejects(store.upsertRows("articulos" as never, []), /tabla no permitida/);
    await assert.rejects(store.markMissing("clientes" as never, "sync_run_id", "x", "t"), /tabla no permitida/);
    await assert.rejects(store.loadIndex("ventas" as never), /tabla no permitida/);
    await assert.rejects(store.upsertRows("articulos" as never, [], "source_variant_key"), /tabla no permitida/);
  });

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return entry === "node_modules" || entry === ".next" ? [] : sourceFiles(path);
      return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) ? [path] : [];
    });
  }

  it("app/, components/ y contexts/ no importan lib/kore-sync (sin dependencia de UI)", () => {
    const offenders = ["app", "components", "contexts"].flatMap((dir) => sourceFiles(join(REPO, dir))).filter((file) => /kore-sync/.test(readFileSync(file, "utf8")));
    assert.deepEqual(offenders.map((file) => relative(REPO, file)), []);
  });

  it("SYNC_ONLY_FULL_SNAPSHOT no se exporta desde @/lib/kore ni lo usa la API interactiva", () => {
    const index = readFileSync(join(REPO, "lib/kore/index.ts"), "utf8");
    const service = readFileSync(join(REPO, "lib/kore/service.ts"), "utf8");
    for (const text of [index, service]) assert.ok(!/sync-only|FullSnapshot/.test(text));
  });

  it("solo lib/kore-sync (y tests) importan el método bulk; app/, components/ y contexts/ nunca", () => {
    const importers = sourceFiles(REPO)
      .filter((file) => !/[\\/](node_modules|\.next)[\\/]/.test(file))
      .filter((file) => /sync-only|listKoreArticulosFullSnapshotForSync/.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO, file).replaceAll("\\", "/"))
      .filter((file) => file !== "lib/kore/sync-only.ts");
    assert.ok(importers.length > 0);
    assert.ok(importers.every((file) => file.startsWith("lib/kore-sync/")), `importadores no permitidos: ${importers.join(", ")}`);
    const uiOffenders = ["app", "components", "contexts"].flatMap((dir) => sourceFiles(join(REPO, dir))).filter((file) => /sync-only|FullSnapshotForSync/.test(readFileSync(file, "utf8")));
    assert.deepEqual(uiOffenders, []);
  });

  it("lib/kore-sync no usa clearDataset, import-dataset, truncate ni borrados", () => {
    const files = sourceFiles(join(REPO, "lib/kore-sync")).filter((file) => !file.includes("__tests__"));
    for (const file of files) {
      // Se ignoran comentarios (documentan lo que NO se hace).
      const text = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      assert.ok(!/clearDataset|clear-dataset|import-dataset|saveDatasetToSupabase|\.delete\(|truncate/i.test(text), `${relative(REPO, file)} contiene operaciones destructivas o legacy`);
    }
  });

  it("la migración shadow no altera, borra ni trunca tablas existentes y no usa cascade", () => {
    const sql = readFileSync(join(REPO, "supabase/migrations/202609170001_kore_shadow_sync.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.ok(!/drop\s|truncate|delete\s+from|on delete cascade/i.test(sql));
    const altered = [...sql.matchAll(/alter table\s+public\.(\w+)/gi)].map((m) => m[1]);
    const created = [...sql.matchAll(/create table if not exists\s+public\.(\w+)/gi)].map((m) => m[1]);
    assert.ok(created.every((table) => table.startsWith("kore_")));
    assert.ok(altered.every((table) => created.includes(table)));
    assert.equal((sql.match(/enable row level security/gi) ?? []).length, created.length);
    assert.ok(!/create policy/i.test(sql));
  });

  it("migración 002 (identidad): solo toca kore_raw_articulos, kore_articulos y la tabla de conflictos; sin borrados ni policies", () => {
    const sql = readFileSync(join(REPO, "supabase/migrations/202609170002_kore_article_identity_conflicts.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const allowed = ["kore_raw_articulos", "kore_articulos", "kore_article_identity_conflicts"];
    assert.ok(!/drop\s+table|truncate|delete\s+from|cascade|create policy|grant\s/i.test(sql));
    const drops = [...sql.matchAll(/drop\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
    assert.deepEqual([...new Set(drops)].sort(), ["constraint", "not"], "solo drop constraint / drop not null");
    assert.deepEqual([...sql.matchAll(/drop constraint if exists\s+(\w+)/gi)].map((m) => m[1]), ["kore_raw_articulos_source_key_key"]);
    const touched = [...sql.matchAll(/(?:alter table|update|create table if not exists|on|revoke all on table)\s+public\.(\w+)/gi)].map((m) => m[1]);
    assert.ok(touched.length > 0 && touched.every((table) => allowed.includes(table)), `tablas fuera de alcance: ${touched.filter((t) => !allowed.includes(t)).join(", ")}`);
    assert.deepEqual([...sql.matchAll(/update\s+public\.(\w+)/gi)].map((m) => m[1]), ["kore_raw_articulos"]);
    assert.deepEqual([...sql.matchAll(/create table if not exists\s+public\.(\w+)/gi)].map((m) => m[1]), ["kore_article_identity_conflicts"]);
    assert.match(sql, /alter table public\.kore_article_identity_conflicts enable row level security/);
    assert.match(sql, /revoke all on table public\.kore_article_identity_conflicts from anon, authenticated/);
    assert.match(sql, /unique \(source_key, content_hash\)/);
    assert.match(sql, /^begin;$/m);
    assert.match(sql, /^commit;$/m);
  });
});
