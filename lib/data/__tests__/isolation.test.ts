import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
/** Código sin comentarios (los comentarios documentan lo que NO se hace). */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" || entry === ".next" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("fuentes explícitas: sin fallback silencioso ni borrados al cambiar de fuente", () => {
  it("DatasetContext no borra Supabase: sin clearDataset, clearSupabaseDataset ni clear-dataset", () => {
    const context = code("contexts/DatasetContext.tsx");
    assert.doesNotMatch(context, /clearDataset\b|clearSupabaseDataset|clear-dataset|saveDatasetToSupabaseServer|\.delete\(/);
    assert.doesNotMatch(context, /clearLocalDataset:\s*clearDataset/);
  });

  it("clearLocalDataset solo toca almacenamiento local (sin fetch)", () => {
    const context = code("contexts/DatasetContext.tsx");
    const start = context.indexOf("const clearLocalDataset = useCallback");
    const body = context.slice(start, context.indexOf("}, [source]);", start));
    assert.ok(start > 0 && body.length > 0);
    assert.doesNotMatch(body, /fetch\(|saveDatasetToSupabase|clearSupabase|\/api\/supabase/);
    assert.match(body, /removePersistedExcelDataset\(\)/);
  });

  it("DatasetContext no importa datos mock (mock no es fallback de la carga legacy)", () => {
    assert.doesNotMatch(code("contexts/DatasetContext.tsx"), /mock-pickup|mockPickupData/);
  });

  it("useActiveDataset solo usa mock con dataMode === \"mock\"; si no, vacío explícito", () => {
    const hook = code("lib/data/use-active-dataset.ts");
    assert.equal(hook.match(/mockPickupDataToActive\(\)/g)?.length, 1);
    assert.match(hook, /if \(dataMode === "mock"\) return mockPickupDataToActive\(\);/);
    assert.match(hook, /return emptyActivePickupData\(\);/);
  });

  it("insights no usan mock como valor por defecto", () => {
    for (const path of ["lib/data/insights.ts", "lib/data/distribuidor-insights.ts"]) {
      assert.doesNotMatch(code(path), /mockPickupData|defaultPickupData/, path);
    }
  });

  it("no existe endpoint que vacíe el dataset legacy desde la UI", () => {
    assert.equal(existsSync(join(REPO, "app/api/supabase/clear-dataset/route.ts")), false);
    const offenders = ["app", "components", "contexts"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => /clear-dataset|clearSupabaseDataset|Volver a datos mock/.test(readFileSync(file, "utf8")));
    assert.deepEqual(offenders.map((file) => relative(REPO, file)), []);
  });

  it("resolver fuentes es puro: sources.ts, source-config.ts y dataset-hydration.ts sin I/O ni borrados", () => {
    for (const path of ["lib/data/sources.ts", "lib/data/source-config.ts", "lib/data/dataset-hydration.ts"]) {
      const text = code(path).replace(/^import (type )?\{[^}]*\} from "\.\/sources\.ts";$/gm, "");
      assert.doesNotMatch(text, /\bimport\s|fetch\(|localStorage|indexedDB|clear\w*\(|delete|createClient|\/api\//i, path);
    }
  });
});

/** Líneas de import de valor (`import type` se borra en compilación). */
function valueImports(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line));
}

