/**
 * Integración KORE / Númina — API pública, solo servidor, READ-ONLY.
 *
 * CONTRATO: `@/lib/kore` es la ÚNICA entrada para el resto de la aplicación.
 * Los demás módulos de `lib/kore/` (client, service, config, soap, xml, …) son
 * internos, no son API pública y el código de aplicación no debe importarlos
 * directamente: solo este archivo y los tests de `lib/kore/__tests__`.
 *
 * `server-only` hace fallar el build si este módulo llega a un Client
 * Component (Next.js lo resuelve internamente, sin dependencia instalada).
 * Los módulos internos no lo importan para poder testearse con `node --test`.
 */
import "server-only";

export {
  listKoreArticulos,
  listKoreCuentas,
  listKoreFamilias,
  listKoreGrupos,
  listKoreMarcasModelos,
  listKoreSubgrupos,
  listKoreVendedores,
} from "./service.ts";
export type { KoreServiceOptions } from "./service.ts";
export type { KoreMarcaModelo, KoreMarcaModeloFilters } from "./marcas-modelos.ts";
export type { KoreFamilia, KoreGrupo, KoreSubgrupo } from "./taxonomia.ts";
export type { KoreArticulo, KoreArticuloFilters } from "./articulos.ts";
export type { KoreCuenta, KoreCuentaFilters } from "./cuentas.ts";
export type { KoreVendedor } from "./vendedores.ts";
export { KoreError } from "./errors.ts";
export type { KoreErrorKind } from "./errors.ts";
