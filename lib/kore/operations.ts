import { KoreError } from "./errors.ts";

/**
 * Allowlist READ-ONLY de operaciones KORE habilitadas.
 *
 * Solo lo que figura acá puede salir a red. Ampliar de a una operación, y
 * únicamente con métodos de lectura revisados contra el WSDL y la
 * documentación oficial.
 */
export const KORE_READ_ONLY_OPERATIONS = [
  "ListarVendedores",
  "ListarCuentas",
  "ListarArticulos",
  "ListarFamilias",
  "ListarGrupos",
  "ListarSubgrupos",
  "ListarMarcasModelos",
  "ListarStock",
  "ListarPreciosxArticulo",
  "ListarPrecios",
  "ListarImagenes",
  "ListarDescuentosXCantidad",
  "ListarCuentasGruposDescuentos",
  "ListarUnidadesYFactoresxArticulo",
  "ListarLotesxCodigoUnico",
  "ListarLotesYUbicacionesxCodigoUnico",
] as const;

export type KoreReadOnlyOperation = (typeof KORE_READ_ONLY_OPERATIONS)[number];

/** Segunda barrera: nombres que indican escritura o estado del lado de KORE. */
const WRITE_LIKE_OPERATION =
  /^(ABM|Alta|Baja|Crear|Agregar|Marcar|Modificar|Eliminar|Borrar|Anular|Actualizar|Grabar|Guardar|Login)|Nuevos$/i;

export function isReadOnlyOperation(operation: string): operation is KoreReadOnlyOperation {
  return (
    !WRITE_LIKE_OPERATION.test(operation) &&
    (KORE_READ_ONLY_OPERATIONS as readonly string[]).includes(operation)
  );
}

export function assertReadOnlyOperation(
  operation: string,
): asserts operation is KoreReadOnlyOperation {
  if (!isReadOnlyOperation(operation)) {
    throw new KoreError({
      kind: "operation_not_allowed",
      operation: operation.slice(0, 80),
      message: "Operación KORE no permitida por la allowlist read-only",
    });
  }
}
