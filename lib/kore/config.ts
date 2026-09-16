import { KoreError } from "./errors.ts";

/**
 * Configuración de KORE. Solo servidor: nunca importar desde componentes
 * cliente ni exponer con prefijo NEXT_PUBLIC_.
 */

export const KORE_ENV_KEYS = ["KORE_BASE_URL", "KORE_COMPANY_NUMBER", "KORE_SECRET_KEY"] as const;

export type KoreEnv = Readonly<Record<string, string | undefined>>;

export type KoreConfig = {
  readonly baseUrl: string;
  readonly companyNumber: string;
  /** No enumerable: no aparece en JSON.stringify ni en console.log. */
  readonly secretKey: string;
};

/** Valida fail-fast. Los mensajes nombran variables, nunca sus valores. */
export function parseKoreConfig(env: KoreEnv): KoreConfig {
  const missing = KORE_ENV_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new KoreError({
      kind: "config",
      message: `Faltan variables de entorno KORE: ${missing.join(", ")}`,
    });
  }

  const baseUrl = env.KORE_BASE_URL!.trim();
  const companyNumber = env.KORE_COMPANY_NUMBER!.trim();
  const secretKey = env.KORE_SECRET_KEY!.trim();

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new KoreError({ kind: "config", message: "KORE_BASE_URL no es una URL válida" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new KoreError({ kind: "config", message: "KORE_BASE_URL debe usar http o https" });
  }
  if (url.username || url.password) {
    throw new KoreError({
      kind: "config",
      message: "KORE_BASE_URL no debe incluir credenciales",
    });
  }
  if (!/^[0-9]+$/.test(companyNumber)) {
    throw new KoreError({ kind: "config", message: "KORE_COMPANY_NUMBER debe ser numérico" });
  }

  const config = { baseUrl, companyNumber } as KoreConfig;
  Object.defineProperty(config, "secretKey", { value: secretKey, enumerable: false });
  return Object.freeze(config);
}
