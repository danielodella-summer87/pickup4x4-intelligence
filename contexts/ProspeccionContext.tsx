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
import {
  emptyFleetProfile,
  emptyProviderProfile,
  type CompanyProspect,
  type CreateProspectInput,
  type ProductOpportunity,
  type ProspectActivity,
  type ProspectCatalogItem,
  type ProspectCatalogKind,
  type ProspectCatalogos,
  type ProspectProposal,
} from "@/lib/models/prospeccion";
import {
  mockProductOpportunities,
  mockProspects,
} from "@/lib/prospeccion/mock-prospeccion";
import {
  buildDefaultCatalogos,
  mergeProspectionSeed,
} from "@/lib/prospeccion/helpers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  deleteNecesidadProductoFromSupabase,
  deleteProspectoFromSupabase,
  loadCatalogosFromSupabase,
  loadProspeccionFromSupabase,
  upsertCatalogoItemInSupabase,
  upsertNecesidadProductoInSupabase,
  upsertProspectoInSupabase,
} from "@/lib/data/supabase-prospeccion";

/** Origen activo de los datos. */
export type ProspeccionSource = "supabase" | "local" | "seed" | "mock";
/** Estado de guardado remoto. */
export type ProspeccionSaveState = "idle" | "guardando" | "guardado" | "error";

// Persistencia local versionada. En esta fase es la única fuente; la estructura
// queda preparada para sincronizar con Supabase más adelante (ver SolicitudesContext
// como referencia del patrón remoto).
const STORAGE_KEY = "pickup4x4:prospeccion";
const STORAGE_VERSION = 1;

// Seed generado desde los Excel reales (scripts/build-prospeccion.cjs).
// Servido estáticamente desde public/. Si no existe, se usa el mock como fallback.
const SEED_URL = "/data/prospeccion.json";

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
  /** Merge NO destructivo del seed JSON: agrega solo empresas nuevas. */
  importSeedMerge: () => void;
  /** Reset duro al seed JSON (descarta lo local). Preparado, sin UI todavía. */
  resetToSeed: () => void;
  /** Origen activo de los datos (supabase / local / seed / mock). */
  source: ProspeccionSource;
  /** Estado del último guardado remoto. */
  saveState: ProspeccionSaveState;
  /** Catálogos editables (desde Supabase si existe; si no, defaults). */
  catalogos: ProspectCatalogos;
  /** Alta/edición de un item de catálogo (rubros / etapas / tipos de actividad). */
  upsertCatalogItem: (kind: ProspectCatalogKind, item: ProspectCatalogItem) => void;
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

type SeedPayload = {
  prospects: CompanyProspect[];
  productOpportunities: ProductOpportunity[];
};

