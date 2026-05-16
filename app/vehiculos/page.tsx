"use client";

import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { getModelosConAplicaciones } from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const MODELOS_PREVIEW = 12;

export default function VehiculosPage() {
  const { data, source } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source);
  const modelos = getModelosConAplicaciones(data);
  const modelosPreview = modelos.slice(0, MODELOS_PREVIEW);
  const totalAplicaciones = data.articuloAplicaciones.length;

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
            label="Marcas"
            value={String(data.vehiculoMarcas.length)}
          />
          <StatCard
            label="Modelos"
            value={String(data.vehiculoModelos.length)}
          />
          <StatCard
            label="Aplicaciones"
            value={String(totalAplicaciones)}
            hint="SKU × vehículo"
          />
        </div>

        {modelos.length > MODELOS_PREVIEW ? (
          <p className="text-sm text-slate-500">
            Mostrando {MODELOS_PREVIEW} de {modelos.length} modelos con aplicaciones.
          </p>
        ) : null}

        {modelosPreview.map((modelo) => (
          <SectionCard
            key={modelo.modeloId}
            title={`${modelo.marcaNombre} ${modelo.modeloNombre}`}
            description={`${modelo.articulos.length} artículo(s) aplican a este modelo`}
          >
            <ul className="space-y-2 text-sm text-slate-200">
              {modelo.articulos.slice(0, 8).map((articulo) => (
                <li
                  key={articulo.codigoAplicacion}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
                >
                  <span>
                    <span className="font-mono text-xs text-emerald-400">
                      {articulo.codigoUnico}
                    </span>
                    <span className="mx-2 text-slate-600">·</span>
                    {articulo.descripcion}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {articulo.codigoAplicacion}
                  </span>
                </li>
              ))}
              {modelo.articulos.length > 8 ? (
                <li className="text-xs text-slate-500">
                  +{modelo.articulos.length - 8} artículos más en este modelo
                </li>
              ) : null}
            </ul>
          </SectionCard>
        ))}

        <div>
          <button type="button" className={primaryCtaClass}>
            Consultar por vehículo
          </button>
        </div>
      </div>
    </AppShell>
  );
}
