# KORE — Contratos de precios

Estado: **implementado read-only** (`listKorePreciosxArticulo` y `listKorePrecios`
en `@/lib/kore`).

- Precio de referencia: **UNRESOLVED**.
- Moneda ISO: **UNRESOLVED**.
- IVA: **no inferido**.

Evidencia: inspecciones KORE-16, KORE-17 y KORE-18 (SOAP 1.2, respuestas reales).
Este documento no contiene códigos, listas, símbolos, precios, nombres ni
credenciales reales.

## Diseño: modelos separados con capa común interna

Los dos métodos tienen contratos distintos y se exponen con modelos públicos
separados (`KoreListaPrecioArticulo` y `KorePrecio`). Internamente comparten
solo la lectura de enteros, textos raw/trim y la validación léxica de precios.
No se convierten a un objeto común y no se ocultan sus diferencias.

| Aspecto            | `ListarPreciosxArticulo`        | `ListarPrecios`                       |
|--------------------|---------------------------------|---------------------------------------|
| Tabla              | `ListaPrecio`                   | `Precio`                              |
| Request            | `CodigoUnico` (obligatorio)     | `NroListaPrecio` (**obligatorio**) + rango de códigos |
| Código de artículo | no se devuelve                  | `CODIGOUNICO`                         |
| Lista              | `NroListaPrecio` `xs:int`       | `NROLISTAPRECIO` `xs:int`             |
| Moneda             | `Moneda`                        | `SIMBOLO`                             |
| Precio             | `Precio` **`xs:decimal`**       | `PRECIO` **`xs:double`**              |
| Precio con IVA     | `PrecioIVA` `xs:decimal`        | —                                     |
| Nombre de lista    | `NombreListaPrecio`             | —                                     |
| Taxonomía          | —                               | `CODIGOFAMILIA/GRUPO/SUBGRUPO`        |
| Id técnico         | —                               | `AUTONUMERADO` `xs:int`               |
| Lista 1            | excluida (documentado y observado) | se puede consultar por lista       |

En ambos XSD reales todos los campos son `minOccurs=0`.

## Diferencias con el PDF

- `ListarPreciosxArticulo`: el PDF declara `NroListaPrecio` como
  `xs:unsignedByte` y `Precio` como `xs:double`; el servicio real devuelve
  `xs:int` y `xs:decimal`.
- `ListarPrecios`: el PDF declara `NROLISTAPRECIO` como `xs:unsignedByte`; el
  servicio real devuelve `xs:int`.
- El manual marca `NroListaPrecio` con `**` (obligatorio y no puede estar en
  blanco). Sin ese tag, `ListarPrecios` responde `Respuesta` con
  `Codigo=ERROR`; con él devuelve un DataSet. Esto es consistente con un
  parámetro obligatorio omitido (el mensaje del servidor no se inspeccionó).

La implementación sigue el XSD real y falla cerrado ante tablas o campos
inesperados.

## Precios: el raw es la fuente fiel

- `precioRaw` / `precioIvaRaw` conservan el texto exacto de KORE, y
  `precio` / `precioIva` son solo valores de conveniencia.
- No usar el `number` para identidad, igualdad exacta ni persistencia exacta.
- `xs:decimal` (`ListarPreciosxArticulo`): se valida la forma decimal, sin
  exponente ni INF/NaN. En lo observado usa escala 4.
- `xs:double` (`ListarPrecios`): se acepta forma decimal o científica
  **finita**; INF/NaN se rechazan. En lo observado el texto tiene más
  decimales que el precio de `ListarPreciosxArticulo`.
- Cero es válido y no se impone signo.
- No se redondea ni se ajusta la escala.
- Observado una vez: para la misma lista y artículo, el `PRECIO` double **no**
  es decimalmente idéntico al `Precio` decimal. No hay una regla de redondeo
  confirmada entre métodos.

## Reglas de la integración

- `listKorePreciosxArticulo(codigoUnico)`: código obligatorio, texto de
  hasta 22 caracteres enviado exacto.
- `listKorePrecios(filters)`:
  - `nroListaPrecio` es obligatorio, como entero seguro. No se impone rango ni
    signo, porque el request documenta Integer.
  - **Restricción local de seguridad:** además se exige `codigoUnicoInicial`
    o `codigoUnicoFinal`. Una lista completa puede ser muy grande y
    requerirá un diseño explícito con paginado.
  - Post-condición: toda fila debe pertenecer a la lista pedida; si no,
    `invalid_data`.
- Todos los filtros son sensibles: un eco de KORE no aparece en los errores.
- Se preservan todas las filas en orden, sin deduplicar. No se asume PK,
  tampoco sobre `AUTONUMERADO`.

## Sin resolver (no implementar sin nueva decisión)

- **Precio de referencia:** no hay `precioActual`, `precioVenta`, "mejor
  precio" ni fallback entre métodos.
- **Lista predeterminada:** no se elige ninguna lista automáticamente.
- **Moneda ISO:** los símbolos se preservan raw/trim, sin mapear.
- **IVA:** no se infiere tasa ni se elige con o sin IVA para la UI.
- **Redondeo** entre `xs:double` y `xs:decimal`: no se aplica ni se asume.
