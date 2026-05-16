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
import { detectarOportunidadesComerciales } from "@/lib/data/oportunidades-engine";
import { pickupDatasetToActiveData } from "@/lib/data/pickup-data";
import {
  loadDatasetFromSupabase,
  saveDatasetToSupabase,
  clearSupabaseDataset,
  type SupabaseDatasetSaveResult,
} from "@/lib/data/supabase-dataset";
import { verifySupabaseConnection, type SupabaseConnectionStatus } from "@/lib/supabase/connection";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";

export type DatasetSource = "mock" | "excel" | "supabase";

export type { DatasetPersistResult };

export type DatasetSetResult = DatasetPersistResult;

type DatasetContextValue = {
  dataset: PickupDataset | null;
  source: DatasetSource;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  oportunidadesSupabase: OportunidadDetectada[] | null;
  hasLocalPersistence: boolean;
  hasSupabasePersistence: boolean;
  isStorageHydrated: boolean;
  isSupabaseLoaded: boolean;
  supabaseError: string | null;
  supabaseConnection: SupabaseConnectionStatus | null;
  lastPersistResult: DatasetPersistResult | null;
  lastSupabaseResult: SupabaseDatasetSaveResult | null;
  isSavingToSupabase: boolean;
  setDataset: (dataset: PickupDataset) => Promise<DatasetSetResult>;
  saveToSupabase: () => Promise<SupabaseDatasetSaveResult>;
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
  const [oportunidadesSupabase, setOportunidadesSupabase] = useState<
    OportunidadDetectada[] | null
  >(null);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(
    initial.hasLocalPersistence,
  );
  const [hasSupabasePersistence, setHasSupabasePersistence] = useState(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [isSupabaseLoaded, setIsSupabaseLoaded] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [supabaseConnection, setSupabaseConnection] =
    useState<SupabaseConnectionStatus | null>(null);
  const [lastPersistResult, setLastPersistResult] =
    useState<DatasetPersistResult | null>(null);
  const [lastSupabaseResult, setLastSupabaseResult] =
    useState<SupabaseDatasetSaveResult | null>(null);
  const [isSavingToSupabase, setIsSavingToSupabase] = useState(false);

  useEffect(() => {
    if (isSupabaseServiceConfigured()) {
      void verifySupabaseConnection().then(setSupabaseConnection);
    } else {
      setSupabaseConnection({
        configured: false,
        connected: false,
        message: "API Supabase: falta SUPABASE_SERVICE_ROLE_KEY en el servidor",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      devLog("Hidratando: 1 Supabase → 2 local → 3 mock");

      if (isSupabaseServiceConfigured()) {
        const supabaseLoad = await loadDatasetFromSupabase();
        if (cancelled) return;

        if (supabaseLoad.ok && supabaseLoad.dataset) {
          setDatasetState(supabaseLoad.dataset);
          setSource("supabase");
          setGeneratedAt(supabaseLoad.generatedAt);
          setWarnings(supabaseLoad.dataset.warnings);
          setOportunidadesSupabase(supabaseLoad.oportunidades);
          setHasSupabasePersistence(true);
          setHasLocalPersistence(false);
          setIsSupabaseLoaded(true);
          setSupabaseError(null);
          setSessionExcelDataset(
            supabaseLoad.dataset,
            supabaseLoad.generatedAt ?? new Date(),
          );
          devLog("Dataset desde Supabase", {
            clientes: supabaseLoad.dataset.clientes.length,
          });
          setIsStorageHydrated(true);
          return;
        }

        if (!supabaseLoad.ok) {
          setSupabaseError(supabaseLoad.errorMessage ?? "Error al cargar Supabase");
          devLog("Supabase falló, fallback local", supabaseLoad.errorMessage);
        } else {
          setSupabaseError(null);
          devLog("Supabase vacío, probando almacenamiento local");
        }
      }

      const session = getSessionExcelSnapshot();
      if (session && !cancelled) {
        setDatasetState(session.dataset);
        setSource("excel");
        setGeneratedAt(session.generatedAt);
        setWarnings(session.warnings);
        setOportunidadesSupabase(null);
        setHasLocalPersistence(hasDurableExcelStorage());
        setHasSupabasePersistence(false);
        setIsSupabaseLoaded(false);
        setIsStorageHydrated(true);
        return;
      }

      const payload = await hydrateExcelDataset();
      if (cancelled) return;

      if (payload) {
        setDatasetState(payload.dataset);
        setSource("excel");
        setGeneratedAt(new Date(payload.generatedAt));
        setWarnings(payload.warnings);
        setOportunidadesSupabase(null);
        setHasLocalPersistence(hasDurableExcelStorage());
        setHasSupabasePersistence(false);
        setIsSupabaseLoaded(false);
        devLog("Dataset desde almacenamiento local");
      } else {
        setSource("mock");
        devLog("Sin datos — mock");
      }

      setIsStorageHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setDataset = useCallback(async (next: PickupDataset) => {
    const at = new Date();
    devLog("setDataset (solo local)", {
      clientes: next.clientes.length,
      ventas: next.ventas.length,
    });

    setSessionExcelDataset(next, at);
    setDatasetState(next);
    setSource("excel");
    setGeneratedAt(at);
    setWarnings(next.warnings);
    setOportunidadesSupabase(null);
    setHasSupabasePersistence(false);
    setIsSupabaseLoaded(false);
    setIsStorageHydrated(true);

    const persistResult = await persistExcelDataset(next, at);
    setLastPersistResult(persistResult);
    setHasLocalPersistence(persistResult.persistedDurably);

    return persistResult;
  }, []);

  const saveToSupabase = useCallback(async (): Promise<SupabaseDatasetSaveResult> => {
    if (!dataset || !generatedAt) {
      const emptyCounts = {
        clientes: 0,
        ventas: 0,
        articulos: 0,
        aplicaciones: 0,
        oportunidades: 0,
      };
      const result: SupabaseDatasetSaveResult = {
        ok: false,
        counts: emptyCounts,
        errorMessage: "Generá el dataset desde Excel antes de guardar en Supabase",
        durationMs: 0,
      };
      setLastSupabaseResult(result);
      setSupabaseError(result.errorMessage ?? null);
      return result;
    }

    setIsSavingToSupabase(true);
    setSupabaseError(null);

    try {
      const result = await saveDatasetToSupabase(dataset, generatedAt);
      setLastSupabaseResult(result);

      if (result.ok) {
        setSource("supabase");
        setHasSupabasePersistence(true);
        setIsSupabaseLoaded(true);
        setSupabaseError(null);
        const active = pickupDatasetToActiveData(dataset);
        setOportunidadesSupabase(
          detectarOportunidadesComerciales(active, "excel"),
        );
        devLog("Guardado en Supabase OK", result);
      } else {
        setSupabaseError(result.errorMessage ?? "No se pudo guardar en Supabase");
      }

      return result;
    } finally {
      setIsSavingToSupabase(false);
    }
  }, [dataset, generatedAt]);

  const clearDataset = useCallback(() => {
    devLog("clearDataset");
    setDatasetState(null);
    setSource("mock");
    setGeneratedAt(null);
    setWarnings([]);
    setOportunidadesSupabase(null);
    setLastPersistResult(null);
    setLastSupabaseResult(null);
    setSupabaseError(null);
    setIsSupabaseLoaded(false);
    removePersistedExcelDataset();
    clearSessionExcelDataset();
    setHasLocalPersistence(false);
    setHasSupabasePersistence(false);
    setIsStorageHydrated(true);
    void clearSupabaseDataset();
  }, []);

  const value = useMemo(
    () => ({
      dataset,
      source,
      generatedAt,
      warnings,
      oportunidadesSupabase,
      hasLocalPersistence,
      hasSupabasePersistence,
      isStorageHydrated,
      isSupabaseLoaded,
      supabaseError,
      supabaseConnection,
      lastPersistResult,
      lastSupabaseResult,
      isSavingToSupabase,
      setDataset,
      saveToSupabase,
      clearDataset,
      clearLocalDataset: clearDataset,
    }),
    [
      dataset,
      source,
      generatedAt,
      warnings,
      oportunidadesSupabase,
      hasLocalPersistence,
      hasSupabasePersistence,
      isStorageHydrated,
      isSupabaseLoaded,
      supabaseError,
      supabaseConnection,
      lastPersistResult,
      lastSupabaseResult,
      isSavingToSupabase,
      setDataset,
      saveToSupabase,
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
