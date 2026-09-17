# KORE-23 — Arquitectura de sincronización de datos reales y retiro de demo

Estado: **DISEÑO** (auditoría + arquitectura + plan de cutover). No implementa sync,
tablas, migraciones, cron ni cambios de UI.

Este documento no contiene secretos, PII ni valores comerciales.

---

## 1. Executive summary

- **KORE está listo para catálogo, pero la app no lo usa.** Hay 19 operaciones READ
  implementadas y testeadas en `lib/kore`, y ningún archivo de `app/`,
  `components/`, `contexts/` ni del resto de `lib/` importa `@/lib/kore`.
- **La app comercial depende de un único dataset monolítico:**
  - `PickupDataset`: clientes, ventas, ventaItems, artículos, aplicaciones,
    marcas/modelos y oportunidades.
  - Se elige automáticamente, sin flag, en el orden **Supabase → Excel en el
    navegador → mock**.
  - **Hay fallback silencioso al mock** (`lib/data/use-active-dataset.ts`) mientras
    carga, ante errores o si Supabase está vacío.
- **Supabase guarda ese dataset de forma pérdida (lossy):**
  - Las tablas `clientes`, `ventas`, `articulos`, `aplicaciones`, `importaciones`
    y `oportunidades` no tienen migraciones ni claves únicas.
  - Se reescriben completas en cada importación (delete-all + insert).
  - La importación **se rechaza si no hay ventas**, así que el catálogo no puede
    persistirse sin ventas.
- **Las ventas no tienen reemplazo en KORE.** `ListarComprobantes` está
  BLOCKED_EXTERNAL. Hoy vienen de Excel (Diario de Ventas) y alimentan dashboard,
  oportunidades, campañas y badges; seguirán dependiendo del Excel hasta que Númina
  resuelva KORE-10.
- **Bloqueante de producción: TRANSPORT_SECURITY_BLOCKER.** KORE expone HTTP en el
  puerto 89 sin TLS y la `SecretKey` viaja en texto plano. **Queda prohibido
  Vercel → KORE HTTP directo en producción.**
- **Arquitectura propuesta:** 3 capas (KORE RAW → Normalized source → Pickup
  domain), registro de sync runs, `KoreSyncRunner` separado de los servicios
  interactivos, **shadow mode** antes de cualquier cutover y cutover por dominio,
  reversible.
- **Primer vertical recomendado para KORE-24:** **taxonomía + artículos**
  (RAW + normalized, en shadow, sin tocar la UI).

---

## 2. Current KORE coverage

- **READ identificadas:** 27. **Implementadas:** 19. **Bloqueadas:** 8.
- **WRITE habilitadas:** 0.
- **Allowlist:** 19. Validación fail-closed y límites locales de seguridad.

| # | Operación | Módulo | SOAP | Estado de filas | Identidad |
|---|---|---|---|---|---|
| 1 | ListarVendedores | `vendedores.ts` | 1.1 | observadas | `nroVendedor` (único, validado) |
| 2 | ListarCuentas | `cuentas.ts` | 1.1 | observadas | `nroCuenta` (único por respuesta, validado) |
| 3 | ListarArticulos | `articulos.ts` | 1.1 | observadas | `codigoUnico` normalizado (único por respuesta, validado) |
| 4 | ListarFamilias | `taxonomia.ts` | 1.1 | observadas | `codigoFamilia` |
| 5 | ListarGrupos | `taxonomia.ts` | 1.1 | observadas | `codigoFamilia + codigoGrupo` |
| 6 | ListarSubgrupos | `taxonomia.ts` | 1.1 | observadas | `codigoFamilia + codigoGrupo + codigoSubgrupo` |
| 7 | ListarMarcasModelos | `marcas-modelos.ts` | 1.2 | observadas | IDENTITY_UNRESOLVED |
| 8 | ListarStock | `stock.ts` | 1.2 | observadas (multifila) | IDENTITY_UNRESOLVED |
| 9 | ListarPreciosxArticulo | `precios.ts` | 1.2 | observadas | IDENTITY_UNRESOLVED |
| 10 | ListarPrecios | `precios.ts` | 1.2 | observadas | IDENTITY_UNRESOLVED |
| 11 | ListarImagenes | `imagenes.ts` | 1.2 | observadas (1 imagen) | IDENTITY_UNRESOLVED (multiplicidad) |
| 12 | ListarDescuentosXCantidad | `descuentos.ts` | 1.2 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 13 | ListarCuentasGruposDescuentos | `descuentos.ts` | 1.2 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 14 | ListarUnidadesYFactoresxArticulo | `unidades.ts` | 1.2 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 15 | ListarLotesxCodigoUnico | `lotes.ts` | 1.1 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 16 | ListarLotesYUbicacionesxCodigoUnico | `lotes.ts` | 1.2 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 17 | ListarFacturasVivasxCuenta | `documentos-vivos.ts` | 1.1 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 18 | ListarNotasCreditoVivasxCuenta | `documentos-vivos.ts` | 1.1 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |
| 19 | ListarRecibosVivosxCuenta | `documentos-vivos.ts` | 1.2 | ROW_SHAPE_NOT_LIVE_OBSERVED | IDENTITY_UNRESOLVED |

**Restricciones de request relevantes para sync.** Son límites locales de
seguridad y **no deben eliminarse**:
- `ListarArticulos` exige al menos un filtro (rango de código, descripción o
  familia/grupo/subgrupo). Un snapshot completo requiere **particionar**, por
  ejemplo por familia.
- `ListarCuentas` exige al menos un filtro (`nroCuenta`, rut, nombre o
  `nroVendedor`). Para un snapshot hay que **particionar por vendedor**. La
  cobertura de cuentas sin vendedor está **sin resolver**.
- **Rango de códigos:** `ListarStock`, `ListarMarcasModelos`, `ListarImagenes`,
  `ListarPrecios` (+ lista) y `ListarDescuentosXCantidad` (+ lista) aceptan
  rangos, lo que permite **ventanas por rango** de códigos.
