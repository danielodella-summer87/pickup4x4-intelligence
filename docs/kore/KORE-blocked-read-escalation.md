# KORE — Escalamiento de operaciones READ bloqueadas (KORE-22)

Paquete de diagnóstico para Númina sobre las operaciones de lectura de
`KoreStandard.asmx` que esta instalación no puede consumir.

No contiene credenciales, número de empresa, cuentas, fechas, monedas, importes
ni el texto literal de los mensajes del servidor. Las razones son paráfrasis de
mensajes redactados en memoria.

## Estado global

| | |
|---|---|
| Operaciones READ identificadas | 27 |
| Implementadas y validadas (read-only) | 19 |
| Bloqueadas / sin resolver | 8 |

## Tabla de escalamiento

| Operation | Status | SOAP version | Request shape (tags en `Data`, además de `NroEmpresa`/`SecretKey`) | Error category | Retry recommended | Escalation recommended |
|---|---|---|---|---|---|---|
| `GetTipodeCambio` | BLOCKED | 1.1 | `Moneda` presente y vacío, como el ejemplo oficial. Sin el tag, el resultado es el mismo. | SQL_OR_DATABASE_INTERNAL_ERROR | no | **sí** |
| `ListarChequesaVencerxCuenta` | BLOCKED | 1.2 | `NroCuenta` | MODULE_OR_SERVICE_NOT_ENABLED | no | **sí** |
| `ListarUltimosRecibosxCuenta` | BLOCKED | 1.1 | `NroCuenta` | MODULE_OR_SERVICE_NOT_ENABLED | no | **sí** |
| `GetSaldosxCuenta` | BLOCKED | 1.1 | `NroCuenta` (sin `NroClasificacion` ni `Cofis`) | MODULE_OR_SERVICE_NOT_ENABLED | no | **sí** |
| `EstadoDeCuenta` | BLOCKED | 1.2 | `NroCuenta`, `FechaInicial`, `FechaFinal` (dd/MM/yyyy), `Simbolo` | MODULE_OR_SERVICE_NOT_ENABLED | no | **sí** |
| `ListarPedidosxCliente` | BLOCKED | 1.2 | `FechaInicial`, `FechaFinal` (dd/MM/yyyy), `NroCuenta` | MODULE_OR_SERVICE_NOT_ENABLED | no | **sí** |
| `ListarComprobantes` | BLOCKED_EXTERNAL (KORE-10) | 1.1 y 1.2 | `FechaInicial`, `FechaFinal`, `NroCuenta`, `NoIncluirLineas` (varias combinaciones) | SQL_OR_DATABASE_INTERNAL_ERROR | no | **sí** |
| `ListarLineasDelComprobante` | BLOCKED (junto con KORE-10) | — | no invocado | — (sin diagnóstico propio) | no | **sí** (junto con `ListarComprobantes`) |

Todos los casos de KORE-21/22 responden HTTP 200, sin SOAP Fault, con
`<Operación>Result → Respuesta` y `Codigo=ERROR` en un único nivel, sin
`Respuesta` anidada y sin clase de excepción .NET.

## Evidencia sanitizada por operación (KORE-22)

Un único POST por operación, idéntico al de KORE-21: misma versión SOAP, mismos
tags y orden, misma cuenta, rango y símbolo.

### Acceso a funcionalidad (5 operaciones)

`ListarChequesaVencerxCuenta`, `ListarUltimosRecibosxCuenta`,
`GetSaldosxCuenta`, `EstadoDeCuenta`, `ListarPedidosxCliente`

- **Reason (paráfrasis):** el servidor indica que no hay acceso a una
  funcionalidad, identificada por un número.
- **Forma del mensaje:** las 5 operaciones devuelven un mensaje con la misma
  forma (misma longitud y mismo vocabulario), independientemente de los
  parámetros enviados.
- **Flags:**
  - mencionan una funcionalidad y la falta de acceso;
  - **no** mencionan parámetros faltantes o inválidos, formato, licencia,
    permisos de usuario explícitos, SQL, base de datos, configuración ni
    ausencia de datos.
