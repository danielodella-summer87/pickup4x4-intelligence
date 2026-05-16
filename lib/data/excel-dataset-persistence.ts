import type { DatasetWarning, PickupDataset } from "@/lib/excel/build-dataset";
import type { DataQualityReport } from "@/lib/excel/data-quality";
import type { SmartNormalizationReport } from "@/lib/excel/normalization";

export const EXCEL_DATASET_STORAGE_KEY = "pickup4x4:excel-dataset";
const EXCEL_DURABLE_FLAG_KEY = "pickup4x4:excel-durable";
const STORAGE_VERSION = 1;
const IDB_NAME = "pickup4x4-intelligence";
const IDB_STORE = "datasets";

export type PersistedExcelPayload = {
  version: number;
  source: "excel";
  generatedAt: string;
  warnings: DatasetWarning[];
  dataQuality: DataQualityReport;
  smartNormalization: SmartNormalizationReport;
  dataset: PickupDataset;
};

export type DatasetPersistenceLayer = "memory" | "localStorage" | "indexedDB";

export type DatasetPersistResult = {
  memory: true;
  localStorage: "ok" | "skipped" | "quota" | "error";
  indexedDB: "ok" | "unsupported" | "error";
  /** Al menos un almacenamiento durable (localStorage o IndexedDB) */
  persistedDurably: boolean;
  errorMessage?: string;
};

type SessionExcelState = {
  dataset: PickupDataset;
  generatedAt: string;
  warnings: DatasetWarning[];
};

/** Sobrevive navegación cliente aunque falle localStorage. */
let sessionExcelState: SessionExcelState | null = null;

function devLog(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[Pickup Dataset] ${message}`, detail);
    } else {
      console.info(`[Pickup Dataset] ${message}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isValidPickupDataset(value: unknown): value is PickupDataset {
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

export function isValidPersistedPayload(value: unknown): value is PersistedExcelPayload {
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

/** Reduce metadata de calidad para intentar caber en localStorage (~5MB). */
export function slimDatasetForLocalStorage(dataset: PickupDataset): PickupDataset {
  const { dataQuality, smartNormalization } = dataset;

  return {
    ...dataset,
    dataQuality: {
      ...dataQuality,
      criticalErrors: [],
      fallbacks: [],
      excludedRows: [],
      issuesBySeverity: {
        critico: dataQuality.issuesBySeverity.critico.slice(0, 20),
        revisar: dataQuality.issuesBySeverity.revisar.slice(0, 40),
        informativo: dataQuality.issuesBySeverity.informativo.slice(0, 40),
      },
      topMotivos: dataQuality.topMotivos.slice(0, 10),
      ejemploFilasProblematicas: [],
    },
    smartNormalization: {
      ...smartNormalization,
      topEquivalencias: smartNormalization.topEquivalencias.slice(0, 25),
    },
  };
}

function buildPayload(dataset: PickupDataset, generatedAt: Date): PersistedExcelPayload {
  return {
    version: STORAGE_VERSION,
    source: "excel",
    generatedAt: generatedAt.toISOString(),
    warnings: dataset.warnings,
    dataQuality: dataset.dataQuality,
    smartNormalization: dataset.smartNormalization,
    dataset,
  };
}

export function setSessionExcelDataset(
  dataset: PickupDataset,
  generatedAt: Date,
): void {
  sessionExcelState = {
    dataset,
    generatedAt: generatedAt.toISOString(),
    warnings: dataset.warnings,
  };
  devLog("Dataset en memoria de sesión", {
    clientes: dataset.clientes.length,
    ventas: dataset.ventas.length,
    articulos: dataset.articulos.length,
    aplicaciones: dataset.aplicaciones.length,
  });
}

export function clearSessionExcelDataset(): void {
  sessionExcelState = null;
  devLog("Memoria de sesión limpiada");
}

export function getSessionExcelState(): SessionExcelState | null {
  return sessionExcelState;
}

/** Estado sincronizado para inicializar React antes del hydrate async. */
export function getSessionExcelSnapshot(): {
  dataset: PickupDataset;
  generatedAt: Date;
  warnings: DatasetWarning[];
} | null {
  if (!sessionExcelState) return null;
  return {
    dataset: sessionExcelState.dataset,
    generatedAt: new Date(sessionExcelState.generatedAt),
    warnings: sessionExcelState.warnings,
  };
}

function markDurablePersisted(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EXCEL_DURABLE_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearDurablePersistedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EXCEL_DURABLE_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

export function hasDurableExcelStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(EXCEL_DURABLE_FLAG_KEY) === "1") {
      return true;
    }
    if (window.localStorage.getItem(EXCEL_DATASET_STORAGE_KEY)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function readLocalStoragePayload(): PersistedExcelPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(EXCEL_DATASET_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidPersistedPayload(parsed)) {
      window.localStorage.removeItem(EXCEL_DATASET_STORAGE_KEY);
      devLog("localStorage inválido — entrada eliminada");
      return null;
    }

    devLog("Restaurado desde localStorage", {
      clientes: parsed.dataset.clientes.length,
      ventas: parsed.dataset.ventas.length,
    });
    return parsed;
  } catch (error) {
    devLog("Error leyendo localStorage", error);
    try {
      window.localStorage.removeItem(EXCEL_DATASET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeLocalStoragePayload(
  dataset: PickupDataset,
  generatedAt: Date,
): Pick<DatasetPersistResult, "localStorage" | "errorMessage"> {
  if (typeof window === "undefined") {
    return { localStorage: "skipped" };
  }

  const slim = slimDatasetForLocalStorage(dataset);
  const payload = buildPayload(slim, generatedAt);

  try {
    const json = JSON.stringify(payload);
    const sizeMb = (json.length / (1024 * 1024)).toFixed(2);
    window.localStorage.setItem(EXCEL_DATASET_STORAGE_KEY, json);
    devLog(`Guardado en localStorage (${sizeMb} MB aprox.)`);
    return { localStorage: "ok" };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const isQuota =
      name === "QuotaExceededError" ||
      (error instanceof DOMException && error.code === 22);

    devLog("Fallo localStorage", error);

    try {
      window.localStorage.removeItem(EXCEL_DATASET_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    return {
      localStorage: isQuota ? "quota" : "error",
      errorMessage: isQuota
        ? "El dataset es demasiado grande para localStorage del navegador."
        : "No se pudo guardar en localStorage.",
    };
  }
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB no disponible"));
      return;
    }

    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function writeIndexedDbPayload(
  dataset: PickupDataset,
  generatedAt: Date,
): Promise<Pick<DatasetPersistResult, "indexedDB" | "errorMessage">> {
  if (typeof indexedDB === "undefined") {
    return { indexedDB: "unsupported" };
  }

  const payload = buildPayload(dataset, generatedAt);

  try {
    const db = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put(payload, EXCEL_DATASET_STORAGE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB write failed"));
      };
    });
    devLog("Guardado en IndexedDB", {
      clientes: dataset.clientes.length,
      ventas: dataset.ventas.length,
    });
    return { indexedDB: "ok" };
  } catch (error) {
    devLog("Fallo IndexedDB", error);
    return {
      indexedDB: "error",
      errorMessage:
        error instanceof Error
          ? `IndexedDB: ${error.message}`
          : "No se pudo guardar en IndexedDB.",
    };
  }
}

async function readIndexedDbPayload(): Promise<PersistedExcelPayload | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const db = await openIndexedDb();
    const payload = await new Promise<PersistedExcelPayload | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(EXCEL_DATASET_STORAGE_KEY);
      request.onsuccess = () => {
        const value = request.result;
        resolve(isValidPersistedPayload(value) ? value : null);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      tx.oncomplete = () => db.close();
    });

    if (payload) {
      devLog("Restaurado desde IndexedDB", {
        clientes: payload.dataset.clientes.length,
        ventas: payload.dataset.ventas.length,
      });
    }
    return payload;
  } catch (error) {
    devLog("Error leyendo IndexedDB", error);
    return null;
  }
}

function removeIndexedDbPayload(): void {
  if (typeof indexedDB === "undefined") return;

  void openIndexedDb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).delete(EXCEL_DATASET_STORAGE_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        }),
    )
    .catch(() => {
      /* ignore */
    });
}

