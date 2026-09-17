# KORE-29 — Acceptance gate del cutover de catálogo

- **Alcance:** cerrar los 2 blockers de KORE-28 (`activo` ← `DESHABILITADO` y UI
  autenticada). No incluye el cutover permanente.
- **Default commiteado:** `legacy`.
- **Sin** llamadas SOAP a KORE, shadow sync, escrituras en Supabase, migraciones ni
  cambios de `.env.local`.
- Sin códigos, artículos ni PII: solo conteos.

## 1. Impacto semántico de `activo = !DESHABILITADO`

El mapping **no se modificó**: sin overrides, whitelist, fallback legacy ni excepciones.
Los conteos se recalcularon en modo read-only.

| Métrica | Valor |
|---|---|
| totalKoreResolvedActiveSourceRows | 10547 |
| koreEnabled | 9582 |
| koreDisabled | 965 |
| disabled presentInLegacy | 453 |
| disabled notPresentInLegacy | 512 |

### Referencias legacy de artículos deshabilitados

Solo joins reales existentes.

| Referencia | Claves | Filas |
|---|---|---|
| ventas (`ventas.codigo_unico`) | 0 | 0 |
| aplicaciones (`aplicaciones.codigo_unico`) | 327 | 642 |
| campañas: ítems (`matched_article_code` / `input_code`) | 0 | 0 |
| campañas: resultados (`article_code`) | 0 | 0 |
| oportunidades (`metadata.entidad` tipo artículo) | 0 | 0 (no hay oportunidades con entidad artículo) |

## 2. Histórico vs catálogo seleccionable

| Concepto | Significado | Regla |
|---|---|---|
| `CURRENT_SELECTABLE_CATALOG` | Artículos que se pueden **elegir hoy** (cotizar, proponer) | Excluye `activo=false` |
| `HISTORICAL_REFERENCE` | Ventas, aplicaciones, campañas, oportunidades e ítems ya guardados que referencian un artículo | **Nunca** se filtra por `activo`; nada se borra |

**Auditoría de código.** Consumidores de `articulo.activo`:

| Módulo | Usa `activo` | Tipo | ¿Mezcla histórico? |
|---|---|---|---|
| `lib/data/distribuidor-insights.ts` → `/distribuidor` (mostrador) | sí (`toArticuloMostrador`) | selección actual | No. "Alta rotación" se calcula desde ventas **sin** filtrar por `activo` (badge histórico) |
| `components/prospeccion/ProposalProductsEditor.tsx` (propuestas) | sí (solo el **buscador**) | selección actual | No. Los ítems ya cargados guardan código/nombre y no se filtran |
| `lib/data/insights.ts`: `calcularCantidadArticulos`, `calcularArticulosBajoStock`, `getArticulosConStock` | sí | — | Sin consumidores (código muerto) |
| `/articulos`, `/dashboard`, `/clientes`, `/ventas`, `/vehiculos`, `/oportunidades`, campañas | no | consulta / histórico | No aplica |

**Conclusión:** ningún módulo usa `activo` para eliminar referencias históricas. No hace
falta corregir código.

## 3. Impacto por feature

Consumidores reales ejecutados sobre la ruta real `load-dataset`.

| Ruta / módulo | Filtra inactivos | Visible legacy | Visible KORE | Delta | Nota |
|---|---|---|---|---|---|
| `/articulos` (filas) | no | 6704 | 10547 | +3843 | consulta; lista los 965 inactivos sin distinguirlos (ver §8) |
| `/distribuidor` (seleccionables por vehículo) | **sí** | 5511 | 5184 | −327 | los 327 deshabilitados con aplicaciones dejan de ser seleccionables; 0 inactivos seleccionables |
| Propuestas (buscador) | **sí** | 6704 | 9582 | +2878 | 965 excluidos; KORE-only habilitados seleccionables |
| `/dashboard` (artículos únicos) | no | 6704 | 10547 | +3843 | clientes, registros de venta y aplicaciones sin cambio |
| `/clientes` | no | 11177 (35 con ventas) | 11177 (35) | 0 | legacy |
| `/ventas` | no | 70 filas | 70 filas | 0 | 0 filas con artículo inactivo; ventas sin artículo en catálogo: 2 → 1 |
| `/vehiculos` (artículos compatibles) | no | 5511 | 5511 | 0 | relación histórica: incluye los 327 inactivos con aplicaciones |
| `/oportunidades` | no | 12 | 12 | 0 | legacy |
| Campañas (validación de ítems existentes) | no | 93 / 95 | 93 / 95 | 0 | validación por código contra el catálogo completo |

