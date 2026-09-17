/**
 * Fuentes de datos explícitas por dominio (KORE-27).
 *
 * legacy  → tablas Supabase cargadas desde Excel (+ copia local del Excel importado).
 *           DEFAULT para todos los dominios.
 * mock    → datos de ejemplo. Solo si se elige EXPLÍCITAMENTE, y para todos los dominios a la
 *           vez (no se mezclan datos de ejemplo con datos reales).
 * shadow  → tablas kore_* (repository server-side). Definida, pero bloqueada para la app
 *           hasta un cutover explícito.
 * kore    → KORE en vivo. Definida, pero bloqueada (TRANSPORT_SECURITY_BLOCKER: HTTP sin TLS).
 *
 * Nunca hay fallback silencioso entre fuentes: una configuración inválida es un error
 * explícito, y "legacy vacío" es un estado explícito (no se reemplaza por mock).
 * Resolver fuentes es puro: no toca almacenamiento, no llama clearDataset ni borra Supabase.
 */

export const DATA_SOURCES = ["legacy", "mock", "shadow", "kore"] as const;
export type DataSourceId = (typeof DATA_SOURCES)[number];

export const DATA_DOMAINS = ["catalog", "sales", "customers", "applications"] as const;
export type DataDomain = (typeof DATA_DOMAINS)[number];

/** Ventas nunca vienen de shadow/kore: siguen en legacy (o mock explícito). */
export type SalesSourceId = Extract<DataSourceId, "legacy" | "mock">;

export type DomainSources = Readonly<{
  catalog: DataSourceId;
  sales: SalesSourceId;
  customers: Extract<DataSourceId, "legacy" | "mock">;
  applications: Extract<DataSourceId, "legacy" | "mock">;
}>;

export const DEFAULT_DATA_SOURCE: DataSourceId = "legacy";

export const DEFAULT_DOMAIN_SOURCES: DomainSources = Object.freeze({
  catalog: "legacy",
  sales: "legacy",
  customers: "legacy",
  applications: "legacy",
});

/** Fuentes que cada dominio admite en la app HOY (sin cutover). */
export const ENABLED_SOURCES_BY_DOMAIN: Readonly<Record<DataDomain, readonly DataSourceId[]>> = Object.freeze({
  catalog: ["legacy", "mock"],
  sales: ["legacy", "mock"],
  customers: ["legacy", "mock"],
  applications: ["legacy", "mock"],
});

/** Fuentes definidas para un dominio pero pendientes de cutover explícito. */
export const PENDING_CUTOVER_SOURCES_BY_DOMAIN: Readonly<Record<DataDomain, readonly DataSourceId[]>> = Object.freeze({
  catalog: ["shadow", "kore"],
  sales: [],
  customers: [],
  applications: [],
});

export type DataMode = "legacy" | "mock";

export type DataSourceConfigErrorCode =
  | "UNKNOWN_DATA_SOURCE"
  | "SOURCE_NOT_ALLOWED_FOR_DOMAIN"
  | "CUTOVER_NOT_ENABLED"
  | "MIXED_MOCK_NOT_ALLOWED";

export type DataSourceResolution =
  | { ok: true; mode: DataMode; sources: DomainSources }
  | { ok: false; code: DataSourceConfigErrorCode; domain: DataDomain | null; message: string };

/** Valores crudos de configuración (en la app: NEXT_PUBLIC_PICKUP_DATA_SOURCE / NEXT_PUBLIC_PICKUP_CATALOG_SOURCE). */
export type DataSourceEnv = {
  dataSource?: string | null;
  catalogSource?: string | null;
};

function parseSource(raw: string | null | undefined): DataSourceId | "" | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return "";
  return (DATA_SOURCES as readonly string[]).includes(value) ? (value as DataSourceId) : null;
}

function checkDomain(domain: DataDomain, source: DataSourceId): DataSourceResolution | null {
  if (ENABLED_SOURCES_BY_DOMAIN[domain].includes(source)) return null;
  if (PENDING_CUTOVER_SOURCES_BY_DOMAIN[domain].includes(source)) {
    return {
      ok: false,
      code: "CUTOVER_NOT_ENABLED",
      domain,
      message: `La fuente "${source}" para ${domain} está definida pero no habilitada (sin cutover).`,
    };
  }
  return {
    ok: false,
    code: "SOURCE_NOT_ALLOWED_FOR_DOMAIN",
    domain,
    message: `La fuente "${source}" no está permitida para ${domain}.`,
  };
}

/**
 * Resuelve la fuente de cada dominio. Sin valores → legacy en todo. Nunca devuelve mock
 * salvo pedido explícito, y nunca cae a otra fuente ante un valor inválido.
 */
export function resolveDataSources(env: DataSourceEnv = {}): DataSourceResolution {
  const global = parseSource(env.dataSource);
  if (global === null) {
    return { ok: false, code: "UNKNOWN_DATA_SOURCE", domain: null, message: "Fuente de datos desconocida." };
  }
  const catalogParsed = parseSource(env.catalogSource);
  if (catalogParsed === null) {
    return { ok: false, code: "UNKNOWN_DATA_SOURCE", domain: "catalog", message: "Fuente de catálogo desconocida." };
  }

  const base: DataSourceId = global === "" ? DEFAULT_DATA_SOURCE : global;
  const catalog: DataSourceId = catalogParsed === "" ? base : catalogParsed;

  const requested: Record<DataDomain, DataSourceId> = { catalog, sales: base, customers: base, applications: base };
  // Primero los dominios bloqueados a legacy/mock (ventas manda), después el catálogo.
  for (const domain of ["sales", "customers", "applications", "catalog"] as const) {
    const error = checkDomain(domain, requested[domain]);
    if (error) return error;
  }

  const mockDomains = DATA_DOMAINS.filter((domain) => requested[domain] === "mock");
  if (mockDomains.length > 0 && mockDomains.length < DATA_DOMAINS.length) {
    return {
      ok: false,
      code: "MIXED_MOCK_NOT_ALLOWED",
      domain: DATA_DOMAINS.find((domain) => requested[domain] !== "mock") ?? null,
      message: "mock debe elegirse para todos los dominios a la vez.",
    };
  }

  return {
    ok: true,
    mode: mockDomains.length > 0 ? "mock" : "legacy",
    sources: Object.freeze(requested) as DomainSources,
  };
}
