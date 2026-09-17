import { resolveDataSources, type DataSourceResolution } from "./sources.ts";

/**
 * Configuración de fuentes de la APP (KORE-28). Única lectura de las variables:
 *   NEXT_PUBLIC_PICKUP_DATA_SOURCE     (legacy | mock)          default legacy
 *   NEXT_PUBLIC_PICKUP_CATALOG_SOURCE  (legacy | mock | kore)   default = la global
 *
 * Next inyecta `process.env.NEXT_PUBLIC_*` en BUILD tanto en el bundle del servidor como en
 * el del cliente, así que ambos resuelven la misma configuración. Cambiar el valor después
 * del build no cambia la app: hay que volver a construir.
 *
 * La fuente nunca se toma de la request (query params, headers, cookies).
 */
export function configuredDataSources(): DataSourceResolution {
  return resolveDataSources({
    dataSource: process.env.NEXT_PUBLIC_PICKUP_DATA_SOURCE,
    catalogSource: process.env.NEXT_PUBLIC_PICKUP_CATALOG_SOURCE,
  });
}