- **Código exacto (per-entity):** `ListarPreciosxArticulo`, unidades y ambos
  métodos de lotes.
- **Número de cuenta exacto:** los documentos vivos.

---

## 3. Blocked capabilities

| Operación | Categoría (KORE-10/22) | Dueño |
|---|---|---|
| ListarComprobantes | BLOCKED_EXTERNAL (error SQL/aplicación anidado) | Númina |
| ListarLineasDelComprobante | bloqueado con KORE-10, no invocado | Númina |
| ListarChequesaVencerxCuenta | MODULE_OR_SERVICE_NOT_ENABLED | Númina |
| ListarUltimosRecibosxCuenta | MODULE_OR_SERVICE_NOT_ENABLED | Númina |
| GetSaldosxCuenta | MODULE_OR_SERVICE_NOT_ENABLED | Númina |
| EstadoDeCuenta | MODULE_OR_SERVICE_NOT_ENABLED | Númina |
| ListarPedidosxCliente | MODULE_OR_SERVICE_NOT_ENABLED | Númina |
| GetTipodeCambio | SQL_OR_DATABASE_INTERNAL_ERROR | Númina |

**Qué queda incompleto en la app real** mientras sigan bloqueados, según la
auditoría del repo.

**Funcionalidad central perdida sin ventas:**
- `/ventas` depende por completo de ventas y líneas.
- Campañas (`/campanas`, `/campanas/articulos`, `/campanas/lonas`): la búsqueda
  de candidatos, la recencia en meses y el conteo de compras parten de líneas de
  venta. `recambio` además depende de rankings calculados offline desde Excel.
- `/importar/ventas` existe solo para cargar ventas.
- `/api/supabase/import-dataset` rechaza datasets sin ventas.

**Pérdida parcial:**
- `/dashboard`: se pierde toda la "actividad comercial" (registros de venta,
  ventas por mes y rankings de clientes y artículos por frecuencia).
- `/oportunidades`: se pierden 5 de 10 tipos (clientes sin ventas o de alta
  actividad, artículos frecuentes, ventas sin artículo, localidades de cartera).
  Los tipos basados en catálogo siguen funcionando.
- `/clientes` y `/articulos`: se pierden los conteos de ventas.
- `/distribuidor`: se pierde el badge "alta rotación".

**Cuentas corrientes (saldos, estado de cuenta, cheques):** ninguna pantalla actual
los usa, así que no hay regresión, pero tampoco pueden construirse.

**Tipo de cambio:** ninguna pantalla lo usa hoy. Las propuestas se cargan en USD
manual.

**IA:** **no existe IA/LLM en el repo.** Los motores son reglas deterministas:
oportunidades, insights del dashboard, badges del distribuidor, campañas,
prioridad de prospección y reglas de calidad/RMA sobre encuestas. Los que
necesitan ventas son oportunidades (parcial), dashboard (parcial), campañas y la
rotación del distribuidor.

**Los bloqueos NO deben frenar el catálogo real** (taxonomía, artículos,
compatibilidades, precios, stock, imágenes).

---

## 4. Current app data inventory

Tipos de fuente: DEMO, MOCK, HARDCODED, EXCEL, SUPABASE_REAL, DERIVED,
LOCALSTORAGE, APP_ONLY, UNKNOWN.

### 4.1 Núcleo comercial (dataset monolítico)

| Archivo | Dominio | Tipo de fuente | Fuente hoy | UI | Analytics | IA/reglas | Persistencia | ¿KORE reemplaza? | Operaciones KORE | ¿Bloqueado? | Riesgo al retirar | Fase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `lib/data/mock-pickup.ts` | todos los núcleos | MOCK/HARDCODED | 4 clientes, 4 artículos, 5 aplicaciones, 3 ventas… | todas las páginas vía fallback | dashboard, oportunidades | engines | — | catálogo y cuentas sí; ventas no | 1–8, 10 | ventas sí | **alto** (fallback silencioso) | último, tras cutover de catálogo y decisión sobre ventas |
| `lib/data/use-active-dataset.ts` | switch | DERIVED + fallback MOCK | contexto | 11 páginas + campañas + propuestas | sí | sí | — | n/a (mecanismo) | — | — | **alto** | antes del primer cutover visible (volver explícito el fallback) |
| `contexts/DatasetContext.tsx` | switch/orquestación | SUPABASE_REAL → EXCEL → MOCK | API load-dataset, IndexedDB/localStorage/sessionStorage | global | sí | recalcula oportunidades | Supabase (delete-all) | n/a | — | — | **alto** (`clearDataset` borra Supabase) | rediseñar por dominio antes del cutover |
| `lib/data/pickup-data.ts` | adaptador | DERIVED | — | global | sí | sí | — | n/a | — | — | medio | con el switch por dominio |
| `lib/data/excel-dataset-persistence.ts` | dataset Excel local | EXCEL + LOCALSTORAGE/IDB | navegador | global | — | — | local | parcial | 1–8 | ventas | medio | tras cutover de catálogo y cuentas |
| `lib/data/supabase-dataset-server.ts` + `supabase-mappers.ts` + API `load/import/clear-dataset`, `import-ventas` | persistencia dataset | SUPABASE_REAL (lossy) | tablas sin migraciones | global | sí | sí | `clientes`, `ventas`, `articulos`, `aplicaciones`, `importaciones`, `oportunidades` | catálogo y cuentas sí | 1–8 | ventas | **alto** | coexistir; no reutilizar estas tablas para KORE |
| `lib/data/insights.ts` | dashboard | DERIVED (default = mock) | dataset | `/dashboard`, `/clientes` | sí | reglas | — | parcial | catálogo/cuentas | ventas | medio | con dashboard |
| `lib/data/oportunidades-engine.ts` | oportunidades/CRM | DERIVED | dataset | `/oportunidades` | sí | 10 reglas | tabla `oportunidades` | parcial (5/10 tipos) | 3, 7, 2 | ventas | medio | tras catálogo |
| `lib/data/distribuidor-insights.ts` | distribuidor | DERIVED (default = mock) | dataset | `/distribuidor` | badges | reglas | — | sí salvo rotación | 3–7 (+8, 10, 11) | rotación | bajo | fase marca/modelo |
| `lib/data/module-filters.ts` | listados | DERIVED | dataset | `/articulos`, `/clientes`, `/ventas`, `/vehiculos` | KPIs | — | — | parcial | 1–7 | ventas | medio | por módulo |
| `lib/excel/*` (read-workbook, column-map, build-dataset, data-quality, normalization, mappers…) | import de 3 exportes de KORE (cuentas, diario, artículos) | EXCEL (import-only; parte reusada en servidor) | subida del usuario | `/importar`, `/importar/ventas`, campañas | calidad | normalización | vía import-dataset | catálogo y cuentas sí; ventas no | 1–8 | ventas | medio | retirar catálogo y cuentas; **conservar ventas** |
| `lib/models/*` | tipos | tipos | — | global | — | — | — | se mapean (Articulo↔codigoUnico, Cliente↔numeroCuenta) | — | — | — | adaptar en Layer 3 |

