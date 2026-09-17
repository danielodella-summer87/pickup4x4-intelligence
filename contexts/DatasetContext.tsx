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
import { resolveHydrationAction, resolveLegacyHydration, resolveServerLoadOutcome, type DatasetStatus } from "@/lib/data/dataset-hydration";
import type { DatasetProvenance } from "@/lib/data/mixed-dataset";
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
import { configuredDataSources } from "@/lib/data/source-config";
import type { DataMode, DomainSources } from "@/lib/data/sources";
import { type SupabaseConnectionStatus } from "@/lib/supabase/connection";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";

/**
 * Origen concreto del dataset activo:
 * - supabase / excel → fuente legacy (tablas Supabase o Excel importado en este navegador)
 * - mixed           → catálogo KORE normalizado + ventas/clientes/aplicaciones legacy (servidor)
 * - mock            → fuente mock elegida EXPLÍCITAMENTE (NEXT_PUBLIC_PICKUP_DATA_SOURCE=mock)
 * - none            → sin datos (legacy vacío, cargando, error o configuración inválida)
 *
 * No existe fallback silencioso legacy vacío → mock.
 */
export type DatasetSource = "supabase" | "excel" | "mixed" | "mock" | "none";

export type { DatasetPersistResult, DatasetStatus };

export type DatasetSetResult = DatasetPersistResult;

