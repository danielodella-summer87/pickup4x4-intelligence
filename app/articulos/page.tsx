"use client";

import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  calcularArticulosBajoStock,
  calcularCantidadArticulos,
  getArticulosConConteoAplicaciones,
} from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

export default function ArticulosPage() {
  const { data, source } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source);
  const articulos = getArticulosConConteoAplicaciones(data);
  const activos = calcularCantidadArticulos(data);
  const categorias = new Set(
    data.articulos.map((articulo) => articulo.categoria).filter(Boolean),
  ).size;
  const bajoStock = calcularArticulosBajoStock(data);

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
          <StatCard label="Artículos activos" value={String(activos)} />
          <StatCard label="Categorías" value={String(categorias)} />
          <StatCard label="Bajo stock" value={String(bajoStock)} hint="Reponer prioridad" trend="down" />
        </div>

        <SectionCard title="Catálogo de artículos" description={`Artículos · ${sourceHint}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 font-medium">Código</th>
                  <th className="pb-2 font-medium">Descripción</th>
                  <th className="pb-2 font-medium">Familia</th>
                  <th className="pb-2 font-medium">Grupo</th>
                  <th className="pb-2 text-right font-medium">Stock</th>
                  <th className="pb-2 text-right font-medium">Aplicaciones</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {articulos.map((articulo) => (
                  <tr key={articulo.codigoUnico} className="border-t border-slate-800">
                    <td className="py-2.5 font-mono text-xs">{articulo.codigoUnico}</td>
                    <td className="py-2.5">{articulo.descripcion}</td>
                    <td className="py-2.5">{articulo.rubro ?? "—"}</td>
                    <td className="py-2.5">{articulo.categoria ?? "—"}</td>
                    <td className="py-2.5 text-right">{articulo.stock ?? 0}</td>
                    <td className="py-2.5 text-right">{articulo.cantidadAplicaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div>
          <button type="button" className={primaryCtaClass}>
            Buscar artículo
          </button>
        </div>
      </div>
    </AppShell>
  );
}
