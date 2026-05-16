import { getSupabaseUrl } from "@/lib/supabase/env";

export type SupabaseConnectionStatus = {
  configured: boolean;
  connected: boolean;
  message: string;
  errorCode?: string;
};

function logLoad(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    if (detail !== undefined) {
      console.info(`[SupabaseLoad] ${message}`, detail);
    } else {
      console.info(`[SupabaseLoad] ${message}`);
    }
  }
}

/**
 * Verifica conectividad vía API server-side (service role).
 */
export async function verifySupabaseConnection(): Promise<SupabaseConnectionStatus> {
  if (!getSupabaseUrl()) {
    return {
      configured: false,
      connected: false,
      message: "Falta NEXT_PUBLIC_SUPABASE_URL en el entorno del cliente",
    };
  }

  try {
    const res = await fetch("/api/supabase/load-dataset", {
      method: "GET",
      cache: "no-store",
    });

    const body = (await res.json()) as { ok?: boolean; errorMessage?: string };

    if (res.status === 503) {
      return {
        configured: false,
        connected: false,
        message: body.errorMessage ?? "Supabase no configurado en el servidor",
      };
    }

    if (!res.ok && res.status >= 500) {
      logLoad("Conexión fallida", body);
      return {
        configured: true,
        connected: false,
        message: body.errorMessage ?? `Error del servidor (${res.status})`,
      };
    }

    logLoad("Conexión OK (API load-dataset)");
    return {
      configured: true,
      connected: true,
      message: "Conexión con Supabase establecida",
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : "No se pudo contactar la API",
    };
  }
}