- **Aplicaciones de artículos inactivos:** 642, conservadas en el dataset (no se
  eliminan).
- **Venta huérfana conocida:** se conserva, sin artículo artificial y sin crash.
  Queda como "sin artículo en catálogo".

## 4. Decisión de negocio: KORE_ACTIVE_POLICY

**Recomendación técnica: `SOURCE_AUTHORITATIVE`.**

- `DESHABILITADO` de KORE gobierna la **disponibilidad actual**: un artículo deshabilitado
  no se puede seleccionar en el mostrador del distribuidor ni en el buscador de
  propuestas.
- La **historia legacy no se elimina**: ventas, aplicaciones, campañas, oportunidades e
  ítems ya guardados siguen visibles donde representan historia.
- **Impacto concreto:**
  - `/distribuidor` deja de ofrecer 327 artículos, que hoy están deshabilitados en KORE
    y tienen aplicaciones legacy.
  - El buscador de propuestas excluye 965 artículos.
  - Ninguno de los 965 tiene ventas registradas.

**Si negocio NO acepta `SOURCE_AUTHORITATIVE`** (no implementado, solo documentado):
- La alternativa sería `LEGACY_COMPAT`, que ignora `DESHABILITADO` para artículos
  presentes en legacy.
- Volverían a ser seleccionables en `/distribuidor` los 327 con aplicaciones, y hasta 453
  en propuestas.
- Requiere una regla explícita en el mapping del catálogo KORE. No es un override
  hardcodeado.
- Contradice a KORE como source-of-truth y reintroduce artículos que KORE marca como no
  operables.

**Estado:** `PENDING` (requiere confirmación humana).

## 5. Rehearsal autenticado (KORE-29: bloqueado)

> **KORE-30: destrabado.** El operador inició sesión manualmente y el rehearsal autenticado
> se completó (ver §10). Lo que sigue es el estado de KORE-29.

**Resultado en KORE-29: `AUTHENTICATED_UI_VALIDATION_BLOCKED`.**

- **Qué se levantó:** `next start` local (puerto temporal) sobre el build B
  (`NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore` solo para el proceso de build, sin cambios en
  `.env.local`).
- **Sesión:** no había sesión autorizada. El navegador local redirigió `/dashboard` →
  `/login`.
- **Credenciales:** las únicas disponibles son las del admin de la app en `.env.local`.
  No se ingresaron contraseñas ni se fabricó sesión. Tampoco se modificó `proxy.ts` ni el
  login.
- **Validado sin sesión** contra el servidor real del build B:

| Request | Resultado |
|---|---|
| `GET /api/supabase/load-dataset` | 401 `No autenticado`, sin dataset |
| `GET /api/supabase/load-dataset?source=kore` | 401 (el query param no cambia nada) |
| `GET /api/supabase/load-dataset?catalogSource=legacy` | 401 (sin override por request) |
| `GET /articulos` | redirect a `/login` |
| Logs de error del servidor | ninguno |

**Para destrabar:**
1. Un operador autorizado inicia sesión en un build con `catalog=kore`.
2. Recorre `/`, `/dashboard`, `/articulos` (búsqueda, filtros, límite 100),
   `/clientes`, `/ventas` y `/distribuidor` (seleccionar vehículo, verificar que no
   aparezcan inactivos).
3. Recorre propuestas (buscador) y `/oportunidades`.
4. Registra errores de consola.

Los datos y conteos esperados por página están en §3.

## 6. Runtime, builds y seguridad

**Runtime.** Ruta real `load-dataset` y consumidores reales de páginas, con Supabase solo
lectura:

| | default | catalog=kore |
|---|---|---|
| status / Cache-Control | ready / no-store | ready / no-store |
| provenance | legacy ×4 | catalog `kore` · sales/customers/applications `legacy` |
| Artículos (= repository) | 6704 | 10547 |
| Conflictos excluidos | — | 2 |
| Joins ventas / aplicaciones | 68/70 · 11129/11129 | 69/70 · 11129/11129 |
| Respuesta con variantes RAW / conflictos / `identity_status` | no | no |

**Builds:**

| Build | Resultado | `catalogSource:"kore"` inyectado (cliente / servidor) |
|---|---|---|
| A (default) | OK | 0 / 0 |
| B (catalog=kore, variable solo para el build) | OK | 1 / 2 |
| A2 (default) | OK | 0 / 0 → `.next` final = legacy |

