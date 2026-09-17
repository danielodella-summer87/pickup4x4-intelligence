# KORE — Contratos restantes de catálogo, producto y comercial (KORE-20)

Inspección read-only de 7 operaciones con un artículo de prueba determinista
(el mismo de KORE-11/16) y, para `ListarDescuentosXCantidad`, una lista de
precios real obtenida en memoria. Este documento no contiene códigos, listas,
imágenes, cantidades, lotes, monedas, cuentas ni credenciales reales.

La respuesta real del servidor gobierna. Los nombres de operación son los del
WSDL real.

## Resumen

| Operación | Estado | SOAP | Tabla real | Filas observadas |
|---|---|---|---|---|
| `ListarImagenes` | IMPLEMENTED | 1.2 | `Imagenes` (sin schema/diffgram) | 1 |
| `ListarDescuentosXCantidad` | IMPLEMENTED | 1.2 | `DescuentoXCantidad` | 0 |
| `ListarCuentasGruposDescuentos` | IMPLEMENTED | 1.2 | `DescuentoXCantidad` | 0 |
| `ListarUnidadesYFactoresxArticulo` | IMPLEMENTED | 1.2 | `UNIDADES` | 0 |
| `ListarLotesxCodigoUnico` | IMPLEMENTED | 1.1 | `Lotes` | 0 |
| `ListarLotesYUbicacionesxCodigoUnico` | IMPLEMENTED | 1.2 | `Lotes` | 0 |
| `GetTipodeCambio` | **BLOCKED_OR_UNRESOLVED** | 1.1 | — (`Respuesta` Codigo=ERROR) | — |

"0 filas": el XSD real se recibió y valida el contrato de campos, pero el
formato de filas reales (padding, escalas, formatos de fecha) **no está
observado**. Los parsers aceptan raw + trim y fallan cerrado ante campos o
tablas inesperados.

Reglas comunes de implementación:
- Tabla exacta y campos exactos (`expectedFields`), fail-closed.
- Textos: raw exacto + trim. Enteros: entero seguro. `xs:unsignedByte`: 0..255.
- `xs:double`: raw exacto + número finito de conveniencia (INF/NaN inválidos).
- Sin deduplicar ni PK.
- Filtros sensibles, validados antes de leer el env, crear el cliente o hacer fetch.

## ListarImagenes

- **Request:** `CodigoUnicoInicial`, `CodigoUnicoFinal` (Varchar 22).
- **Respuesta real:** `ListarImagenesResult → DataSet → Imagenes*`, **sin
  `xs:schema` ni diffgram** (no hay tipos XSD). Campos: `CodigoUnico`, `Imagen`
  (Base64). Observado: 1 fila con 1 imagen, del orden de cientos de KB.
- **Diferencias con el PDF:** ninguna estructural (el PDF muestra la misma forma).
- **Seguridad local:** se exige al menos un código efectivo. Nunca se permite
  pedir todas las imágenes.
- **Modelo:** `KoreImagen { codigoUnicoRaw, codigoUnico, imagenBase64 }`.
  - El Base64 se preserva exacto y **no se decodifica**; solo se valida léxicamente.
  - `CodigoUnico` es obligatorio.
- **Sin resolver:**
  - Si un artículo con varias imágenes devuelve varias filas o varios
    `<Imagen>` por fila; lo segundo hoy falla cerrado.
  - Formato de imagen (MIME).
  - Tamaño máximo por respuesta.

## ListarDescuentosXCantidad

- **Request:** `**NroListaPrecio` (Integer), `CodigoUnicoInicial`,
  `CodigoUnicoFinal` (Varchar 22), `Cantidad` (Float, opcional).
- **Respuesta real:** tabla `DescuentoXCantidad`: `NROLISTAPRECIO` xs:int,
  `CODIGOUNICO` xs:string, `CANTIDADAPARTIRDE` xs:double, `PORCDESCUENTO`
  xs:double; todos minOccurs=0.
- **Diferencias con el PDF:** ninguna en el XSD.
- **Seguridad local:** `nroListaPrecio` obligatorio **y** al menos un código.
  `cantidad` debe ser un número finito sin exponente.
- **Sin resolver:**
  - Semántica de aplicación de los descuentos (acumulación, tramos).
  - Si las filas pertenecen siempre a la lista pedida: el ejemplo del PDF
    muestra otra lista, así que **no** se impone post-condición.

## ListarCuentasGruposDescuentos

