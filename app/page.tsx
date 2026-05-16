import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { mainNavigation } from "@/lib/navigation";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const modules = mainNavigation.filter((item) => item.href !== "/");

export default function Home() {
  return (
    <AppShell
      moduleTitle="Inicio"
      moduleDescription="Landing interna del sistema comercial Pickup 4x4"
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-900 to-slate-900/40 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
            Pickup 4x4 Intelligence
          </p>
          <h2 className="mt-3 max-w-3xl text-2xl font-bold text-white sm:text-3xl">
            Sistema comercial inteligente para ventas, clientes y accesorios 4x4
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            Centralizá el diario de ventas, la cartera de clientes, el catálogo de
            artículos y las aplicaciones por vehículo. Preparado para conectar los
            Excel históricos y activar inteligencia comercial.
          </p>
          <div className="mt-6">
            <Link href="/dashboard" className={primaryCtaClass}>
              Ir al dashboard comercial
            </Link>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 transition hover:border-emerald-500/40 hover:bg-slate-900"
            >
              <h3 className="font-semibold text-white">{module.label}</h3>
              <p className="mt-2 text-sm text-slate-400">{module.description}</p>
            </Link>
          ))}
        </div>

        <SectionCard
          title="Próximos pasos"
          description="Estructura base lista para datos reales"
        >
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Importar listado de cuentas / clientes desde Excel</li>
            <li>Importar diario de ventas histórico</li>
            <li>Importar artículos y aplicaciones por vehículo</li>
            <li>Conectar Supabase y reglas de oportunidades comerciales</li>
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
