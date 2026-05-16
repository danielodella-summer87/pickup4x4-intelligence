"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  ConsultaToolbar,
  EstadoVacioConsulta,
  FilterField,
  FilterSelect,
  FuenteDatosLabel,
  ResultadosMeta,
} from "@/components/module/ConsultaToolbar";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  buildArticulosConsulta,
  filterArticulos,
  getArticulosKpis,
  getArticulosOpcionesFiltro,
  limitList,
  type ArticulosFiltros,
} from "@/lib/data/module-filters";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const filtrosIniciales: ArticulosFiltros = {
  busqueda: "",
  rubro: "",
  categoria: "",
  aplicaciones: "",
};

export default function ArticulosPage() {
  const { data, source, isExcel, isPersistedLocally } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [filtros, setFiltros] = useState<ArticulosFiltros>(filtrosIniciales);

  const filasBase = useMemo(() => buildArticulosConsulta(data), [data]);
  const opciones = useMemo(() => getArticulosOpcionesFiltro(filasBase), [filasBase]);
  const filtradas = useMemo(
    () => filterArticulos(filasBase, filtros),
    [filasBase, filtros],
  );
  const kpis = useMemo(() => getArticulosKpis(filtradas), [filtradas]);
  const { visible, total: totalFiltrado, truncated } = useMemo(
    () => limitList(filtradas),
    [filtradas],
  );

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.rubro !== "" ||
    filtros.categoria !== "" ||
    filtros.aplicaciones !== "";

  return (
    <AppShell>
      <div className="space-y-6">
        <FuenteDatosLabel sourceLabel={sourceLabel} isExcel={isExcel} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Artículos únicos"
            value={kpis.articulosUnicos.toLocaleString("es-AR")}
            hint={hayFiltros ? "Según filtros activos" : sourceLabel}
          />
          <StatCard
            label="Con aplicaciones"
            value={kpis.conAplicaciones.toLocaleString("es-AR")}
            trend="up"
          />
          <StatCard
            label="Sin aplicaciones"
            value={kpis.sinAplicaciones.toLocaleString("es-AR")}
            hint="Sin vehículo asociado"
          />
          <StatCard
            label="Categoría destacada"
            value={kpis.topCategoria}
            hint="Mayor presencia en catálogo"
          />
        </div>

        <SectionCard
          title="Consulta de artículos"
          description="Código único, descripción, rubro y compatibilidad con vehículos"
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) =>
              setFiltros((prev) => ({ ...prev, busqueda }))
            }
            placeholder="Código, descripción, rubro, categoría…"
            onLimpiar={
              hayFiltros ? () => setFiltros(filtrosIniciales) : undefined
            }
          >
            <FilterField label="Rubro">
              <FilterSelect
                value={filtros.rubro}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, rubro: e.target.value }))
                }
              >
                <option value="">Todos los rubros</option>
                {opciones.rubros.map((rubro) => (
                  <option key={rubro} value={rubro}>
                    {rubro}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Categoría">
              <FilterSelect
                value={filtros.categoria}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, categoria: e.target.value }))
                }
              >
                <option value="">Todas las categorías</option>
                {opciones.categorias.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Aplicaciones a vehículos">
              <FilterSelect
                value={filtros.aplicaciones}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    aplicaciones: e.target.value as ArticulosFiltros["aplicaciones"],
                  }))
                }
              >
                <option value="">Todos</option>
                <option value="con">Con aplicaciones</option>
                <option value="sin">Sin aplicaciones</option>
              </FilterSelect>
            </FilterField>
          </ConsultaToolbar>

          <div className="mt-6">
            <ResultadosMeta
              total={filasBase.length}
              filtrados={totalFiltrado}
              truncated={truncated}
            />
          </div>

          {totalFiltrado === 0 ? (
            <div className="mt-6">
              <EstadoVacioConsulta
                titulo="No hay artículos para mostrar"
                descripcion={
                  hayFiltros
                    ? "Probá otra búsqueda o ampliá los filtros del catálogo."
                    : "Importá tu planilla para cargar el catálogo de repuestos."
                }
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Código único</th>
                    <th className="pb-2 font-medium">Descripción</th>
                    <th className="pb-2 font-medium">Rubro</th>
                    <th className="pb-2 font-medium">Categoría</th>
                    <th className="pb-2 text-right font-medium">Aplicaciones</th>
                    <th className="pb-2 text-right font-medium">Ventas</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {visible.map((fila) => (
                    <tr key={fila.codigoUnico} className="border-t border-slate-800">
                      <td className="py-2.5 font-mono text-xs text-emerald-400/90">
                        {fila.codigoUnico}
                      </td>
                      <td className="py-2.5">{fila.descripcion}</td>
                      <td className="py-2.5">{fila.rubro}</td>
                      <td className="py-2.5">{fila.categoria}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {fila.cantidadAplicaciones.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {fila.cantidadVentas.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {totalFiltrado > 0 ? (
          <div>
            <Link href="/distribuidor" className={primaryCtaClass}>
              Ir al mostrador
            </Link>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
