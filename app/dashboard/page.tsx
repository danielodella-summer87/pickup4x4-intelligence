"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  calcularArticulosBajoStock,
  calcularArticulosConStock,
  calcularCantidadArticulos,
  calcularCantidadClientes,
  calcularClientesActivos,
  calcularOportunidadesPrioritarias,
  calcularSolicitudesAbiertas,
  calcularTotalVentas,
  formatCurrency,
  formatOportunidadTipo,
  formatPrioridad,
  getClienteByNumeroCuenta,
  getOportunidadesDestacadas,
  getTopArticulosPorCantidad,
  getTopClientesPorVentas,
  getVentasPorLocalidad,
} from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function DashboardPage() {
  const { data, source } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source);

  const totalVentas = calcularTotalVentas(data);
  const totalClientes = calcularCantidadClientes(data);
  const clientesActivos = calcularClientesActivos(data);
  const articulosActivos = calcularCantidadArticulos(data);
  const articulosConStock = calcularArticulosConStock(data);
  const articulosBajoStock = calcularArticulosBajoStock(data);
  const solicitudesAbiertas = calcularSolicitudesAbiertas(data);
  const oportunidadesPrioritarias = calcularOportunidadesPrioritarias(data);

  const topClientes = getTopClientesPorVentas(5, data);
  const topArticulos = getTopArticulosPorCantidad(5, data);
  const ventasPorLocalidad = getVentasPorLocalidad(data);
  const oportunidadesDestacadas = getOportunidadesDestacadas(3, data);

  return (
    <AppShell>
      <div className="space-y-6">
        <p className="text-xs text-slate-500">
          Fuente de datos:{" "}
          <span
            className={
              source === "excel"
                ? "font-medium text-emerald-400"
                : "font-medium text-slate-400"
            }
          >
            {sourceHint}
          </span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total ventas"
            value={formatCurrency(totalVentas)}
            hint={`${solicitudesAbiertas} solicitudes abiertas · ${sourceHint}`}
            trend="up"
          />
          <StatCard
            label="Clientes"
            value={String(totalClientes)}
            hint={`${clientesActivos} activos`}
            trend="up"
          />
          <StatCard
            label="Artículos con stock"
            value={String(articulosConStock)}
            hint={`${articulosBajoStock} bajo mínimo · ${articulosActivos} activos`}
            trend="neutral"
          />
          <StatCard
            label="Oportunidades"
            value={String(oportunidadesPrioritarias)}
            hint="Prioridad alta"
            trend="up"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Top clientes" description="Por facturación acumulada">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Zona</th>
                  <th className="pb-2 text-right font-medium">Ventas</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {topClientes.map((client) => (
                  <tr key={client.numeroCuenta} className="border-t border-slate-800">
                    <td className="py-2.5">{client.razonSocial}</td>
                    <td className="py-2.5">{client.zona}</td>
                    <td className="py-2.5 text-right">
                      {formatCurrency(client.totalVentas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Top artículos" description="Por unidades vendidas">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Código</th>
                  <th className="pb-2 font-medium">Artículo</th>
                  <th className="pb-2 text-right font-medium">Uds.</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {topArticulos.map((article) => (
                  <tr key={article.codigoUnico} className="border-t border-slate-800">
                    <td className="py-2.5 font-mono text-xs">{article.codigoUnico}</td>
                    <td className="py-2.5">{article.descripcion}</td>
                    <td className="py-2.5 text-right">{article.cantidadVendida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>

        <SectionCard title="Ventas por localidad" description="Según cliente de cada venta">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ventasPorLocalidad.map((row) => (
              <div
                key={row.localidad}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
              >
                <p className="text-sm text-slate-400">{row.localidad}</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {formatCurrency(row.totalVentas)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.cantidadComprobantes} comprobante
                  {row.cantidadComprobantes === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Oportunidades destacadas" description="Prioridad alta y media">
          <ul className="space-y-3">
            {oportunidadesDestacadas.map((opp) => {
              const cliente = getClienteByNumeroCuenta(opp.numeroCuenta, data);
              return (
                <li
                  key={opp.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                        {formatOportunidadTipo(opp.tipo)}
                      </p>
                      <p className="mt-1 font-medium text-white">
                        {cliente?.razonSocial ?? opp.numeroCuenta}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">{opp.detalle}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        opp.prioridad === "alta"
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {formatPrioridad(opp.prioridad)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <div>
          <Link href="/oportunidades" className={primaryCtaClass}>
            Ver oportunidades comerciales
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
