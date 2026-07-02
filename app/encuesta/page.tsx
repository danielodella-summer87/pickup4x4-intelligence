import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSlugEncuestaActiva } from "@/lib/inteligencia-mercado/server";

export const metadata: Metadata = { title: "Encuesta · Pickup 4x4" };

// Sin esto, Next prerenderiza esta página en build time y "congela" el
// redirect a la encuesta que estaba activa en ese momento. Necesita
// resolverse en cada request para reflejar la encuesta activa vigente.
export const dynamic = "force-dynamic";

export default async function EncuestaIndexPage() {
  const slug = await getSlugEncuestaActiva();
  if (slug) {
    redirect(`/encuesta/${slug}`);
  }

  return (
    <div className="relative min-h-screen bg-[#081726] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Pickup 4x4 · Voz del distribuidor
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          No hay encuestas disponibles en este momento.
        </h1>
      </div>
    </div>
  );
}
