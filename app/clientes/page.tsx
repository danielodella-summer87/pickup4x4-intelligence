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
import { formatClienteEstado } from "@/lib/data/insights";
import type { ClienteEstado } from "@/lib/models/cliente";
import {
  buildClientesConsulta,
  filterClientes,
  getClientesKpis,
  getClientesOpcionesFiltro,
  limitList,
  type ClientesFiltros,
} from "@/lib/data/module-filters";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const filtrosIniciales: ClientesFiltros = {
  busqueda: "",
  localidad: "",
  estado: "",
};

function estadoBadgeClass(estadoLabel: string) {
  if (estadoLabel === "Dormido") return "bg-amber-500/15 text-amber-300";
  if (estadoLabel === "En seguimiento") return "bg-sky-500/15 text-sky-300";
  return "bg-emerald-500/15 text-emerald-300";
}

export default function ClientesPage() {
  const { data, source, isExcel, isMock, isPersistedLocally } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [filtros, setFiltros] = useState<ClientesFiltros>(filtrosIniciales);

  const filasBase = useMemo(() => buildClientesConsulta(data), [data]);
  const opciones = useMemo(() => getClientesOpcionesFiltro(filasBase), [filasBase]);
  const filtradas = useMemo(
    () => filterClientes(filasBase, filtros),
    [filasBase, filtros],
  );
  const kpis = useMemo(() => getClientesKpis(filtradas), [filtradas]);
  const { visible, total: totalFiltrado, truncated } = useMemo(
    () => limitList(filtradas),
    [filtradas],
  );

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.localidad !== "" ||
    filtros.estado !== "";

  return (
    <AppShell>
      <div className="space-y-6">
        <FuenteDatosLabel sourceLabel={sourceLabel} isExcel={isExcel} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total clientes"
            value={kpis.totalClientes.toLocaleString("es-AR")}
            hint={hayFiltros ? "Según filtros activos" : sourceLabel}
          />
          <StatCard
            label="Localidades"
            value={kpis.localidades.toLocaleString("es-AR")}
          />
          <StatCard
            label="Con ventas"
            value={kpis.conVentas.toLocaleString("es-AR")}
            trend="up"
          />
          <StatCard
            label="Sin ventas"
            value={kpis.sinVentas.toLocaleString("es-AR")}
            hint="Sin comprobantes asociados"
          />
        </div>

        <SectionCard
          title="Consulta de clientes"
          description="Buscá por cuenta, razón social, fantasía, localidad o RUC"
        >
          <ConsultaToolbar
            busqueda={filtros.busqueda}
            onBusquedaChange={(busqueda) =>
              setFiltros((prev) => ({ ...prev, busqueda }))
            }
            placeholder="Cuenta, nombre, localidad, RUC…"
            onLimpiar={
              hayFiltros ? () => setFiltros(filtrosIniciales) : undefined
            }
          >
            <FilterField label="Localidad">
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
            {opciones.estados.length > 0 ? (
              <FilterField label="Estado comercial">
                <FilterSelect
                  value={filtros.estado}
                  onChange={(e) =>
                    setFiltros((prev) => ({ ...prev, estado: e.target.value }))
                  }
                >
                  <option value="">Todos los estados</option>
                  {opciones.estados.map((estado) => (
                    <option key={estado} value={estado}>
                      {formatClienteEstado(estado as ClienteEstado)}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
            ) : null}
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
                titulo="No hay clientes para mostrar"
                descripcion={
                  hayFiltros
                    ? "Probá con otros términos o quitá filtros para ver más cuentas."
                    : "Importá tu planilla Excel para cargar la cartera de clientes."
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
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Nº cuenta</th>
                    <th className="pb-2 font-medium">Nombre / fantasía</th>
                    <th className="pb-2 font-medium">Localidad</th>
                    <th className="pb-2 font-medium">RUC</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 text-right font-medium">Ventas</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {visible.map((fila) => (
                    <tr
                      key={fila.numeroCuenta}
                      className="border-t border-slate-800"
                    >
                      <td className="py-2.5 font-mono text-xs">
                        {fila.numeroCuenta}
                      </td>
                      <td className="py-2.5">
                        <span className="font-medium">{fila.nombreDisplay}</span>
                        {fila.nombreDisplay !== fila.razonSocial ? (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {fila.razonSocial}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5">{fila.localidad}</td>
                      <td className="py-2.5 font-mono text-xs">{fila.ruc}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${estadoBadgeClass(fila.estadoLabel)}`}
                        >
                          {fila.estadoLabel}
                        </span>
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