**Seguridad:**
- Chunks del cliente en A, B y A2 sin la service role key, sin nombres de tablas `kore_*`
  y sin `source_variant_key` / `identity_status` / `content_hash`.
- Tests estáticos: ningún client component importa service role, `lib/kore`,
  `lib/kore-sync` ni `@/lib/kore-catalog`. La ruta no lee la request.
- Servidor real: la fuente no cambia por query param y sin sesión responde 401.

## 7. Performance

| | default (legacy) | catalog=kore | KORE-28 |
|---|---|---|---|
| Respuesta `load-dataset` | 16.217.426 B | 16.757.690 B | idéntico |
| Payload del catálogo (`articulos`) | 856.338 B | 1.365.543 B | idéntico |
| `dataQuality` | 10.008.614 B | 10.008.614 B | idéntico |

- **Tamaño:** sin regresión, los bytes son idénticos a KORE-28.
- **Tiempo del servidor (ruta aislada, 2 corridas por modo):** default 8,6–11,0 s y kore
  8,0–9,1 s (KORE-28: ~6–7,7 s). Con bytes idénticos, la variación corresponde a la red
  local → Supabase; kore no es más lento que legacy.
- **`DATASET_PAYLOAD_TECH_DEBT`:**
  - `dataQuality` (metadata del import legacy) es ~60% de cada respuesta y se envía
    completo al browser en cada carga.
  - No es blocker del catálogo. Candidato a endpoint separado o carga diferida en una
    fase posterior. No se optimizó en KORE-29.

## 8. Observaciones no bloqueantes

- **`/articulos` (consulta):** lista inactivos sin indicador visual. No es selección,
  así que no viola la política. Un badge "Inactivo" sería una mejora de UX futura (no
  se rediseñó UI).
- **`/vehiculos`:** cuenta como "compatibles" las aplicaciones de artículos inactivos
  (relación histórica). Aceptable bajo `SOURCE_AUTHORITATIVE`; decidir si esa vista debe
  mostrar solo seleccionables.
- **Propuestas:** con artículos KORE (sin precio) el precio unitario inicia en 0 y es
  editable, igual que con legacy (que no persistía precio). No requiere
  pricing/stock → **no** aplica `PRICING_OR_STOCK_REQUIRED_FOR_PROPOSAL`.

## 9. Rehearsal autenticado (KORE-30)

- **Login:** manual, hecho por el operador en el navegador local. Claude no leyó, copió ni
  escribió contraseñas, ni fabricó cookies o tokens. La cookie de sesión es `httpOnly`
  (no visible para JS).
- **Build temporal:** `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore` solo como variable del
  proceso de build; `.env.local` sin cambios (hash verificado antes y después).
- **Servidor:** `next start` en `127.0.0.1`, puerto local, detenido al terminar.
- **Sin sesión** (antes del login): `/dashboard` → redirect a `/login`;
  `/api/supabase/load-dataset` → 401, también con `?source=legacy|kore` y
  `?catalogSource=legacy|kore`. La fuente no es override-able desde la request.

### Resultado por ruta

| Ruta | Render | Fuente mostrada | Observaciones |
|---|---|---|---|
| `/` | PASS | — | navegación completa, sin errores |
| `/dashboard` | PASS | Catálogo KORE · resto legacy | KPIs y tablas OK; el aumento de catálogo no rompe cálculos |
| `/articulos` | PASS | Catálogo KORE · resto legacy | ver detalle abajo |
| `/clientes` | PASS | Catálogo KORE · resto legacy | 100 filas visibles; clientes siguen legacy |
| `/ventas` | PASS | Catálogo KORE · resto legacy | 70 filas; la venta huérfana conocida no rompe ni crea artículo |
| `/distribuidor` | PASS | — | 298 botones renderizados vs 297 seleccionables esperados (1 es de acción); **0 inactivos**; selección funciona |
| `/vehiculos` | PASS | Catálogo KORE · resto legacy | 793 modelos; conserva aplicaciones de artículos inactivos |
| `/oportunidades` | PASS | Catálogo KORE · resto legacy | oportunidades legacy visibles |
| `/campanas/articulos` | PASS | Catálogo KORE · resto legacy | sin ejecutar campañas |
| Editor de propuestas | PASS | — | buscador: 25 resultados, **0 inactivos** (había 11 candidatos inactivos para ese término); sin precio inventado; nada guardado |

### `/articulos` en detalle

