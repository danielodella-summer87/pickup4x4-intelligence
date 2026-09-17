# KORE — Contrato de `ListarStock`

Estado: **implementado read-only** (`listKoreStock` en `@/lib/kore`).
Relación con el Stock del Excel: **UNRESOLVED**.

Evidencia: inspecciones KORE-13 y KORE-14 (6 artículos reales, SOAP 1.2).
Este documento no contiene códigos, ubicaciones, cantidades, estados ni
credenciales reales.

## Transporte

- SOAP 1.2 (`application/soap+xml; charset=utf-8; action="http://tempuri.org/ListarStock"`).
- Filtros en `<Data>`: `CodigoUnicoInicial`, `CodigoUnicoFinal` (Varchar 22),
  `NroEstado` (Integer).
- La integración exige al menos un filtro efectivo para no traer todo el stock.
- `NroEstado` de entrada se valida solo como entero seguro. El rango 0..255
  corresponde al output y no se infiere para el request.

## Respuesta real

`ListarStockResult` → `DataSet` → tabla única `Stock`:

| Campo             | Tipo XSD real     | minOccurs | Observado             |
|-------------------|-------------------|-----------|-----------------------|
| `CODIGOUNICO`     | `xs:string`       | 0         | padding derecho, ancho 22 |
| `CANTIDAD`        | `xs:double`       | 0         | —                     |
| `CODIGOUBICACION` | `xs:string`       | 0         | padding derecho, ancho 10 |
| `NROESTADO`       | `xs:unsignedByte` | 0         | —                     |
| `UBICACION`       | `xs:string`       | 0         | padding derecho, ancho 30 |

- El XSD del PDF oficial **omite `NROESTADO`**, aunque su fila de ejemplo lo
  incluye. El XSD real de esta instalación lo declara. La implementación sigue
  el servicio real y acepta exactamente estos 5 campos (fail-closed ante
  cualquier otro campo o tabla).
- Los anchos de padding son observaciones, no parte del contrato lógico.

## Semántica de campos (parser)

- `CODIGOUNICO`: obligatorio (ausente o vacío → `invalid_data`); raw exacto + trim.
- `CANTIDAD`: double finito **con signo**. Negativos, cero y decimales son
  válidos (el ejemplo oficial muestra cantidades negativas). Ausente → `null`.
  No se redondea.
- `NROESTADO`: entero 0..255. Ausente → `null`. Sin semántica asignada.
- `CODIGOUBICACION` / `UBICACION`: ausente → `null`; presente → raw exacto +
  trim (puede quedar `""`).

## Cardinalidad e identidad

- Un artículo puede devolver varias filas: observado un artículo con **una
  ubicación y dos estados**.
- **(codigo, ubicacion) NO es única.**
- (codigo, ubicacion, estado) es el candidato conceptual más natural, pero
  **no hay PK confirmada**. No se valida unicidad y no se deduplica: se
  preservan todas las filas en orden.

## Relación con el Stock del Excel — UNRESOLVED

En la única observación multifila, el Stock escalar del Excel no coincidió con
la suma total de `CANTIDAD` ni con ninguna fila individual o subtotal por
estado, por ubicación o por ubicación + estado.

Reglas mientras siga sin resolver:

- **No sumar `CANTIDAD` automáticamente** ni exponer un "stock disponible"
  derivado.
- No elegir un `NROESTADO` como disponible ni interpretar cantidades negativas.
- No reemplazar, reconciliar ni usar como fallback el Stock del Excel.
- `listKoreStock` es una fuente read-only adicional que devuelve las filas de
  KORE tal cual.

Resolverlo requiere documentación de Númina sobre los estados de stock y la
definición del Stock exportado en el Excel.
