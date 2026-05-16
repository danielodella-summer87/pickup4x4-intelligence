import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/env";

/**
 * Cliente con service role — solo en Route Handlers / Server Actions.
 * No importar desde componentes cliente.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> | null {
  if (!isSupabaseServiceConfigured()) return null;

  return createClient<Database>(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
