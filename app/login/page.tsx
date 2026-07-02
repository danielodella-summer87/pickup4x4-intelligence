import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  getAdminCredentials,
  isValidSessionCookieValue,
} from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceso interno · Pickup 4x4" };

type Props = { searchParams: Promise<{ from?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { from } = await searchParams;
  const creds = getAdminCredentials();
  const cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (creds && isValidSessionCookieValue(cookieValue, creds)) {
    redirect(from && from.startsWith("/") ? from : "/");
  }

  return (
    <div className="relative min-h-screen bg-[#081726] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Pickup 4x4 Intelligence
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Acceso interno Pickup4x4 Intelligence
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Ingresá tus credenciales para continuar a la app interna.
        </p>

        <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#0d2236] p-6 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.8)]">
          {creds ? (
            <LoginForm from={from} />
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Acceso interno no configurado. Contactá al equipo técnico.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
