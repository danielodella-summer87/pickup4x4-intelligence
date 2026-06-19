"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { apiListCampaigns } from "@/lib/campanas/campaign-storage";
import type { CampaignSummaryDTO } from "@/lib/campanas/campaign-types";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-white";

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function openHref(c: CampaignSummaryDTO): string {
  const base = c.preset === "lonas" ? "/campanas/lonas" : "/campanas/articulos";
  return `${base}?id=${c.id}`;
}

export default function CampanasListPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiListCampaigns();
      if (cancelled) return;
      if (res.ok) {
        setCampaigns(res.data);
        setError(null);
      } else {
        setCampaigns([]);
        setError(res.errorMessage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      moduleTitle="Campañas guardadas"
      moduleDescription="Campañas comerciales por artículos persistidas en Supabase."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Link href="/campanas/articulos" className={primaryCtaClass}>
            Nueva campaña
          </Link>
          <Link href="/campanas/lonas" className={secondaryBtnClass}>
            Renovación de lonas
          </Link>
        </div>

        <SectionCard
          title="Listado de campañas"
          description={
            campaigns === null
              ? "Cargando…"
              : `${campaigns.length} campaña(s) guardada(s).`
          }
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          {campaigns === null ? (
            <p className="text-sm text-slate-400">Cargando campañas…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hay campañas guardadas todavía. Creá una desde &quot;Nueva campaña&quot; o
              &quot;Renovación de lonas&quot;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 pr-3 font-medium">Nombre</th>
                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                    <th className="pb-2 pr-3 font-medium">Preset</th>
                    <th className="pb-2 pr-3 font-medium">Estado</th>
                    <th className="pb-2 pr-3 text-right font-medium">Artículos</th>
                    <th className="pb-2 pr-3 text-right font-medium">Clientes</th>
                    <th className="pb-2 pr-3 font-medium">Actualizada</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-t border-slate-800">
                      <td className="py-2.5 pr-3 font-medium">{c.name}</td>
                      <td className="py-2.5 pr-3">{c.type ?? "—"}</td>
                      <td className="py-2.5 pr-3">{c.preset ?? "—"}</td>
                      <td className="py-2.5 pr-3">{c.status}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{c.itemsCount}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{c.resultsCount}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{formatFecha(c.updatedAt)}</td>
                      <td className="py-2.5 text-right">
                        <Link href={openHref(c)} className="text-xs text-emerald-300 underline hover:text-emerald-200">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