export function removePersistedExcelDataset(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(EXCEL_DATASET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  clearDurablePersistedFlag();
  removeIndexedDbPayload();
  clearSessionExcelDataset();
  devLog("Persistencia eliminada (localStorage + IndexedDB + sesión)");
}

export async function persistExcelDataset(
  dataset: PickupDataset,
  generatedAt: Date,
): Promise<DatasetPersistResult> {
  setSessionExcelDataset(dataset, generatedAt);

  const local = writeLocalStoragePayload(dataset, generatedAt);
  const idb = await writeIndexedDbPayload(dataset, generatedAt);

  const persistedDurably = local.localStorage === "ok" || idb.indexedDB === "ok";

  if (persistedDurably) {
    markDurablePersisted();
  }

  const result: DatasetPersistResult = {
    memory: true,
    localStorage: local.localStorage,
    indexedDB: idb.indexedDB,
    persistedDurably,
    errorMessage: local.errorMessage ?? idb.errorMessage,
  };

  devLog("persistExcelDataset", result);
  return result;
}

export async function hydrateExcelDataset(): Promise<PersistedExcelPayload | null> {
  const fromSession = getSessionExcelState();
  if (fromSession) {
    devLog("Hidratación: usando memoria de sesión activa");
    return {
      version: STORAGE_VERSION,
      source: "excel",
      generatedAt: fromSession.generatedAt,
      warnings: fromSession.warnings,
      dataQuality: fromSession.dataset.dataQuality,
      smartNormalization: fromSession.dataset.smartNormalization,
      dataset: fromSession.dataset,
    };
  }

  const fromLocal = readLocalStoragePayload();
  if (fromLocal) {
    setSessionExcelDataset(fromLocal.dataset, new Date(fromLocal.generatedAt));
    markDurablePersisted();
    return fromLocal;
  }

  const fromIdb = await readIndexedDbPayload();
  if (fromIdb) {
    setSessionExcelDataset(fromIdb.dataset, new Date(fromIdb.generatedAt));
    markDurablePersisted();
    return fromIdb;
  }

  devLog("Hidratación: sin dataset Excel persistido");
  return null;
}