| Verificación | Resultado |
|---|---|
| Fuente | `catalog=kore`, resto legacy |
| loader = repository | 10547 = 10547 |
| Códigos distintos | 10547 |
| Claves en conflicto presentes (verificado por hash, sin exponer códigos) | 0 |
| Artículos `missing` | 0 (no hay resolved+missing en la fuente) |
| Campos del artículo | `codigoUnico`, `descripcion`, `rubro`, `categoria`, `activo` (sin stock/precio/marca inventados) |
| Inactivos listados (consulta) | 965, sin romper la vista |
| Límite visual | "10.547 resultados · Mostrando primeros 100", 100 filas |
| Filtro sin aplicaciones | "5.036 de 10.547 resultados", todas las filas con 0 aplicaciones |
| Filtro con aplicaciones | ninguna fila con 0 aplicaciones |
| Filtro por rubro | un único rubro en las filas |
| Búsqueda sin coincidencias | 0 filas + estado vacío explícito |
| Artículos con 0 ventas / 0 aplicaciones | soportados |

### Semántica de `activo` verificada en UI

- **`CURRENT_SELECTABLE_CATALOG`:** `/distribuidor` y el buscador de propuestas no
  ofrecen ningún artículo inactivo.
- **`HISTORICAL_REFERENCE`:** ventas, aplicaciones (incluidas las de artículos
  inactivos, visibles en `/vehiculos`), campañas y oportunidades siguen presentes.
- Ninguna pantalla usa `activo` para borrar u ocultar historia.

### Performance (sesión autenticada)

| Medición | Valor |
|---|---|
| `load-dataset` (navegador) | 16,76 MB; 9,4–13,0 s por carga completa de página |
| `/articulos` hasta tabla renderizada | ~6,9 s después del `load-dataset` |
| `/dashboard` hasta contenido | ~8,3 s |
| Comparación con KORE-28/29 | mismos bytes; sin regresión atribuible al catálogo KORE |

`DATASET_PAYLOAD_TECH_DEBT` sigue vigente: `dataQuality` son ~10 MB de cada respuesta.

### Seguridad (durante el rehearsal)

- Sin service role en los chunks del cliente. La única coincidencia es el **nombre**
  `SUPABASE_SERVICE_ROLE_KEY` dentro de un mensaje de ayuda al usuario, no un valor.
- Sin `kore_raw_*`, `source_variant_key`, `content_hash`, `identity_status` ni payloads
  de conflictos en la respuesta ni en los chunks.
- La cookie de sesión no es accesible por JS; no se exportaron cookies ni tokens.
- Todas las llamadas a `/api/` posteriores al login respondieron 200. Los 401 en consola
  corresponden a las pruebas previas al login.

### Hallazgo: `NON_BLOCKING_UI_ISSUE` — estado obsoleto tras el login

- **Qué pasa:** `LoginForm` navega con `router.push()` + `router.refresh()`, que no
  remontan el `DatasetProvider` del layout raíz. El provider conserva el 401 obtenido en
  `/login` y la app muestra "Sin datos · fuente legacy no disponible" hasta recargar.
- **Alcance:** preexistente e independiente de la fuente (antes de KORE-27 mostraba mock
  en silencio; ahora es un error explícito). No muestra datos incorrectos.
- **Workaround:** recargar la página (F5) después del login.
- **Corrección sugerida (no aplicada en KORE-30, requiere re-login para verificar):**
  navegación completa tras el login, o re-fetch del provider cuando la carga previa
  terminó en 401.
- **Detalle menor:** en modo mixto ese cartel dice "fuente legacy no disponible" aunque el
  catálogo sea KORE.

## 10. Gates

| Gate | Resultado | Motivo |
|---|---|---|
| `TECHNICAL_CUTOVER_GATE` | **PASS** | loader = repository; sin fallbacks; conflictos en cuarentena; joins medidos; historia intacta; boundary y bundles limpios; builds A/B/A2 OK; tests 64 + 56 + 790 |
| `AUTHENTICATED_UI_GATE` | **PASS** (KORE-30) | 10 rutas validadas con sesión real del operador; sin fallback mock/legacy; conflictos e inactivos correctos; 1 hallazgo no bloqueante (§10) |
| `BUSINESS_ACTIVE_POLICY_GATE` | **PENDING** | falta confirmación humana de `SOURCE_AUTHORITATIVE` (§4) |

**Clasificación final: `READY_TECHNICALLY_PENDING_BUSINESS_CONFIRMATION`.**

- Lo único pendiente es la decisión humana sobre la política de `activo`.
- El default productivo **sigue `legacy`**: KORE-30 no activó nada.
- Con la política confirmada, el cutover permanente queda en
  `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore` + rebuild, sin cambios de código ni de esquema.
