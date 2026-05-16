import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  calcularSolicitudesAbiertas,
  formatDate,
  formatSolicitudEstado,
  getSolicitudesEnriquecidas,
} from "@/lib/data/insights";
import { mockPickupData } from "@/lib/data/mock-pickup";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function SolicitudesPage() {
  const solicitudes = getSolicitudesEnriquecidas();
  const pendientes = mockPickupData.solicitudes.filter((s) => s.estado === "pendiente").length;
  const enviadas = mockPickupData.solicitudes.filter((s) => s.estado === "enviado").length;
  const cerradas = mockPickupData.solicitudes.filter((s) => s.estado === "cerrado").length;
  const abiertas = calcularSolicitudesAbiertas();

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Pendientes" value={String(pendientes)} trend="neutral" />
          <StatCard label="Enviadas" value={String(enviadas)} hint={`${abiertas} abiertas`} />
          <StatCard label="Cerradas" value={String(cerradas)} trend="up" />
        </div>

        <SectionCard title="Solicitudes de presupuesto" description="mockPickupData.solicitudes">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Nº</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Origen</th>
                  <th className="pb-2 font-medium">Vehículo</th>
                  <th className="pb-2 text-right font-medium">Ítems</th>
                  <th className="pb-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {solicitudes.map((solicitud) => (
                  <tr key={solicitud.id} className="border-t border-slate-800">
                    <td className="py-2.5 font-mono text-xs">{solicitud.id}</td>
                    <td className="py-2.5">{solicitud.clienteNombre}</td>
                    <td className="py-2.5">{formatSolicitudEstado(solicitud.estado)}</td>
                    <td className="py-2.5">{solicitud.origen}</td>
                    <td className="py-2.5">{solicitud.vehiculo}</td>
                    <td className="py-2.5 text-right">{solicitud.cantidadItems}</td>
                    <td className="py-2.5">{formatDate(solicitud.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div>
          <button type="button" className={primaryCtaClass}>
            Nueva solicitud
          </button>
        </div>
      </div>
    </AppShell>
  );
}
