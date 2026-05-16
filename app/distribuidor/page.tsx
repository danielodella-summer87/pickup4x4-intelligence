import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";

const primaryCtaClass =
  "inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-emerald-400 sm:w-auto";

const quickFilters = [
  "Toyota Hilux 2020+",
  "Ford Ranger",
  "Barras antivuelco",
  "Estribos",
  "Lonas",
];

export default function DistribuidorPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <SectionCard
          title="Modo mostrador táctil"
          description="Interfaz simplificada para consulta en distribuidor"
        >
          <p className="text-sm text-slate-300">
            Buscá por vehículo, categoría o SKU. Los resultados mostrarán stock,
            aplicación y opción de solicitar presupuesto.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              type="search"
              placeholder="Marca, modelo o año..."
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500"
              readOnly
            />
            <input
              type="search"
              placeholder="Categoría o SKU..."
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500"
              readOnly
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <span
                key={filter}
                className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300"
              >
                {filter}
              </span>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Resultados recientes" description="Mock de consultas">
          <ul className="space-y-3 text-sm">
            <li className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              BAR-450 · Barra antivuelco · Hilux 2016-2024 · Stock: 42
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              EST-220 · Estribos aluminio · Ranger 2012-2023 · Stock: 18
            </li>
          </ul>
        </SectionCard>

        <Link href="/solicitudes" className={primaryCtaClass}>
          Crear solicitud de presupuesto
        </Link>
      </div>
    </AppShell>
  );
}
