import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLegacyHydration } from "../dataset-hydration.ts";
import { validateDatasetCountsForImport } from "../dataset-import-validation.ts";
import {
  DATA_DOMAINS,
  DATA_SOURCES,
  DEFAULT_DOMAIN_SOURCES,
  ENABLED_SOURCES_BY_DOMAIN,
  OBSERVATION_ONLY_SOURCES,
  resolveDataSources,
  sameDomainSources,
} from "../sources.ts";

describe("fuentes explícitas por dominio", () => {
  it("define legacy, mock, shadow y kore", () => {
    assert.deepEqual([...DATA_SOURCES], ["legacy", "mock", "shadow", "kore"]);
    assert.deepEqual([...DATA_DOMAINS], ["catalog", "sales", "customers", "applications"]);
  });

  it("DEFAULT: legacy en todos los dominios (sin configuración, vacío o espacios)", () => {
    for (const env of [{}, { dataSource: "", catalogSource: "" }, { dataSource: "  ", catalogSource: undefined }, { dataSource: null }]) {
      const result = resolveDataSources(env);
      assert.ok(result.ok);
      assert.equal(result.mode, "legacy");
      assert.deepEqual(result.sources, DEFAULT_DOMAIN_SOURCES);
    }
    assert.deepEqual(DEFAULT_DOMAIN_SOURCES, { catalog: "legacy", sales: "legacy", customers: "legacy", applications: "legacy" });
  });

  it("mock solo si se pide explícitamente, y para todos los dominios", () => {
    const result = resolveDataSources({ dataSource: "MOCK" });
    assert.ok(result.ok);
    assert.equal(result.mode, "mock");
    assert.deepEqual(result.sources, { catalog: "mock", sales: "mock", customers: "mock", applications: "mock" });
  });

  it("mezclar mock con datos reales → error explícito (sin fallback)", () => {
    for (const env of [{ catalogSource: "mock" }, { dataSource: "mock", catalogSource: "legacy" }]) {
      const result = resolveDataSources(env);
      assert.ok(!result.ok);
      assert.equal(result.code, "MIXED_MOCK_NOT_ALLOWED");
    }
  });

  it("catalog=kore → modo mixed con provenance por dominio (resto legacy)", () => {
    const result = resolveDataSources({ catalogSource: "kore" });
    assert.ok(result.ok);
    assert.equal(result.mode, "mixed");
    assert.deepEqual(result.sources, { catalog: "kore", sales: "legacy", customers: "legacy", applications: "legacy" });
    assert.ok(sameDomainSources(result.sources, { catalog: "kore", sales: "legacy", customers: "legacy", applications: "legacy" }));
    assert.ok(!sameDomainSources(result.sources, DEFAULT_DOMAIN_SOURCES));
    assert.deepEqual([...ENABLED_SOURCES_BY_DOMAIN.catalog], ["legacy", "mock", "kore"]);
  });

  it("shadow sigue siendo solo observación: nunca catálogo visible", () => {
    assert.deepEqual([...OBSERVATION_ONLY_SOURCES], ["shadow"]);
    for (const env of [{ catalogSource: "shadow" }, { dataSource: "shadow" }]) {
      const result = resolveDataSources(env);
      assert.ok(!result.ok);
    }
    const catalog = resolveDataSources({ catalogSource: "shadow" });
    assert.ok(!catalog.ok);
    assert.deepEqual([catalog.code, catalog.domain], ["SHADOW_OBSERVATION_ONLY", "catalog"]);
  });

  it("DEFAULT obligatorio: sin override el catálogo sigue legacy (no kore)", () => {
    const result = resolveDataSources({});
    assert.ok(result.ok);
    assert.deepEqual([result.mode, result.sources.catalog], ["legacy", "legacy"]);
  });

  it("ventas = legacy: nunca shadow ni kore, por ninguna combinación", () => {
    const koreGlobal = resolveDataSources({ dataSource: "kore" });
    assert.ok(!koreGlobal.ok);
    assert.deepEqual([koreGlobal.code, koreGlobal.domain], ["SOURCE_NOT_ALLOWED_FOR_DOMAIN", "sales"]);
    const shadowGlobal = resolveDataSources({ dataSource: "shadow" });
    assert.ok(!shadowGlobal.ok);
    assert.deepEqual([shadowGlobal.code, shadowGlobal.domain], ["SHADOW_OBSERVATION_ONLY", "sales"]);
    for (const dataSource of [undefined, "legacy", "mock", "shadow", "kore", "x"]) {
      for (const catalogSource of [undefined, "legacy", "mock", "shadow", "kore", "x"]) {
        const result = resolveDataSources({ dataSource, catalogSource });
        if (result.ok) assert.ok(["legacy", "mock"].includes(result.sources.sales));
      }
    }
    assert.deepEqual([...ENABLED_SOURCES_BY_DOMAIN.sales], ["legacy", "mock"]);
  });

  it("valor desconocido → UNKNOWN_DATA_SOURCE (no cae a legacy ni a mock)", () => {
    assert.equal((resolveDataSources({ dataSource: "excel" }) as { code: string }).code, "UNKNOWN_DATA_SOURCE");
    assert.equal((resolveDataSources({ catalogSource: "supabase" }) as { code: string }).code, "UNKNOWN_DATA_SOURCE");
  });
});