### 4.2 Pantallas con dependencia del dataset

| Ruta | Dominio | Tipo de fuente | ¿KORE reemplaza? | Operaciones | Bloqueo | Fase |
|---|---|---|---|---|---|---|
| `/articulos` | artículos | DERIVED (dataset; mock silencioso) | sí (salvo conteo de ventas) | 3–6 | ventas (conteo) | artículos |
| `/vehiculos` | compatibilidades | DERIVED | sí | 3, 7 | — | marca/modelo |
| `/distribuidor` (+ `PresupuestoModal`) | mostrador | DERIVED | sí salvo rotación | 3–7 (+8, 10, 11) | rotación | marca/modelo |
| `/clientes` | cuentas | DERIVED (banner mock) | sí salvo KPIs de ventas | 2, 1 | ventas (KPIs) | cuentas |
| `/ventas` | ventas | DERIVED | **no** | — | **BLOCKED_EXTERNAL** | fuera de alcance |
| `/dashboard` | analytics | DERIVED | parcial | 1–7 | ventas | después de catálogo y cuentas |
| `/oportunidades` | CRM/reglas | DERIVED / `oportunidades` | parcial | 2, 3, 7 | ventas | después de catálogo |
| `/campanas/articulos`, `/campanas/lonas` | campañas | DERIVED + EXCEL + SUPABASE_REAL | parcial (matching, compatibilidades, contacto) | 1–7 | **ventas centrales** | tardía |
| `/campanas` (recambio) | campañas | SUPABASE_REAL (seed offline desde Excel) | no | — | ventas | fuera de alcance |
| `/prospeccion-empresas/[id]` (propuestas) | precios en propuestas | DERIVED (`precioLista`, solo en el mock) | sí | 3, 9/10 | semántica de precio | pricing |
| `/importar`, `/importar/ventas` | import | EXCEL (runtime) | catálogo y cuentas sí; ventas no | 1–8 | ventas | retiro parcial |
| `/demo` | demo | HARDCODED + conteos | n/a | — | — | UNKNOWN_REVIEW (decisión comercial) |
| `/` | landing | HARDCODED | n/a | — | — | copy |

### 4.3 Dominios APP_ONLY (KORE nunca los provee)

| Módulo | Fuente | Notas |
|---|---|---|
| Prospección (`contexts/ProspeccionContext.tsx`, `lib/prospeccion/*`) | SUPABASE_REAL → LOCALSTORAGE → seed JSON → MOCK (`mock-prospeccion.ts`) | APP_ONLY; tiene su propio fallback a mock |
| Inteligencia de mercado / encuestas / calidad-RMA | SUPABASE_REAL (`mercado_*`) + seed demo por script | APP_ONLY; el brand→models embebido en la migración podría alimentarse de marca/modelo |
| Mesa de ayuda | SUPABASE_REAL (`helpdesk_tickets`) | versión localStorage muerta |
| Solicitudes | SUPABASE_REAL / LOCALSTORAGE | APP_ONLY; los artículos seleccionados vienen del dataset |
| Contenedores de campañas | SUPABASE_REAL (`commercial_campaign*`) | APP_ONLY; los resultados dependen de ventas |
| Auditoría de catálogos externos | EXCEL/CSV (runtime) → LOCALSTORAGE | APP_ONLY; podría auditar también el catálogo propio de KORE |
| Auth, proyecto, tutorial | env / HARDCODED | APP_ONLY |

### 4.4 Datos HARDCODED relevantes

- Normalización: `lib/excel/normalization.ts` (~49 alias de localidad/marca/modelo).
- Taxonomía genérica: `lib/catalog-audit/normalization.ts` (~56).
- Preset de campaña: `LONAS_PRESET` / `LONAS_EMAIL_KIT`.
- Encuestas: `DEPARTAMENTOS_URUGUAY`, `GIRO_OPCIONES`, `SLUG_ENCUESTA_PRINCIPAL`.
- Varios: `SOURCE_SUGGESTIONS`, `PRIO_RANK`, reglas regex producto→sector de
  prospección, URLs de FlipHTML5.
- Checklists de `/demo` y copy de `/`.

### 4.5 Conteos del inventario

- **Archivos demo/mock con datos:** 4.
  - `lib/data/mock-pickup.ts`
  - `lib/prospeccion/mock-prospeccion.ts`
  - `app/demo/page.tsx`
  - `scripts/seed-mercado-respuestas-demo.cjs`
- **Puntos de fallback o default a mock en código:** 6.
  - `use-active-dataset.ts`
  - `DatasetContext.tsx`
  - `pickup-data.ts` (`mockPickupDataToActive`)
  - `insights.ts` (default)
  - `distribuidor-insights.ts` (default)
  - `ProspeccionContext.tsx`