/** Lee el seed JSON generado desde los Excel. Devuelve null si no existe/inválido. */
async function fetchSeed(): Promise<SeedPayload | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(SEED_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isRecord(data) || !Array.isArray(data.prospects)) return null;
    const prospects = data.prospects.filter(isValidProspect);
    const productOpportunities = Array.isArray(data.productOpportunities)
      ? data.productOpportunities.filter(isValidProductOpportunity)
      : [];
    if (prospects.length === 0) return null;
    return { prospects, productOpportunities };
  } catch {
    return null;
  }
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
  const [source, setSource] = useState<ProspeccionSource>("mock");
  const [saveState, setSaveState] = useState<ProspeccionSaveState>("idle");
  const [catalogos, setCatalogos] = useState<ProspectCatalogos>(
    buildDefaultCatalogos(),
  );

  // Copias vivas para computar objetos a sincronizar sin depender del closure.
  const prospectsRef = useRef<CompanyProspect[]>([]);
  const oppsRef = useRef<ProductOpportunity[]>([]);
  useEffect(() => {
    prospectsRef.current = prospects;
  }, [prospects]);
  useEffect(() => {
    oppsRef.current = productOpportunities;
  }, [productOpportunities]);

  useEffect(() => {
    // Patrón del proyecto (ver SolicitudesContext): la hidratación corre en un
    // callback asíncrono para no llamar setState de forma síncrona en el efecto.
    let cancelled = false;
    void (async () => {
      // 1) Supabase como fuente principal si está configurado y tiene datos.
      if (isSupabaseConfigured()) {
        const remote = await loadProspeccionFromSupabase();
        if (cancelled) return;
        if (remote.ok && remote.prospects.length > 0) {
          setProspects(remote.prospects);
          setProductOpportunities(remote.productOpportunities);
          writeToStorage(remote.prospects, remote.productOpportunities); // cache
          setSource("supabase");
          const cat = await loadCatalogosFromSupabase();
          if (!cancelled && cat.ok && cat.catalogos.rubros.length > 0) {
            setCatalogos(cat.catalogos);
          }
          if (!cancelled) setIsHydrated(true);
          return;
        }
      }
      // 2) Cache local (posiblemente editado): NO se sobrescribe.
      const stored = readFromStorage();
      if (stored) {
        if (cancelled) return;
        setProspects(stored.prospects);
        setProductOpportunities(stored.productOpportunities);
        setSource("local");
        setIsHydrated(true);
        return;
      }
      // 3) Seed desde el JSON de los Excel; si no existe, mock del bundle.
      const seed = await fetchSeed();
      if (cancelled) return;
      const initialProspects = seed ? seed.prospects : mockProspects;
      const initialOpps = seed ? seed.productOpportunities : mockProductOpportunities;
      setProspects(initialProspects);
      setProductOpportunities(initialOpps);
      writeToStorage(initialProspects, initialOpps);
      setSource(seed ? "seed" : "mock");
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Sincronización remota (fire-and-forget; localStorage queda como respaldo)
  const syncProspecto = useCallback((p: CompanyProspect) => {
    if (!isSupabaseConfigured()) return;
    setSaveState("guardando");
    void upsertProspectoInSupabase(p).then((r) =>
      setSaveState(r.ok ? "guardado" : "error"),
    );
  }, []);
  const syncDeleteProspecto = useCallback((id: string) => {
    if (!isSupabaseConfigured()) return;
    void deleteProspectoFromSupabase(id);
  }, []);
  const syncOpp = useCallback((o: ProductOpportunity) => {
    if (!isSupabaseConfigured()) return;
    void upsertNecesidadProductoInSupabase(o);
  }, []);
  const syncDeleteOpp = useCallback((id: string) => {
    if (!isSupabaseConfigured()) return;
    void deleteNecesidadProductoFromSupabase(id);
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
      syncProspecto(prospect);
      return prospect;
    },
    [mutateProspects, syncProspecto],
  );

  const updateProspect = useCallback(
    (id: string, changes: Partial<CompanyProspect>) => {
      const actualizadoEn = nowISO();
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...changes, id: p.id, actualizadoEn } : p,
        ),
      );
      const prev = prospectsRef.current.find((p) => p.id === id);
      if (prev) syncProspecto({ ...prev, ...changes, id, actualizadoEn });
    },
    [mutateProspects, syncProspecto],
  );

  const deleteProspect = useCallback(
    (id: string) => {
      mutateProspects((prev) => prev.filter((p) => p.id !== id));
      syncDeleteProspecto(id);
    },
    [mutateProspects, syncDeleteProspecto],
  );

  const addActivity = useCallback(
    (prospectId: string, activity: Omit<ProspectActivity, "id">) => {
      const act: ProspectActivity = { ...activity, id: genId("act") };
      const actualizadoEn = nowISO();
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? { ...p, actividades: [...p.actividades, act], actualizadoEn }
            : p,
        ),
      );
      const cur = prospectsRef.current.find((p) => p.id === prospectId);
      if (cur) {
        syncProspecto({
          ...cur,
          actividades: [...cur.actividades, act],
          actualizadoEn,
        });
      }
    },
    [mutateProspects, syncProspecto],
  );

  const updateActivity = useCallback(
    (
      prospectId: string,
      activityId: string,
      changes: Partial<ProspectActivity>,
    ) => {
      const actualizadoEn = nowISO();
      const applyActs = (acts: ProspectActivity[]) =>
        acts.map((a) => (a.id === activityId ? { ...a, ...changes, id: a.id } : a));
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? { ...p, actividades: applyActs(p.actividades), actualizadoEn }
            : p,
        ),
      );
      const cur = prospectsRef.current.find((p) => p.id === prospectId);
      if (cur) {
        syncProspecto({ ...cur, actividades: applyActs(cur.actividades), actualizadoEn });
      }
    },
    [mutateProspects, syncProspecto],
  );

  const addProposal = useCallback(
    (prospectId: string, proposal: Omit<ProspectProposal, "id">) => {
      const prop: ProspectProposal = { ...proposal, id: genId("prop") };
      const actualizadoEn = nowISO();
      mutateProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? { ...p, propuestas: [...p.propuestas, prop], actualizadoEn }
            : p,
        ),
      );
      const cur = prospectsRef.current.find((p) => p.id === prospectId);
      if (cur) {
        syncProspecto({
          ...cur,
          propuestas: [...cur.propuestas, prop],
          actualizadoEn,
        });
      }
    },
    [mutateProspects, syncProspecto],
  );

  const createProductOpportunity = useCallback(
    (opp: Omit<ProductOpportunity, "id">): ProductOpportunity => {
      const created: ProductOpportunity = { ...opp, id: genId("po") };
      mutateOpps((prev) => [created, ...prev]);
      syncOpp(created);
      return created;
    },
    [mutateOpps, syncOpp],
  );

  const updateProductOpportunity = useCallback(
    (id: string, changes: Partial<ProductOpportunity>) => {
      mutateOpps((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...changes, id: o.id } : o)),
      );
      const cur = oppsRef.current.find((o) => o.id === id);
      if (cur) syncOpp({ ...cur, ...changes, id });
    },
    [mutateOpps, syncOpp],
  );

  const deleteProductOpportunity = useCallback(
    (id: string) => {
      mutateOpps((prev) => prev.filter((o) => o.id !== id));
      syncDeleteOpp(id);
    },
    [mutateOpps, syncDeleteOpp],
  );

  // Alta/edición de catálogo (local optimista + Supabase fire-and-forget).
  const upsertCatalogItem = useCallback(
    (kind: ProspectCatalogKind, item: ProspectCatalogItem) => {
      const key =
        kind === "rubros"
          ? "rubros"
          : kind === "etapas"
            ? "etapas"
            : "tiposActividad";
      setCatalogos((prev) => {
        const list = prev[key];
        const exists = list.some((c) => c.id === item.id);
        const nextList = exists
          ? list.map((c) => (c.id === item.id ? item : c))
          : [...list, item];
        return { ...prev, [key]: nextList };
      });
      if (isSupabaseConfigured()) void upsertCatalogoItemInSupabase(kind, item);
    },
    [],
  );

  const resetToMock = useCallback(() => {
    persist(mockProspects, mockProductOpportunities);
  }, [persist]);

  // Merge NO destructivo del seed: agrega solo empresas nuevas (por id / clave
  // canónica) sin tocar las ya cargadas o editadas manualmente.
  const importSeedMerge = useCallback(() => {
    void (async () => {
      const seed = await fetchSeed();
      if (!seed) return;
      setProspects((prevProspects) => {
        const nextProspects = mergeProspectionSeed(prevProspects, seed.prospects);
        setProductOpportunities((prevOpps) => {
          const ids = new Set(prevOpps.map((o) => o.id));
          const nextOpps = [
            ...prevOpps,
            ...seed.productOpportunities.filter((o) => !ids.has(o.id)),
          ];
          writeToStorage(nextProspects, nextOpps);
          return nextOpps;
        });
        return nextProspects;
      });
    })();
  }, []);

  // Reset duro al seed JSON (descarta lo local). Preparado para una acción
  // explícita y confirmada en UI; todavía no expuesto visualmente.
  const resetToSeed = useCallback(() => {
    void (async () => {
      const seed = await fetchSeed();
      if (seed) persist(seed.prospects, seed.productOpportunities);
    })();
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
      importSeedMerge,
      resetToSeed,
      source,
      saveState,
      catalogos,
      upsertCatalogItem,
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
      importSeedMerge,
      resetToSeed,
      source,
      saveState,
      catalogos,
      upsertCatalogItem,
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
