import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveHydrationAction, resolveServerLoadOutcome, type HydrationPhase, type ServerLoadResponse } from "../dataset-hydration.ts";
import { DEFAULT_DOMAIN_SOURCES } from "../sources.ts";

/**
 * KORE-31 — el dataset reacciona a la sesión.
 *
 * Sin sesión no se pide nada (antes el 401 previo al login quedaba pegado) y no queda
 * visible ningún dataset privado. Al autenticarse se carga; al cerrar sesión se limpia.
 */

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const context = readFileSync(join(REPO, "contexts/DatasetContext.tsx"), "utf8");
const phase = (over: Partial<HydrationPhase> = {}): HydrationPhase => ({ isAuthenticated: true, configOk: true, mode: "legacy", ...over });

describe("transición de sesión → hidratación del dataset", () => {
  it("A: sin sesión no se carga nada; al autenticarse se carga desde el servidor", () => {
    assert.equal(resolveHydrationAction(phase({ isAuthenticated: false })), "clear-unauthenticated");
    assert.equal(resolveHydrationAction(phase()), "load-from-server");
    assert.equal(resolveHydrationAction(phase({ mode: "mixed" })), "load-from-server");
  });

  it("A2: sin sesión gana sobre cualquier modo o configuración inválida (no se filtra nada)", () => {
    for (const mode of ["legacy", "mixed", "mock", null] as const) {
      for (const configOk of [true, false]) {
        assert.equal(resolveHydrationAction({ isAuthenticated: false, configOk, mode }), "clear-unauthenticated");
      }
    }
  });

  it("B: con sesión, mock explícito no pide datos; configuración inválida es error explícito", () => {
    assert.equal(resolveHydrationAction(phase({ mode: "mock" })), "mock-ready");
    assert.equal(resolveHydrationAction(phase({ configOk: false, mode: null })), "config-error");
  });

  it("C: si la carga post-login falla de verdad → error explícito, sin mock ni otra fuente", () => {
    const mixed = { catalog: "kore", sales: "legacy", customers: "legacy", applications: "legacy" } as const;
    const failed: ServerLoadResponse = { httpOk: false, ok: false, status: "error", errorCode: "KORE_CATALOG_UNAVAILABLE", hasDataset: false, provenanceSources: mixed, errorMessage: "sin catálogo" };
    const outcome = resolveServerLoadOutcome("mixed", mixed, failed);
    assert.deepEqual(outcome, { kind: "final", status: "error", code: "KORE_CATALOG_UNAVAILABLE", message: "sin catálogo" });
    const legacyFailure = resolveServerLoadOutcome("legacy", DEFAULT_DOMAIN_SOURCES, { ...failed, provenanceSources: DEFAULT_DOMAIN_SOURCES });
    assert.equal(legacyFailure.kind, "continue-legacy");
    assert.ok(!JSON.stringify([outcome, legacyFailure]).includes("mock"));
  });

  it("E: la acción es determinística (misma fase → misma acción): sin loops de request", () => {
    const acciones = new Set(Array.from({ length: 5 }, () => resolveHydrationAction(phase())));
    assert.equal(acciones.size, 1);
    assert.notEqual(resolveHydrationAction(phase()), resolveHydrationAction(phase({ isAuthenticated: false })));
  });
});

describe("DatasetProvider: contrato de sesión (estático)", () => {
  it("recibe isAuthenticated del layout y lo usa como dependencia del efecto", () => {
    assert.match(context, /DatasetProvider\(\{ children, isAuthenticated \}/);
    assert.match(context, /resolveHydrationAction\(\{ isAuthenticated, configOk: resolution\.ok, mode: dataMode \}\)/);
    assert.match(context, /\}, \[resolution, hydrationAction\]\);/);
    const layout = readFileSync(join(REPO, "app/layout.tsx"), "utf8");
    assert.match(layout, /const isAuthenticated = await isRequestAuthenticated\(\);/);
    assert.match(layout, /<DatasetProvider key=\{isAuthenticated \? "session" : "anonymous"\} isAuthenticated=\{isAuthenticated\}>/);
  });

  it("D: al cerrar sesión el provider se remonta (estado vacío) y sin sesión no hay request", () => {
    const layout = readFileSync(join(REPO, "app/layout.tsx"), "utf8");
    // La key derivada de la sesión remonta el provider: el dataset privado no sobrevive al logout.
    assert.match(layout, /<DatasetProvider key=\{isAuthenticated \? "session" : "anonymous"\} isAuthenticated=\{isAuthenticated\}>/);
    const start = context.indexOf('if (hydrationAction === "clear-unauthenticated")');
    const body = context.slice(start, context.indexOf("return;", start));
    assert.ok(start > 0);
    assert.doesNotMatch(body, /fetch\(|load-dataset/);
    assert.ok(body.includes("clearSessionExcelDataset()"), "limpia la copia de sesión del Excel");
    // El estado inicial se deriva de la acción: sin sesión nace vacío y en unauthenticated.
    assert.match(context, /useState<DatasetSource>\(hydrationAction === "mock-ready" \? "mock" : "none"\)/);
    assert.match(context, /useState<DatasetStatus>\(\(\) => statusForAction\(hydrationAction\)\)/);
    assert.match(context, /if \(action === "clear-unauthenticated"\) return "unauthenticated";/);
  });

  it("E2: sin polling, sin reintentos automáticos ni recargas forzadas", () => {
    assert.doesNotMatch(context, /setInterval|location\.reload|window\.location\.assign|retry|setTimeout\(\s*\(\)\s*=>\s*fetch/);
    assert.equal(context.match(/fetch\("\/api\/supabase\/load-dataset"/g)?.length, 1);
  });

  it("la sesión se resuelve en el servidor con la cookie firmada existente (sin segunda capa de auth)", () => {
    const helper = readFileSync(join(REPO, "lib/auth/request-session.ts"), "utf8");
    assert.match(helper, /^import "server-only";$/m);
    assert.match(helper, /isValidSessionCookieValue/);
    assert.doesNotMatch(helper, /PASSWORD|PIN|createSessionCookieValue/);
  });
});