- **Módulos afectados por mock** (páginas con fallback del dataset o de
  prospección): 16. Son 11 páginas del dataset, campañas ×2, propuestas y las 7
  pantallas de prospección agrupadas como 2 módulos.
- **Fuentes HARDCODED de datos o reglas:** 10 (sección 4.4).
- **Excel:** dependencia funcional de runtime **0**. Flujos de subida en runtime
  **4** (`/importar`, `/importar/ventas`, pantalla de campañas y auditoría de
  catálogo). Scripts offline **5**. JSON estático derivado de Excel **1**
  (`/data/prospeccion.json`, hoy ausente).

---

## 5. Source-of-truth matrix

| Dominio | Estado | Operaciones | Notas |
|---|---|---|---|
| Vendedores | READY_FROM_KORE | ListarVendedores | la app hoy los guarda como texto en Cliente/Venta |
| Cuentas/clientes | READY_FROM_KORE | ListarCuentas | snapshot particionado por vendedor; cobertura de cuentas sin vendedor sin resolver |
| Artículos | READY_FROM_KORE | ListarArticulos | snapshot particionado por taxonomía |
| Familias | READY_FROM_KORE | ListarFamilias | catálogo completo sin filtros |
| Grupos | READY_FROM_KORE | ListarGrupos | ídem |
| Subgrupos | READY_FROM_KORE | ListarSubgrupos | la app hoy lo descarta |
| Marca/modelo/compatibilidad | READY_FROM_KORE (IDENTITY_UNRESOLVED) | ListarMarcasModelos | KORE no provee años ni confianza (la app los deriva del Excel) |
| Imágenes | READY_FROM_KORE (IDENTITY_UNRESOLVED) | ListarImagenes | sin consumidor UI actual |
| Unidades/factores | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarUnidadesYFactoresxArticulo | sin consumidor UI actual |
| Lotes | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarLotesxCodigoUnico | sin consumidor |
| Lotes/ubicaciones | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarLotesYUbicacionesxCodigoUnico | sin consumidor |
| Stock | READY_FROM_KORE_BUT_SEMANTICS_UNRESOLVED | ListarStock | multifila por ubicación y estado; el Excel no coincide con la suma |
| Listas de precio | READY_FROM_KORE_BUT_SEMANTICS_UNRESOLVED | ListarPreciosxArticulo | lista por defecto sin resolver |
| Precios | READY_FROM_KORE_BUT_SEMANTICS_UNRESOLVED | ListarPreciosxArticulo, ListarPrecios | precio de referencia, moneda ISO, IVA y redondeo sin resolver |
| Descuentos por cantidad | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarDescuentosXCantidad | sin consumidor |
| Descuentos por cuenta/categoría | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarCuentasGruposDescuentos | sin consumidor |
| Facturas vivas | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarFacturasVivasxCuenta | shadow únicamente |
| NC vivas | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarNotasCreditoVivasxCuenta | shadow únicamente |
| Recibos vivos | ROW_SHAPE_NOT_LIVE_OBSERVED | ListarRecibosVivosxCuenta | shadow únicamente |
| Ventas | BLOCKED_EXTERNAL | (ListarComprobantes) | sigue con Excel |
| Comprobantes | BLOCKED_EXTERNAL | ListarComprobantes / ListarLineasDelComprobante | KORE-10 |
| Pedidos | BLOCKED_EXTERNAL | ListarPedidosxCliente | módulo no habilitado |
| Saldos | BLOCKED_EXTERNAL | GetSaldosxCuenta | módulo no habilitado |
| Estado de cuenta | BLOCKED_EXTERNAL | EstadoDeCuenta | módulo no habilitado |
| Tipo de cambio | BLOCKED_EXTERNAL | GetTipodeCambio | error interno |
| Dashboards | DERIVED | — | parte de catálogo lista; parte de ventas bloqueada |
| CRM (oportunidades) | DERIVED | — | 5 de 10 tipos dependen de ventas |
| Analytics | DERIVED | — | ídem |
| IA | DERIVED (reglas; sin LLM) | — | no hay IA generativa en el repo |
| Alertas | DERIVED / APP_ONLY | — | solo reglas sobre encuestas (calidad/RMA) |
| Prospección, encuestas, helpdesk, solicitudes, campañas (contenedor), auditoría externa | APP_ONLY | — | — |

**Conteo:**
- READY_FROM_KORE: **8**
- READY_FROM_KORE_BUT_SEMANTICS_UNRESOLVED: **3**
- ROW_SHAPE_NOT_LIVE_OBSERVED: **8**
- BLOCKED_EXTERNAL: **6**
- DERIVED: **5**
- APP_ONLY: **6**

---

## 6. RAW layer (Layer 1 — KORE RAW)

**Objetivo:** preservar fielmente lo recibido, sin lógica de negocio.

**Principios:**
- **Una unidad de observación por fila KORE parseada** con los parsers de
  `lib/kore`, que ya validan contrato, tipos y fail-closed. No se guarda XML crudo:
  el payload RAW es el **mapa campo técnico → texto raw** de la fila, que ya
  excluye credenciales.
- **Sin transformación de stock ni precios.** Decimales y dobles se guardan como
  el texto recibido.
- **Contrato separado por operación.** No se colapsan `ListarPreciosxArticulo` y
  `ListarPrecios`, ni facturas y notas de crédito.

**Registro conceptual por fila observada:**

