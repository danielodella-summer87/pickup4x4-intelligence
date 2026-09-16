"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { useCatalogAudit } from "@/contexts/CatalogAuditContext";
import { buildCatalogSummary } from "@/lib/catalog-audit/summary";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function AuditoriaCatalogoPage() {
  const { products, isHydrated, lastSavedAt } = useCatalogAudit();
  const summary = useMemo(() => buildCatalogSummary(products), [products]);

  const lastImportLabel = summary.lastImportedAt
    ? new Date(summary.lastImportedAt).toLocaleString("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : lastSavedAt
      ? new Date(lastSavedAt).toLocaleString("es-AR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "Sin importaciones todavía";

  return (
    <AppShell
      moduleTitle="Auditoría de Catálogo"
      moduleDescription="Importación, estructuración y auditoría de calidad de catálogos externos (ProtecCar y otros)."
    >
      <div className="space-y-6">
        {!isHydrated ? (
          <p className="text-sm text-slate-500">Cargando dataset local…</p>
        ) : summary.totalProducts === 0 ? (
          <SectionCard
            title="Todavía no hay catálogo importado"
            description="Importá un archivo .xlsx o .csv para comenzar la auditoría."
          >
            <Link href="/auditoria-catalogo/importaciones" className={primaryCtaClass}>
              Importar catálogo
            </Link>
          </SectionCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total de productos"
                value={summary.totalProducts.toLocaleString("es-AR")}
              />
              <StatCard
                label="Categorías normalizadas"
                value={summary.normalizedCategoriesCount.toLocaleString("es-AR")}
              />
              <StatCard
                label="Subcategorías normalizadas"
                value={summary.normalizedSubcategoriesCount.toLocaleString("es-AR")}
              />
              <StatCard
                label="Marcas"
                value={summary.brandsCount.toLocaleString("es-AR")}
              />
              <StatCard
                label="Vehículos"
                value={summary.vehiclesCount.toLocaleString("es-AR")}
                hint="Combinaciones marca + modelo compatibles"
              />
              <StatCard
                label="Sin precio"
                value={summary.productsWithoutPrice.toLocaleString("es-AR")}
                trend={summary.productsWithoutPrice > 0 ? "down" : "neutral"}
              />
              <StatCard
                label="Sin stock"
                value={summary.productsWithoutStock.toLocaleString("es-AR")}
                trend={summary.productsWithoutStock > 0 ? "down" : "neutral"}
              />
              <StatCard
                label="Con problemas de calidad"
                value={summary.productsWithQualityIssues.toLocaleString("es-AR")}
                hint={`${summary.totalProducts.toLocaleString("es-AR")} productos en total`}
                trend={summary.productsWithQualityIssues > 0 ? "down" : "neutral"}
              />
            </div>

            <SectionCard
              title="Última importación"
              description={lastImportLabel}
              action={
                <Link href="/auditoria-catalogo/importaciones" className={primaryCtaClass}>
                  Importar catálogo
                </Link>
              }
            >
              <p className="text-sm text-slate-400">
                El catálogo se guarda solo en este navegador (localStorage), separado
                del dataset principal de ventas, clientes y artículos.
              </p>
              <div className="mt-4">
                <Link
                  href="/auditoria-catalogo/productos"
                  className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Ver productos →
                </Link>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
