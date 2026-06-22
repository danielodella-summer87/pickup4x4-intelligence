"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { loadRecambio, type RecambioData, type RecambioItem } from "@/lib/campanas/recambio-data";

const PRIO_RANK: Record<string, number> = {
  "Prioridad alta": 4,
  "Prioridad media": 3,
  "Prioridad baja": 2,
  "No contactar todavía": 1,
  "No contactar (no identificable)": 0,
};

function prioBadgeClass(prioridad: string): string {
  if (prioridad === "Prioridad alta") return "bg-rose-500/15 text-rose-200 border border-rose-500/30";
  if (prioridad === "Prioridad media") return "bg-amber-500/15 text-amber-200 border border-amber-500/30";
  if (prioridad === "Prioridad baja") return "bg-yellow-500/10 text-yellow-200 border border-yellow-500/25";
  return "bg-slate-600/20 text-slate-300 border border-slate-600/40";
}

function prioShort(prioridad: string): string {
  return prioridad.replace("Prioridad ", "").replace("No contactar todavía", "No contactar");
}

function contactDotClass(estado: string): string {
  if (estado.startsWith("Ubicable")) return "bg-emerald-400";
  if (estado.startsWith("Revisar") || estado.startsWith("Solo")) return "bg-amber-400";
  return "bg-rose-400";
}

function StatCard({ value, label, accent }: { value: number | string; label: string; accent?: string }) {
  return (
    <div className={`rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-3 ${accent ?? ""}`}>
      <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

export default function CampanasPage() {
  const [data, setData] = useState<RecambioData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await loadRecambio();
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        setStatus("ok");
      } else {
        setStatus(res.missing ? "empty" : "error");
        setErrorMessage(res.errorMessage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ranking = candidatos (alta/media/baja) ordenados por prioridad y antigüedad.
  const ranking: RecambioItem[] = (data?.items ?? [])
    .filter((i) => i.esCandidato)
    .sort(
      (a, b) =>
        (PRIO_RANK[b.prioridad] ?? 0) - (PRIO_RANK[a.prioridad] ?? 0) ||
        b.mesesDesdeUltima - a.mesesDesdeUltima,
    );

  const r = data?.resumen;

  return (
    <AppShell
      moduleTitle="Campaña de recambio — cubre cajas / lonas"
      moduleDescription="Vista solo-lectura. Campaña persistida en Supabase (sin recálculo en vivo)."
    >
      <div className="space-y-6">
        {status === "loading" && <p className="text-sm text-slate-400">Cargando campaña…</p>}

        {status === "empty" && (
          <SectionCard title="Sin base de campaña todavía" description="No se encontró /data/recambio.json.">
            <p className="text-sm text-slate-300">
              {errorMessage}
            </p>
          </SectionCard>
        )}

        {status === "error" && (
          <SectionCard title="No se pudo leer la campaña" description="Error al cargar los datos.">
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {errorMessage}
            </p>
          </SectionCard>
        )}

        {status === "ok" && r && data && (
          <>
            <SectionCard
              title="Resumen ejecutivo"
              description={`${data.nombre} · ${r.total} candidatos · generada ${data.generadoEl} · campaña ${data.campaignId.slice(0, 8)}`}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard value={r.total} label="Candidatos totales" />
                <StatCard value={r.alta} label="Prioridad alta" accent="border-t-2 border-t-rose-500/60" />
                <StatCard value={r.media} label="Prioridad media" accent="border-t-2 border-t-amber-500/60" />
                <StatCard value={r.baja} label="Prioridad baja" accent="border-t-2 border-t-yellow-500/50" />
                <StatCard value={r.noContactar} label="No contactar aún" accent="border-t-2 border-t-slate-500/50" />
                <StatCard value={r.listasParaTrabajar} label="Listas para trabajar" accent="border-t-2 border-t-emerald-500/60" />
                <StatCard value={r.frenadasPorContacto} label="Frenadas por falta de contacto" accent="border-t-2 border-t-rose-500/40" />
              </div>
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                La base no tiene teléfono ni email (no existe esa fuente en el proyecto). Las cuentas son
                ubicables por zona y vendedor; el contacto directo queda frenado hasta conseguir ese export.
              </p>
            </SectionCard>

            <SectionCard
              title="Ranking de candidatos"
              description={`${ranking.length} cuentas contactables (alta + media + baja), ordenadas por prioridad y antigüedad.`}
            >
              <div className="max-h-[640px] overflow-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900/95 text-xs text-slate-400">
                    <tr>
                      <th className="px-2.5 py-2 font-medium">Prioridad</th>
                      <th className="px-2.5 py-2 font-medium">Cuenta</th>
                      <th className="px-2.5 py-2 font-medium">Razón social</th>
                      <th className="px-2.5 py-2 font-medium">Producto actual</th>
                      <th className="px-2.5 py-2 font-medium">Últ. compra</th>
                      <th className="px-2.5 py-2 text-right font-medium">Meses</th>
                      <th className="px-2.5 py-2 font-medium">Producto sugerido</th>
                      <th className="px-2.5 py-2 font-medium">Recomendación</th>
                      <th className="px-2.5 py-2 font-medium">Contactabilidad</th>
                      <th className="px-2.5 py-2 font-medium">Vendedor</th>
                      <th className="px-2.5 py-2 font-medium">Zona</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {ranking.map((i) => (
                      <tr key={i.cuenta} className="border-t border-slate-800/70 align-top">
                        <td className="px-2.5 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${prioBadgeClass(i.prioridad)}`}>
                            {prioShort(i.prioridad)}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 tabular-nums">{i.cuenta}</td>
                        <td className="px-2.5 py-2 font-medium">{i.razonSocial}</td>
                        <td className="px-2.5 py-2 text-slate-300">{i.productoActual}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{i.ultimaCompra}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{i.mesesDesdeUltima}</td>
                        <td className="px-2.5 py-2 text-slate-300">{i.productoSugerido}</td>
                        <td className="px-2.5 py-2">{i.recomendacion}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${contactDotClass(i.estadoContactabilidad)}`} />
                          {i.estadoContactabilidad}
                        </td>
                        <td className="px-2.5 py-2">{i.vendedor || "—"}</td>
                        <td className="px-2.5 py-2">{i.zona || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
