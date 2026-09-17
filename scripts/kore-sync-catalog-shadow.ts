/**
 * KORE-24/25/26 — Shadow sync manual del catálogo (taxonomía + artículos) KORE → Supabase.
 *
 * Uso (local, server-side, manual):
 *   npm run kore:sync:catalog-shadow
 *
 * - Lee credenciales de .env.local (Node --env-file). Nunca imprime secretos.
 * - Presupuesto: exactamente 4 POST a KORE (3 taxonomía + 1 snapshot global de artículos), serial, 0 reintentos.
 * - Escribe solo en tablas kore_*. No toca tablas legacy, UI, demo ni Excel.
 * - Salida: únicamente conteos, categorías y nombres de fields en conflicto (nunca claves ni valores).
 * - Exit code: 0 = completed; 2 = partial por KORE_IDENTITY_CONFLICT (snapshot completo,
 *   claves en cuarentena); 1 = cualquier otro caso. Siempre ≠ 0 si cambió una tabla legacy.
 *
 * TRANSPORT_SECURITY_BLOCKER: KORE usa HTTP :89 sin TLS. No ejecutar desde Vercel
 * ni convertir en proceso automático hasta resolver el transporte.
 */
import { KORE_IDENTITY_CONFLICT, runCatalogShadowSync } from "../lib/kore-sync/catalog-runner.ts";
import { validateShadowSyncEnv } from "../lib/kore-sync/env.ts";
import { createKoreCatalogSource } from "../lib/kore-sync/kore-source.ts";
import {
  countLegacyTables,
  createLegacyCatalogReader,
  createShadowSupabaseClient,
  createSupabaseShadowStore,
} from "../lib/kore-sync/supabase-store.ts";

async function main(): Promise<number> {
  const env = validateShadowSyncEnv(process.env);
  const client = createShadowSupabaseClient(env.supabaseUrl, env.serviceRoleKey);

  const legacyBefore = await countLegacyTables(client);
  const result = await runCatalogShadowSync({
    source: createKoreCatalogSource(env.kore),
    store: createSupabaseShadowStore(client),
    legacy: createLegacyCatalogReader(client),
  });
  const legacyAfter = await countLegacyTables(client);

  const legacyTablesUnchanged = Object.keys(legacyBefore).every((table) => legacyBefore[table] === legacyAfter[table]);
  console.log(
    JSON.stringify(
      {
        status: result.status,
        errorCategory: result.errorCategory,
        metrics: result.metrics,
        legacy: {
          tablesChecked: Object.keys(legacyBefore).length,
          tablesAvailable: Object.values(legacyBefore).filter((count) => count !== null).length,
          legacyTablesUnchanged,
        },
      },
      null,
      2,
    ),
  );
  if (!legacyTablesUnchanged) return 1;
  if (result.status === "completed") return 0;
  return result.status === "partial" && result.errorCategory === KORE_IDENTITY_CONFLICT ? 2 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Sin mensajes de detalle: pueden contener valores de entorno o de negocio.
    const name = error instanceof Error ? error.name : "Error";
    const safeMessage = error instanceof Error && /^(ShadowSyncEnvError|KoreError)$/.test(error.name) ? error.message : "";
    console.error(JSON.stringify({ status: "aborted", error: name, message: safeMessage }));
    process.exitCode = 1;
  },
);
