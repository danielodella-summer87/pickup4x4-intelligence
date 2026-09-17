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
  listKoreCuentasGruposDescuentos,
  listKoreDescuentosXCantidad,
  listKoreFamilias,
  listKoreGrupos,
  listKoreImagenes,
  listKoreLotes,
  listKoreLotesYUbicaciones,
  listKoreMarcasModelos,
  listKorePrecios,
  listKorePreciosxArticulo,
  listKoreStock,
  listKoreSubgrupos,
  listKoreUnidadesYFactores,
  listKoreVendedores,
} from "./service.ts";
export type { KoreServiceOptions } from "./service.ts";
export type {
  KoreCuentaGrupoDescuento,
  KoreCuentaGrupoDescuentoFilters,
  KoreDescuentoXCantidad,
  KoreDescuentoXCantidadFilters,
} from "./descuentos.ts";
export type { KoreImagen, KoreImagenFilters } from "./imagenes.ts";
export type { KoreLote, KoreLoteUbicacion } from "./lotes.ts";
export type { KoreUnidadArticulo } from "./unidades.ts";
export type { KoreListaPrecioArticulo, KorePrecio, KorePrecioFilters } from "./precios.ts";
export type { KoreStock, KoreStockFilters } from "./stock.ts";
export type { KoreMarcaModelo, KoreMarcaModeloFilters } from "./marcas-modelos.ts";
export type { KoreFamilia, KoreGrupo, KoreSubgrupo } from "./taxonomia.ts";
export type { KoreArticulo, KoreArticuloFilters } from "./articulos.ts";
export type { KoreCuenta, KoreCuentaFilters } from "./cuentas.ts";
export type { KoreVendedor } from "./vendedores.ts";
export { KoreError } from "./errors.ts";
export type { KoreErrorKind } from "./errors.ts";