| Campo | Descripción |
|---|---|
| `operation` | nombre exacto de la operación KORE |
| `request_scope` | alcance del request que produjo la fila (p. ej. partición familia X, rango de códigos, código exacto, cuenta). Los valores sensibles se guardan hasheados o en columna protegida, nunca en logs |
| `source_key` | natural key normalizada cuando es CONFIRMED/STRONG; si no, `null` |
| `row_fingerprint` | hash del payload raw canónico (detecta cambios y duplicados sin asumir identidad) |
| `row_ordinal` | posición dentro de la respuesta (preserva el orden y los duplicados) |
| `payload_raw` | campos técnicos → strings raw exactos |
| `first_seen_at` / `last_seen_at` | primera y última observación |
| `last_sync_run_id` | último sync run que la observó |
| `ingested_at` | timestamp de ingesta |
| `missing_since` | sync run o timestamp en que dejó de aparecer dentro de su `request_scope` |

**Entidades con identidad sin resolver** (stock, marca/modelo, precios,
descuentos, lotes, documentos vivos):
- La unidad de comparación es el **conjunto de filas por `request_scope`** (por
  ejemplo, todas las filas de stock de un `codigoUnico`).
- Se versiona el conjunto completo: fingerprints y conteo.
- "Desaparición" = la fila (por fingerprint) no aparece en la siguiente
  observación del mismo scope.

---

## 7. Normalized layer (Layer 2 — Normalized source)

**Objetivo:** entidades KORE consistentes, sin reglas de Pickup4x4.

**Reglas:**
- **Pares raw + normalizado**, tal como ya los producen los modelos de `lib/kore`
  (`codigoUnicoRaw`/`codigoUnico`, `precioRaw`/`precio`, etc.).
- **Relaciones explícitas, sin inferencias comerciales:**
  - familia → grupo → subgrupo (keys compuestas; huérfanos detectables con
    `findOrphanGrupos` y `findOrphanSubgrupos`);
  - artículo → taxonomía (códigos raw y normalizados; nulos preservados);
  - artículo → marca/modelo (filas N por artículo);
  - artículo → stock (filas N por artículo × ubicación × estado);
  - artículo → precios por lista (dos fuentes separadas);
  - cuenta → vendedor (`nroVendedor`) y cuenta → lista de precio (`nroListaDePrecio`,
    sin elegir precio).
- **Montos:** texto exacto más valor numérico de conveniencia; nunca se usa el
  número para identidad o igualdad.
- **Stock:** filas preservadas. **Prohibido en Layers 1-2:** `stockTotal`,
  `stockDisponible` y `stockVendible`.
- **Pricing:** se conservan `precioRaw`, `precioIvaRaw`, lista, símbolo raw,
  nombre de lista, `autonumerado` y taxonomía. **Sin resolver:** precio comercial,
  lista por defecto, moneda ISO y redondeo.
- **Lotes:** se preservan lote, vencimiento raw (texto), ubicación, cantidad y
  estado. No se interpreta vencido, disponible ni vendible.
- **Documentos vivos:** solo ingesta shadow; no son dependencia crítica de la UI.

---

## 8. Domain layer (Layer 3 — Pickup domain)

**Objetivo:** datos listos para la UI, CRM, dashboards y motores, **solo con reglas
confirmadas**.

**Alcance:**
- **Adaptadores hacia los tipos actuales** (`lib/models`): `Articulo` por
  `codigoUnico`; `Cliente` por `numeroCuenta`; `VehiculoMarca`/`VehiculoModelo`
  con ids KORE (`nroMarca`/`nroModelo`) en vez de slugs; `Vendedor` como entidad.
- **Conceptos comerciales** (precio comercial, stock disponible, cliente activo):
  **solo cuando Pickup4x4 los defina por escrito**. Mientras tanto, la UI muestra
  datos fuente con etiquetas explícitas, como "lista N" o "stock por
  ubicación/estado".
- **Huecos conocidos entre KORE y el modelo actual:**
  - `ArticuloAplicacion.anioDesde/anioHasta`, `confidence`, `validationStatus`
    y `codigoAplicacion` provienen del Excel y de la normalización local, no de
    KORE. Hay que decidir si se derivan, se mantienen como capa manual o se
    eliminan. Supabase ya los pierde hoy (años 0/9999).
  - `Cliente.zona`, `cuit` y `provincia` no mapean 1:1 con `KoreCuenta` (que tiene
    `ruc`, `codigoLocalidad` y `codigoPostal`).
  - `Articulo.rubro/categoria` corresponden hoy a Familia/Grupo del Excel. KORE
    provee códigos y descripciones reales, más subgrupo.
- **Ventas:** siguen llegando por la importación del Diario (Excel) hasta que se
  resuelva KORE-10. La capa de dominio debe poder **combinar catálogo KORE con
  ventas legacy** por `codigoUnico` y `numeroCuenta`, sin forzar la
  reimportación completa.

---

## 9. Natural keys

| Entidad | Key | Evidencia |
|---|---|---|
| Artículo | `codigoUnico` normalizado (trim) | CONFIRMED: único por respuesta, validado por el parser; padding a la derecha observado |
| Cuenta | `nroCuenta` | CONFIRMED: único por respuesta, validado |
| Vendedor | `nroVendedor` | CONFIRMED: único, validado; el vendedor 0 es válido y sin significado |
| Familia | `codigoFamilia` | STRONG: unicidad validada en el catálogo |
| Grupo | `codigoFamilia + codigoGrupo` | STRONG |
| Subgrupo | `codigoFamilia + codigoGrupo + codigoSubgrupo` | STRONG |

En taxonomía, `AUTONUMERADO` también es único por entidad, pero no se usa como
natural key.

**Aclaración:** la unicidad está validada **dentro de una respuesta**. La
estabilidad entre syncs (reutilización de códigos o renumeración) debe medirse en
shadow mode antes del cutover.

---

## 10. Identity unresolved

