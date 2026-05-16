"use client";

import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  calcularTicketPromedio,
  calcularTotalVentas,
  calcularUnidadesVendidas,
  formatCurrency,
  formatDate,
  getVentasEnriquecidas,
} from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function VentasPage() {
  const { data, source } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source);
  const ventas = getVentasEnriquecidas(data);
  const totalVentas = calcularTotalVentas(data);
  const ticketPromedio = calcularTicketPromedio(data);
  const unidades = calcularUnidadesVendidas(data);

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

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total ventas"
            value={formatCurrency(totalVentas)}
            hint={`${ventas.length} comprobantes`}
            trend="up"
          />
          <StatCard
            label="Ticket promedio"
            value={formatCurrency(ticketPromedio)}
            hint={sourceHint}
          />
          <StatCard
            label="Unidades vendidas"
            value={String(unidades)}
            trend="up"
          />
        </div>

        <SectionCard title="Diario de ventas" description={`Ventas · ${sourceHint}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Localidad</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 font-medium">Condición</th>
                  <th className="pb-2 font-medium">Vendedor</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {ventas.map((venta) => (
                  <tr key={venta.id} className="border-t border-slate-800">
                    <td className="py-2.5">{formatDate(venta.fecha)}</td>
                    <td className="py-2.5">{venta.clienteNombre}</td>
                    <td className="py-2.5">{venta.localidad}</td>
                    <td className="py-2.5 text-right">
                      {formatCurrency(venta.importeTotal)}
                    </td>
                    <td className="py-2.5">{venta.condicion}</td>
                    <td className="py-2.5">{venta.vendedor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div>
          <button type="button" className={primaryCtaClass}>
            Registrar venta
          </button>
        </div>
      </div>
    </AppShell>
  );
}
