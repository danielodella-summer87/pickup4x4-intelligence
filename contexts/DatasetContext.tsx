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
import type { DatasetWarning, PickupDataset } from "@/lib/excel/build-dataset";
import {
  clearSessionExcelDataset,
  type DatasetPersistResult,
  getSessionExcelSnapshot,
  hasDurableExcelStorage,
  hydrateExcelDataset,
  persistExcelDataset,
  removePersistedExcelDataset,
  setSessionExcelDataset,
} from "@/lib/data/excel-dataset-persistence";

export type DatasetSource = "mock" | "excel";

export type { DatasetPersistResult };

type DatasetContextValue = {
  dataset: PickupDataset | null;
  source: DatasetSource;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  /** Dataset Excel guardado en localStorage o IndexedDB de este navegador */
  hasLocalPersistence: boolean;
  /** true tras intentar hidratar almacenamiento (cliente) */
  isStorageHydrated: boolean;
  /** Último resultado al llamar setDataset (null si nunca se generó) */
  lastPersistResult: DatasetPersistResult | null;
  setDataset: (dataset: PickupDataset) => Promise<DatasetPersistResult>;
  clearDataset: () => void;
  clearLocalDataset: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

function devLog(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[DatasetContext] ${message}`, detail);
    } else {
      console.info(`[DatasetContext] ${message}`);
    }
  }
}

function readInitialContextState(): {
  dataset: PickupDataset | null;
  source: DatasetSource;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  hasLocalPersistence: boolean;
} {
  const snapshot = getSessionExcelSnapshot();
  if (!snapshot) {
    return {
      dataset: null,
      source: "mock",
      generatedAt: null,
      warnings: [],
      hasLocalPersistence: false,
    };
  }

  devLog("Estado inicial desde memoria de sesión", {
    clientes: snapshot.dataset.clientes.length,
    ventas: snapshot.dataset.ventas.length,
  });

  return {
    dataset: snapshot.dataset,
    source: "excel",
    generatedAt: snapshot.generatedAt,
    warnings: snapshot.warnings,
    hasLocalPersistence: hasDurableExcelStorage(),
  };
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => readInitialContextState(), []);

  const [dataset, setDatasetState] = useState<PickupDataset | null>(initial.dataset);
  const [source, setSource] = useState<DatasetSource>(initial.source);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(initial.generatedAt);
  const [warnings, setWarnings] = useState<DatasetWarning[]>(initial.warnings);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(
    initial.hasLocalPersistence,
  );
  const [isStorageHydrated, setIsStorageHydrated] = useState(
    () => initial.source === "excel",
  );
  const [lastPersistResult, setLastPersistResult] =
    useState<DatasetPersistResult | null>(null);

  useEffect(() => {
    if (initial.source === "excel") {
      setHasLocalPersistence(hasDurableExcelStorage());
      devLog("Sesión Excel ya activa — omitiendo hydrate bloqueante");
      return;
    }

    let cancelled = false;

    void (async () => {
      devLog("Hidratando dataset desde almacenamiento…");
      const payload = await hydrateExcelDataset();

      if (cancelled) return;

      if (payload) {
        setDatasetState(payload.dataset);
        setSource("excel");
        setGeneratedAt(new Date(payload.generatedAt));
        setWarnings(payload.warnings);
        setHasLocalPersistence(hasDurableExcelStorage());
        devLog("Dataset Excel restaurado", {
          source: "excel",
          clientes: payload.dataset.clientes.length,
          ventas: payload.dataset.ventas.length,
        });
      } else {
        devLog("Sin dataset persistido — usando mock hasta importar");
      }

      setIsStorageHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [initial.source]);

  const setDataset = useCallback(async (next: PickupDataset) => {
    const at = new Date();
    devLog("setDataset llamado", {
      clientes: next.clientes.length,
      ventas: next.ventas.length,
      articulos: next.articulos.length,
      aplicaciones: next.aplicaciones.length,
    });

    setSessionExcelDataset(next, at);
    setDatasetState(next);
    setSource("excel");
    setGeneratedAt(at);
    setWarnings(next.warnings);
    setIsStorageHydrated(true);

    const persistResult = await persistExcelDataset(next, at);
    setLastPersistResult(persistResult);
    setHasLocalPersistence(persistResult.persistedDurably);

    devLog("setDataset completado", {
      source: "excel",
      persistResult,
    });

    return persistResult;
  }, []);

  const clearDataset = useCallback(() => {
    devLog("clearDataset — volver a mock");
    setDatasetState(null);
    setSource("mock");
    setGeneratedAt(null);
    setWarnings([]);
    setLastPersistResult(null);
    removePersistedExcelDataset();
    clearSessionExcelDataset();
    setHasLocalPersistence(false);
    setIsStorageHydrated(true);
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
      lastPersistResult,
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
      lastPersistResult,
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
