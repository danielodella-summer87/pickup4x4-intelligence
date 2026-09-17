# KORE — Cutover productivo del catálogo (paquete de release)

> **Este documento NO activa nada.** Prepara el release. Ejecutar el cutover requiere
> autorización explícita y los pasos de §9.

## 1. Estado del release

| Ítem | Estado |
|---|---|
| `TECHNICAL_CUTOVER_GATE` | PASS (KORE-28/29) |
| `AUTHENTICATED_UI_GATE` | PASS (KORE-30/31) |
| `BUSINESS_ACTIVE_POLICY_GATE` | CONFIRMED — `SOURCE_AUTHORITATIVE` |
| `LOGIN_HYDRATION_GATE` | PASS (KORE-31) |
| Clasificación | **READY_TO_EXECUTE_PRODUCTION_CUTOVER** |
| Fuente productiva hoy | `catalog = legacy` (sin cambios) |

Falta únicamente: autorización para `push` + env + deploy + smoke.

## 2. Baseline de código

- Rama: `main`, 21 commits por delante de `origin/main` (nada pusheado).
- Working tree limpio; `git diff origin/main...HEAD --check` sin problemas.
- 133 archivos, +17.668 / −445.

Bloques de los commits adelantados:

| Bloque | Commits |
|---|---|
| Seguridad | `9ee3ecf` (bloqueo de planillas en `public/`) |
| Conector KORE (read-only) | `d142179` cliente SOAP · `1b90646` cuentas · `72096fe` artículos · `873f434` taxonomía |
| Catálogos y contratos | `6953807` aplicaciones · `0a802c0` stock · `818ccc1` precios · `4b37265` catálogos restantes · `3b43a6e` cuenta y finanzas |
| Endpoints bloqueados | `ac4541e` comprobantes · `ea26c0a` clasificación de lecturas bloqueadas |
| Arquitectura de sync | `0744d1d` |
| Shadow sync + identidad | `c40b225` (incluye migraciones 001 y 002, conflictos de identidad) |
| Fuentes explícitas | `a682897` |
| Integración del catálogo | `81a0e5f` |
| Aceptación y fix de login | `ec0d17e` · `10b7118` · `ad9f5cf` |
| Lint pre-release | `9dee770` |
| Docs de release | `9e12a99` (este documento) |

## 3. Gate de tests

| Check | Resultado |
|---|---|
| `npm run test:data` | 73/73 |
| `npm run test:kore` | 790/790 |
| `npm run test:kore-sync` | 56/56 |
| `npx tsc --noEmit` | 0 errores |
| `npm run build` (default legacy) | OK |
| `git diff --check` | OK |
| `npx eslint .` | 2 errores preexistentes y ajenos al catálogo (§4), 14 warnings |

## 4. Lint

`npx eslint .` sobre todo el repo (alcance mayor al de KORE-31, que no incluía
`scripts/`) daba **29 errores**, todos preexistentes y ajenos al catálogo KORE.

| Error | Dónde | Clasificación | Acción |
|---|---|---|---|
| `@typescript-eslint/no-require-imports` (27) | `scripts/*.cjs` (build, seed y exploración) | TOOLING_FALSE_POSITIVE | **Corregido por configuración**: en `eslint.config.mjs` la regla no aplica a `**/*.cjs`, donde `require` es el idioma correcto del formato. Sin `eslint-disable` en el código |
| `Cannot reassign variable after render completes` (1) | `components/inteligencia-mercado/charts/DonutChart.tsx` | SAFE_TRIVIAL_FIX | **Corregido**: los offsets de arco se calculan sin mutar variables durante el render. Equivalencia numérica verificada (diferencia máxima 1,7e-13 px sobre 465 px de circunferencia) |
| `react-hooks/set-state-in-effect` (2) | `app/inteligencia-mercado/page.tsx`, `app/mesa-de-ayuda/page.tsx` | SEMANTIC_FIX_REQUIRED | **No corregido**: el efecto llama a un loader async que hace `setState` antes del primer `await`; arreglarlo cambia el ciclo de carga de esas pantallas |

**Estado final:** 2 errores y 14 warnings, todos preexistentes y fuera del catálogo.

- **No bloquean el release:** `npm run build` pasa; el pipeline de build no corre eslint.
- Sin supresiones globales ni `eslint-disable` arbitrarios.
- **Release debt:** `LINT_SETSTATE_IN_EFFECT` en esas dos pantallas.

## 5. Auditoría de secretos e historial

Revisado en el árbol de trabajo y en los 19 commits adelantados:

| Búsqueda | Resultado |
|---|---|
| Valores reales (service role, `KORE_SECRET_KEY`, password admin, clave publishable, URL Supabase) | **0 coincidencias** en historial y árbol |
| Patrones genéricos (JWT `eyJ…`, `sb_secret_`, bearer, claves privadas) | 0 |
| `<SecretKey>` | Solo el código de redacción y un placeholder `…` |
| Planillas `.xlsx/.xls/.xlsm/.csv` versionadas | 0 (incluye `public/`) |
| `.env*`, `launch.json`, scratchpads, temporales | 0 |
| Emails en fixtures/tests | Sintéticos (`@ejemplo.invalid`, `@kore.test.invalid`) |

Los Excel reales siguen únicamente fuera del repo, en
`C:\Users\Andres\pickup4x4-local\imports` (no se tocaron).

**Nombres** de variables en mensajes de ayuda están permitidos; lo prohibido son los
valores.

## 6. Snapshot actual

| Métrica | Valor |
|---|---|
| Último run | `partial` / `KORE_IDENTITY_CONFLICT` (conflictos conocidos, en cuarentena) |
| Requests | 4 intentadas / 4 OK / 0 fallidas |
| Snapshot completo | sí |
| Filas recibidas | 10.551 |
| Claves distintas | 10.549 |
| Resolved activos | 10.547 |
| En cuarentena | 2 (2 conflictos abiertos) |
| Resolved missing | 0 |
| Variantes RAW | 10.551 |
| Taxonomía activa | 8 / 62 / 251 |

**`SNAPSHOT_FRESHNESS_STATUS = FRESH_FOR_CUTOVER`** al preparar este release (antigüedad:
~2,3 h). Como la sync es manual, la frescura se vuelve a evaluar el día del cutover: el
paso 1 de §9 es correr una sync nueva.

## 7. Runbook de sync manual

Mientras no exista un agente always-on, la sync es **manual** y corre en el entorno local
autorizado (nunca desde la nube).

**Cadencia recomendada:** una corrida antes de empezar la jornada comercial, y otra
después de cambios grandes de catálogo en KORE. No automatizar todavía.

