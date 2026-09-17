import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELIGIBLE_ARTICLE_FILTERS,
  KORE_CATALOG_COLUMNS,
  KoreCatalogIntegrityError,
  createKoreCatalogRepository,
} from "../repository.ts";
import { createSupabaseCatalogReader } from "../supabase-reader.ts";
import { FakeReader, catalog, row } from "./fixtures.ts";

describe("repository catálogo KORE: solo artículos aptos", () => {
  it("filtro único de elegibilidad: identity_status = resolved AND missing_since IS NULL", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(ELIGIBLE_ARTICLE_FILTERS)), { eq: [["identity_status", "resolved"]], isNull: ["missing_since"], notNull: [] });
  });

  it("listEligibleArticles excluye conflictos y missing; usa el filtro en la query", async () => {
    const reader = new FakeReader(catalog());
    const articles = await createKoreCatalogRepository(reader).listEligibleArticles();
    assert.deepEqual(articles.map((a) => a.codigoUnico), ["SINT-A", "SINT-B"]);
    assert.ok(reader.selects.every((q) => q.table === "kore_articulos" && q.filters === ELIGIBLE_ARTICLE_FILTERS));
    assert.deepEqual(Object.keys(articles[0]).sort(), [
      "basico", "codigoFamilia", "codigoGrupo", "codigoSubgrupo", "codigoUnico", "controlaStock", "descripcion",
      "deshabilitado", "exento", "familiaId", "grupoId", "id", "lastSeenAt", "minimo", "observaciones", "subgrupoId",
    ]);
  });

  it("las claves en conflicto se excluyen automáticamente (también por búsqueda puntual)", async () => {
    const repo = createKoreCatalogRepository(new FakeReader(catalog()));
    assert.equal(await repo.findEligibleArticle("SINT-CONFLICT-1"), null);
    assert.equal(await repo.findEligibleArticle("SINT-C"), null);
    assert.equal((await repo.findEligibleArticle("  SINT-A "))?.id, "id-SINT-A");
    assert.equal(await repo.findEligibleArticle("   "), null);
  });

  it("pagina hasta agotar filas con orden estable", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`SINT-${String(i).padStart(2, "0")}`));
    const reader = new FakeReader(rows);
    const articles = await createKoreCatalogRepository(reader, 3).listEligibleArticles();
    assert.equal(articles.length, 7);
    assert.deepEqual(reader.selects.map((q) => [q.from, q.to]), [[0, 2], [3, 5], [6, 8]]);
    assert.ok(reader.selects.every((q) => q.orderBy === "codigo_unico" && q.columns === KORE_CATALOG_COLUMNS));
    assert.throws(() => createKoreCatalogRepository(reader, 0), RangeError);
    assert.throws(() => createKoreCatalogRepository(reader, 5000), RangeError);
  });

  it("fail-closed: si la fuente devuelve una fila no apta, error (nunca se descarta en silencio)", async () => {
    for (const bad of [
      { identity_status: "conflict" },
      { missing_since: "2099-01-02T00:00:00Z" },
      { raw_id: null },
      { descripcion: null },
      { basico: 2 },
    ]) {
      const reader = new FakeReader([row("SINT-A"), row("SINT-BAD", bad)]);
      reader.ignoreFilters = true;
      await assert.rejects(createKoreCatalogRepository(reader).listEligibleArticles(), KoreCatalogIntegrityError);
    }
  });

  it("countArticles: aptos, cuarentena, resolved missing y total", async () => {
    const counts = await createKoreCatalogRepository(new FakeReader(catalog())).countArticles();
    assert.deepEqual(counts, { eligible: 2, quarantined: 2, resolvedMissing: 1, total: 5 });
  });
});

describe("adaptador Supabase del repository: solo lectura", () => {
  function fakeClient(result: { data?: unknown[] | null; error?: unknown; count?: number | null }) {
    const calls: string[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["eq", "is", "not", "order"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push(`${method}:${JSON.stringify(args)}`);
        return chain;
      };
    }
    chain.range = (...args: unknown[]) => {
      calls.push(`range:${JSON.stringify(args)}`);
      return Promise.resolve({ data: result.data ?? [], error: result.error ?? null });
    };
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: result.error ?? null, count: result.count });
    const client = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop !== "from") return assert.fail(`método no permitido: ${String(prop)}`);
          return (table: string) =>
            new Proxy(
              {},
              {
                get: (_t, op) => {
                  if (op !== "select") return assert.fail(`operación no permitida: ${String(op)}`);
                  return (columns: string, options?: unknown) => {
                    calls.push(`from:${table}`, `select:${JSON.stringify([columns, options ?? null])}`);
                    return chain;
                  };
                },
              },
            );
        },
      },
    );
    return { client: client as never, calls };
  }

  it("select aplica eq/is/order/range sobre kore_articulos y nada más", async () => {
    const { client, calls } = fakeClient({ data: [row("SINT-A")] });
    const repo = createKoreCatalogRepository(createSupabaseCatalogReader(client));
    const articles = await repo.listEligibleArticles();
    assert.equal(articles.length, 1);
    assert.deepEqual(calls.filter((c) => !c.startsWith("select:")), [
      "from:kore_articulos",
      'eq:["identity_status","resolved"]',
      'is:["missing_since",null]',
      'order:["codigo_unico",{"ascending":true}]',
      "range:[0,999]",
    ]);
  });

  it("count usa head + count exact; count ausente o error → error de lectura", async () => {
    const ok = fakeClient({ count: 10547 });
    const reader = createSupabaseCatalogReader(ok.client);
    assert.equal(await reader.count({ table: "kore_articulos", filters: ELIGIBLE_ARTICLE_FILTERS }), 10547);
    assert.ok(ok.calls.some((c) => c === 'select:["id",{"count":"exact","head":true}]'));
    await assert.rejects(createSupabaseCatalogReader(fakeClient({ count: null }).client).count({ table: "kore_articulos", filters: ELIGIBLE_ARTICLE_FILTERS }), /fallo de lectura/);
    await assert.rejects(createSupabaseCatalogReader(fakeClient({ data: [], error: { message: "x" } }).client).select({
      table: "kore_articulos", columns: KORE_CATALOG_COLUMNS, filters: ELIGIBLE_ARTICLE_FILTERS, orderBy: "codigo_unico", from: 0, to: 0,
    }), /fallo de lectura \(select\)/);
  });
});
