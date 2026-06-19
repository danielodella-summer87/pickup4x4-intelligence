"use client";

import { useEffect, useMemo } from "react";
import { useDataset, type DatasetSource } from "@/contexts/DatasetContext";
import type { DatasetWarning } from "@/lib/excel/build-dataset";
import {
  mockPickupDataToActive,
  pickupDatasetToActiveData,
  type ActivePickupData,
} from "@/lib/data/pickup-data";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";

function logActiveDataset(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[useActiveDataset] ${message}`, detail);
  } else {
    console.info(`[useActiveDataset] ${message}`);
  }
}

export type ActiveDataset = {
  data: ActivePickupData;
  source: DatasetSource;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  isMock: boolean;
  isExcel: boolean;
  isSupabase: boolean;
  isPersistedLocally: boolean;
  isPersistedInSupabase: boolean;
  isStorageHydrated: boolean;
  supabaseError: string | null;
  oportunidadesSupabase: OportunidadDetectada[] | null;
};

export function useActiveDataset(): ActiveDataset {
  const {
    dataset,
    source,
    generatedAt,
    warnings,
    hasLocalPersistence,
    hasSupabasePersistence,
    isStorageHydrated,
    isSupabaseLoaded,
    supabaseError,
    oportunidadesSupabase,
  } = useDataset();

  const data = useMemo(() => {
    if (source === "supabase" && dataset) {
      return pickupDatasetToActiveData(dataset);
    }

    if (dataset) {
      return pickupDatasetToActiveData(dataset);
    }

    if (!isStorageHydrated) {
      return mockPickupDataToActive();
    }

    if (source === "excel" || source === "supabase") {
      logActiveDataset("source real pero dataset=null — mock temporal", { source });
    }

    return mockPickupDataToActive();
  }, [dataset, source, isStorageHydrated]);

  useEffect(() => {
    logActiveDataset("source actual y conteos", {
      source,
      isStorageHydrated,
      isSupabaseLoaded,
      hasDataset: dataset !== null,
      isMock: source === "mock",
      isExcel: source === "excel",
      isSupabase: source === "supabase",
      isPersistedLocally: source === "excel" && hasLocalPersistence,
      isPersistedInSupabase: source === "supabase" && hasSupabasePersistence,
      counts: dataset
        ? {
            clientes: dataset.clientes.length,
            ventas: dataset.ventas.length,
            articulos: dataset.articulos.length,
            aplicaciones: dataset.aplicaciones.length,
          }
        : null,
    });
  }, [
    dataset,
    source,
    hasLocalPersistence,
    hasSupabasePersistence,
    isStorageHydrated,
    isSupabaseLoaded,
  ]);

  return {
    data,
    source,
    generatedAt,
    warnings,
    isMock: source === "mock",
    isExcel: source === "excel",
    isSupabase: source === "supabase",
    isPersistedLocally: source === "excel" && hasLocalPersistence,
    isPersistedInSupabase: source === "supabase" && hasSupabasePersistence,
    isStorageHydrated,
    supabaseError,
    oportunidadesSupabase,
  };
}

export function formatDatasetSourceLabel(
  source: DatasetSource,
  options?: { persistedLocally?: boolean; inMemoryOnly?: boolean },
): string {
  if (source === "supabase") {
    return "Supabase";
  }
  if (source === "excel") {
    if (options?.persistedLocally) {
      return "Excel (persistido local)";
    }
    if (options?.inMemoryOnly) {
      return "Excel (solo en memoria)";
    }
    return "Excel";
  }
  return "Mock";
}
