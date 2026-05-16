"use client";

import { useEffect, useMemo } from "react";
import { useDataset } from "@/contexts/DatasetContext";
import type { DatasetSource } from "@/contexts/DatasetContext";
import type { DatasetWarning } from "@/lib/excel/build-dataset";
import {
  mockPickupDataToActive,
  pickupDatasetToActiveData,
  type ActivePickupData,
} from "@/lib/data/pickup-data";

function devWarnExcelWithoutDataset(): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[useActiveDataset] source=excel pero dataset=null — usando mock temporalmente",
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
  /** Dataset Excel restaurado o guardado en localStorage */
  isPersistedLocally: boolean;
  isStorageHydrated: boolean;
};

export function useActiveDataset(): ActiveDataset {
  const {
    dataset,
    source,
    generatedAt,
    warnings,
    hasLocalPersistence,
    isStorageHydrated,
  } = useDataset();

  const data = useMemo(() => {
    if (dataset) {
      return pickupDatasetToActiveData(dataset);
    }
    if (source === "excel") {
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
      isPersistedLocally: source === "excel" && hasLocalPersistence,
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
  }, [dataset, source, hasLocalPersistence, isStorageHydrated]);

  return {
    data,
    source,
    generatedAt,
    warnings,
    isMock: source === "mock",
    isExcel: source === "excel",
    isPersistedLocally: source === "excel" && hasLocalPersistence,
    isStorageHydrated,
  };
}

export function formatDatasetSourceLabel(
  source: DatasetSource,
  options?: { persistedLocally?: boolean; inMemoryOnly?: boolean },
): string {
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
