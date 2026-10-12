/**
 * Acceso desde el panel admin (cliente del navegador, clave pública).
 * Las lecturas pasan por la API admin; la edición de investigaciones usa el cliente público. La inserción de respuestas la
 * hace la API con service role (ver lib/inteligencia-mercado/server.ts).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  DbMercadoInvestigacion,
} from "@/lib/supabase/types";
import {
  dbRowToInvestigacion,
  investigacionToDbInsert,
} from "@/lib/inteligencia-mercado/mappers";
import type {
  Investigacion,
  Respuesta,
  RespuestaValor,
} from "@/lib/inteligencia-mercado/types";

const NOT_CONFIGURED =
  "Supabase no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o ANON_KEY) en .env.local.";

function friendly(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("mercado_") &&
    (lower.includes("does not exist") ||
      lower.includes("no existe") ||
      lower.includes("schema cache"))
  ) {
    return "Las tablas de Inteligencia de Mercado no existen en Supabase. Ejecutá la migración 20260629_inteligencia_mercado.sql en el SQL Editor.";
  }
  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "Sin permisos para acceder a las tablas de mercado. Verificá las políticas RLS en Supabase.";
  }
  return message;
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; errorMessage: string };

function err(message: string): Err {
  return { ok: false, errorMessage: friendly(message) };
}

/** Lectura administrativa mediante el servidor, sin acceso anon a las tablas. */
async function loadAdminData<T extends object>(
  tipo: string | URLSearchParams,
): Promise<Ok<T> | Err> {
  const params = typeof tipo === "string" ? new URLSearchParams({ tipo }) : tipo;
  try {
    const res = await fetch(`/api/inteligencia-mercado/datos?${params}`, {
      cache: "no-store",
    });
    const data = await res.json() as Ok<T> | (Err & { error?: string });
    if (!res.ok || !data.ok) {
      const failure = data as Err & { error?: string };
      return err(failure.errorMessage ?? failure.error ?? "No se pudieron cargar los datos.");
    }
    return data;
  } catch {
    return err("No se pudo conectar con el servidor.");
  }
}

// ── Investigaciones ──────────────────────────────────────────────────────-

export async function loadInvestigaciones(): Promise<
  Ok<{ investigaciones: Investigacion[] }> | Err
> {
  return loadAdminData<{ investigaciones: Investigacion[] }>("investigaciones");
}

export async function saveInvestigacion(
  inv: Investigacion,
): Promise<Ok<{ investigacion: Investigacion }> | Err> {
  if (!isSupabaseConfigured()) return err(NOT_CONFIGURED);
  const client = createSupabaseBrowserClient();
  if (!client) return err("No se pudo inicializar el cliente de Supabase.");

  const { data, error } = await client
    .from("mercado_investigaciones")
    .upsert(investigacionToDbInsert(inv))
    .select("*")
    .single();

  if (error) return err(error.message);
  return {
    ok: true,
    investigacion: dbRowToInvestigacion(data as DbMercadoInvestigacion),
  };
}

export async function setEstadoInvestigacion(
  id: string,
  estado: Investigacion["estado"],
): Promise<Ok<{ investigacion: Investigacion }> | Err> {
  if (!isSupabaseConfigured()) return err(NOT_CONFIGURED);
  const client = createSupabaseBrowserClient();
  if (!client) return err("No se pudo inicializar el cliente de Supabase.");

  const { data, error } = await client
    .from("mercado_investigaciones")
    .update({ estado })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return err(error.message);
  return {
    ok: true,
    investigacion: dbRowToInvestigacion(data as DbMercadoInvestigacion),
  };
}

export async function deleteInvestigacion(id: string): Promise<Ok<object> | Err> {
  if (!isSupabaseConfigured()) return err(NOT_CONFIGURED);
  const client = createSupabaseBrowserClient();
  if (!client) return err("No se pudo inicializar el cliente de Supabase.");

  const { error } = await client
    .from("mercado_investigaciones")
    .delete()
    .eq("id", id);

  if (error) return err(error.message);
  return { ok: true };
}

// ── Respuestas ────────────────────────────────────────────────────────────-
// Lectura y edición de respuestas mediante la API administrativa protegida.

export async function loadRespuestas(options?: {
  investigacionId?: string;
}): Promise<Ok<{ respuestas: Respuesta[] }> | Err> {
  const params = new URLSearchParams({ tipo: "respuestas" });
  if (options?.investigacionId) {
    params.set("investigacionId", options.investigacionId);
  }
  return loadAdminData<{ respuestas: Respuesta[] }>(params);
}

export async function updateRespuestaAdmin(
  id: string,
  patch: {
    distribuidorNombre?: string | null;
    departamento?: string | null;
    giro?: string | null;
    cargo?: string | null;
    respuestas?: Record<string, RespuestaValor>;
  },
): Promise<Ok<object> | Err> {
  try {
    const res = await fetch(
      `/api/inteligencia-mercado/respuestas/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const data = (await res.json()) as { ok: boolean; errorMessage?: string };
    if (!res.ok || !data.ok) {
      return err(data.errorMessage ?? "No se pudo guardar la respuesta.");
    }
    return { ok: true };
  } catch {
    return err("No se pudo conectar con el servidor.");
  }
}

export async function deleteRespuestaAdmin(id: string): Promise<Ok<object> | Err> {
  try {
    const res = await fetch(
      `/api/inteligencia-mercado/respuestas/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const data = (await res.json()) as { ok: boolean; errorMessage?: string };
    if (!res.ok || !data.ok) {
      return err(data.errorMessage ?? "No se pudo borrar la respuesta.");
    }
    return { ok: true };
  } catch {
    return err("No se pudo conectar con el servidor.");
  }
}