- **Request:** `CodigoFamilia`, `CodigoGrupo`, `CodigoSubgrupo` (Varchar 6),
  `CodigoUnicoInicial`, `CodigoUnicoFinal` (Varchar 22); todos opcionales, pero
  hay que indicar un rango o una categoría.
- **Respuesta real:** tabla `DescuentoXCantidad` (mismo nombre que la anterior,
  otros campos): `AUTONUMERICO` xs:int, `CODIGOFAMILIA`, `CODIGOGRUPO`,
  `CODIGOSUBGRUPO` xs:string, `NROCUENTA` xs:int, `CODIGOUNICOINICIAL`,
  `CODIGOUNICOFINAL` xs:string, `DESCUENTO3`, `DESCUENTO2`, `DESCUENTO1`
  xs:double, `SIMBOLO` xs:string, `NROLISTA` **xs:double**.
- **Diferencias con el PDF:** ninguna en el XSD.
- **Seguridad local:** se exige al menos un filtro efectivo (rango o categoría).
- **Sin resolver:**
  - Prioridad entre reglas y cómo se combinan `DESCUENTO1/2/3`.
  - Significado de `NROCUENTA` (el PDF muestra 1).
  - Por qué `NROLISTA` es double.

## ListarUnidadesYFactoresxArticulo

- **Nombre real (WSDL):** `ListarUnidadesYFactoresxArticulo` (el índice del PDF
  escribe "yFactores").
- **Request:** `**CodigoUnico` (Varchar 22).
- **Respuesta real:** tabla `UNIDADES`: `NROUNIDAD` xs:unsignedByte, `UNIDAD`
  xs:string, `FACTOR` xs:double.
- **Diferencias con el PDF:** ninguna en el XSD.
- **Seguridad local:** código obligatorio y efectivo.
- **Sin resolver:** unidad base, factor principal, factor entero y significado
  del factor. No se asume nada.

## ListarLotesxCodigoUnico

- **Nombre real (WSDL):** `ListarLotesxCodigoUnico` (el ejemplo del PDF escribe
  "ListarLoterxCodigoUnico").
- **Binding:** SOAP 1.1, igual que el ejemplo oficial; la respuesta real vino en
  SOAP 1.1.
- **Request:** `**CodigoUnico` (Varchar 22).
- **Respuesta real:** tabla `Lotes`: `Lote`, `Estado`, `FechaVencimiento`
  (**xs:string**), `Cantidad` xs:double.
- **Diferencias con el PDF:** ninguna en el XSD, salvo el nombre de la operación.
- **Seguridad local:** código obligatorio y efectivo.
- **Sin resolver:**
  - Formato de `FechaVencimiento`: se preserva como texto, no se parsea.
  - Significado de `Estado`, stock disponible o vendible y lote activo.

## ListarLotesYUbicacionesxCodigoUnico

- **Binding:** SOAP 1.2.
- **Request:** `**CodigoUnico` (Varchar 22).
- **Respuesta real:** tabla `Lotes`: `Lote`, `Estado`, `CodigoUbicacion`,
  `Ubicacion`, `FechaVencimiento` (xs:string), `Cantidad` xs:double.
- **Diferencias con el PDF:** el XSD del PDF escribe `CodigoUbicocacion`; el XSD
  real declara `CodigoUbicacion`, como las filas del ejemplo.
- **Comparación con `ListarLotesxCodigoUnico`:** mismo nombre de tabla. Este
  método agrega `CodigoUbicacion` y `Ubicacion`, así que los contratos se
  mantienen separados. Con 0 filas no se pudo comparar cardinalidad.
- **Seguridad local:** código obligatorio y efectivo.
- **Sin resolver:** lo mismo que `ListarLotesxCodigoUnico`, más si las
  cantidades negativas representan movimientos (el PDF las muestra).

## GetTipodeCambio — BLOCKED_OR_UNRESOLVED

- **Request inspeccionado:** SOAP 1.1 (binding del ejemplo oficial), **sin**
  el tag `Moneda`.
- **Respuesta:** HTTP 200, sin Fault, `GetTipodeCambioResult → Respuesta` con
  `Codigo=ERROR`, sin Respuesta anidada y sin clase de excepción. El mensaje no
  se inspeccionó.
- **XSD documentado (no verificado):** tabla `TipodeCambio`, campo `TipoCambio`
  xs:decimal.
- **No implementado ni agregado a la allowlist.**
- **Hipótesis a validar con autorización explícita:** el ejemplo oficial envía
  `<Moneda></Moneda>` vacío. Es posible que el tag sea requerido aunque esté en
  blanco, como pasó con `NroListaPrecio` en `ListarPrecios`. No se probaron
  variantes.
