import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKoreCatalogRepository } from "../../kore-catalog/repository.ts";
import { FakeReader, conflictRow, row } from "../../kore-catalog/__tests__/fixtures.ts";
import { resolveServerLoadOutcome, type ServerLoadResponse } from "../dataset-hydration.ts";
import {
  composeMixedDataset,
  koreArticleToArticulo,
  loadActiveDataset,
  type ActiveDatasetDeps,
  type KoreCatalogPort,
  type LegacyDatasetLoad,
} from "../mixed-dataset.ts";
import { DEFAULT_DOMAIN_SOURCES, resolveDataSources } from "../sources.ts";

type Dataset = NonNullable<LegacyDatasetLoad["dataset"]>;

/** Dataset legacy sintético mínimo (solo los campos que usa el loader). */
function legacyDataset(): Dataset {
  return {
    clientes: [{ numeroCuenta: "C1" }],
    ventas: [{ id: "v1", numeroCuenta: "C1" }],
    ventaItems: [
      { id: "vi1", ventaId: "v1", codigoUnico: "SINT-A", descripcion: "", cantidad: 1, precioUnitario: 0, importe: 0 },
      { id: "vi2", ventaId: "v1", codigoUnico: "SINT-LEGACY-ONLY", descripcion: "", cantidad: 1, precioUnitario: 0, importe: 0 },
      { id: "vi3", ventaId: "v1", codigoUnico: "SINT-CONFLICT-1", descripcion: "", cantidad: 1, precioUnitario: 0, importe: 0 },
    ],
    articulos: [
      { codigoUnico: "SINT-A", descripcion: "LEGACY A", rubro: "F1", categoria: "G1", activo: true },
      { codigoUnico: "SINT-LEGACY-ONLY", descripcion: "LEGACY SOLO", rubro: "F1", categoria: "G1", activo: true },
    ],
    aplicaciones: [
      { codigoAplicacion: "ap1", codigoUnico: "SINT-A", marcaId: "m", modeloId: "mm", anioDesde: 0, anioHasta: 9999 },
      { codigoAplicacion: "ap2", codigoUnico: "SINT-LEGACY-ONLY", marcaId: "m", modeloId: "mm", anioDesde: 0, anioHasta: 9999 },
    ],
    marcas: [{ id: "m", nombre: "MARCA SINT" }],
    modelos: [{ id: "mm", marcaId: "m", nombre: "MODELO SINT" }],
    solicitudes: [],
    oportunidades: [],
    warnings: [],
    dataQuality: {},
    smartNormalization: {},
    stats: { articulosUnicos: 2 },
  } as unknown as Dataset;
}

function koreRows() {
  return [
    row("SINT-A", { descripcion: "KORE A" }),
    row("SINT-KORE-ONLY", { codigo_familia: "", codigo_grupo: null, deshabilitado: 1 }),
    row("SINT-MISSING", { missing_since: "2099-01-02T00:00:00Z" }),
    conflictRow("SINT-CONFLICT-1"),
  ];
}

function deps(overrides: Partial<ActiveDatasetDeps> & { reader?: FakeReader; legacy?: LegacyDatasetLoad } = {}): ActiveDatasetDeps & { calls: string[] } {
  const calls: string[] = [];
  const reader = overrides.reader ?? new FakeReader(koreRows());
  const legacy: LegacyDatasetLoad = overrides.legacy ?? { ok: true, dataset: legacyDataset(), oportunidades: [{ id: "op" }], generatedAt: new Date("2099-01-01T00:00:00Z") };
  return {
    calls,
    resolution: overrides.resolution ?? resolveDataSources({ catalogSource: "kore" }),
    loadLegacy: overrides.loadLegacy ?? (async () => (calls.push("legacy"), structuredClone(legacy))),
    koreCatalog:
      overrides.koreCatalog ??
      (() => {
        calls.push("kore");
        return createKoreCatalogRepository(reader);
      }),
    emptyLegacyDataset: overrides.emptyLegacyDataset ?? (() => ({ ...legacyDataset(), clientes: [], ventas: [], ventaItems: [], articulos: [], aplicaciones: [] })),
  };
}