type DatasetContextValue = {
  dataset: PickupDataset | null;
  source: DatasetSource;
  /** legacy | mixed | mock según configuración explícita; null si la configuración es inválida. */
  dataMode: DataMode | null;
  /** Fuente resuelta por dominio (catalog, sales, customers, applications). */
  dataSources: DomainSources | null;
  status: DatasetStatus;
  /** Procedencia por dominio informada por el servidor (catálogo, joins); null en mock. */
  provenance: DatasetProvenance | null;
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
const SOURCE_RESOLUTION = configuredDataSources();

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

function statusForAction(action: ReturnType<typeof resolveHydrationAction>): DatasetStatus {
  if (action === "clear-unauthenticated") return "unauthenticated";
  if (action === "config-error") return "error";
  return action === "mock-ready" ? "ready" : "loading";
}

/**
 * `isAuthenticated` lo calcula el layout raíz (server) desde la cookie de sesión. Es la
 * dependencia que hace que login y logout invaliden el dataset.
 */
export function DatasetProvider({ children, isAuthenticated }: { children: ReactNode; isAuthenticated: boolean }) {
  const resolution = SOURCE_RESOLUTION;
  const dataMode: DataMode | null = resolution.ok ? resolution.mode : null;
  const dataSources: DomainSources | null = resolution.ok ? resolution.sources : null;
  const configError = resolution.ok ? null : `${resolution.code}: ${resolution.message}`;
  const isLegacyMode = dataMode === "legacy" && isAuthenticated;
  const hydrationAction = resolveHydrationAction({ isAuthenticated, configOk: resolution.ok, mode: dataMode });

  const [dataset, setDatasetState] = useState<PickupDataset | null>(null);
  const [source, setSource] = useState<DatasetSource>(hydrationAction === "mock-ready" ? "mock" : "none");
  const [status, setStatus] = useState<DatasetStatus>(() => statusForAction(hydrationAction));
  const [provenance, setProvenance] = useState<DatasetProvenance | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [warnings, setWarnings] = useState<DatasetWarning[]>([]);
  const [oportunidadesSupabase, setOportunidadesSupabase] = useState<
    OportunidadDetectada[] | null
  >(null);
  const [hasLocalPersistence, setHasLocalPersistence] = useState(false);
  const [hasSupabasePersistence, setHasSupabasePersistence] = useState(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState(hydrationAction !== "load-from-server");
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
    // Una acción por fase (sesión + configuración): determinística, sin polling ni reintentos.
    supabaseResolvedRef.current = false;

    if (hydrationAction === "clear-unauthenticated") {
      // Sin sesión no se pide nada (evita el 401 que antes quedaba pegado tras el login).
      // El estado ya nace vacío: el layout remonta el provider al cambiar la sesión, así que
      // tampoco queda en memoria el dataset privado anterior (logout).
      logHydration("sin sesión — sin carga y sin datos visibles");
      clearSessionExcelDataset();
      return;
    }

    if (hydrationAction === "config-error") {
      logHydration("configuración de fuentes inválida — sin datos", resolution.ok ? null : resolution.code);
      return;
    }

    if (hydrationAction === "mock-ready") {
      logHydration("fuente mock explícita — sin carga del servidor");
      return;
    }

    if (!resolution.ok) return;

    let cancelled = false;
    const controller = new AbortController();
    // Red de seguridad: la carga no puede quedar colgada indefinidamente. Se alinea con el
    // presupuesto del endpoint (`maxDuration = 60` en load-dataset): con el dataset actual
    // (~16 MB, ~17 s) un corte menor abortaba cargas legítimas. Sin reintentos: si falla,
    // el estado queda en error explícito.
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    void (async () => {
      const mode: "legacy" | "mixed" = resolution.mode === "mixed" ? "mixed" : "legacy";
      logHydration(mode === "mixed" ? "cargando dataset mixto (catálogo KORE + resto legacy)" : "intentando cargar legacy (Supabase)");
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
          status: parsed.status,
          errorCode: parsed.errorCode,
          provenance: parsed.provenance?.sources ?? null,
          hasDataset: Boolean(parsed.dataset),
          clientes: parsed.dataset?.clientes.length,
          ventas: parsed.dataset?.ventas.length,
          articulos: parsed.dataset?.articulos.length,
          aplicaciones: parsed.dataset?.aplicaciones.length,
        });

        const outcome = resolveServerLoadOutcome(mode, resolution.sources, {
          httpOk: res.ok,
          ok: parsed.ok,
          status: parsed.status,
          errorCode: parsed.errorCode,
          hasDataset: parsed.dataset !== null,
          provenanceSources: parsed.provenance?.sources ?? null,
          errorMessage: parsed.errorMessage ?? (res.ok ? null : `HTTP ${res.status}`),
        });

        if (outcome.kind === "apply" && parsed.dataset) {
          const loadedAt = parsed.generatedAt ?? new Date();
          supabaseResolvedRef.current = true;
          setDatasetState(parsed.dataset);
          setProvenance(parsed.provenance);
          setSource(outcome.source);
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
          // Solo legacy puro: la copia de sesión es un respaldo legacy. Un dataset mixto nunca se
          // guarda localmente (luego podría servirse como "legacy" sin serlo).
          if (outcome.persistSessionCopy) setSessionExcelDataset(parsed.dataset, loadedAt);
          setIsStorageHydrated(true);
          logHydration(outcome.source === "mixed" ? "dataset mixto OK" : "legacy (Supabase) OK");
          return;
        }

        if (outcome.kind === "final") {
          supabaseResolvedRef.current = true;
          logHydration(`estado final explícito: ${outcome.status}`, outcome.code);
          setDatasetState(null);
          setProvenance(parsed.provenance);
          setSource("none");
          setStatus(outcome.status);
          setGeneratedAt(null);
          setWarnings([]);
          setOportunidadesSupabase(null);
          setHasLocalPersistence(false);
          setHasSupabasePersistence(false);
          setIsSupabaseLoaded(false);
          setSupabaseError(outcome.status === "error" ? [outcome.code, outcome.message].filter(Boolean).join(": ") : null);
          setSupabaseConnection({
            configured: res.status !== 503,
            connected: res.ok,
            message: outcome.status === "error" ? outcome.code : "Sin datos",
          });
          setIsStorageHydrated(true);
          return;
        }

        if (outcome.kind === "continue-legacy" && !outcome.supabaseOk) {
          supabaseErrorMessage = outcome.errorMessage ?? `HTTP ${res.status}`;
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
        if (mode === "mixed") {
          // Sin fallback a copias locales (catálogo legacy) ni a mock.
          supabaseResolvedRef.current = true;
          setDatasetState(null);
          setSource("none");
          setStatus("error");
          setIsStorageHydrated(true);
          return;
        }
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
  }, [resolution, hydrationAction]);

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
              : dataMode === "mixed"
                ? "El catálogo activo es KORE: la importación de Excel (catálogo legacy) está deshabilitada en este modo."
                : !isAuthenticated
                  ? "Sesión no válida: la importación está deshabilitada."
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
    [isLegacyMode, dataMode, isAuthenticated],
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
      provenance,
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
      provenance,
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
