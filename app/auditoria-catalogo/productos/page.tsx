"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
  ResultadosMeta,
} from "@/components/module/ConsultaToolbar";
import { SectionCard } from "@/components/SectionCard";
import { useCatalogAudit } from "@/contexts/CatalogAuditContext";
import {
  EMPTY_CATALOG_FILTERS,
  filterCatalogProducts,
  getCatalogFilterOptions,
  type CatalogProductFilters,
} from "@/lib/catalog-audit/filters";
import { classifyStockStatus, STOCK_FILTER_LABELS } from "@/lib/catalog-audit/stock";
import { PENDING_NORMALIZATION } from "@/lib/catalog-audit/types";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const ROW_LIMIT = 200;

function formatPrice(price: number | undefined, currency: string): string {
  if (price === undefined) return "—";
  const formatted = price.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatYearRange(from: number | undefined, to: number | undefined): string {
  if (from === undefined && to === undefined) return "—";
  if (from !== undefined && to !== undefined && from !== to) return `${from}–${to}`;
  return String(from ?? to);
}

export default function AuditoriaCatalogoProductosPage() {
  const { products, isHydrated } = useCatalogAudit();
  const [filters, setFilters] = useState<CatalogProductFilters>(EMPTY_CATALOG_FILTERS);

  const options = useMemo(() => getCatalogFilterOptions(products), [products]);
  const filtered = useMemo(
    () => filterCatalogProducts(products, filters),
    [products, filters],
  );

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.category !== "" ||
    filters.subcategory !== "" ||
    filters.brand !== "" ||
    filters.vehicle !== "" ||
    filters.stock !== "" ||
    filters.quality !== "";

  const visible = filtered.slice(0, ROW_LIMIT);
  const truncated = filtered.length > ROW_LIMIT;

  return (
    <AppShell
      moduleTitle="Auditoría de Catálogo · Productos"
      moduleDescription="Consulta y filtros sobre el catálogo importado localmente."
    >
      <div className="space-y-6">
        {!isHydrated ? (
          <p className="text-sm text-slate-500">Cargando dataset local…</p>
        ) : products.length === 0 ? (
          <SectionCard
            title="No hay productos importados"
            description="Importá un catálogo para ver la tabla de productos."
          >
            <Link href="/auditoria-catalogo/importaciones" className={primaryCtaClass}>
              Importar catálogo
            </Link>
          </SectionCard>
        ) : (
          <SectionCard
            title="Productos"
            description="Búsqueda por nombre o SKU, y filtros de categoría/subcategoría/marca/vehículo/stock/calidad."
          >
            <ConsultaToolbar
              busqueda={filters.search}
              onBusquedaChange={(search) => setFilters((prev) => ({ ...prev, search }))}
              placeholder="Nombre o SKU…"
              onLimpiar={hasFilters ? () => setFilters(EMPTY_CATALOG_FILTERS) : undefined}
            >
              <FilterField label="Categoría">
                <FilterSelect
                  value={filters.category}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, category: e.target.value }))
                  }
                >
                  <option value="">Todas las categorías</option>
                  {options.categories.map((category) => (
                    <option key={category} value={category}>
                      {category === PENDING_NORMALIZATION
                        ? "Pendiente de normalización"
                        : category}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Subcategoría">
                <FilterSelect
                  value={filters.subcategory}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, subcategory: e.target.value }))
                  }
                >
                  <option value="">Todas las subcategorías</option>
                  {options.subcategories.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>
                      {subcategory === PENDING_NORMALIZATION
                        ? "Pendiente de normalización"
                        : subcategory}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Marca">
                <FilterSelect
                  value={filters.brand}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, brand: e.target.value }))
                  }
                >
                  <option value="">Todas las marcas</option>
                  {options.brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Vehículo">
                <FilterSelect
                  value={filters.vehicle}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, vehicle: e.target.value }))
                  }
                >
                  <option value="">Todos los vehículos</option>
                  {options.vehicles.map((vehicle) => (
                    <option key={vehicle} value={vehicle}>
                      {vehicle}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Stock">
                <FilterSelect
                  value={filters.stock}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      stock: e.target.value as CatalogProductFilters["stock"],
                    }))
                  }
                >
                  <option value="">Todos</option>
                  <option value="in_stock">{STOCK_FILTER_LABELS.in_stock}</option>
                  <option value="out_of_stock">{STOCK_FILTER_LABELS.out_of_stock}</option>
                  <option value="unknown">{STOCK_FILTER_LABELS.unknown}</option>
                </FilterSelect>
              </FilterField>
              <FilterField label="Calidad">
                <FilterSelect
                  value={filters.quality}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      quality: e.target.value as CatalogProductFilters["quality"],
                    }))
                  }
                >
                  <option value="">Con y sin problemas</option>
                  <option value="con">Con problemas</option>
                  <option value="sin">Sin problemas</option>
                </FilterSelect>
              </FilterField>
            </ConsultaToolbar>

            <div className="mt-6">
              <ResultadosMeta
                total={products.length}
                filtrados={filtered.length}
                truncated={truncated}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="mt-6">
                <EstadoVacioConsulta
                  titulo="No hay productos para mostrar"
                  descripcion="Probá otra búsqueda o ampliá los filtros del catálogo."
                />
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2 font-medium">Producto</th>
                      <th className="pb-2 font-medium">Categoría</th>
                      <th className="pb-2 font-medium">Subcategoría</th>
                      <th className="pb-2 font-medium">Marca</th>
                      <th className="pb-2 font-medium">Vehículo</th>
                      <th className="pb-2 font-medium">Año</th>
                      <th className="pb-2 font-medium">SKU</th>
                      <th className="pb-2 text-right font-medium">Precio</th>
                      <th className="pb-2 font-medium">Moneda</th>
                      <th className="pb-2 font-medium">Stock</th>
                      <th className="pb-2 text-right font-medium">Hallazgos</th>
                      <th className="pb-2 font-medium">URL</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {visible.map((product) => {
                      const stock = classifyStockStatus(product.stockStatus);
                      return (
                        <tr key={product.id} className="border-t border-slate-800">
                          <td className="max-w-[220px] truncate py-2.5">
                            {product.productName}
                          </td>
                          <td className="py-2.5">
                            {product.normalizedCategory === PENDING_NORMALIZATION ? (
                              <span className="text-amber-300">Pendiente</span>
                            ) : (
                              product.normalizedCategory
                            )}
                          </td>
                          <td className="py-2.5">
                            {product.normalizedSubcategory === PENDING_NORMALIZATION ? (
                              <span className="text-amber-300">Pendiente</span>
                            ) : (
                              product.normalizedSubcategory
                            )}
                          </td>
                          <td className="py-2.5">{product.brand || "—"}</td>
                          <td className="max-w-[160px] truncate py-2.5">
                            {[product.compatibleVehicleBrand, product.compatibleVehicleModel]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </td>
                          <td className="py-2.5">
                            {formatYearRange(
                              product.compatibleYearFrom,
                              product.compatibleYearTo,
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-xs text-emerald-400/90">
                            {product.sku || "—"}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {formatPrice(product.price, product.currency)}
                          </td>
                          <td className="py-2.5">{product.currency || "—"}</td>
                          <td className="py-2.5">{STOCK_FILTER_LABELS[stock]}</td>
                          <td className="py-2.5 text-right tabular-nums">
                            {product.qualityIssues.length > 0 ? (
                              <span className="text-amber-300">
                                {product.qualityIssues.length}
                              </span>
                            ) : (
                              <span className="text-slate-500">0</span>
                            )}
                          </td>
                          <td className="max-w-[140px] truncate py-2.5">
                            {product.productUrl ? (
                              <a
                                href={product.productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:text-sky-300"
                              >
                                Ver
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