1. Abrir el entorno local autorizado (la máquina que tiene acceso a KORE en HTTP :89).
2. `git checkout main` y confirmar el commit esperado del release.
3. Verificar que `.env.local` tenga `KORE_BASE_URL`, `KORE_COMPANY_NUMBER`,
   `KORE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
   **Nunca** copiar esos valores a otro lado ni a este documento.
4. Ejecutar:

```bash
npm run kore:sync:catalog-shadow
```

5. Revisar el exit code:
   - `0` = `completed`;
   - `2` = `partial` por `KORE_IDENTITY_CONFLICT` (aceptable si el snapshot está completo
     y los conflictos son los conocidos);
   - `1` = cualquier otro caso → **no promover el cutover**.
6. Revisar los conteos del JSON de salida: `articleRowsReceived`, `distinctArticleKeys`,
   `resolvedNormalizedKeys`, `conflictNormalizedKeys`, `snapshotComplete` y
   `legacyTablesUnchanged`.
7. Aceptable: `partial` solo por conflictos de identidad ya conocidos.
8. Si es `failed`, o aparecen conflictos nuevos, errores de parser, fallas de request o de
   persistencia: **detener** y no promover datos ni cutover.

Presupuesto por corrida: 4 POST, 0 reintentos. Nunca llama endpoints bloqueados
(`ListarComprobantes`, `ListarLineasDelComprobante`) ni escribe en KORE.

## 8. Arquitectura productiva

```
navegador → Vercel (Next) → Supabase (tablas kore_* normalizadas)
runner local autorizado → KORE SOAP (HTTP :89) → Supabase (tablas kore_*)
```

- **Producción NO llama KORE.** El catálogo se sirve desde Supabase.
- Por lo tanto Vercel **no necesita** `KORE_BASE_URL`, `KORE_COMPANY_NUMBER` ni
  `KORE_SECRET_KEY`. Esas credenciales viven solo en el runner local/on-prem.
- **`TRANSPORT_SECURITY_BLOCKER` sigue vigente:** KORE usa HTTP sin TLS. El cutover no lo
  elimina, pero tampoco lo viola, porque no existe el camino Vercel → KORE. **No diseñar
  ese camino.**
- **RLS:** las tablas `kore_*` tienen RLS activo y 0 políticas públicas. El browser no las
  lee directo; solo el repository server-side con service role.

### Variables necesarias en producción

| Variable | Para qué | Estado |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase (ya en uso por la app) | debería estar configurada |
| `SUPABASE_SERVICE_ROLE_KEY` | Lectura server-side del catálogo KORE | debería estar configurada |
| `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore` | **Cambio del cutover** | pendiente |

- Las dos primeras ya las usa el endpoint `load-dataset` actual en producción; aun así,
  **`DEPLOY_ENV_VALIDATION_REQUIRED`**: confirmarlas en Vercel (scope Production, y Preview
  si se quiere probar ahí) durante la tarea de deploy. No se consultó Vercel en esta fase.
- **`NEXT_PUBLIC_PICKUP_CATALOG_SOURCE` es build-time:** Next la inyecta al compilar, en
  cliente y servidor. Cambiarla **exige un build/deploy nuevo**; no alcanza con editarla
  después de compilar.

## 9. Secuencia de deploy (no ejecutada)

| Paso | Acción |
|---|---|
| 1 | Sync local nueva (§7) |
| 2 | Confirmar que el resultado es aceptable (`completed`, o `partial` solo por conflictos conocidos) |
| 3 | `git push` de los commits del release |
| 4 | Setear en producción `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore` |
| 5 | Disparar build/deploy de producción (necesario por ser build-time) |
| 6 | Smoke autenticado (§10) |
| 7 | Confirmar procedencia: `catalog=kore`, resto `legacy` |
| 8 | Monitorear (errores de carga, tiempos) |

## 10. Checklist de smoke en producción

Con sesión válida, por cada ruta: render OK, fuente correcta, sin fallback (mock o legacy)
y sin errores de consola/servidor.

| Ruta | Verificación específica |
|---|---|
| `/` | Carga y navegación |
| `/dashboard` | Etiqueta "Catálogo KORE · ventas, clientes y aplicaciones legacy"; KPIs coherentes |
| `/articulos` | Conteo del catálogo = artículos aptos del repository; sin conflictos ni missing; búsqueda, filtros y límite de 100 |
| `/clientes` | Legacy sin cambios; histórico intacto |
| `/ventas` | Legacy sin cambios; la venta huérfana conocida no rompe ni crea artículo |
| `/distribuidor` | **0 artículos inactivos seleccionables**; aplicaciones legacy resuelven |
| Editor de propuestas | Solo artículos activos en el buscador; sin precio/stock inventados |

Además: tras el login **no** debe hacer falta recargar (fix de KORE-31), y debe haber una
sola carga de dataset por sesión (sin loop).

## 11. Rollback

Simple y **no destructivo**:

1. Volver `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE` a `legacy` (o quitarla: el default es legacy).
2. Rebuild + deploy.

**Nunca** como parte del rollback: borrar tablas `kore_*`, borrar tablas legacy, revertir
migraciones ni borrar datos de sync. El catálogo legacy queda intacto durante todo el
cutover, igual que el shadow KORE, el soporte de Excel y la fuente mock.

## 12. Conflictos de identidad conocidos

- 2 claves `CODIGOUNICO` en cuarentena (`identity_status = conflict`), ambas abiertas.
- 0 referencias en ventas, campañas y oportunidades; sí aparecen en aplicaciones
  históricas, que no se tocan.
- Quedan fuera del catálogo seleccionable por filtro del repository, no por la UI.
- Resolución pendiente con Númina/negocio (ver `KORE-shadow-catalog-sync.md`). No bloquean
  el cutover.

## 13. Política de artículos activos

`KORE_ACTIVE_POLICY = SOURCE_AUTHORITATIVE` (confirmada):

- `DESHABILITADO` de KORE define qué artículos se pueden seleccionar hoy.
- No elimina ni oculta ventas, aplicaciones, campañas ni referencias históricas.
- `LEGACY_COMPAT` no está implementado.
- Impacto al activar: `/distribuidor` deja de ofrecer los artículos deshabilitados con
  aplicaciones y el buscador de propuestas excluye los deshabilitados. Ninguno tiene
  ventas registradas.

## 14. Deuda técnica registrada

| Ítem | Descripción | Bloquea cutover |
|---|---|---|
| `REDUCE_DATASET_PAYLOAD` | `load-dataset` pesa ~16 MB; `dataQuality` son ~10 MB y se envían completos en cada carga | No |
| `SUPABASE_MIGRATION_HISTORY_DRIFT` | Solo las migraciones KORE 001 y 002 están registradas remotamente; 6 históricas tienen drift previo. **Nunca** `supabase db push` en deploy ni cutover | No |
| `CATALOG_SYNC_AUTOMATION` | Agente local/on-prem: lock anti-overlap, ejecución programada, monitoreo de exit code, métricas seguras, notificación de fallas, política de reintentos acotada, entorno seguro y sin puerto entrante. Solo propuesta; no implementado | No |
| `LINT_SETSTATE_IN_EFFECT` | 2 errores de eslint preexistentes en pantallas ajenas al catálogo (§4) | No |
| `LEGACY_KEY_MAPPING_UNRESOLVED` | Etiqueta histórica: la cobertura legacy → KORE es 100% por string, falta validación semántica | No |

## 15. Autorización pendiente

KORE-32 termina **antes** de `git push`, de cualquier cambio de env en Vercel y de
cualquier deploy (tampoco preview). El siguiente paso requiere autorización explícita y se
limita a: **push + set env + deploy + smoke**.