describe("KORE-28 dataset mixto: provenance por dominio", () => {
  it("catalog=kore, sales/customers/applications=legacy → provenance correcta (no 'KORE' global)", async () => {
    const result = await loadActiveDataset(deps());
    assert.equal(result.status, "ready");
    assert.deepEqual(result.provenance?.sources, { catalog: "kore", sales: "legacy", customers: "legacy", applications: "legacy" });
    assert.equal(result.provenance?.mode, "mixed");
    assert.equal(result.provenance?.catalog.source, "kore");
    assert.equal(result.provenance?.catalog.quarantinedExcluded, 1);
    assert.deepEqual(result.provenance?.catalog.taxonomy, { familias: 1, grupos: 1, subgrupos: 1 });
    assert.deepEqual(result.oportunidades, [{ id: "op" }], "oportunidades siguen legacy");
  });

  it("DEFAULT (sin override): catálogo legacy, sin tocar el repository KORE", async () => {
    const d = deps({ resolution: resolveDataSources({}) });
    const result = await loadActiveDataset(d);
    assert.deepEqual(result.provenance?.sources, DEFAULT_DOMAIN_SOURCES);
    assert.equal(result.provenance?.catalog.source, "legacy");
    assert.deepEqual(d.calls, ["legacy"], "no se consulta KORE en modo legacy");
    assert.deepEqual(result.dataset?.articulos.map((a) => a.descripcion), ["LEGACY A", "LEGACY SOLO"]);
  });

  it("catalog=shadow nunca es catálogo visible: error de configuración, sin datos", async () => {
    const d = deps({ resolution: resolveDataSources({ catalogSource: "shadow" }) });
    const result = await loadActiveDataset(d);
    assert.deepEqual([result.status, result.errorCode, result.dataset], ["error", "SOURCE_CONFIG_INVALID", null]);
    assert.deepEqual(d.calls, []);
  });
});

describe("KORE-28 catálogo core", () => {
  it("resolved incluido; conflict y missing excluidos; KORE-only incluido con enrichment vacío; legacy-only no se agrega", async () => {
    const result = await loadActiveDataset(deps());
    const articulos = result.dataset!.articulos;
    assert.deepEqual(articulos.map((a) => a.codigoUnico).sort(), ["SINT-A", "SINT-KORE-ONLY"]);
    assert.equal(articulos.find((a) => a.codigoUnico === "SINT-A")?.descripcion, "KORE A", "core field desde KORE, no legacy");
    const koreOnly = articulos.find((a) => a.codigoUnico === "SINT-KORE-ONLY")!;
    assert.deepEqual(koreOnly, { codigoUnico: "SINT-KORE-ONLY", descripcion: "ARTICULO SINT SINT-KORE-ONLY", rubro: undefined, categoria: undefined, activo: false });
    for (const field of ["marcaArticulo", "stock", "precioLista", "unidadMedida"]) assert.ok(!(field in koreOnly), `${field} no se fabrica`);
    assert.equal(result.provenance?.catalog.articleCount, 2);
    assert.equal(result.dataset?.stats.articulosUnicos, 2);
    assert.deepEqual(result.dataset?.catalogTaxonomy?.familias.map((f) => f.codigoFamilia), ["F1"], "taxonomía KORE activa, sin familias retiradas");
  });

  it("dominios legacy intactos: ventas, clientes y aplicaciones no se filtran ni se reasignan", async () => {
    const result = await loadActiveDataset(deps());
    const legacy = legacyDataset();
    assert.deepEqual(result.dataset!.ventaItems, legacy.ventaItems);
    assert.deepEqual(result.dataset!.aplicaciones, legacy.aplicaciones);
    assert.deepEqual(result.dataset!.clientes, legacy.clientes);
    assert.deepEqual(result.dataset!.marcas, legacy.marcas);
  });

  it("koreArticleToArticulo: solo campos con fuente KORE", () => {
    const [article] = [row("SINT-Z", { codigo_familia: "F9", codigo_grupo: "G9", deshabilitado: null })].map((r) => ({
      id: String(r.id), codigoUnico: String(r.codigo_unico), descripcion: String(r.descripcion), observaciones: "",
      codigoFamilia: "F9", codigoGrupo: "G9", codigoSubgrupo: null, familiaId: null, grupoId: null, subgrupoId: null,
      basico: null, minimo: null, exento: null, deshabilitado: null, controlaStock: null, lastSeenAt: "x",
    }));
    assert.deepEqual(koreArticleToArticulo(article), { codigoUnico: "SINT-Z", descripcion: "ARTICULO SINT SINT-Z", rubro: "F9", categoria: "G9", activo: true });
  });

  it("composeMixedDataset no muta el dataset legacy de entrada", () => {
    const legacy = legacyDataset();
    const before = structuredClone(legacy);
    composeMixedDataset(legacy, [], { familias: [], grupos: [], subgrupos: [] });
    assert.deepEqual(legacy, before);
  });
});