- **GetSaldosxCuenta:** el mensaje **no** menciona `NroClasificacion`, `Cofis`
  ni ningún parámetro obligatorio, así que no hay evidencia de que falten esos
  tags.
- **Categoría:** MODULE_OR_SERVICE_NOT_ENABLED. La lectura alternativa sería
  AUTHORIZATION_OR_PERMISSION (acceso de las credenciales a la funcionalidad);
  la decisión es la misma.
- **Decisión:** ESCALATE_TO_NUMINA. No se recomienda reintentar con otros
  parámetros.

### GetTipodeCambio

- **Reason (paráfrasis):** se produce un error interno que hace referencia a una
  columna de datos. No menciona el parámetro `Moneda`, formato, faltantes,
  acceso ni habilitación.
- **Flags:**
  - menciona una columna (capa de datos);
  - sin menciones de parámetros, módulo, licencia, permisos, configuración o
    no encontrado.
- **Categoría:** SQL_OR_DATABASE_INTERNAL_ERROR (confianza media; la única
  señal es la referencia a una columna).
- **Decisión:** ESCALATE_TO_NUMINA.
- **Historial:** KORE-20 (sin tag `Moneda`) y KORE-21/22 (tag vacío) dieron
  `Codigo=ERROR`. No se probó una moneda concreta.

### ListarComprobantes / ListarLineasDelComprobante (KORE-10, sin requests nuevos)

- **ListarComprobantes:** 8 de 8 intentos (SOAP 1.1 y 1.2, distintas
  combinaciones de fechas, cuenta y `NoIncluirLineas`) devolvieron `Codigo=OK`
  exterior con una `Respuesta` anidada `Codigo=ERROR` y una excepción SQL del
  servidor. Detalle en `KORE-10-listar-comprobantes-blocked.md`.
- **ListarLineasDelComprobante:** no se invocó; queda bloqueado junto con la
  integración de comprobantes.

## Resumen de decisiones

| Decisión | Operaciones |
|---|---|
| NEEDS_ONE_CONTROLLED_RETRY | 0 |
| ESCALATE_TO_NUMINA | 6 (KORE-21) + `ListarComprobantes` / `ListarLineasDelComprobante` (KORE-10) |
| REVIEW_SERVICE_SEMANTICS | 0 |
| ESCALATE_WITH_SANITIZED_CONTEXT (UNKNOWN) | 0 |

## Contexto del manual (no es conclusión)

El manual divide los Web Services en grupos:

- **Grupo 1:** artículos, clientes, familias, grupos, subgrupos, precios,
  fotos, reglas de descuento, marcas/modelos y stock.
- **Grupo 2:** ingreso de comprobantes, pedidos, comprobantes de pago y
  comprobantes que generan CFE (marcados como adquiribles por separado).
- **Grupo 3:** estado de cuenta, saldos, consulta de pedidos por cliente y
  status.
- **Grupo 4:** facturas vivas, NC vivas, recibos y comprobantes con líneas.

Con las mismas credenciales, las operaciones de Grupo 4 `ListarFacturasVivasxCuenta`,
`ListarNotasCreditoVivasxCuenta` y `ListarRecibosVivosxCuenta` sí responden
DataSet. Las de Grupo 3 y los cheques, últimos recibos y tipo de cambio no. Esto
**puede** reflejar diferencias de habilitación por funcionalidad, pero la
categoría asignada se basa en el mensaje del servidor, no en esta agrupación.

## Preguntas para Númina

1. ¿Qué funcionalidades o módulos deben habilitarse para esta empresa y
   credenciales, para `ListarChequesaVencerxCuenta`,
   `ListarUltimosRecibosxCuenta`, `GetSaldosxCuenta`, `EstadoDeCuenta` y
   `ListarPedidosxCliente`?
2. ¿Por qué `GetTipodeCambio` devuelve un error interno referido a una columna,
   tanto sin `Moneda` como con `Moneda` vacío? ¿Hay que configurar monedas o
   cotizaciones del lado servidor?
3. ¿Cuál es el estado del error SQL interno de `ListarComprobantes` (KORE-10)?
