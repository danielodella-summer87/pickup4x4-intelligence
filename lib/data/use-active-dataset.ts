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

function devWarnExcelWithoutDataset(): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[useActiveDataset] source=excel|supabase pero dataset=null — usando mock temporalmente",
    );
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
  /** Dataset Excel restaurado o guardado en localStorage / IndexedDB */
  isPersistedLocally: boolean;
  isPersistedInSupabase: boolean;
  isStorageHydrated: boolean;
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
    oportunidadesSupabase,
  } = useDataset();

  const data = useMemo(() => {
    if (dataset) {
      return pickupDatasetToActiveData(dataset);
    }
    if (source === "excel" || source === "supabase") {
      devWarnExcelWithoutDataset();
    }
    return mockPickupDataToActive();
  }, [dataset, source]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[useActiveDataset]", {
      source,
      hasDataset: dataset !== null,
      isMock: source === "mock",
      isExcel: source === "excel",
      isSupabase: source === "supabase",
      isPersistedLocally: source === "excel" && hasLocalPersistence,
      isPersistedInSupabase: source === "supabase" && hasSupabasePersistence,
      isStorageHydrated,
      counts: dataset
        ? {
            clientes: dataset.clientes.length,
            ventas: dataset.ventas.length,
            articulos: dataset.articulos.length,
            aplicaciones: dataset.aplicaciones.length,
          }
        : null,
    });
  }, [dataset, source, hasLocalPersistence, hasSupabasePersistence, isStorageHydrated]);

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
