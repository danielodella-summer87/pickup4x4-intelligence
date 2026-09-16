"use client";

/**
 * Estado y persistencia de Auditoría de Catálogo.
 *
 * Contexto propio, aislado de `DatasetContext` (ventas/clientes/artículos):
 * dominio y almacenamiento local separados a propósito, ver
 * lib/catalog-audit/persistence.ts.
 */
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
  clearCatalogAuditDataset,
  loadCatalogAuditDataset,
  replaceCatalogAuditDataset,
  type CatalogAuditSaveResult,
} from "@/lib/catalog-audit/persistence";
import type { CatalogProduct } from "@/lib/catalog-audit/types";

type CatalogAuditContextValue = {
  products: CatalogProduct[];
  isHydrated: boolean;
  lastSavedAt: string | null;
  lastSaveResult: CatalogAuditSaveResult | null;
  /** Reemplaza el dataset completo (ej. tras confirmar una importación) y persiste. */
  setProducts: (products: CatalogProduct[]) => CatalogAuditSaveResult;
  /** Borra el dataset de auditoría de catálogo (no afecta ventas/artículos/clientes). */
  clearProducts: () => void;
};

const CatalogAuditContext = createContext<CatalogAuditContextValue | null>(null);

export function CatalogAuditProvider({ children }: { children: ReactNode }) {
  const [products, setProductsState] = useState<CatalogProduct[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveResult, setLastSaveResult] =
    useState<CatalogAuditSaveResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Boundary asíncrono a propósito: evita disparar setState de forma
      // síncrona dentro del cuerpo del efecto (mismo patrón que
      // SolicitudesContext/ProspeccionContext).
      await Promise.resolve();
      if (cancelled) return;

      const persisted = loadCatalogAuditDataset();
      if (persisted) {
        setProductsState(persisted.products);
        setLastSavedAt(persisted.savedAt);
      }
      setIsHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setProducts = useCallback(
    (next: CatalogProduct[]): CatalogAuditSaveResult => {
      setProductsState(next);
      const result = replaceCatalogAuditDataset(next);
      setLastSaveResult(result);
      if (result.ok) {
        setLastSavedAt(new Date().toISOString());
      }
      return result;
    },
    [],
  );

  const clearProducts = useCallback(() => {
    setProductsState([]);
    clearCatalogAuditDataset();
    setLastSavedAt(null);
    setLastSaveResult(null);
  }, []);

  const value = useMemo<CatalogAuditContextValue>(
    () => ({
      products,
      isHydrated,
      lastSavedAt,
      lastSaveResult,
      setProducts,
      clearProducts,
    }),
    [products, isHydrated, lastSavedAt, lastSaveResult, setProducts, clearProducts],
  );

  return (
    <CatalogAuditContext.Provider value={value}>
      {children}
    </CatalogAuditContext.Provider>
  );
}

export function useCatalogAudit(): CatalogAuditContextValue {
  const ctx = useContext(CatalogAuditContext);
  if (!ctx) {
    throw new Error("useCatalogAudit debe usarse dentro de CatalogAuditProvider");
  }
  return ctx;
}
