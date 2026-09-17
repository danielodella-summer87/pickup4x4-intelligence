# KORE-10 — ListarComprobantes BLOCKED_EXTERNAL

## Estado

**BLOCKED_EXTERNAL**

Fecha de cierre técnico: 2026-09-17

La integración de `ListarComprobantes` queda bloqueada hasta recibir información del lado servidor de Númina. No existe implementación permanente de este método en `lib/kore`: el contrato real exitoso de esta instalación todavía no fue observado.

## Endpoint

- Servicio: `KoreStandard.asmx`
- Transporte: HTTP, puerto 89
- Credenciales: `NroEmpresa` y `SecretKey` provistas por variables de entorno (no se documentan valores)

## Contrato verificado

Verificado contra el WSDL publicado, la página de ayuda ASMX (`?op=ListarComprobantes`) y el ejemplo del PDF oficial *Kore Standard – Web Services*:

| Aspecto | Valor |
|---|---|
| Operación | `ListarComprobantes` |
| SOAPAction / action | `http://tempuri.org/ListarComprobantes` |
| SOAP 1.1 | disponible (`text/xml; charset=utf-8` + cabecera `SOAPAction`) |
| SOAP 1.2 | disponible (`application/soap+xml; charset=utf-8; action="…"`) |
| Estilo | `document` / `literal` |
| Namespace de la operación | `http://tempuri.org/` (`elementFormDefault="qualified"`) |
| Parámetro | `doc`: XML libre (`mixed` + `s:any`) |
| Result | `ListarComprobantesResult`: XML libre (`mixed` + `s:any`) |

Wrapper del request:

```xml
<tem:ListarComprobantes>
  <tem:doc>
    <Data>
      <NroEmpresa>…</NroEmpresa>
      <SecretKey>…</SecretKey>
      <FechaInicial>dd/MM/yyyy</FechaInicial>
      <FechaFinal>dd/MM/yyyy</FechaFinal>
      <NroCuenta>…</NroCuenta>
      <NoIncluirLineas>false</NoIncluirLineas>
    </Data>
  </tem:doc>
</tem:ListarComprobantes>
```

- `Data` y todos sus hijos van **sin** namespace tempuri.
- Filtros documentados (todos opcionales; se debe enviar rango de fechas y/o número de cuenta):
  - `FechaInicial` (DateTime, formato del ejemplo `dd/MM/yyyy`)
  - `FechaFinal` (DateTime, formato del ejemplo `dd/MM/yyyy`)
  - `NroCuenta` (Integer)
  - `NoIncluirLineas` (True/False; por defecto se incluyen las líneas)

## Respuesta exitosa documentada

Según el PDF oficial:

```
ListarComprobantesResult
└─ DataSet
   ├─ xs:schema
   └─ diffgram
      └─ NewDataSet
         └─ LineaComprobante (una fila por línea, con campos de cabecera repetidos)
```

## Matriz de pruebas

Todas las pruebas usaron casos reales tomados de un export local del Diario de Ventas (valores no documentados aquí). Timeout 15 s, sin reintentos, redirect manual.

| # | SOAP | Filtros enviados | NoIncluirLineas | Resultado |
|---|---|---|---|---|
| 1 | 1.1 | FechaInicial + FechaFinal + NroCuenta | `true` | `System.Data.SqlClient.SqlException` |
| 2 | 1.1 | FechaInicial + FechaFinal + NroCuenta | `true` | `System.Data.SqlClient.SqlException` |
| 3 | 1.1 | FechaInicial + FechaFinal + NroCuenta | `true` | `System.Data.SqlClient.SqlException` |
| 4 | 1.1 | FechaInicial + FechaFinal + NroCuenta | `true` | `System.Data.SqlClient.SqlException` |
| 5 | 1.1 | FechaInicial + FechaFinal + NroCuenta (forma idéntica al ejemplo oficial) | `false` | `System.Data.SqlClient.SqlException` |
| 6 | 1.1 | FechaInicial + FechaFinal | omitido | `System.Data.SqlClient.SqlException` |
| 7 | 1.1 | NroCuenta | omitido | `System.Data.SqlClient.SqlException` |
| 8 | 1.2 | FechaInicial + FechaFinal + NroCuenta (exacto al ejemplo oficial) | `false` | `System.Data.SqlClient.SqlException` |

**8/8 requests funcionales reprodujeron el fallo.** Las pruebas 1–4 repiten el mismo caso para descartar intermitencia y clasificar la respuesta; la prueba 8 usa el binding SOAP 1.2 y el namespace `http://www.w3.org/2003/05/soap-envelope` exactamente como el ejemplo del PDF.

## Forma real del error

Idéntica en las 8 pruebas:

- HTTP 200
- SOAP Fault: **no**

```
ListarComprobantesResult
└─ Respuesta
   ├─ Codigo = OK
   └─ Descripcion   (XML embebido)
      └─ Respuesta
         ├─ Codigo = ERROR
         └─ Descripcion = System.Data.SqlClient.SqlException (texto con traza)
```

El mensaje de la excepción, la traza y cualquier SQL no se registran en este repositorio.

