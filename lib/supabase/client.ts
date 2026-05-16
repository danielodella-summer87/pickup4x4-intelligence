"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Cliente Supabase para el navegador (solo clave pública).
 * Operaciones masivas de dataset usan API routes con service role.
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;

  if (!browserClient) {
    browserClient = createClient<Database>(
      getSupabaseUrl()!,
      getSupabasePublishableKey()!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return browserClient;
}

export function resetSupabaseBrowserClient(): void {
  browserClient = null;
}