| Entidad | Estado | Evidencia |
|---|---|---|
| Stock | IDENTITY_UNRESOLVED | (código, ubicación) **no es único**; (código, ubicación, estado) es candidato sin confirmar |
| Marca/modelo | IDENTITY_UNRESOLVED | candidato (código, nroMarca, nroModelo); sin unicidad validada |
| Precios x artículo | IDENTITY_UNRESOLVED | (lista) único en 1 observación, con 1 sola moneda |
| Precios (general) | IDENTITY_UNRESOLVED | `AUTONUMERADO` no es PK confirmada |
| Imágenes | IDENTITY_UNRESOLVED | multiplicidad por artículo no observada |
| Descuentos (ambos) | IDENTITY_UNRESOLVED | 0 filas observadas |
| Unidades / lotes / lotes-ubicaciones | IDENTITY_UNRESOLVED | 0 filas observadas |
| Facturas / NC / recibos vivos | IDENTITY_UNRESOLVED | 0 filas; `Numero` sin garantía de unicidad |

---

## 11. Sync modes

| Dominio | Modo | Particionado / límite de seguridad | Cadencia relativa |
|---|---|---|---|
| Familias, grupos, subgrupos | SNAPSHOT | catálogo completo (contrato documentado sin filtros) | baja |
| Vendedores | SNAPSHOT | completo | baja |
| Artículos | SNAPSHOT (particionado) | por familia, o subgrupo si una familia es grande; nunca sin filtro | media |
| Cuentas | SNAPSHOT (particionado) | por `nroVendedor`; cobertura de cuentas sin vendedor sin resolver | media |
| Marca/modelo | WINDOWED (rangos de código) | ventanas de rango de `codigoUnico` | media-baja |
| Imágenes | PER_ENTITY / WINDOWED lento | rango pequeño; límite de bytes por request | baja |
| Stock | WINDOWED (rangos de código) | ventanas de rango; opcional `nroEstado` | alta |
| Precios x artículo | PER_ENTITY | código exacto | media |
| Precios (general) | WINDOWED | lista + rango de códigos (obligatorio) | media |
| Descuentos por cantidad | WINDOWED (controlado) | lista + rango | baja |
| Descuentos por cuenta/categoría | WINDOWED (controlado) | rango o categoría | baja |
| Unidades | PER_ENTITY | código exacto | baja |
| Lotes / lotes-ubicaciones | PER_ENTITY | código exacto | media |
| Documentos vivos | PER_ENTITY (shadow only) | cuenta exacta | a definir |
| Ventas, comprobantes, pedidos, saldos, estado de cuenta, tipo de cambio | BLOCKED | — | — |

**`KoreSyncRunner` (futuro, separado de `lib/kore/service.ts`):**
- **Lo que no cambia:** reutiliza los `fetchKore*` y parsers existentes y **no
  elimina los límites de seguridad**. Particiona explícitamente.
- **Planificación:** planner de particiones y ventanas, checkpoint por partición,
  ejecución serial o con concurrencia acotada.
- **Tolerancia a fallos:** timeout por request, política de reintento explícita
  (hoy el cliente tiene 0 reintentos), backoff y resume desde checkpoint.
- **Observabilidad:** métricas por run y partición, sin PII.
- **Categorías de error:** las de `KoreError` (`http`, `timeout`, `soap_fault`,
  `invalid_data`, `parse`, `response_too_large`) más `Respuesta ERROR` por
  operación.

**Sync runs (`kore_sync_runs`, conceptual; se adapta al patrón Supabase actual
con service role en el servidor):**
- Campos: `id`, `operation`, `sync_mode`, `status` (running, succeeded, partial,
  failed, aborted), `started_at`, `completed_at`, `rows_received`,
  `rows_created`, `rows_updated`, `rows_unchanged`, `rows_rejected`,
  `error_category`, `window_start` / `window_end` (partición o rango, sin valores
  sensibles en claro), `checkpoint`, `created_at`.
- Recomendación: un run por (operación, partición) o un run padre con
  sub-checkpoints.
- **Las tablas nuevas deben crearse por migración versionada**, a diferencia de
  las tablas núcleo actuales, que no tienen migraciones.

**Trazabilidad por entidad fuente:** operación de origen, `last_sync_run_id`,
`first_seen_at`, `last_seen_at`, payload raw, representación normalizada, natural
key conocida (o `null`) y `missing_since`.

---

## 12. Shadow mode

1. **Sync en paralelo, sin impacto en la UI:** el sync escribe en las tablas KORE
   (RAW + normalized) mientras la UI sigue leyendo el dataset actual.
2. **Sin escrituras sobre tablas legacy:** nunca se escriben `articulos`,
   `clientes` ni el resto, y nunca se llama `clearDataset` ni `import-dataset`.
3. **Métricas seguras por run** (sin PII ni valores):
   - conteos por entidad y partición;
   - keys faltantes o nuevas contra el sync previo y contra el snapshot legacy
     (`codigoUnico`, `numeroCuenta`);
   - entidades removidas (`missing_since`);
   - tasas de nulos por campo;
   - candidatos duplicados (fingerprints repetidos);
   - cobertura de relaciones (artículos sin familia válida, huérfanos de
     taxonomía, cuentas con vendedor inexistente);
   - duración, bytes y errores por categoría.
4. **Reconciliación contra Excel** (LEGACY_SNAPSHOT): solo métricas agregadas de
   cobertura de keys. No se reconcilian valores de stock ni precio como regla.

---

## 13. Cutover order

Orden validado contra las dependencias reales del repo, que difiere del orden
conceptual:

| Fase | Dominio | Justificación en el repo |
|---|---|---|
| 0 | **Prerequisitos de app** | fallback de mock explícito; switch de fuente por dominio; desacoplar catálogo del requisito de ventas de `import-dataset` y del borrado de `clearDataset` |
| 1 | Taxonomía | necesaria para particionar artículos; la app hoy pierde subgrupo |
| 2 | Artículos | `/articulos`, distribuidor, matching de campañas, selector de propuestas |
| 3 | Marca/modelo | `/vehiculos` y `/distribuidor`; resolver la brecha de años y confianza |
| 4 | Vendedores | prerequisito de la partición de cuentas; hoy son texto |
| 5 | Cuentas | `/clientes`, contacto de campañas |
| 6 | Pricing | propuestas (`precioLista` hoy solo existe en el mock); requiere definir la semántica |
| 7 | Stock | ninguna pantalla lo usa con datos reales hoy; requiere semántica |
| 8 | Imágenes | sin consumidor UI actual; habilita mejoras del distribuidor |
| 9 | Unidades / lotes | sin consumidor; shadow |
| 10 | Descuentos | sin consumidor; shadow |
| — | Documentos vivos | shadow only |
| — | Ventas / comprobantes / pedidos / saldos / estado de cuenta / tipo de cambio | BLOCKED (Númina); ventas siguen vía Excel |

