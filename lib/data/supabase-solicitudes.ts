import { solicitudLocalToDbRow, dbRowToSolicitudLocal } from "@/lib/data/supabase-mappers";
import type { SolicitudLocal, SolicitudLocalEstado } from "@/lib/models/solicitud";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function logLoad(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[SupabaseLoad] ${message}`, detail);
    } else {
      console.info(`[SupabaseLoad] ${message}`);
    }
  }
}

export async function loadSolicitudesFromSupabase(): Promise<{
  ok: boolean;
  solicitudes: SolicitudLocal[];
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, solicitudes: [], errorMessage: "Supabase no configurado" };
  }

  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, solicitudes: [], errorMessage: "Cliente no disponible" };
  }

  const { data, error } = await client
    .from("solicitudes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    logLoad("Error cargando solicitudes", error);
    return { ok: false, solicitudes: [], errorMessage: error.message };
  }

  const solicitudes = (data ?? []).map(dbRowToSolicitudLocal);
  logLoad("Solicitudes cargadas", { count: solicitudes.length });
  return { ok: true, solicitudes };
}

export async function insertSolicitudInSupabase(
  solicitud: SolicitudLocal,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };

  const { error } = await client.from("solicitudes").insert(solicitudLocalToDbRow(solicitud));
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

export async function updateSolicitudEstadoInSupabase(
  id: string,
  estado: SolicitudLocalEstado,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };

  const { error } = await client.from("solicitudes").update({ estado }).eq("id", id);
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}

export async function deleteSolicitudFromSupabase(
  id: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const client = createSupabaseBrowserClient();
  if (!client) return { ok: false, errorMessage: "Cliente no disponible" };

  const { error } = await client.from("solicitudes").delete().eq("id", id);
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true };
}