## Hipótesis descartadas

Con la evidencia de la matriz:

| Hipótesis | Evidencia que la descarta |
|---|---|
| Binding SOAP 1.1 vs SOAP 1.2 | pruebas 5 y 8: mismo error en ambos bindings |
| `NoIncluirLineas` (`true` / `false` / omitido) | pruebas 1, 5 y 6–7: mismo error con los tres valores |
| `NroCuenta` como condición necesaria | prueba 6: falla sin `NroCuenta` |
| Fecha como condición necesaria | prueba 7: falla sin `FechaInicial` / `FechaFinal` |
| Combinación fecha + cuenta | pruebas 6 y 7: falla con cada filtro por separado |
| SOAPAction | coincide con WSDL, ayuda ASMX y PDF |
| Endpoint | coincide con el WSDL (puertos SOAP 1.1 y 1.2) |
| Namespace | envelope, `tem:` y `Data` sin namespace según el ejemplo oficial |
| Estructura básica del request | orden, nombres y mayúsculas idénticos al ejemplo oficial |

La evidencia sitúa el fallo después de la aceptación SOAP, en la ejecución interna de ListarComprobantes. La causa raíz requiere información del servidor de Númina.

## Pendiente de Númina

1. Confirmar que `ListarComprobantes` está habilitado para nuestro `NroEmpresa`.
2. Número de error de SQL Server asociado a la excepción.
3. Mensaje de la `SqlException` registrado del lado servidor.
4. Configuración o módulo requerido para Comprobantes con Líneas.
5. Cualquier condición previa no documentada para usar el método.
6. Confirmar si existe una versión o hotfix específico del servicio que corrija este comportamiento.

## Regla operativa

Hasta la resolución externa:

**NO ejecutar:**

- `ListarComprobantes`
- `ListarLineasDelComprobante`

**NO probar:**

- otros formatos de fecha
- otras fechas
- otras cuentas
- otros bindings
- otros valores de `NoIncluirLineas`

## Requisito para el futuro parser (no implementado)

- HTTP 200 **no** implica éxito.
- SOAP sin Fault **no** implica éxito.
- `Respuesta/Codigo = OK` exterior **tampoco** implica éxito.

El parser futuro debe resolver recursivamente:

```
ListarComprobantesResult
├─ DataSet                      → candidato a éxito (validar schema/diffgram/NewDataSet)
└─ Respuesta
   ├─ Codigo
   └─ Descripcion
      └─ posible Respuesta anidada (repetir la resolución)
```

Solo un `DataSet` válido, o una respuesta de aplicación sin error en **todos** los niveles, puede considerarse éxito. Cualquier `Codigo` distinto de `OK` en un nivel anidado debe tratarse como error de aplicación, sin exponer el texto de `Descripcion` (puede contener trazas).

## Mensaje de escalamiento

> **Asunto:** ListarComprobantes devuelve SqlException interna (reproducible 8/8)
>
> Hola,
>
> Estamos integrando el web service Kore Standard (`KoreStandard.asmx`) en modo de solo lectura. Los métodos `ListarVendedores`, `ListarCuentas`, `ListarArticulos`, `ListarFamilias`, `ListarGrupos` y `ListarSubgrupos` funcionan correctamente con nuestras credenciales.
>
> `ListarComprobantes` falla de forma reproducible:
>
> - Probamos **SOAP 1.1** y **SOAP 1.2**; este último exactamente como el ejemplo del manual (namespace `http://www.w3.org/2003/05/soap-envelope`, `Content-Type: application/soap+xml; action="http://tempuri.org/ListarComprobantes"`).
> - El request coincide con el WSDL, la página de ayuda del servicio y el ejemplo de la documentación: `tem:ListarComprobantes/tem:doc/Data` con `NroEmpresa`, `SecretKey`, `FechaInicial` y `FechaFinal` en formato `dd/MM/yyyy`, `NroCuenta` y `NoIncluirLineas`.
> - Probamos fecha + cuenta con `NoIncluirLineas` en `true` y en `false`, solo rango de fechas y solo número de cuenta.
> - **8 de 8 llamadas** devolvieron lo mismo: HTTP 200, sin SOAP Fault, `Respuesta/Codigo = OK` y, dentro de `Descripcion`, otra `Respuesta` con `Codigo = ERROR` y una `System.Data.SqlClient.SqlException`.
>
> No recibimos en ningún caso el DataSet con `LineaComprobante` que muestra la documentación.
>
> ¿Podrían ayudarnos con lo siguiente?
>
> 1. Confirmar que `ListarComprobantes` está habilitado para nuestro número de empresa.
> 2. Indicarnos el número de error de SQL Server y el mensaje de la excepción registrados en el servidor.
> 3. Informarnos si se requiere alguna configuración o módulo para Comprobantes con Líneas, o alguna condición previa no documentada.
> 4. Confirmar si existe una versión o actualización del servicio que corrija este comportamiento.
>
> Podemos coordinar una prueba puntual en el horario que nos indiquen para que la correlacionen con sus logs.
>
> Muchas gracias.