**Diferencias con el orden conceptual:**
- Imágenes, unidades/lotes y descuentos se postergan: no tienen consumidor en la
  UI actual.
- Vendedores va antes que cuentas, porque la partición de cuentas lo requiere.
- Se agrega una **fase 0** de prerequisitos de app.

### READY_FOR_CUTOVER (criterio por módulo)

Un módulo abandona demo/Excel solo si se cumplen todas:
- sync estable en shadow por un período acordado;
- datos reales presentes, con cobertura de keys aceptable contra el legacy;
- identidad suficiente y relaciones válidas (huérfanos medidos);
- UI funcionando con la fuente real;
- **sin fallback oculto a demo**;
- observabilidad (sync runs y métricas);
- rollback probado.

**Sin big-bang.**

---

## 14. Demo retirement

Nada se borra en KORE-23.

| Elemento | Clasificación | Motivo |
|---|---|---|
| `lib/data/mock-pickup.ts` | KEEP_UNTIL_DEPENDENCY_RESOLVED | sigue siendo el fallback de dominios con ventas bloqueadas |
| Fallback silencioso en `lib/data/use-active-dataset.ts` / `contexts/DatasetContext.tsx` | KEEP_UNTIL_DEPENDENCY_RESOLVED | se vuelve explícito en fase 0 y se retira por dominio tras el cutover |
| `mockPickupDataToActive` (`lib/data/pickup-data.ts`) | KEEP_UNTIL_DEPENDENCY_RESOLVED | usado por el fallback |
| Default a mock en `lib/data/insights.ts` | SAFE_TO_REMOVE_AFTER_CUTOVER | los llamadores ya pasan el dataset activo |
| Default a mock en `lib/data/distribuidor-insights.ts` | SAFE_TO_REMOVE_AFTER_CUTOVER | ídem |
| `fuenteDatos: "mock"` y penalización de confianza en `oportunidades-engine.ts` | SAFE_TO_REMOVE_AFTER_CUTOVER | reemplazar por la fuente real (`kore`/`legacy`) |
| Botón "Volver a datos mock" en `/importar` (borra tablas Supabase) | KEEP_UNTIL_DEPENDENCY_RESOLVED | **riesgo operativo**; revisar en fase 0 |
| `app/demo/page.tsx` + ítem "Demo" en `lib/navigation.ts` | UNKNOWN_REVIEW | decisión comercial (pitch) |
| Copy "datos de demostración" en `app/page.tsx` y banners mock | SAFE_TO_REMOVE_AFTER_CUTOVER | por módulo |
| `lib/prospeccion/mock-prospeccion.ts` + fallback de `ProspeccionContext` | KEEP_UNTIL_DEPENDENCY_RESOLVED | dominio APP_ONLY; depende de Supabase de prospección, no de KORE |
| `scripts/seed-mercado-respuestas-demo.cjs` | TEST_ONLY_KEEP | datos demo marcados y con `--clean` |
| `lib/helpdesk/storage.ts` (localStorage, sin importadores) y `buildDemoHelpDeskTicket` (sin uso) | SAFE_TO_REMOVE_AFTER_CUTOVER | código muerto independiente de KORE |
| Barrels muertos `lib/excel/index.ts`, `lib/catalog-audit/index.ts`, `lib/models/index.ts`; `readExcelFileRows`, `buildImportPreviewFromMockRows` | SAFE_TO_REMOVE_AFTER_CUTOVER | código muerto |
| `lib/kore/__fixtures__/*` | TEST_ONLY_KEEP | fixtures sintéticas de tests |

**Conteo:**
- SAFE_TO_REMOVE_AFTER_CUTOVER: **7** filas
- KEEP_UNTIL_DEPENDENCY_RESOLVED: **5**
- TEST_ONLY_KEEP: **2**
- UNKNOWN_REVIEW: **1**

---

## 15. Excel retirement

Los Excel pasan a **LEGACY_SNAPSHOT** y **RECONCILIATION_SOURCE**; no son fuente de
verdad futura.

| Uso actual | Clasificación | Destino |
|---|---|---|
| `/importar` (cuentas, diario, artículos → dataset) | import-only (runtime upload) | catálogo y cuentas: retirar tras cutover. **Diario de ventas: conservar** mientras KORE-10 siga bloqueado |
| `/importar/ventas` → `import-ventas` | import-only; lógica de `lib/excel` reusada en servidor | **conservar** (única fuente de ventas) |
| Pantalla de campañas (Excel de artículos objetivo + export xlsx) | import-only / export | la entrada objetivo puede pasar a selección desde el catálogo KORE; el export se mantiene |
| Auditoría de catálogos externos (xlsx/csv) | import-only, APP_ONLY | se mantiene (catálogos de terceros) |
| `scripts/build-campania.cjs`, `build-prospeccion.cjs`, `scripts/exploracion/*` | migration-only / exploratorio; **rotos** (leen `public/imports`, hoy vacío) | UNKNOWN_REVIEW; no son runtime |
| `/data/prospeccion.json` | JSON estático derivado de Excel (ausente) | APP_ONLY; fuera del alcance de KORE |
| Dependencia **funcional** de runtime | **0** | objetivo: mantener 0 y retirar los uploads de catálogo y cuentas tras cutover |

**Regla vigente:** los Excel reales viven fuera del repo
(`pickup4x4-local/imports`). Nunca se vuelven a copiar a `public/`.

