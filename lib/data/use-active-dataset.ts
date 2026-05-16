"use client";

import { useMemo } from "react";
import { useDataset } from "@/contexts/DatasetContext";
import type { DatasetSource } from "@/contexts/DatasetContext";
import type { DatasetWarning } from "@/lib/excel/build-dataset";
import {
  mockPickupDataToActive,
  pickupDatasetToActiveData,
  type ActivePickupData,
} from "@/lib/data/pickup-data";

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
    return mockPickupDataToActive();
  }, [dataset]);

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
  options?: { persistedLocally?: boolean },
): string {
  if (source === "excel") {
    return options?.persistedLocally
      ? "Excel (persistido local)"
      : "Excel";
  }
  return "Mock";
}
