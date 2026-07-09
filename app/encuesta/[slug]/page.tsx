import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getInvestigacionParaPreview,
  getInvestigacionPublica,
} from "@/lib/inteligencia-mercado/server";
import {
  SESSION_COOKIE_NAME,
  getAdminCredentials,
  isValidSessionCookieValue,
} from "@/lib/auth/session";
import { EncuestaInterview } from "./EncuestaInterview";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

/** true si hay una sesión admin válida (mismo criterio que proxy.ts). */
async function haySesionAdmin(): Promise<boolean> {
  const creds = getAdminCredentials();
  if (!creds) return false;
  const store = await cookies();
  return isValidSessionCookieValue(store.get(SESSION_COOKIE_NAME)?.value, creds);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;

  const result =
    preview === "1" && (await haySesionAdmin())
      ? await getInvestigacionParaPreview(slug)
      : await getInvestigacionPublica(slug);

  if (!result.ok) {
    return { title: "Encuesta · Pickup 4x4" };
  }
  return {
    title: `${result.data.titulo} · Pickup 4x4`,
    description: result.data.descripcion,
  };
}

function EstadoNoDisponible({ mensaje }: { mensaje: string }) {
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
          Encuesta no disponible
        </h1>
        <p className="mt-3 text-base text-slate-400">{mensaje}</p>
      </div>
    </div>
  );
}

export default async function EncuestaPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;

  if (preview === "1") {
    if (!(await haySesionAdmin())) {
      redirect(`/login?from=${encodeURIComponent(`/encuesta/${slug}?preview=1`)}`);
    }
    const result = await getInvestigacionParaPreview(slug);
    if (!result.ok) {
      return <EstadoNoDisponible mensaje={result.errorMessage} />;
    }
    return <EncuestaInterview investigacion={result.data} preview />;
  }

  const result = await getInvestigacionPublica(slug);
  if (!result.ok) {
    return <EstadoNoDisponible mensaje={result.errorMessage} />;
  }

  return <EncuestaInterview investigacion={result.data} />;
}