---

## 16. Rollback

**Mecanismo compatible con la arquitectura actual.** No existe un flag global, y
no se agrega en KORE-23.
- `DatasetSource` ya distingue `mock | excel | supabase`. Se propone evolucionar a
  una **fuente por dominio** con tres estados conceptuales:
  - `legacy`: comportamiento actual;
  - `shadow`: la UI lee legacy mientras se sincroniza KORE;
  - `kore`: la UI lee la capa de dominio alimentada por KORE.
- **Ubicación:** en el servidor (configuración o tabla de settings), para evitar
  divergencias entre navegadores.
- **Reversibilidad:** durante shadow y cutover **no se modifican ni se borran**
  las tablas legacy. El rollback de un dominio es volver de `kore` a `legacy` sin
  migrar datos.
- **Salvaguarda:** `clearDataset` y `import-dataset` (delete-all) no deben afectar
  dominios en `kore`; se resuelve en fase 0.

---

## 17. Transport security

**TRANSPORT_SECURITY_BLOCKER:** KORE expone **HTTP en el puerto 89, sin TLS**, y la
`SecretKey` viaja en texto plano en cada request. **Vercel → KORE HTTP directo
queda prohibido en producción.**

| Opción | Exposición de SecretKey | Complejidad de despliegue | Uptime | Operación | Reintentos | ¿Solo saliente? | Firewall |
|---|---|---|---|---|---|---|---|
| A. Agente de sync on-prem / local (red de KORE) | la clave solo viaja por la LAN; el agente necesita credenciales de escritura hacia el destino (Supabase) | media (host, servicio, updates) | depende del host local | monitoreo del agente | locales, con checkpoint | **sí** (agente → HTTPS a Supabase) | no abre puertos entrantes |
| B. VPN / red privada (cloud ↔ red KORE) | cifrada en el túnel; HTTP plano dentro de la red privada | alta (VPN site-to-site, gateway; Vercel no se une fácil a VPN y requiere runner fuera de Vercel) | depende de túnel y proveedor | gestión de VPN | en el runner cloud | no necesariamente | reglas de túnel |
| C. Reverse proxy TLS autorizado frente a KORE | cifrada hasta el proxy; HTTP plano proxy → KORE en LAN | media (certificado, host y exposición pública autorizada por Númina) | depende del proxy | certificados, hardening, allowlist de IPs | en el cliente | **no** (expone un endpoint entrante) | abrir 443 entrante |
| D. Híbrido (agente on-prem + API propia TLS / cola) | similar a A | media-alta | desacopla la UI de KORE | más piezas | desacoplados | sí | sin entrantes |

**Evaluación preliminar** (sin decisión final, depende de la infraestructura de
Pickup4x4 y de Númina):
- **A o D** encajan mejor con sync batch: tráfico solo saliente, clave fuera de
  internet, shadow mode natural.
- **C** sirve a consultas interactivas (fichas en vivo), pero requiere
  autorización de Númina y endurecimiento.
- **B** es la más costosa para un frontend en Vercel.

---

## 18. Númina blockers

1. **KORE-10:** error interno SQL/aplicación en `ListarComprobantes` (bloquea
   ventas, comprobantes y líneas).
2. **Funcionalidades no habilitadas:** Cheques, Últimos recibos, Saldos, Estado de
   cuenta y Pedidos.
3. **`GetTipodeCambio`:** error interno referido a columna de datos.
4. **Transporte:** disponibilidad de TLS, VPN o autorización de proxy para el
   endpoint KORE.
5. **Semántica comercial:**
   - estados de stock (`NROESTADO`);
   - lista de precio por defecto;
   - relación entre `PRECIO` (double) y `Precio` (decimal);
   - significado de los símbolos de moneda;
   - IVA;
   - descuentos (acumulación y prioridad).
6. **Cobertura de cuentas:** forma soportada de listar todas las cuentas sin
   filtros masivos (partición por vendedor versus cuentas sin vendedor).

Detalle en `KORE-10-listar-comprobantes-blocked.md` y
`KORE-blocked-read-escalation.md`.

---

## 19. Recommended next implementation — KORE-24

### Vertical elegido: **Taxonomía (familias, grupos, subgrupos) + Artículos**

**Justificación:**
- **Datos reales de KORE:** las 4 operaciones están implementadas y con filas
  observadas.
- **Baja ambigüedad semántica:** códigos y descripciones; no hay stock, precio ni
  moneda.
- **Identidad suficiente:** `codigoUnico` y keys compuestas de taxonomía con
  unicidad validada por los parsers.
- **Bajo riesgo de negocio:** es el catálogo que ya existe en la app desde Excel.
  Permite medir cobertura contra el legacy por `codigoUnico` sin tocar valores
  comerciales.
- **Prueba la arquitectura:**
  - snapshot completo (taxonomía) y snapshot **particionado** (artículos por
    familia), respetando los límites de seguridad;
  - sync runs, checkpoints, `first_seen` / `last_seen` / `missing_since`;
  - relaciones y huérfanos.
- **Desbloquea:** marca/modelo, stock, precios e imágenes, que se sincronizan
  por rangos o códigos de artículos conocidos.

**Alcance propuesto para KORE-24:**
- RAW + normalized en **shadow mode**.
- **Sin UI, sin tocar tablas legacy, sin `clearDataset` ni `import-dataset`.**

**Decisiones previas que KORE-24 debe confirmar con el usuario:**
1. **Entorno de ejecución.** No es Vercel (TRANSPORT_SECURITY_BLOCKER): puede ser
   un script o agente local en la red de KORE.
2. **Destino de la persistencia shadow:** tablas nuevas en Supabase por migración
   versionada (requiere aprobación explícita de SQL y migraciones), o un almacén
   local transitorio.
3. **Presupuesto de requests por run:** 3 de taxonomía más 1 por familia en
   artículos.
