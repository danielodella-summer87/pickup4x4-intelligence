# KORE — Contratos de cuentas, finanzas y pedidos (KORE-21)

Inspección read-only de 9 operaciones con una cuenta real seleccionada
determinísticamente desde el Diario de Ventas externo y validada con una única
llamada a `ListarCuentas`. El rango de fechas y el símbolo se derivaron de esa
cuenta en el Diario.

Este documento no contiene cuentas, nombres, fechas, monedas, importes,
comprobantes ni credenciales reales. La respuesta real gobierna. Los nombres de
operación coinciden con el WSDL real auditado.

## Resumen

| Operación | Estado | SOAP | Tabla real | Filas observadas |
|---|---|---|---|---|
| `ListarFacturasVivasxCuenta` | IMPLEMENTED (ROW_SHAPE_NOT_LIVE_OBSERVED) | 1.1 | `FacturasVivas` | 0 |
| `ListarNotasCreditoVivasxCuenta` | IMPLEMENTED (ROW_SHAPE_NOT_LIVE_OBSERVED) | 1.1 | `FacturasVivas` | 0 |
| `ListarRecibosVivosxCuenta` | IMPLEMENTED (ROW_SHAPE_NOT_LIVE_OBSERVED) | 1.2 | `RecibosVivos` | 0 |
| `GetTipodeCambio` | **BLOCKED_OR_UNRESOLVED** | 1.1 | — | — |
| `ListarChequesaVencerxCuenta` | **BLOCKED_OR_UNRESOLVED** | 1.2 | — | — |
| `ListarUltimosRecibosxCuenta` | **BLOCKED_OR_UNRESOLVED** | 1.1 | — | — |
| `GetSaldosxCuenta` | **BLOCKED_OR_UNRESOLVED** | 1.1 | — | — |
| `EstadoDeCuenta` | **BLOCKED_OR_UNRESOLVED** | 1.2 | — | — |
| `ListarPedidosxCliente` | **BLOCKED_OR_UNRESOLVED** | 1.2 | — | — |

Los 6 bloqueados respondieron HTTP 200, sin SOAP Fault, con
`<Op>Result → Respuesta` y `Codigo=ERROR` en un único nivel (sin Respuesta
anidada ni clase de excepción). El mensaje no se inspeccionó y no se probaron
variantes.

Causas posibles, no verificadas: parámetros o formatos no aceptados, o módulos
que el manual indica que "se adquieren por separado" (grupos 2–4). Requiere
decisión explícita o consulta a Númina.

## Implementados

Reglas comunes:
- **Request:** `NroCuenta` obligatorio (Integer, entero seguro, sensible),
  validado antes de leer el env, crear el cliente o hacer fetch.
- **`Direccion`:** documentada como opcional para esta familia, **no se expone**
  porque no fue validada contra el servidor.
- **Parser:** tabla exacta, campos exactos, fail-closed.
- **Textos:** raw + trim.
- **Fechas** (`xs:string`): se preservan como texto, **sin parsear**, porque el
  formato real no se observó.
- **Importes** `xs:double`: raw exacto más número finito de conveniencia;
  **sin transformar signos** (el PDF muestra saldos residuales en notación
  exponencial).
- **Filas:** sin deduplicar ni PK.
- **0 filas:** el XSD real valida los campos, pero padding, formatos y escalas de
  filas reales **no están observados**.

### ListarFacturasVivasxCuenta / ListarNotasCreditoVivasxCuenta

