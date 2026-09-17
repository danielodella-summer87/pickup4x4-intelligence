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

  it("resolver fuentes es puro: sources.ts y dataset-hydration.ts sin I/O ni borrados", () => {
    for (const path of ["lib/data/sources.ts", "lib/data/dataset-hydration.ts"]) {
      assert.doesNotMatch(code(path), /\bimport\s|fetch\(|localStorage|indexedDB|clear\w*\(|delete|createClient|\/api\//i, path);
    }
  });
});

describe("repository KORE: server-only y fuera de la UI (sin cutover)", () => {
  it("la entrada @/lib/kore-catalog importa server-only", () => {
    assert.match(read("lib/kore-catalog/index.ts"), /^import "server-only";$/m);
  });

  it("ningún archivo de app/, components/, contexts/ ni lib/data importa lib/kore-catalog", () => {
    const offenders = ["app", "components", "contexts", "lib/data"]
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .filter((file) => !file.includes("__tests__"))
      .filter((file) => /kore-catalog/.test(readFileSync(file, "utf8")));
    assert.deepEqual(offenders.map((file) => relative(REPO, file)), []);
  });

  it("lib/kore-catalog es solo lectura y no llama KORE ni el sync", () => {
    for (const path of ["lib/kore-catalog/index.ts", "lib/kore-catalog/repository.ts", "lib/kore-catalog/supabase-reader.ts"]) {
      const text = code(path);
      assert.doesNotMatch(text, /\.(insert|update|upsert|delete|rpc)\(|truncate|lib\/kore\/|@\/lib\/kore"|kore-sync|fetch\(/, path);
    }
  });
});