/** Archivos que Next empaqueta para el browser: los marcados "use client" en app/, components/, contexts/ y lib/. */
function clientFiles(): string[] {
  return ["app", "components", "contexts", "lib"]
    .flatMap((dir) => sourceFiles(join(REPO, dir)))
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /^\s*["']use client["'];?/m.test(readFileSync(file, "utf8").slice(0, 400)));
}

describe("boundary server-side del catálogo KORE (KORE-28)", () => {
  it("las entradas server-side importan server-only", () => {
    assert.match(read("lib/kore-catalog/index.ts"), /^import "server-only";$/m);
    assert.match(read("lib/data/active-dataset-server.ts"), /^import "server-only";$/m);
  });

  it("@/lib/kore-catalog solo lo importa el loader server-side del dataset activo", () => {
    const importers = ["app", "components", "contexts", "lib"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => !file.includes("__tests__") && !relative(REPO, file).replaceAll("\\", "/").startsWith("lib/kore-catalog/"))
      .filter((file) => valueImports(file).some((line) => /from\s+["'][^"']*kore-catalog[^"']*["']/.test(line)))
      .map((file) => relative(REPO, file).replaceAll("\\", "/"));
    assert.deepEqual(importers, ["lib/data/active-dataset-server.ts"]);
  });

  it("el loader server-side solo lo usa la ruta load-dataset", () => {
    const importers = ["app", "components", "contexts", "lib"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => !file.includes("__tests__"))
      .filter((file) => valueImports(file).some((line) => /active-dataset-server/.test(line)))
      .map((file) => relative(REPO, file).replaceAll("\\", "/"))
      .filter((file) => file !== "lib/data/active-dataset-server.ts");
    assert.deepEqual(importers, ["app/api/supabase/load-dataset/route.ts"]);
  });

  it("ningún client component importa service role, supabase-js, lib/kore, lib/kore-sync ni el catálogo KORE", () => {
    const files = clientFiles();
    assert.ok(files.length > 10, "se detectan client components");
    const forbidden = /from\s+["'](@\/lib\/supabase\/server|@\/lib\/kore(\/[^"']*)?|@\/lib\/kore-sync[^"']*|@\/lib\/kore-catalog[^"']*|@\/lib\/data\/active-dataset-server|@\/lib\/data\/supabase-dataset-server)["']/;
    const offenders = files.filter((file) => forbidden.test(valueImports(file).join("\n")));
    assert.deepEqual(offenders.map((file) => relative(REPO, file)), []);
    // supabase-js en el browser: solo el cliente público preexistente (clave publishable, sujeto a RLS).
    const supabaseJs = files.filter((file) => valueImports(file).some((line) => /["']@supabase\/supabase-js["']/.test(line)));
    assert.deepEqual(supabaseJs.map((file) => relative(REPO, file).replaceAll("\\", "/")), ["lib/supabase/client.ts"]);
    for (const file of files) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /SERVICE_ROLE|getSupabaseServiceRoleKey|createSupabaseServiceClient|\bkore_[a-z_]+\b/, relative(REPO, file));
    }
  });

  it("la ruta load-dataset resuelve la fuente por configuración, nunca desde la request, y responde no-store", () => {
    const route = code("app/api/supabase/load-dataset/route.ts");
    assert.match(route, /export async function GET\(\)/, "GET sin parámetros de request");
    assert.doesNotMatch(route, /searchParams|request\.|headers\(\)|cookies\(\)|\?source=/);
    assert.match(route, /"Cache-Control": "no-store"/);
    assert.match(code("lib/data/source-config.ts"), /process\.env\.NEXT_PUBLIC_PICKUP_CATALOG_SOURCE/);
  });

  it("la ruta no expone variantes RAW, hashes ni tablas de conflictos", () => {
    for (const path of ["lib/kore-catalog/repository.ts", "lib/data/mixed-dataset.ts"]) {
      const text = code(path);
      assert.doesNotMatch(text, /kore_raw_articulos|source_variant_key|content_hash|kore_article_identity_conflicts/, path);
    }
    assert.doesNotMatch(code("lib/kore-catalog/repository.ts").match(/KORE_CATALOG_COLUMNS = \[[\s\S]*?\]/)?.[0] ?? "", /hash|variant|raw_json|payload/);
  });

  it("lib/kore-catalog es solo lectura y no llama KORE ni el sync", () => {
    for (const path of ["lib/kore-catalog/index.ts", "lib/kore-catalog/repository.ts", "lib/kore-catalog/supabase-reader.ts", "lib/data/active-dataset-server.ts", "lib/data/mixed-dataset.ts"]) {
      const text = code(path);
      assert.doesNotMatch(text, /\.(insert|update|upsert|delete|rpc)\(|truncate|lib\/kore\/|@\/lib\/kore"|kore-sync|fetch\(|clearSupabase/, path);
    }
  });
});
