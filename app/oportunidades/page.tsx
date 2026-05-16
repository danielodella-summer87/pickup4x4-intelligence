import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  formatOportunidadTipo,
  formatPrioridad,
  getClientesDormidosOBajaActividad,
  getOportunidadesEnriquecidas,
  getOportunidadesPorPrioridad,
} from "@/lib/data/insights";
import { mockPickupData } from "@/lib/data/mock-pickup";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function OportunidadesPage() {
  const oportunidades = getOportunidadesEnriquecidas();
  const porPrioridad = getOportunidadesPorPrioridad();
  const dormidos = getClientesDormidosOBajaActividad().length;
  const crossSell = mockPickupData.oportunidades.filter(
    (o) => o.tipo === "venta_cruzada",
  ).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Alertas activas"
            value={String(oportunidades.length)}
            hint={`${porPrioridad.alta.length} prioritarias`}
            trend="up"
          />
          <StatCard label="Clientes dormidos / baja actividad" value={String(dormidos)} trend="down" />
          <StatCard label="Cross-sell" value={String(crossSell)} />
        </div>

        <SectionCard
          title="Oportunidades comerciales"
          description="mockPickupData.oportunidades"
        >
          <ul className="space-y-3">
            {oportunidades.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                      {formatOportunidadTipo(item.tipo)}
                    </p>
                    <p className="mt-1 font-medium text-white">{item.clienteNombre}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.detalle}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Artículo: {item.articuloLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Impacto estimado: {item.impactoEstimado}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      item.prioridad === "alta"
                        ? "bg-rose-500/15 text-rose-300"
                        : item.prioridad === "media"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {formatPrioridad(item.prioridad)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <Link href="/clientes" className={primaryCtaClass}>
          Revisar cartera de clientes
        </Link>
      </div>
    </AppShell>
  );
}
