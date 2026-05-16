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
  buildVehiculosConsulta,
  filterVehiculos,
  getVehiculosKpis,
  getVehiculosOpcionesFiltro,
  limitList,
  type VehiculosFiltros,
} from "@/lib/data/module-filters";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const filtrosIniciales: VehiculosFiltros = {
  busqueda: "",
  marcaId: "",
  modeloId: "",
  categoria: "",
  rubro: "",
};

export default function VehiculosPage() {
  const { data, source, isExcel, isPersistedLocally } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [filtros, setFiltros] = useState<VehiculosFiltros>(filtrosIniciales);

  const filasBase = useMemo(() => buildVehiculosConsulta(data), [data]);
  const opciones = useMemo(
    () => getVehiculosOpcionesFiltro(filasBase, data),
    [filasBase, data],
  );
  const filtradas = useMemo(
    () => filterVehiculos(filasBase, filtros),
    [filasBase, filtros],
  );
  const kpis = useMemo(() => getVehiculosKpis(data, filtradas), [data, filtradas]);
  const { visible, total: totalFiltrado, truncated } = useMemo(
    () => limitList(filtradas),
    [filtradas],
  );

  const modelosDisponibles = filtros.marcaId
    ? (opciones.modelosPorMarca.get(filtros.marcaId) ?? [])
    : [];

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.marcaId !== "" ||
    filtros.modeloId !== "" ||
    filtros.categoria !== "" ||
    filtros.rubro !== "";

  return (
    <AppShell>
      <div className="space-y-6">
        <FuenteDatosLabel sourceLabel={sourceLabel} isExcel={isExcel} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Marcas"
            value={kpis.marcas.toLocaleString("es-AR")}
            hint={hayFiltros ? "Según filtros activos" : sourceLabel}
          />
          <StatCard label="Modelos" value={kpis.modelos.toLocaleString("es-AR")} />
          <StatCard
            label="Aplicaciones"
            value={kpis.aplicaciones.toLocaleString("es-AR")}
            hint="Relaciones repuesto × vehículo"
          />
          <StatCard
            label="Artículos compatibles"
            value={kpis.articulosCompatibles.toLocaleString("es-AR")}
          />
        </div>

        <SectionCard
          title="Consulta por vehículo"
          description="Marcas, modelos y repuestos que aplican a cada unidad"
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) =>
              setFiltros((prev) => ({ ...prev, busqueda }))
            }
            placeholder="Marca, modelo, código, descripción…"
            onLimpiar={
              hayFiltros
                ? () => setFiltros(filtrosIniciales)
                : undefined
            }
          >
            <FilterField label="Marca">
              <FilterSelect
                value={filtros.marcaId}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    marcaId: e.target.value,
                    modeloId: "",
                  }))
                }
              >
                <option value="">Todas las marcas</option>
                {opciones.marcas.map((marca) => (
                  <option key={marca.id} value={marca.id}>
                    {marca.nombre}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Modelo">
              <FilterSelect
                value={filtros.modeloId}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, modeloId: e.target.value }))
                }
                disabled={!filtros.marcaId}
              >
                <option value="">
                  {filtros.marcaId ? "Todos los modelos" : "Elegí una marca"}
                </option>
                {modelosDisponibles.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.nombre}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Categoría de repuesto">
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
                titulo="No hay vehículos con aplicaciones"
                descripcion={
                  hayFiltros
                    ? "Cambiá la búsqueda o los filtros para ver otros modelos."
                    : "Cuando importes aplicaciones de repuestos, vas a ver marcas y modelos acá."
                }
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Marca</th>
                    <th className="pb-2 font-medium">Modelo</th>
                    <th className="pb-2 text-right font-medium">Accesorios</th>
                    <th className="pb-2 font-medium">Códigos principales</th>
                    <th className="pb-2 font-medium">Categorías</th>
                    <th className="pb-2 font-medium">Rubros</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {visible.map((fila) => (
                    <tr
                      key={fila.modeloId}
                      className="border-t border-slate-800"
                    >
                      <td className="py-2.5 font-medium">{fila.marcaNombre}</td>
                      <td className="py-2.5">{fila.modeloNombre}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {fila.cantidadAccesorios.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2.5">
                        <span className="font-mono text-xs text-emerald-400/90">
                          {fila.codigosPrincipales.join(" · ") || "—"}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300">
                        {fila.categoriasPrincipales.join(" · ") || "—"}
                      </td>
                      <td className="py-2.5 text-slate-400">
                        {fila.rubrosPrincipales.join(" · ") || "—"}
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
              Consultar en mostrador
            </Link>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