describe("KORE-28 joins legacy → catálogo KORE", () => {
  it("venta/aplicación con y sin artículo KORE resolved: sin crash, sin artículo falso, huérfanos medidos", async () => {
    const result = await loadActiveDataset(deps());
    assert.deepEqual(result.provenance?.joins, {
      catalogArticles: 2,
      catalogArticlesWithSales: 1,
      catalogArticlesWithApplications: 1,
      catalogOnlyArticles: 1,
      legacyCatalogArticlesNotInCatalog: 1,
      saleItemsTotal: 3,
      saleItemsWithCatalogArticle: 1,
      saleItemsWithoutCatalogArticle: 2,
      applicationsTotal: 2,
      applicationsWithCatalogArticle: 1,
      applicationsWithoutCatalogArticle: 1,
    });
    const codes = new Set(result.dataset!.articulos.map((a) => a.codigoUnico));
    assert.ok(!codes.has("SINT-LEGACY-ONLY") && !codes.has("SINT-CONFLICT-1"), "sin artículos artificiales para huérfanos");
  });

  it("legacy sin datos + KORE listo → catálogo KORE con dominios legacy vacíos explícitos", async () => {
    const result = await loadActiveDataset(deps({ legacy: { ok: true, dataset: null, oportunidades: [], generatedAt: null } }));
    assert.equal(result.status, "ready");
    assert.equal(result.dataset!.articulos.length, 2);
    assert.deepEqual([result.dataset!.ventas.length, result.dataset!.aplicaciones.length], [0, 0]);
    assert.equal(result.provenance?.joins?.catalogOnlyArticles, 2);
  });
});

describe("KORE-28 fallas de la fuente: sin fallback", () => {
  it("catalog=kore + repository con error → error explícito, sin legacy ni mock", async () => {
    const reader = new FakeReader(koreRows());
    reader.failWith = new Error("fallo simulado");
    const result = await loadActiveDataset(deps({ reader }));
    assert.deepEqual([result.ok, result.status, result.errorCode, result.dataset], [false, "error", "KORE_CATALOG_UNAVAILABLE", null]);
    assert.deepEqual(result.oportunidades, []);
    assert.equal(result.provenance?.catalog.status, "error");
  });

  it("catalog=kore + repository no configurado → error explícito", async () => {
    const result = await loadActiveDataset(deps({ koreCatalog: () => null }));
    assert.deepEqual([result.status, result.errorCode, result.dataset], ["error", "KORE_CATALOG_UNAVAILABLE", null]);
  });

  it("catalog=kore + 0 artículos → empty explícito, sin catálogo legacy", async () => {
    const result = await loadActiveDataset(deps({ reader: new FakeReader([conflictRow("SINT-CONFLICT-1")]) }));
    assert.deepEqual([result.ok, result.status, result.emptyReason, result.dataset], [true, "empty", "KORE_CATALOG_EMPTY", null]);
  });

  it("conteo del repository distinto de los artículos leídos → KORE_CATALOG_INCONSISTENT", async () => {
    const port: KoreCatalogPort = {
      listEligibleArticles: async () => [],
      listActiveTaxonomy: async () => ({ familias: [], grupos: [], subgrupos: [] }),
      countArticles: async () => ({ eligible: 5, quarantined: 0, resolvedMissing: 0, total: 5 }),
    };
    const result = await loadActiveDataset(deps({ koreCatalog: () => port }));
    assert.deepEqual([result.status, result.errorCode], ["error", "KORE_CATALOG_INCONSISTENT"]);
  });

  it("catalog=kore + legacy (ventas/clientes) no disponible → error explícito (no dataset parcial oculto)", async () => {
    const result = await loadActiveDataset(deps({ legacy: { ok: false, dataset: null, oportunidades: [], generatedAt: null, errorMessage: "legacy caído" } }));
    assert.deepEqual([result.status, result.errorCode, result.dataset], ["error", "LEGACY_UNAVAILABLE", null]);
  });

  it("mock nunca se carga desde el servidor", async () => {
    const result = await loadActiveDataset(deps({ resolution: resolveDataSources({ dataSource: "mock" }) }));
    assert.deepEqual([result.status, result.errorCode], ["error", "MOCK_SOURCE_HAS_NO_SERVER_DATASET"]);
  });
});

