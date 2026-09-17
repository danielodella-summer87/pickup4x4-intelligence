/**
 * Fuentes de datos explícitas por dominio (KORE-27 / KORE-28).
 *
 * legacy  → tablas Supabase cargadas desde Excel (+ copia local del Excel importado).
 *           DEFAULT para todos los dominios.
 * mock    → datos de ejemplo. Solo si se elige EXPLÍCITAMENTE, y para todos los dominios a la
 *           vez (no se mezclan datos de ejemplo con datos reales).
 * kore    → catálogo KORE NORMALIZADO ya persistido (kore_articulos resolved + activos y
 *           taxonomía activa), leído server-side vía @/lib/kore-catalog. La app nunca llama
 *           SOAP KORE. Habilitada SOLO para el dominio catálogo.
 * shadow  → observación/comparación de las tablas kore_*. Nunca es catálogo visible: pedirla
 *           como fuente de un dominio es un error explícito.
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

/** Catálogo visible: legacy, mock explícito o KORE normalizado. Nunca shadow. */
export type CatalogSourceId = Extract<DataSourceId, "legacy" | "mock" | "kore">;

export type DomainSources = Readonly<{
  catalog: CatalogSourceId;
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

/** Fuentes que cada dominio admite en la app. */
export const ENABLED_SOURCES_BY_DOMAIN: Readonly<Record<DataDomain, readonly DataSourceId[]>> = Object.freeze({
  catalog: ["legacy", "mock", "kore"],
  sales: ["legacy", "mock"],
  customers: ["legacy", "mock"],
  applications: ["legacy", "mock"],
});

/** Fuentes que existen solo como observación (nunca datos visibles). */
export const OBSERVATION_ONLY_SOURCES: readonly DataSourceId[] = Object.freeze(["shadow"]);

/**
 * legacy → todos los dominios legacy.
 * mixed  → catálogo KORE normalizado + ventas/clientes/aplicaciones legacy.
 * mock   → todos los dominios mock (explícito).
 */
export type DataMode = "legacy" | "mixed" | "mock";

export type DataSourceConfigErrorCode =
  | "UNKNOWN_DATA_SOURCE"
  | "SOURCE_NOT_ALLOWED_FOR_DOMAIN"
  | "SHADOW_OBSERVATION_ONLY"
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
  if (OBSERVATION_ONLY_SOURCES.includes(source)) {
    return {
      ok: false,
      code: "SHADOW_OBSERVATION_ONLY",
      domain,
      message: `"${source}" es solo observación/comparación: no puede ser la fuente visible de ${domain}.`,
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

  const mode: DataMode = mockDomains.length > 0 ? "mock" : requested.catalog === "kore" ? "mixed" : "legacy";
  return { ok: true, mode, sources: Object.freeze(requested) as DomainSources };
}

/** Misma configuración que usa la app (valores inyectados en build por Next). */
export function sameDomainSources(a: DomainSources, b: DomainSources): boolean {
  return DATA_DOMAINS.every((domain) => a[domain] === b[domain]);
}
