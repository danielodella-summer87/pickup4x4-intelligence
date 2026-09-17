"use client";

import { useEffect, useMemo } from "react";
import { useDataset, type DatasetSource, type DatasetStatus } from "@/contexts/DatasetContext";
import type { DatasetWarning } from "@/lib/excel/build-dataset";
import {
  emptyActivePickupData,
  mockPickupDataToActive,
  pickupDatasetToActiveData,
  type ActivePickupData,
} from "@/lib/data/pickup-data";
import type { DataMode, DomainSources } from "@/lib/data/sources";
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
  dataMode: DataMode | null;
  dataSources: DomainSources | null;
  status: DatasetStatus;
  configError: string | null;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  /** true solo con la fuente mock elegida explícitamente. */
  isMock: boolean;
  /** true cuando no hay datos que mostrar (legacy vacío, error o configuración inválida). */
  isEmpty: boolean;
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
    dataMode,
    dataSources,
    status,
    configError,
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
    if (dataMode === "mock") return mockPickupDataToActive();
    if (dataMode === "legacy" && dataset) return pickupDatasetToActiveData(dataset);
    // Cargando, legacy vacío, error o configuración inválida: vacío explícito, nunca mock.
    return emptyActivePickupData();
  }, [dataMode, dataset]);

  const isEmpty = status === "empty" || status === "error";

  useEffect(() => {
    logActiveDataset("fuente y conteos", {
      dataMode,
      dataSources,
      status,
      source,
      isStorageHydrated,
      isSupabaseLoaded,
      hasDataset: dataset !== null,
      counts: dataset
        ? {
            clientes: dataset.clientes.length,
            ventas: dataset.ventas.length,
            articulos: dataset.articulos.length,
            aplicaciones: dataset.aplicaciones.length,
          }
        : null,
    });
  }, [dataset, dataMode, dataSources, status, source, isStorageHydrated, isSupabaseLoaded]);

  return {
    data,
    source,
    dataMode,
    dataSources,
    status,
    configError,
    generatedAt,
    warnings,
    isMock: dataMode === "mock",
    isEmpty,
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
    return "Legacy · Supabase";
  }
  if (source === "excel") {
    if (options?.persistedLocally) {
      return "Legacy · Excel (persistido local)";
    }
    if (options?.inMemoryOnly) {
      return "Legacy · Excel (solo en memoria)";
    }
    return "Legacy · Excel";
  }
  if (source === "mock") {
    return "Mock (explícito)";
  }
  return "Sin datos";
}
