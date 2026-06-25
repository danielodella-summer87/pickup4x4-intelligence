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
import {
  emptyFleetProfile,
  emptyProviderProfile,
  type CompanyProspect,
  type CreateProspectInput,
  type ProductOpportunity,
  type ProspectActivity,
  type ProspectProposal,
} from "@/lib/models/prospeccion";
import {
  mockProductOpportunities,
  mockProspects,
} from "@/lib/prospeccion/mock-prospeccion";

// Persistencia local versionada. En esta fase es la única fuente; la estructura
// queda preparada para sincronizar con Supabase más adelante (ver SolicitudesContext
// como referencia del patrón remoto).
const STORAGE_KEY = "pickup4x4:prospeccion";
const STORAGE_VERSION = 1;

type PersistedPayload = {
  version: number;
  prospects: CompanyProspect[];
  productOpportunities: ProductOpportunity[];
};

type ProspeccionContextValue = {
  prospects: CompanyProspect[];
  productOpportunities: ProductOpportunity[];
  isHydrated: boolean;
  createProspect: (input: CreateProspectInput) => CompanyProspect;
  updateProspect: (id: string, changes: Partial<CompanyProspect>) => void;
  deleteProspect: (id: string) => void;
  addActivity: (
    prospectId: string,
    activity: Omit<ProspectActivity, "id">,
  ) => void;
  updateActivity: (
    prospectId: string,
    activityId: string,
    changes: Partial<ProspectActivity>,
  ) => void;
  addProposal: (
    prospectId: string,
    proposal: Omit<ProspectProposal, "id">,
  ) => void;
  createProductOpportunity: (
    opp: Omit<ProductOpportunity, "id">,
  ) => ProductOpportunity;
  updateProductOpportunity: (
    id: string,
    changes: Partial<ProductOpportunity>,
  ) => void;
  deleteProductOpportunity: (id: string) => void;
  resetToMock: () => void;
};

const ProspeccionContext = createContext<ProspeccionContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidProspect(value: unknown): value is CompanyProspect {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.nombre === "string" &&
    typeof value.rubro === "string" &&
    typeof value.etapa === "string" &&
    Array.isArray(value.contactos) &&
    Array.isArray(value.actividades) &&
    Array.isArray(value.propuestas) &&
    Array.isArray(value.necesidades) &&
    isRecord(value.flota) &&
    isRecord(value.proveedor)
  );
}

function isValidProductOpportunity(value: unknown): value is ProductOpportunity {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.producto === "string";
}