describe("KORE-28 hidratación del cliente: sin copias locales en modo mixto", () => {
  const mixed = { catalog: "kore", sales: "legacy", customers: "legacy", applications: "legacy" } as const;
  const response = (overrides: Partial<ServerLoadResponse> = {}): ServerLoadResponse => ({
    httpOk: true,
    ok: true,
    status: "ready",
    errorCode: null,
    hasDataset: true,
    provenanceSources: mixed,
    errorMessage: null,
    ...overrides,
  });

  it("mixed OK → aplicar sin guardar copia de sesión", () => {
    assert.deepEqual(resolveServerLoadOutcome("mixed", mixed, response()), { kind: "apply", source: "mixed", persistSessionCopy: false });
  });

  it("mixed error → estado final error (nunca Excel local/sesión legacy)", () => {
    const outcome = resolveServerLoadOutcome("mixed", mixed, response({ ok: false, status: "error", errorCode: "KORE_CATALOG_UNAVAILABLE", hasDataset: false }));
    assert.deepEqual(outcome, { kind: "final", status: "error", code: "KORE_CATALOG_UNAVAILABLE", message: null });
    const network = resolveServerLoadOutcome("mixed", mixed, response({ httpOk: false, ok: false, status: null, hasDataset: false, errorMessage: "HTTP 500" }));
    assert.equal(network.kind, "final");
  });

  it("mixed empty → estado final empty", () => {
    const outcome = resolveServerLoadOutcome("mixed", mixed, response({ status: "empty", hasDataset: false }));
    assert.deepEqual(outcome, { kind: "final", status: "empty", code: "KORE_CATALOG_EMPTY", message: null });
  });

  it("procedencia del servidor distinta de la configuración del cliente → error explícito", () => {
    const outcome = resolveServerLoadOutcome("mixed", mixed, response({ provenanceSources: DEFAULT_DOMAIN_SOURCES }));
    assert.equal(outcome.kind === "final" && outcome.code, "SOURCE_CONFIG_MISMATCH");
    const legacyOutcome = resolveServerLoadOutcome("legacy", DEFAULT_DOMAIN_SOURCES, response());
    assert.equal(legacyOutcome.kind === "final" && legacyOutcome.code, "SOURCE_CONFIG_MISMATCH");
  });

  it("mixed sin provenance → error (no se asume la procedencia)", () => {
    const outcome = resolveServerLoadOutcome("mixed", mixed, response({ provenanceSources: null }));
    assert.equal(outcome.kind === "final" && outcome.code, "PROVENANCE_MISSING");
  });

  it("legacy conserva la cadena KORE-27 (Supabase → Excel sesión → local)", () => {
    const legacySources = DEFAULT_DOMAIN_SOURCES;
    assert.deepEqual(resolveServerLoadOutcome("legacy", legacySources, response({ provenanceSources: legacySources })), { kind: "apply", source: "supabase", persistSessionCopy: true });
    assert.deepEqual(resolveServerLoadOutcome("legacy", legacySources, response({ provenanceSources: legacySources, status: "empty", hasDataset: false })), { kind: "continue-legacy", supabaseOk: true, errorMessage: null });
    assert.deepEqual(resolveServerLoadOutcome("legacy", legacySources, response({ provenanceSources: null, ok: false, status: "error", hasDataset: false, errorMessage: "x" })), { kind: "continue-legacy", supabaseOk: false, errorMessage: "x" });
  });
});
