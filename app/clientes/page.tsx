"use client";

import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  formatClienteEstado,
  formatClienteTipo,
  getResumenClientes,
} from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

function estadoBadgeClass(estado: string) {
  if (estado === "Dormido") return "bg-amber-500/15 text-amber-300";
  if (estado === "En seguimiento") return "bg-sky-500/15 text-sky-300";
  return "bg-emerald-500/15 text-emerald-300";
}

export default function ClientesPage() {
  const { data, source } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source);
  const { total, activos, dormidos } = getResumenClientes(data);
  const clientes = data.clientes;

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
          <StatCard label="Total cuentas" value={String(total)} hint={sourceHint} />
          <StatCard label="Activas" value={String(activos)} trend="up" />
          <StatCard label="Dormidas" value={String(dormidos)} hint="Requieren acción" trend="down" />
        </div>

        <SectionCard
          title="Listado de clientes"
          description={`Cuentas activas · ${sourceHint}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Nº cuenta</th>
                  <th className="pb-2 font-medium">Nombre fantasía</th>
                  <th className="pb-2 font-medium">Localidad</th>
                  <th className="pb-2 font-medium">Sector</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {clientes.map((cliente) => {
                  const estadoLabel = formatClienteEstado(cliente.estado);
                  return (
                    <tr key={cliente.numeroCuenta} className="border-t border-slate-800">
                      <td className="py-2.5 font-mono text-xs">{cliente.numeroCuenta}</td>
                      <td className="py-2.5">
                        {cliente.nombreFantasia ?? cliente.razonSocial}
                      </td>
                      <td className="py-2.5">{cliente.localidad ?? "—"}</td>
                      <td className="py-2.5">{cliente.zona}</td>
                      <td className="py-2.5">{formatClienteTipo(cliente)}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${estadoBadgeClass(estadoLabel)}`}
                        >
                          {estadoLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div>
          <button type="button" className={primaryCtaClass}>
            Nuevo cliente
          </button>
        </div>
      </div>
    </AppShell>
  );
}
