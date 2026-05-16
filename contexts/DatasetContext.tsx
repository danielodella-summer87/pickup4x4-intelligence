"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DatasetWarning, PickupDataset } from "@/lib/excel/build-dataset";
import { parseLoadDatasetApiBody } from "@/lib/data/coerce-pickup-dataset";
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

/** Logs de hidratación visibles también en producción (DevTools). */
function logHydration(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[DatasetContext] ${message}`, detail);
  } else {
    console.info(`[DatasetContext] ${message}`);
  }
}

function applySupabaseDataset(
  loaded: PickupDataset,
  generatedAt: Date | null,
  oportunidades: OportunidadDetectada[],
): {
  dataset: PickupDataset;
  generatedAt: Date | null;
  warnings: DatasetWarning[];
  oportunidades: OportunidadDetectada[];
} {
  return {
    dataset: loaded,
    generatedAt,
    warnings: loaded.warnings ?? [],
    oportunidades,
  };
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDatasetState] = useState<PickupDataset | null>(null);
  const [source, setSource] = useState<DatasetSource>("mock");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [warnings, setWarnings] = useState<DatasetWarning[]>([]);
  const [oportunidadesSupabase, setOportunidadesSupabase] = useState<
    OportunidadDetectada[] | null
  >(null);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(false);
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

  const supabaseResolvedRef = useRef(false);

  useEffect(() => {
    void verifySupabaseConnection().then(setSupabaseConnection);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      logHydration("intentando cargar Supabase");

      try {
        const res = await fetch("/api/supabase/load-dataset", {
          method: "GET",
          cache: "no-store",
        });
        const body: unknown = await res.json();

        if (cancelled) return;

        const parsed = parseLoadDatasetApiBody(body);

        logHydration("respuesta load-dataset", {
          httpStatus: res.status,
          ok: parsed.ok,
          hasDataset: Boolean(parsed.dataset),
          clientes: parsed.dataset?.clientes.length,
          articulos: parsed.dataset?.articulos.length,
          aplicaciones: parsed.dataset?.aplicaciones.length,
        });

        if (res.ok && parsed.ok && parsed.dataset) {
          const oportunidades = parsed.oportunidades as OportunidadDetectada[];
          const applied = applySupabaseDataset(
            parsed.dataset,
            parsed.generatedAt ?? new Date(),
            oportunidades,
          );

          supabaseResolvedRef.current = true;
          setDatasetState(applied.dataset);
          setSource("supabase");
          setGeneratedAt(applied.generatedAt);
          setWarnings(applied.warnings);
          setOportunidadesSupabase(applied.oportunidades);
          setHasSupabasePersistence(true);
          setHasLocalPersistence(false);
          setIsSupabaseLoaded(true);
          setSupabaseError(null);
          setSessionExcelDataset(
            applied.dataset,
            applied.generatedAt ?? new Date(),
          );
          setIsStorageHydrated(true);

          logHydration("Supabase OK", {
            clientes: applied.dataset.clientes.length,
            ventas: applied.dataset.ventas.length,
            articulos: applied.dataset.articulos.length,
            aplicaciones: applied.dataset.aplicaciones.length,
          });
          logHydration("usando Supabase");
          return;
        }

        if (!res.ok || !parsed.ok) {
          const errMsg = parsed.errorMessage ?? `HTTP ${res.status}`;
          setSupabaseError(errMsg);
          logHydration("Supabase falló", errMsg);
        } else if (parsed.ok && !parsed.dataset) {
          logHydration("Supabase vacío — sin dataset en la respuesta");
        } else {
          logHydration("Supabase sin datos utilizables");
        }
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "Error de red";
        setSupabaseError(msg);
        logHydration("Supabase error de red", msg);
      }

      if (cancelled || supabaseResolvedRef.current) return;

      const session = getSessionExcelSnapshot();
      if (session) {
        logHydration("fallback local (memoria de sesión)");
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
      if (cancelled || supabaseResolvedRef.current) return;

      if (payload) {
        logHydration("fallback local (IndexedDB / localStorage)");
        setDatasetState(payload.dataset);
        setSource("excel");
        setGeneratedAt(new Date(payload.generatedAt));
        setWarnings(payload.warnings);
        setOportunidadesSupabase(null);
        setHasLocalPersistence(hasDurableExcelStorage());
        setHasSupabasePersistence(false);
        setIsSupabaseLoaded(false);
        setIsStorageHydrated(true);
        return;
      }

      logHydration("fallback mock");
      setDatasetState(null);
      setSource("mock");
      setGeneratedAt(null);
      setWarnings([]);
      setOportunidadesSupabase(null);
      setHasLocalPersistence(false);
      setHasSupabasePersistence(false);
      setIsSupabaseLoaded(false);
      setIsStorageHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setDataset = useCallback(async (next: PickupDataset) => {
    const at = new Date();
    logHydration("setDataset (solo local)", {
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

      if (result.ok === true) {
        setSource("supabase");
        setHasSupabasePersistence(true);
        setIsSupabaseLoaded(true);
        setSupabaseError(null);
        const active = pickupDatasetToActiveData(dataset);
        setOportunidadesSupabase(
          detectarOportunidadesComerciales(active, "excel"),
        );
        logHydration("Guardado en Supabase OK", result);
      } else {
        const errText = [
          result.errorMessage,
          result.httpStatus ? `(HTTP ${result.httpStatus})` : null,
          result.technicalDetail,
        ]
          .filter(Boolean)
          .join(" — ");
        setSupabaseError(errText || "No se pudo guardar en Supabase");
        logHydration("Guardado en Supabase falló", result);
      }

      return result;
    } finally {
      setIsSavingToSupabase(false);
    }
  }, [dataset, generatedAt]);

  const clearDataset = useCallback(() => {
    logHydration("clearDataset");
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