describe("hidratación legacy: sin fallback silencioso a mock", () => {
  const base = { supabase: { ok: true, hasDataset: false }, hasSessionExcel: false, hasLocalExcel: false };

  it("legacy vacío → empty explícito", () => {
    assert.deepEqual(resolveLegacyHydration(base), { status: "empty", reason: "LEGACY_EMPTY" });
  });

  it("Supabase no disponible y sin copia local → error explícito", () => {
    const decision = resolveLegacyHydration({ ...base, supabase: { ok: false, hasDataset: false, errorMessage: "HTTP 503" } });
    assert.deepEqual(decision, { status: "error", reason: "LEGACY_UNAVAILABLE", errorMessage: "HTTP 503" });
  });

  it("orden legacy: Supabase → Excel de sesión → Excel local", () => {
    assert.deepEqual(resolveLegacyHydration({ ...base, supabase: { ok: true, hasDataset: true }, hasSessionExcel: true }), { status: "ready", origin: "supabase" });
    assert.deepEqual(resolveLegacyHydration({ ...base, hasSessionExcel: true, hasLocalExcel: true }), { status: "ready", origin: "excel-session" });
    assert.deepEqual(resolveLegacyHydration({ ...base, supabase: { ok: false, hasDataset: false }, hasLocalExcel: true }), { status: "ready", origin: "excel-local" });
  });

  it("ninguna combinación produce mock", () => {
    for (const ok of [true, false]) {
      for (const hasDataset of [true, false]) {
        for (const hasSessionExcel of [true, false]) {
          for (const hasLocalExcel of [true, false]) {
            const decision = resolveLegacyHydration({ supabase: { ok, hasDataset }, hasSessionExcel, hasLocalExcel });
            assert.ok(!JSON.stringify(decision).includes("mock"));
          }
        }
      }
    }
  });
});

describe("catálogo desacoplado de ventas", () => {
  const dataset = (ventas: number) => ({
    clientes: [{}],
    ventas: Array.from({ length: ventas }, () => ({})),
    ventaItems: Array.from({ length: ventas }, () => ({})),
    articulos: [{}, {}],
    aplicaciones: [{}],
  }) as never;

  it("artículos válidos con ventas = 0 → importable, con advertencia SIN_VENTAS", () => {
    const result = validateDatasetCountsForImport(dataset(0));
    assert.ok(result.ok);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^SIN_VENTAS/);
  });

  it("con ventas → sin advertencias", () => {
    assert.deepEqual(validateDatasetCountsForImport(dataset(3)), { ok: true, warnings: [] });
  });

  it("sin artículos sigue bloqueando (el catálogo es obligatorio)", () => {
    const result = validateDatasetCountsForImport({ ...(dataset(3) as object), articulos: [] } as never);
    assert.ok(!result.ok);
    assert.match(result.errorMessage, /artículos/);
    assert.doesNotMatch(result.errorMessage, /ventas/);
  });
});
