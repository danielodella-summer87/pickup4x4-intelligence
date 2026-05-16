"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DataQualityReport } from "@/lib/excel/data-quality";
import type { DatasetWarning, PickupDataset } from "@/lib/excel/build-dataset";
import type { SmartNormalizationReport } from "@/lib/excel/normalization";

export type DatasetSource = "mock" | "excel";

const STORAGE_KEY = "pickup4x4:excel-dataset";
const STORAGE_VERSION = 1;

type PersistedExcelPayload = {
  version: number;
  source: "excel";
  generatedAt: string;
  warnings: DatasetWarning[];
  dataQuality: DataQualityReport;
  smartNormalization: SmartNormalizationReport;
  dataset: PickupDataset;
};

type DatasetContextValue = {
  dataset: PickupDataset | null;
  source: DatasetSource;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  /** true cuando hay dataset Excel guardado en localStorage de este navegador */
  hasLocalPersistence: boolean;
  /** true tras intentar hidratar desde localStorage (cliente) */
  isStorageHydrated: boolean;
  setDataset: (dataset: PickupDataset) => void;
  clearDataset: () => void;
  clearLocalDataset: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isValidPickupDataset(value: unknown): value is PickupDataset {
  if (!isRecord(value)) return false;
  return (
    isArray(value.clientes) &&
    isArray(value.ventas) &&
    isArray(value.ventaItems) &&
    isArray(value.articulos) &&
    isArray(value.aplicaciones) &&
    isArray(value.marcas) &&
    isArray(value.modelos) &&
    isArray(value.solicitudes) &&
    isArray(value.oportunidades) &&
    isArray(value.warnings) &&
    isRecord(value.stats) &&
    isRecord(value.dataQuality) &&
    isRecord(value.smartNormalization)
  );
}

function isValidPersistedPayload(value: unknown): value is PersistedExcelPayload {
  if (!isRecord(value)) return false;
  if (value.version !== STORAGE_VERSION) return false;
  if (value.source !== "excel") return false;
  if (typeof value.generatedAt !== "string") return false;
  if (Number.isNaN(Date.parse(value.generatedAt))) return false;
  if (!isArray(value.warnings)) return false;
  if (!isRecord(value.dataQuality)) return false;
  if (!isRecord(value.smartNormalization)) return false;
  if (!isValidPickupDataset(value.dataset)) return false;
  return true;
}

function readPersistedExcelPayload(): PersistedExcelPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidPersistedPayload(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore quota / private mode */
    }
    return null;
  }
}

function writePersistedExcelPayload(
  dataset: PickupDataset,
  generatedAt: Date,
): void {
  if (typeof window === "undefined") return;

  const payload: PersistedExcelPayload = {
    version: STORAGE_VERSION,
    source: "excel",
    generatedAt: generatedAt.toISOString(),
    warnings: dataset.warnings,
    dataQuality: dataset.dataQuality,
    smartNormalization: dataset.smartNormalization,
    dataset,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded o modo privado */
  }
}

function removePersistedExcelPayload(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function applyPersistedPayload(
  payload: PersistedExcelPayload,
  setters: {
    setDatasetState: (dataset: PickupDataset) => void;
    setSource: (source: DatasetSource) => void;
    setGeneratedAt: (date: Date) => void;
    setWarnings: (warnings: DatasetWarning[]) => void;
    setHasLocalPersistence: (value: boolean) => void;
  },
): void {
  setters.setDatasetState(payload.dataset);
  setters.setSource("excel");
  setters.setGeneratedAt(new Date(payload.generatedAt));
  setters.setWarnings(payload.warnings);
  setters.setHasLocalPersistence(true);
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDatasetState] = useState<PickupDataset | null>(null);
  const [source, setSource] = useState<DatasetSource>("mock");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [warnings, setWarnings] = useState<DatasetWarning[]>([]);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);

  useEffect(() => {
    const payload = readPersistedExcelPayload();
    if (payload) {
      applyPersistedPayload(payload, {
        setDatasetState,
        setSource,
        setGeneratedAt,
        setWarnings,
        setHasLocalPersistence,
      });
    }
    setIsStorageHydrated(true);
  }, []);

  const setDataset = useCallback((next: PickupDataset) => {
    const at = new Date();
    setDatasetState(next);
    setSource("excel");
    setGeneratedAt(at);
    setWarnings(next.warnings);
    writePersistedExcelPayload(next, at);
    setHasLocalPersistence(true);
  }, []);

  const clearDataset = useCallback(() => {
    setDatasetState(null);
    setSource("mock");
    setGeneratedAt(null);
    setWarnings([]);
    removePersistedExcelPayload();
    setHasLocalPersistence(false);
  }, []);

  const clearLocalDataset = clearDataset;

  const value = useMemo(
    () => ({
      dataset,
      source,
      generatedAt,
      warnings,
      hasLocalPersistence,
      isStorageHydrated,
      setDataset,
      clearDataset,
      clearLocalDataset,
    }),
    [
      dataset,
      source,
      generatedAt,
      warnings,
      hasLocalPersistence,
      isStorageHydrated,
      setDataset,
      clearDataset,
    ],
  );

  return (
    <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
  );
}

export function useDataset(): DatasetContextValue {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset debe usarse dentro de DatasetProvider");
  }
  return context;
}