function readFromStorage(): PersistedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const prospects = Array.isArray(parsed.prospects)
      ? parsed.prospects.filter(isValidProspect)
      : [];
    const productOpportunities = Array.isArray(parsed.productOpportunities)
      ? parsed.productOpportunities.filter(isValidProductOpportunity)
      : [];
    return {
      version: STORAGE_VERSION,
      prospects,
      productOpportunities,
    };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeToStorage(
  prospects: CompanyProspect[],
  productOpportunities: ProductOpportunity[],
): void {
  if (typeof window === "undefined") return;
  const payload: PersistedPayload = {
    version: STORAGE_VERSION,
    prospects,
    productOpportunities,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ProspeccionProvider({ children }: { children: ReactNode }) {
  const [prospects, setProspects] = useState<CompanyProspect[]>([]);
  const [productOpportunities, setProductOpportunities] = useState<
    ProductOpportunity[]
  >([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Patrón del proyecto (ver SolicitudesContext): la hidratación corre en un
    // callback asíncrono para no llamar setState de forma síncrona en el efecto.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const stored = readFromStorage();
      if (stored) {
        setProspects(stored.prospects);
        setProductOpportunities(stored.productOpportunities);
      } else {
        // Primer arranque: sembrar con los datos mock iniciales y persistir.
        setProspects(mockProspects);
        setProductOpportunities(mockProductOpportunities);
        writeToStorage(mockProspects, mockProductOpportunities);
      }
      setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    (
      nextProspects: CompanyProspect[],
      nextOpps: ProductOpportunity[],
    ) => {
      setProspects(nextProspects);
      setProductOpportunities(nextOpps);
      writeToStorage(nextProspects, nextOpps);
    },
    [],
  );

  // Aplica una transformación sobre los prospects manteniendo persistencia.
  const mutateProspects = useCallback(
    (fn: (prev: CompanyProspect[]) => CompanyProspect[]) => {
      setProspects((prev) => {
        const next = fn(prev);
        setProductOpportunities((opps) => {
          writeToStorage(next, opps);
          return opps;
        });
        return next;
      });
    },
    [],
  );

  const mutateOpps = useCallback(
    (fn: (prev: ProductOpportunity[]) => ProductOpportunity[]) => {
      setProductOpportunities((prev) => {
        const next = fn(prev);
        setProspects((p) => {
          writeToStorage(p, next);
          return p;
        });
        return next;
      });
    },
    [],
  );

  const createProspect = useCallback(
    (input: CreateProspectInput): CompanyProspect => {
      const fecha = nowISO();
      const prospect: CompanyProspect = {
        id: genId("prospect"),
        nombre: input.nombre.trim(),
        rubro: input.rubro,
        subrubro: input.subrubro?.trim() || undefined,
        tipoOrganizacion: input.tipoOrganizacion,
        direccion: input.direccion?.trim() || undefined,
        localidad: input.localidad?.trim() || undefined,
        departamento: input.departamento?.trim() || undefined,
        web: input.web?.trim() || undefined,
        observaciones: input.observaciones?.trim() || undefined,
        fuente: input.fuente ?? "manual",
        esSugerida: input.esSugerida,
        categoriaSugerida: input.categoriaSugerida?.trim() || undefined,
        etapa: input.etapa ?? "lead_detectado",
        prioridad: input.prioridad ?? "media",
        contactos: [],
        flota: emptyFleetProfile(),
        proveedor: emptyProviderProfile(),
        necesidades: [],
        propuestas: [],
        actividades: [],
        creadoEn: fecha,
        actualizadoEn: fecha,
      };
      mutateProspects((prev) => [prospect, ...prev]);
      return prospect;
    },
    [mutateProspects],
  );

  const updateProspect = useCallback(
    (id: string, changes: Partial<CompanyProspect>) => {
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, ...changes, id: p.id, actualizadoEn: nowISO() }
            : p,
        ),
      );
    },
    [mutateProspects],
  );

  const deleteProspect = useCallback(
    (id: string) => {
      mutateProspects((prev) => prev.filter((p) => p.id !== id));
    },
    [mutateProspects],
  );

  const addActivity = useCallback(
    (prospectId: string, activity: Omit<ProspectActivity, "id">) => {
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? {
                ...p,
                actividades: [
                  ...p.actividades,
                  { ...activity, id: genId("act") },
                ],
                actualizadoEn: nowISO(),
              }
            : p,
        ),
      );
    },
    [mutateProspects],
  );

  const updateActivity = useCallback(
    (
      prospectId: string,
      activityId: string,
      changes: Partial<ProspectActivity>,
    ) => {
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? {
                ...p,
                actividades: p.actividades.map((a) =>
                  a.id === activityId ? { ...a, ...changes, id: a.id } : a,
                ),
                actualizadoEn: nowISO(),
              }
            : p,
        ),
      );
    },
    [mutateProspects],
  );

  const addProposal = useCallback(
    (prospectId: string, proposal: Omit<ProspectProposal, "id">) => {
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? {
                ...p,
                propuestas: [
                  ...p.propuestas,
                  { ...proposal, id: genId("prop") },
                ],
                actualizadoEn: nowISO(),
              }
            : p,
        ),
      );
    },
    [mutateProspects],
  );

  const createProductOpportunity = useCallback(
    (opp: Omit<ProductOpportunity, "id">): ProductOpportunity => {
      const created: ProductOpportunity = { ...opp, id: genId("po") };
      mutateOpps((prev) => [created, ...prev]);
      return created;
    },
    [mutateOpps],
  );

  const updateProductOpportunity = useCallback(
    (id: string, changes: Partial<ProductOpportunity>) => {
      mutateOpps((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...changes, id: o.id } : o)),
      );
    },
    [mutateOpps],
  );

  const deleteProductOpportunity = useCallback(
    (id: string) => {
      mutateOpps((prev) => prev.filter((o) => o.id !== id));
    },
    [mutateOpps],
  );

  const resetToMock = useCallback(() => {
    persist(mockProspects, mockProductOpportunities);
  }, [persist]);

  const value = useMemo<ProspeccionContextValue>(
    () => ({
      prospects,
      productOpportunities,
      isHydrated,
      createProspect,
      updateProspect,
      deleteProspect,
      addActivity,
      updateActivity,
      addProposal,
      createProductOpportunity,
      updateProductOpportunity,
      deleteProductOpportunity,
      resetToMock,
    }),
    [
      prospects,
      productOpportunities,
      isHydrated,
      createProspect,
      updateProspect,
      deleteProspect,
      addActivity,
      updateActivity,
      addProposal,
      createProductOpportunity,
      updateProductOpportunity,
      deleteProductOpportunity,
      resetToMock,
    ],
  );

  return (
    <ProspeccionContext.Provider value={value}>
      {children}
    </ProspeccionContext.Provider>
  );
}

export function useProspeccion(): ProspeccionContextValue {
  const context = useContext(ProspeccionContext);
  if (!context) {
    throw new Error("useProspeccion debe usarse dentro de ProspeccionProvider");
  }
  return context;
}

export function useProspect(id: string): CompanyProspect | undefined {
  const { prospects } = useProspeccion();
  return prospects.find((p) => p.id === id);
}
