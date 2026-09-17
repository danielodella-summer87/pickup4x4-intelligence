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
import { resolveLegacyHydration, type DatasetStatus } from "@/lib/data/dataset-hydration";
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
  saveDatasetToSupabase,
  type SupabaseDatasetSaveResult,
} from "@/lib/data/supabase-dataset";
import { resolveDataSources, type DataMode, type DomainSources } from "@/lib/data/sources";
import { type SupabaseConnectionStatus } from "@/lib/supabase/connection";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";

/**
 * Origen concreto del dataset activo:
 * - supabase / excel → fuente legacy (tablas Supabase o Excel importado en este navegador)
 * - mock            → fuente mock elegida EXPLÍCITAMENTE (NEXT_PUBLIC_PICKUP_DATA_SOURCE=mock)
 * - none            → sin datos (legacy vacío, cargando, error o configuración inválida)
 *
 * No existe fallback silencioso legacy vacío → mock.
 */
export type DatasetSource = "supabase" | "excel" | "mock" | "none";

export type { DatasetPersistResult, DatasetStatus };

export type DatasetSetResult = DatasetPersistResult;

type DatasetContextValue = {
  dataset: PickupDataset | null;
  source: DatasetSource;
  /** legacy | mock según configuración explícita; null si la configuración es inválida. */
  dataMode: DataMode | null;
  /** Fuente resuelta por dominio (catalog, sales, customers, applications). */
  dataSources: DomainSources | null;
  status: DatasetStatus;
  configError: string | null;
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
  /** Borra SOLO la copia local del Excel (sesión + IndexedDB/localStorage). Nunca toca Supabase. */
  clearLocalDataset: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

/**
 * Configuración de fuentes. `process.env.NEXT_PUBLIC_*` se inyecta en build; sin valores,
 * todos los dominios usan legacy.
 */
const SOURCE_RESOLUTION = resolveDataSources({
  dataSource: process.env.NEXT_PUBLIC_PICKUP_DATA_SOURCE,
  catalogSource: process.env.NEXT_PUBLIC_PICKUP_CATALOG_SOURCE,
});

const EMPTY_SAVE_COUNTS = {
  clientes: 0,
  ventas: 0,
  articulos: 0,
  aplicaciones: 0,
  oportunidades: 0,
};

/** Logs de hidratación visibles también en producción (DevTools). */
function logHydration(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[DatasetContext] ${message}`, detail);
  } else {
    console.info(`[DatasetContext] ${message}`);
  }
}

function initialStatus(): DatasetStatus {
  if (!SOURCE_RESOLUTION.ok) return "error";
  return SOURCE_RESOLUTION.mode === "mock" ? "ready" : "loading";
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const resolution = SOURCE_RESOLUTION;
  const dataMode: DataMode | null = resolution.ok ? resolution.mode : null;
  const dataSources: DomainSources | null = resolution.ok ? resolution.sources : null;
  const configError = resolution.ok ? null : `${resolution.code}: ${resolution.message}`;
  const isLegacyMode = dataMode === "legacy";

  const [dataset, setDatasetState] = useState<PickupDataset | null>(null);
  const [source, setSource] = useState<DatasetSource>(dataMode === "mock" ? "mock" : "none");
  const [status, setStatus] = useState<DatasetStatus>(initialStatus);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [warnings, setWarnings] = useState<DatasetWarning[]>([]);
  const [oportunidadesSupabase, setOportunidadesSupabase] = useState<
    OportunidadDetectada[] | null
  >(null);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(false);
  const [hasSupabasePersistence, setHasSupabasePersistence] = useState(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState(!isLegacyMode);
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
    if (!resolution.ok) {
      logHydration("configuración de fuentes inválida — sin datos", resolution.code);
      return;
    }
    if (resolution.mode === "mock") {
      logHydration("fuente mock explícita — sin carga legacy");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    // Red de seguridad: la carga no puede quedar colgada indefinidamente.
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    void (async () => {
      logHydration("intentando cargar legacy (Supabase)");
      let supabaseOk = false;
      let supabaseErrorMessage: string | null = null;

      try {
        const res = await fetch("/api/supabase/load-dataset", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await res.json();

        if (cancelled) return;

        const parsed = parseLoadDatasetApiBody(body);

        logHydration("respuesta load-dataset", {
          httpStatus: res.status,
          ok: parsed.ok,
          hasDataset: Boolean(parsed.dataset),
          clientes: parsed.dataset?.clientes.length,
          ventas: parsed.dataset?.ventas.length,
          articulos: parsed.dataset?.articulos.length,
          aplicaciones: parsed.dataset?.aplicaciones.length,
        });

        if (res.ok && parsed.ok && parsed.dataset) {
          const loadedAt = parsed.generatedAt ?? new Date();
          supabaseResolvedRef.current = true;
          setDatasetState(parsed.dataset);
          setSource("supabase");
          setStatus("ready");
          setGeneratedAt(loadedAt);
          setWarnings(parsed.dataset.warnings ?? []);
          setOportunidadesSupabase(parsed.oportunidades as OportunidadDetectada[]);
          setHasSupabasePersistence(true);
          setHasLocalPersistence(false);
          setIsSupabaseLoaded(true);
          setSupabaseError(null);
          setSupabaseConnection({
            configured: true,
            connected: true,
            message: "Conexión con Supabase establecida",
          });
          setSessionExcelDataset(parsed.dataset, loadedAt);
          setIsStorageHydrated(true);
          logHydration("legacy (Supabase) OK");
          return;
        }

        if (!res.ok || !parsed.ok) {
          supabaseErrorMessage = parsed.errorMessage ?? `HTTP ${res.status}`;
          setSupabaseError(supabaseErrorMessage);
          setSupabaseConnection({
            configured: res.status !== 503,
            connected: false,
            message: supabaseErrorMessage,
          });
          logHydration("Supabase falló", supabaseErrorMessage);
        } else {
          supabaseOk = true;
          setSupabaseConnection({
            configured: true,
            connected: true,
            message: "Supabase conectado, sin dataset cargado",
          });
          logHydration("Supabase vacío — sin dataset en la respuesta");
        }
      } catch (error) {
        if (cancelled) return;
        const aborted = error instanceof Error && error.name === "AbortError";
        supabaseErrorMessage = aborted
          ? "La carga de Supabase tardó demasiado (timeout)."
          : error instanceof Error
            ? error.message
            : "Error de red";
        setSupabaseError(supabaseErrorMessage);
        setSupabaseConnection({ configured: true, connected: false, message: supabaseErrorMessage });
        logHydration(aborted ? "Supabase timeout" : "Supabase error de red", supabaseErrorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      if (cancelled || supabaseResolvedRef.current) return;

      const session = getSessionExcelSnapshot();
      const payload = session ? null : await hydrateExcelDataset();
      if (cancelled || supabaseResolvedRef.current) return;

      const decision = resolveLegacyHydration({
        supabase: { ok: supabaseOk, hasDataset: false, errorMessage: supabaseErrorMessage },
        hasSessionExcel: session !== null,
        hasLocalExcel: payload !== null,
      });

      if (decision.status === "ready" && session) {
        logHydration("legacy: Excel de la sesión");
        setDatasetState(session.dataset);
        setSource("excel");
        setGeneratedAt(session.generatedAt);
        setWarnings(session.warnings);
      } else if (decision.status === "ready" && payload) {
        logHydration("legacy: Excel persistido localmente (IndexedDB / localStorage)");
        setDatasetState(payload.dataset);
        setSource("excel");
        setGeneratedAt(new Date(payload.generatedAt));
        setWarnings(payload.warnings);
      } else {
        // Estado explícito: legacy vacío o no disponible. Sin mock.
        logHydration(decision.status === "error" ? "legacy no disponible" : "legacy vacío");
        setDatasetState(null);
        setSource("none");
        setGeneratedAt(null);
        setWarnings([]);
      }

      setStatus(decision.status);
      setOportunidadesSupabase(null);
      setHasLocalPersistence(decision.status === "ready" && hasDurableExcelStorage());
      setHasSupabasePersistence(false);
      setIsSupabaseLoaded(false);
      setIsStorageHydrated(true);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [resolution]);

  const setDataset = useCallback(
    async (next: PickupDataset): Promise<DatasetSetResult> => {
      if (!isLegacyMode) {
        const blocked: DatasetPersistResult = {
          memory: true,
          localStorage: "skipped",
          indexedDB: "unsupported",
          persistedDurably: false,
          errorMessage:
            dataMode === "mock"
              ? "La fuente activa es mock (explícita): la importación de Excel está deshabilitada."
              : "Configuración de fuentes inválida: la importación está deshabilitada.",
        };
        setLastPersistResult(blocked);
        return blocked;
      }

      const at = new Date();
      logHydration("setDataset (legacy, solo local)", {
        clientes: next.clientes.length,
        ventas: next.ventas.length,
      });

      setSessionExcelDataset(next, at);
      setDatasetState(next);
      setSource("excel");
      setStatus("ready");
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
    },
    [isLegacyMode, dataMode],
  );

  const saveToSupabase = useCallback(async (): Promise<SupabaseDatasetSaveResult> => {
    if (!isLegacyMode || !dataset || !generatedAt) {
      const result: SupabaseDatasetSaveResult = {
        ok: false,
        counts: EMPTY_SAVE_COUNTS,
        errorMessage: !isLegacyMode
          ? "Solo la fuente legacy puede guardarse en Supabase"
          : "Generá el dataset desde Excel antes de guardar en Supabase",
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
        setStatus("ready");
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
  }, [isLegacyMode, dataset, generatedAt]);

  const clearLocalDataset = useCallback(() => {
    logHydration("clearLocalDataset (solo copia local; Supabase intacto)");
    removePersistedExcelDataset();
    clearSessionExcelDataset();
    setHasLocalPersistence(false);
    setLastPersistResult(null);
    // Si el dataset activo era la copia local, queda legacy vacío explícito (sin mock).
    // Si venía de Supabase, se mantiene: borrar la copia local no borra la nube.
    if (source === "excel") {
      setDatasetState(null);
      setSource("none");
      setStatus("empty");
      setGeneratedAt(null);
      setWarnings([]);
      setOportunidadesSupabase(null);
    }
  }, [source]);

  const value = useMemo(
    () => ({
      dataset,
      source,
      dataMode,
      dataSources,
      status,
      configError,
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
      clearLocalDataset,
    }),
    [
      dataset,
      source,
      dataMode,
      dataSources,
      status,
      configError,
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
      clearLocalDataset,
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