- **Binding:** SOAP 1.1, del ejemplo oficial compartido ("Son 3 métodos
  distintos con 3 request y response similares").
- **Respuesta real, idéntica en ambos:** tabla `FacturasVivas`: `Emision`,
  `Vencimiento`, `Comprobante` xs:string, `Numero` xs:int, `Moneda`
  xs:string, `Total`, `Saldo` xs:double.
- **Diferencias con el PDF:** ninguna en el XSD. Notas de crédito usa también la
  tabla `FacturasVivas`.
- **Diseño:** parser interno compartido (XSD real idéntico); tipos y funciones
  públicas separadas (`KoreFacturaViva`, `KoreNotaCreditoViva`). No se fusionan
  facturas y notas de crédito.
- **Sin resolver:**
  - Formato de fechas.
  - Signo de notas de crédito.
  - Relación `Total`/`Saldo`.
  - Clasificación por `Comprobante`.

### ListarRecibosVivosxCuenta

- **Binding:** SOAP 1.2, según el ejemplo propio del método. El ejemplo
  compartido de la familia usa 1.1; prevalece el específico, y la respuesta real
  vino en 1.2.
- **Respuesta real:** tabla `RecibosVivos`: `Fecha` xs:string, `NUMERO` xs:int,
  `MONEDA` xs:string, `MONTO`, `SALDO` xs:double. El casing difiere de
  `FacturasVivas`.
- **Diferencias con el PDF:** ninguna en el XSD.
- **Sin resolver:** formato de fecha, significado de `SALDO` en recibos y signos.

## Bloqueados

### GetTipodeCambio

- KORE-20 sin tag `Moneda` dio `Respuesta` con `Codigo=ERROR`.
- KORE-21 con `<Moneda></Moneda>` vacío, como el ejemplo oficial, dio
  **el mismo resultado**.
- **Estado:** BLOCKED_OR_UNRESOLVED para esta fase. No se implementa ni se agrega
  a la allowlist.
- **XSD documentado (no verificado):** `TipodeCambio.TipoCambio` xs:decimal.

### ListarChequesaVencerxCuenta

- **Request probado:** `NroCuenta`, SOAP 1.2.
- **XSD documentado (no verificado):** tabla `FetchChequesxCuentas`:
  `NroBanco`, `Nombre`, `Numero`, `Vencimiento` xs:string, `Moneda` xs:string,
  `Importe` xs:decimal.

### ListarUltimosRecibosxCuenta

- **Request probado:** `NroCuenta`, SOAP 1.1.
- **XSD documentado (no verificado):** tabla `RecibosVivos`, mismos campos que
  `ListarRecibosVivosxCuenta`; el PDF indica hasta 5 recibos.

### GetSaldosxCuenta

- **Request probado:** solo `NroCuenta`, SOAP 1.1, **sin** `NroClasificacion`
  ni `Cofis`. El ejemplo oficial envía ambos con valor 0; no se probó esa
  variante.
- **PDF inconsistente:** el XSD documenta `SaldoPesos` y `SaldoDolares`
  (xs:decimal), pero la fila de ejemplo también trae `ChequesPesos` y
  `ChequesDolares`. No verificado.

### EstadoDeCuenta

- **Request probado:** `NroCuenta`, `FechaInicial`, `FechaFinal` (dd/MM/yyyy,
  como el ejemplo) y `Simbolo` (derivado del Diario), SOAP 1.2.
- **XSD documentado (no verificado):** tabla `EstadoDeCuenta`: `Fecha`
  xs:dateTime, `Descripcion` xs:string, `Numero` xs:int, `Monto` xs:double.

### ListarPedidosxCliente

- **Request probado:** `FechaInicial`, `FechaFinal` (dd/MM/yyyy) y
  `NroCuenta`, SOAP 1.2.
- **Estructura documentada (no verificada):** jerárquica, sin schema:
  `DataSet → Pedidos → Pedido*`. Cada `Pedido` tiene cabecera (`NROPEDIDO`,
  `FECHA`, `HORA`, `FECHAVENCIMIENTO`, `ESTADO`, `MONEDA`, `TOTALIMPINC`,
  `NROREPARTO`, `FECHAREPARTO`) y `LineasPedidos*` (`NROLINEA`, `CODIGOUNICO`,
  `DESCRIPCION`, `CANTIDADSOLICITADA`, `TOTALIMPINC`).
- No se creó parser: la forma real no fue observada.
