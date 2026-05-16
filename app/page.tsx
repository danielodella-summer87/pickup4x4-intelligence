import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700";

const accesosRapidos = [
  {
    href: "/dashboard",
    titulo: "Dashboard comercial",
    texto: "Lectura ejecutiva de clientes, ventas y catálogo.",
  },
  {
    href: "/distribuidor",
    titulo: "Mostrador táctil",
    texto: "Búsqueda por vehículo y armado de solicitudes en piso.",
  },
  {
    href: "/importar",
    titulo: "Importar Excel",
    texto: "Carga controlada desde planillas históricas o KORE.",
  },
  {
    href: "/clientes",
    titulo: "Consultas",
    texto: "Clientes, ventas, artículos y vehículos con filtros.",
  },
] as const;

export default function Home() {
  return (
    <AppShell
      moduleTitle="Pickup 4x4 Intelligence"
      moduleDescription="Plataforma comercial para ventas, cartera y accesorios 4x4"
    >
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 p-6 sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">
            Pickup 4x4 · Intelligence
          </p>
          <h2 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-white sm:text-4xl">
            Inteligencia comercial para tu operación de repuestos y accesorios
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Unificá ventas, clientes, catálogo y compatibilidad por vehículo en una
            sola experiencia. Esta versión corre en el navegador con datos de
            demostración o Excel importado, lista para mostrar valor antes de
            conectar producción.
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <span className="mt-1 text-emerald-400" aria-hidden>
                ✓
              </span>
              Lectura comercial sin depender de planillas sueltas
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-emerald-400" aria-hidden>
                ✓
              </span>
              Mostrador táctil para atención en mostrador
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-emerald-400" aria-hidden>
                ✓
              </span>
              Importación Excel con normalización y control de calidad
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-emerald-400" aria-hidden>
                ✓
              </span>
              Solicitudes locales para presupuestos en armado
            </li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className={primaryCtaClass}>
              Ver guía de demo
            </Link>
            <Link href="/dashboard" className={secondaryLinkClass}>
              Ir al dashboard
            </Link>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {accesosRapidos.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 transition hover:border-emerald-500/40 hover:bg-slate-900"
            >
              <h3 className="font-semibold text-white group-hover:text-emerald-300">
                {item.titulo}
              </h3>
              <p className="mt-2 text-sm text-slate-400">{item.texto}</p>
            </Link>
          ))}
        </div>

        <SectionCard
          title="Versión actual"
          description="Demostración local en navegador"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                Qué ya funciona
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                <li>Importación y persistencia local de Excel</li>
                <li>Dashboard y módulos de consulta</li>
                <li>Mostrador y solicitudes guardadas en el dispositivo</li>
              </ul>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Próximo salto
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
                <li>Base de datos en la nube (Supabase)</li>
                <li>Conexión API KORE en tiempo real</li>
                <li>Usuarios, envío de solicitudes y reportes avanzados</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Para una presentación guiada al cliente, usá la sección{" "}
            <Link href="/demo" className="font-medium text-emerald-400 hover:underline">
              Demo
            </Link>{" "}
            del menú lateral.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
