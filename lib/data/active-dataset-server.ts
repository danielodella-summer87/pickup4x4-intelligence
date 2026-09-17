/**
 * Loader server-side del dataset activo (KORE-28). SOLO SERVIDOR.
 *
 * browser → /api/supabase/load-dataset → este loader → { legacy loader, @/lib/kore-catalog }
 *
 * La fuente se resuelve con la configuración de la app (source-config), nunca desde la
 * request. Con catalog=kore el catálogo sale del repository KORE (service role, server-only);
 * ventas, clientes y aplicaciones siguen en legacy. Sin fallbacks entre fuentes.
 */
import "server-only";
import { emptyPickupDataset } from "@/lib/data/coerce-pickup-dataset";
import { loadActiveDataset, type ActiveDatasetLoad } from "@/lib/data/mixed-dataset";
import { configuredDataSources } from "@/lib/data/source-config";
import { loadDatasetFromSupabaseServer } from "@/lib/data/supabase-dataset-server";
import { createServerKoreCatalogRepository } from "@/lib/kore-catalog";

export async function loadActiveDatasetServer(): Promise<ActiveDatasetLoad> {
  return loadActiveDataset({
    resolution: configuredDataSources(),
    loadLegacy: loadDatasetFromSupabaseServer,
    koreCatalog: createServerKoreCatalogRepository,
    emptyLegacyDataset: emptyPickupDataset,
  });
}
