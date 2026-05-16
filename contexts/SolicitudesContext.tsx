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
import type {
  CreateSolicitudInput,
  SolicitudLocal,
  SolicitudLocalEstado,
} from "@/lib/models/solicitud";

const STORAGE_KEY = "pickup4x4:solicitudes";
const STORAGE_VERSION = 1;

type PersistedSolicitudesPayload = {
  version: number;
  solicitudes: SolicitudLocal[];
};

type SolicitudesContextValue = {
  solicitudes: SolicitudLocal[];
  isHydrated: boolean;
  createSolicitud: (input: CreateSolicitudInput) => SolicitudLocal;
  updateSolicitudEstado: (id: string, estado: SolicitudLocalEstado) => void;
  deleteSolicitud: (id: string) => void;
  clearSolicitudes: () => void;
};

const SolicitudesContext = createContext<SolicitudesContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidSolicitudLocal(value: unknown): value is SolicitudLocal {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.fecha !== "string") return false;
  if (typeof value.nombre !== "string") return false;
  if (typeof value.telefono !== "string") return false;
  if (typeof value.observaciones !== "string") return false;
  if (typeof value.marcaVehiculo !== "string") return false;
  if (typeof value.modeloVehiculo !== "string") return false;
  if (value.origen !== "mostrador") return false;
  if (
    value.estado !== "nueva" &&
    value.estado !== "en_revision" &&
    value.estado !== "enviada" &&
    value.estado !== "descartada"
  ) {
    return false;
  }
  if (!Array.isArray(value.articulos)) return false;
  return value.articulos.every(
    (item) =>
      isRecord(item) &&
      typeof item.codigoUnico === "string" &&
      typeof item.descripcion === "string",
  );
}

function readSolicitudesFromStorage(): SolicitudLocal[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    if (!Array.isArray(parsed.solicitudes)) return [];

    const valid = parsed.solicitudes.filter(isValidSolicitudLocal);
    if (valid.length !== parsed.solicitudes.length) {
      writeSolicitudesToStorage(valid);
    }
    return valid;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

function writeSolicitudesToStorage(solicitudes: SolicitudLocal[]): void {
  if (typeof window === "undefined") return;

  const payload: PersistedSolicitudesPayload = {
    version: STORAGE_VERSION,
    solicitudes,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}

function generateSolicitudId(): string {
  return `sol-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SolicitudesProvider({ children }: { children: ReactNode }) {
  const [solicitudes, setSolicitudes] = useState<SolicitudLocal[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setSolicitudes(readSolicitudesFromStorage());
    setIsHydrated(true);
  }, []);

  const persist = useCallback((next: SolicitudLocal[]) => {
    setSolicitudes(next);
    writeSolicitudesToStorage(next);
  }, []);

  const createSolicitud = useCallback(
    (input: CreateSolicitudInput): SolicitudLocal => {
      const solicitud: SolicitudLocal = {
        id: generateSolicitudId(),
        fecha: new Date().toISOString(),
        nombre: input.nombre.trim(),
        telefono: input.telefono.trim(),
        observaciones: input.observaciones.trim(),
        marcaVehiculo: input.marcaVehiculo.trim(),
        modeloVehiculo: input.modeloVehiculo.trim(),
        articulos: input.articulos.map((a) => ({
          codigoUnico: a.codigoUnico,
          descripcion: a.descripcion,
          categoria: a.categoria,
          rubro: a.rubro,
        })),
        origen: input.origen ?? "mostrador",
        estado: "nueva",
      };

      setSolicitudes((prev) => {
        const next = [solicitud, ...prev];
        writeSolicitudesToStorage(next);
        return next;
      });

      return solicitud;
    },
    [],
  );

  const updateSolicitudEstado = useCallback(
    (id: string, estado: SolicitudLocalEstado) => {
      setSolicitudes((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, estado } : s));
        writeSolicitudesToStorage(next);
        return next;
      });
    },
    [],
  );

  const deleteSolicitud = useCallback((id: string) => {
    setSolicitudes((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeSolicitudesToStorage(next);
      return next;
    });
  }, []);

  const clearSolicitudes = useCallback(() => {
    persist([]);
  }, [persist]);

  const value = useMemo(
    () => ({
      solicitudes,
      isHydrated,
      createSolicitud,
      updateSolicitudEstado,
      deleteSolicitud,
      clearSolicitudes,
    }),
    [
      solicitudes,
      isHydrated,
      createSolicitud,
      updateSolicitudEstado,
      deleteSolicitud,
      clearSolicitudes,
    ],
  );

  return (
    <SolicitudesContext.Provider value={value}>{children}</SolicitudesContext.Provider>
  );
}

export function useSolicitudes(): SolicitudesContextValue {
  const context = useContext(SolicitudesContext);
  if (!context) {
    throw new Error("useSolicitudes debe usarse dentro de SolicitudesProvider");
  }
  return context;
}
