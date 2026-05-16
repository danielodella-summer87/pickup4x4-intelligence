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
  buildVentasConsulta,
  filterVentas,
  formatFechaCorta,
  getVentasKpis,
  getVentasOpcionesFiltro,
  limitList,
  type VentasFiltros,
} from "@/lib/data/module-filters";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const filtrosIniciales: VentasFiltros = {
  busqueda: "",
  mes: "",
  localidad: "",
  articulo: "",
};

export default function VentasPage() {
  const { data, source, isExcel, isMock, isPersistedLocally } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [filtros, setFiltros] = useState<VentasFiltros>(filtrosIniciales);

  const filasBase = useMemo(() => buildVentasConsulta(data), [data]);
  const opciones = useMemo(() => getVentasOpcionesFiltro(filasBase), [filasBase]);
  const filtradas = useMemo(
    () => filterVentas(filasBase, filtros),
    [filasBase, filtros],
  );
  const kpis = useMemo(() => getVentasKpis(filtradas), [filtradas]);
  const { visible, total: totalFiltrado, truncated } = useMemo(
    () => limitList(filtradas),
    [filtradas],
  );

  const fechasConfiables = opciones.fechasConfiables;

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.mes !== "" ||
    filtros.localidad !== "" ||
    filtros.articulo !== "";

  return (
    <AppShell>
      <div className="space-y-6">
        <FuenteDatosLabel sourceLabel={sourceLabel} isExcel={isExcel} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Registros de venta"
            value={kpis.totalRegistros.toLocaleString("es-AR")}
            hint={hayFiltros ? "Según filtros activos" : "Líneas de comprobante"}
          />
          <StatCard
            label={kpis.fechasConfiables ? "Meses con actividad" : "Comprobantes"}
            value={
              kpis.fechasConfiables
                ? kpis.mesesConActividad.toLocaleString("es-AR")
                : kpis.comprobantesUnicos.toLocaleString("es-AR")
            }
            hint={
              kpis.fechasConfiables
                ? undefined
                : "El Excel no trae fechas confiables"
            }
          />
          <StatCard
            label="Con artículo"
            value={kpis.conArticulo.toLocaleString("es-AR")}
            trend="up"
          />
          <StatCard
            label="Sin artículo"
            value={kpis.sinArticulo.toLocaleString("es-AR")}
            hint="Comprobantes sin línea de repuesto"
          />
        </div>

        <SectionCard
          title="Consulta de ventas"
          description="Comprobantes y líneas vendidas, sin importes"
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) =>
              setFiltros((prev) => ({ ...prev, busqueda }))
            }
            placeholder="Comprobante, cliente, código, descripción…"
            onLimpiar={
              hayFiltros ? () => setFiltros(filtrosIniciales) : undefined
            }
          >
            {fechasConfiables && opciones.meses.length > 0 ? (
              <FilterField label="Mes">
                <FilterSelect
                  value={filtros.mes}
                  onChange={(e) =>
                    setFiltros((prev) => ({ ...prev, mes: e.target.value }))
                  }
                >
                  <option value="">Todos los meses</option>
                  {opciones.meses.map((mes) => (
                    <option key={mes.clave} value={mes.clave}>
                      {mes.etiqueta}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
            ) : null}
            <FilterField label="Localidad del cliente">
              <FilterSelect
                value={filtros.localidad}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, localidad: e.target.value }))
                }
              >
                <option value="">Todas las localidades</option>
                {opciones.localidades.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>
            <FilterField label="Línea de artículo">
              <FilterSelect
                value={filtros.articulo}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    articulo: e.target.value as VentasFiltros["articulo"],
                  }))
                }
              >
                <option value="">Todas las líneas</option>
                <option value="con">Con artículo</option>
                <option value="sin">Sin artículo</option>
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
                titulo="No hay ventas para mostrar"
                descripcion={
                  hayFiltros
                    ? "Ajustá la búsqueda o los filtros para ver otros comprobantes."
                    : "Importá tu planilla Excel para ver el historial de ventas."
                }
                action={
                  isMock ? (
                    <Link href="/importar" className={primaryCtaClass}>
                      Importar datos
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Comprobante</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Localidad</th>
                    <th className="pb-2 font-medium">Código único</th>
                    <th className="pb-2 font-medium">Descripción</th>
                    <th className="pb-2 text-right font-medium">Cant.</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {visible.map((fila) => (
                    <tr key={fila.id} className="border-t border-slate-800">
                      <td className="py-2.5 whitespace-nowrap">
                        {formatFechaCorta(fila.fecha)}
                      </td>
                      <td className="py-2.5 font-mono text-xs">
                        {fila.comprobante}
                      </td>
                      <td className="py-2.5">{fila.clienteNombre}</td>
                      <td className="py-2.5">{fila.localidad}</td>
                      <td className="py-2.5 font-mono text-xs text-emerald-400/90">
                        {fila.codigoUnico}
                      </td>
                      <td className="py-2.5 max-w-xs truncate" title={fila.descripcion}>
                        {fila.descripcion}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {fila.tieneArticulo
                          ? fila.cantidad.toLocaleString("es-AR")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {isMock && totalFiltrado > 0 ? (
          <div>
            <Link href="/importar" className={primaryCtaClass}>
              Importar datos
            </Link>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
