# KORE-24/25/26 — Shadow sync del catálogo (taxonomía + artículos)

- **Estado:** implementado, en **shadow mode** y ejecución **manual local**.
  Ver [Historial de runs](#historial-de-runs).
- **UI:** no depende de estas tablas, y no cambia ningún dato ni comportamiento
  actual de la app. **No es READY_FOR_CUTOVER.**

Sin datos reales, códigos, secretos ni valores comerciales: solo conteos, categorías y
nombres de fields.

## Arquitectura

```
KORE (HTTP :89, READ-ONLY)
  └─ lib/kore               cliente permanente: allowlist, parsers estrictos, 0 reintentos
       └─ lib/kore-sync     orquestación + identidad + persistencia shadow (este documento)
            └─ Supabase     tablas kore_* (RAW + NORMALIZED + conflictos), aisladas de legacy
```

| Módulo | Responsabilidad |
|---|---|
| `lib/kore-sync/catalog-runner.ts` | Flujo, presupuesto de requests, identidad de artículos, estados, missing, métricas, reconciliación |
| `lib/kore-sync/kore-source.ts` | Fuente real: `listKoreFamilias/Grupos/Subgrupos` de `lib/kore/service.ts` + `listKoreArticulosFullSnapshotForSync`, más el conteo de POST |
| `lib/kore/sync-only.ts` | `SYNC_ONLY_FULL_SNAPSHOT`: `ListarArticulos` sin filtros, tope 25 MB, 0 reintentos. **No** se exporta desde `@/lib/kore`; solo lo importa `lib/kore-sync` (verificado por test) |
| `lib/kore-sync/rows.ts` | Proyección RAW y NORMALIZED, trazabilidad, created/updated/unchanged |
| `lib/kore-sync/hash.ts` | JSON canónico, SHA-256, `source_key`, `source_variant_key` |
| `lib/kore-sync/supabase-store.ts` | Upserts con allowlist de tablas `kore_*`; índices paginados; lectura legacy read-only |
| `lib/kore-sync/env.ts` | Validación fail-closed del entorno |
| `scripts/kore-sync-catalog-shadow.ts` | Entrypoint manual |

**Aislamiento:**
- `app/`, `components/` y `contexts/` **no importan** `lib/kore-sync` ni
  `sync-only` (hay tests que lo verifican).
- La API interactiva `listKoreArticulos` **sigue exigiendo al menos un filtro**.
- El runner no usa `clearDataset`, `import-dataset`, `truncate` ni borrados.

## Ejecución

```
npm run kore:sync:catalog-shadow
```

- **Dónde corre:** Node 24 con `--env-file=.env.local`, local, server-side y manual.
  Nunca desde Vercel, el navegador, una Edge Function ni un cron.
- **Variables requeridas:** `KORE_BASE_URL`, `KORE_COMPANY_NUMBER`,
  `KORE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (https) y
  `SUPABASE_SERVICE_ROLE_KEY`.
  - La service role key debe ser server-only, estar en `.env.local` (gitignored),
    nunca con prefijo `NEXT_PUBLIC_` y distinta de la clave pública.
  - Si falta alguna variable, el runner falla antes de cualquier request.
- **Salida:** JSON con conteos, categorías y nombres de fields en conflicto, más la
  verificación de conteos de tablas legacy antes y después del run. Nunca claves ni
  valores.
- **Exit code:** `0` = `completed`; `2` = `partial` por `KORE_IDENTITY_CONFLICT`
  (snapshot completo, claves en cuarentena); `1` = cualquier otro caso. Siempre `1`
  si cambió una tabla legacy.

## Migraciones

| Migración | Contenido |
|---|---|
| `202609170001_kore_shadow_sync.sql` | 9 tablas `kore_*` (sync runs, RAW y NORMALIZED de familias, grupos, subgrupos y artículos) |
| `202609170002_kore_article_identity_conflicts.sql` | Identidad de artículos: variantes RAW, `identity_status` en NORMALIZED y `kore_article_identity_conflicts` |

- Se aplican **aisladas** (`supabase db query -f`), cada una en una transacción.
  **No usar `supabase db push`**: aplicaría migraciones históricas marcadas como "no
  ejecutar".
- **Historial remoto:** registrado solo para `202609170001` y `202609170002`
  (`supabase migration repair <version> --status applied`). Las 6 migraciones
  históricas siguen sin registrar a propósito (drift preexistente, fuera de alcance).
- **RLS** habilitado en todas las tablas, **sin políticas** y con `revoke all` a
  `anon` y `authenticated`. Solo escribe el service role.
- Sin `ON DELETE CASCADE`, sin borrado físico por ausencia (se usa
  `missing_since`) y sin tocar tablas legacy.
- La 002 adapta las filas existentes **in place** (backfill de `source_variant_key`,
  `observed_occurrences = 1`, `identity_status = resolved`), sin borrar ni reinsertar.

## Tablas

| Tabla | Capa | Identidad física |
|---|---|---|
| `kore_sync_runs` | trazabilidad | `id` |
| `kore_raw_familias` | RAW | `source_key` = `[codigoFamilia]` |
| `kore_raw_grupos` | RAW | `source_key` = `[codigoFamilia, codigoGrupo]` |
| `kore_raw_subgrupos` | RAW | `source_key` = `[codigoFamilia, codigoGrupo, codigoSubgrupo]` |
| `kore_raw_articulos` | RAW | **variante**: `source_variant_key` (único), `(source_key, content_hash)` (único) |
| `kore_familias` | NORMALIZED | `codigo_familia` (+ `source_key`) |
| `kore_grupos` | NORMALIZED | `(codigo_familia, codigo_grupo)` (+ `source_key`) |
| `kore_subgrupos` | NORMALIZED | `(codigo_familia, codigo_grupo, codigo_subgrupo)` (+ `source_key`) |
| `kore_articulos` | NORMALIZED | `codigo_unico` (+ `source_key`), con `identity_status` |
| `kore_article_identity_conflicts` | cuarentena | `source_key` (único) |

- **`source_key`:** JSON array de claves normalizadas (trim), sin separadores ambiguos.
- **Blank taxonomy record:** el código `""` es una clave válida.

## Identidad de artículos (KORE-26)

### CODIGOUNICO no es único en la fuente

- El XSD real de `ListarArticulos` **no declara** `CODIGOUNICO` único, y el full
  snapshot de KORE-25 devolvió 2 claves repetidas con contenido distinto.
- No existe otro ID source confirmado en el contrato de `Articulo`, así que **no se
  inventa una PK global**.
- El parser de `lib/kore` devuelve **todas las filas del servidor, en orden y sin
  deduplicar**. Toda decisión de identidad vive **solo en `lib/kore-sync`**.

### source_key vs variante source

| Concepto | Definición |
|---|---|
| `source_key` | `CODIGOUNICO` normalizado (`["<trim>"]`). **No** es PK física en RAW |
| `content_hash` | SHA-256 del JSON canónico del contenido source de la fila (raw + normalizado de los 11 fields); sin timestamps, ids de run ni metadata |
| `source_variant_key` | `sha256_hex(content_hash + "\n" + source_key)`; el largo fijo del hash hace la concatenación inequívoca. La migración lo verifica con un `CHECK` usando la misma fórmula |

Una variante identifica **contenido source distinto** para una clave; **no** afirma
que sea otro artículo.

### Duplicados exactos

Misma `source_key` + mismo `content_hash` más de una vez → **una** fila RAW con
`observed_occurrences` = cantidad de filas idénticas observadas en el snapshot. La
clave se materializa `resolved` normalmente. Métricas: `duplicateArticleKeys`,
`exactDuplicateRows`.

### Variantes conflictivas y cuarentena

Misma `source_key` + más de un `content_hash` → `IDENTITY_CONFLICT`:

- **RAW:** se guardan **todas** las variantes.
- **NORMALIZED:** `identity_status = conflict`, `identity_conflict_since`; contenido,
  relaciones, `content_hash` y `raw_id` en `null`. **No** se elige first, last, más
  completa, más nueva, alfabética, por taxonomía ni por descripción, y no se mezclan
  fields. Si la clave existía `resolved` de un run anterior, la misma fila pasa a
  `conflict` (nunca queda silenciosamente `resolved`). Un `CHECK` en la DB impide
  estados mixtos.
- **CONFLICTS:** `kore_article_identity_conflicts` con `variant_count`,
  `differing_fields` (solo nombres de los 11 fields source, validados por `CHECK`),
  `status open`, `first_seen_at`, `last_seen_at`, `last_sync_run_id`. Sin
  descripciones, valores ni payloads: las variantes completas viven en RAW.

**Idempotencia de conflictos:**

| Situación en el snapshot | Efecto |
|---|---|
| Conflicto nuevo | Fila `open` (`conflictsNew`) |
| Conflicto repetido | Misma fila: `first_seen_at` preservado; `last_seen_at`, `last_sync_run_id`, `variant_count`, `differing_fields` actualizados (`conflictsRepeated`) |
| Conflicto `resolved` que reaparece | Se reabre: `open`, `resolved_at = null` (`conflictsReopened`) |
| Conflicto `open` que ya no se reproduce (una sola variante o clave ausente) | `CONFLICT_NO_LONGER_REPRODUCED` (`conflictNoLongerReproduced`): la fila **sigue `open`** y la clave **sigue en cuarentena**. No se infiere cuál variante quedó correcta |

La resolución es **explícita** (`status = resolved`, `resolved_at`), por una decisión
posterior (Númina/negocio). Con el conflicto `resolved` y una sola variante, la clave
vuelve a materializarse `resolved`.

### Diferencias sin valores

Por cada clave conflictiva se calculan **en memoria** los fields que difieren entre
variantes, usando solo los 11 fields source (`CODIGOUNICO`, `CODIGOFAMILIA`,
`CODIGOGRUPO`, `CODIGOSUBGRUPO`, `DESCRIPCION`, `BASICO`, `MINIMO`, `EXENTO`,
`DESHABILITADO`, `CONTROLASTOCK`, `OBSERVACIONES`). La forma raw (padding) y la
normalizada de un tag cuentan como el mismo field. Las métricas del run guardan
`identity.conflicts = [{ variantCount, differingFieldNames }]`, sin claves.

## Restricción de cutover

Cualquier consumo futuro de artículos KORE debe tomar **solo**
`kore_articulos.identity_status = 'resolved'` (y `missing_since is null`). Una clave
`conflict` **nunca** puede entrar silenciosamente a dominio o UI. KORE-26 no conecta
UI.

## RAW vs NORMALIZED

- **RAW:** todos los campos del modelo `lib/kore`, en su forma raw y normalizada
  (por ejemplo `codigo_unico_raw` con padding y `codigo_unico` trimeado). No hay XML
  ni transformaciones. `kore_raw_articulos.request_codigo_familia` guarda el alcance
  del request: `*FULL_SNAPSHOT*` desde KORE-25 (las filas de KORE-24 conservan la
  familia de su partición).
- **NORMALIZED:**
  - Descripciones y observaciones trimeadas, `raw_id` y `last_sync_run_id`.
  - Relaciones **materializadas solo si la clave existe** (grupo → familia,
    subgrupo → grupo, artículo → familia/grupo/subgrupo). Una relación inexistente
    queda en `null`; el código se conserva y no se inventa. Cada artículo `resolved`
    se clasifica `matched` / `partial` / `unmatched`. Taxonomía blank o desconocida
    **no bloquea** el run.
- **Fuera de `kore_articulos`:** marca/modelo, stock, precios, imágenes, lotes y
  ventas son dominios separados (1:N). `controla_stock` es el flag `CONTROLASTOCK`
  de KORE, no una cantidad de stock.

## Trazabilidad e idempotencia

| Columna | Semántica |
|---|---|
| `content_hash` | SHA-256 del contenido source de la fila, con claves ordenadas |
| `first_seen_at` | se fija al crear y **se preserva** |
| `last_seen_at` | se actualiza en cada observación |
| `sync_run_id` (RAW) / `last_sync_run_id` (NORMALIZED, conflictos) | último run que observó la fila |
| `missing_since` | ausencia en un snapshot completo; se limpia si reaparece |
| `observed_occurrences` (RAW artículos) | filas idénticas de la variante en el último snapshot que la observó |

- **Taxonomía:** una fila física por clave natural; contenido igual → `unchanged`,
  distinto → `updated` en la misma fila.
- **Artículos RAW:** una fila por variante. Si el contenido de una clave cambia entre
  runs, se crea una variante nueva y la anterior queda con `missing_since` (historial
  de variantes, sin borrado). Cambio de `observed_occurrences` → `updated`.
- **Artículos NORMALIZED:** una fila por clave; su `raw_id` apunta a la variante
  vigente.
- **Upserts** por `source_key` o `source_variant_key`, sin delete-all + insert. Dos
  runs idénticos producen 0 duplicados y todo `unchanged` (tests; observado en real
  en la taxonomía).

## Presupuesto de requests

Exactamente **4 POST**, en serie y sin reintentos:

1. `ListarFamilias`
2. `ListarGrupos`
3. `ListarSubgrupos`
4. `ListarArticulos` **full snapshot** (`SYNC_ONLY_FULL_SNAPSHOT`, sin filtros,
   timeout 60 s, tope de respuesta 25 MB)

- **Verificación:** POST reales === 4; si no, `REQUEST_COUNT_MISMATCH` y `failed`.
- **Tope 25 MB:** si se supera, `KORE_SNAPSHOT_TOO_LARGE`, `failed`, **sin fallback**.
- **Por qué no por familia (KORE-24):** la familia blank (`""`) no es consultable con
  filtro, así que la cobertura nunca podía ser completa.

## Estados del run

| Estado | `error_category` | Criterio |
|---|---|---|
| `completed` | `null` | 4 requests OK, snapshot RAW y NORMALIZED persistido, 0 claves en cuarentena |
| `partial` | `KORE_IDENTITY_CONFLICT` | Extracción completa = sí; RAW completo = sí; NORMALIZED usable = incompleto (≥1 clave `conflict`) |
| `failed` | categoría del error | Falla de request, snapshot > 25 MB, datos inconsistentes, error de persistencia o conteo de requests inesperado |

`partial` por conflictos **no** es una falla de la infraestructura: el snapshot se
ingirió completo y los datos ambiguos quedaron en cuarentena. **No** significa
`READY_FOR_CUTOVER`.

## Semántica de missing

- **Presencia ≠ resolución de identidad.**
- **Taxonomía:** snapshot completo (3 requests OK y persistidas) → filas no observadas
  reciben `missing_since`.
- **Artículos:** solo después de persistir un snapshot global completo.
  - Clave ausente → `missing_since` en NORMALIZED y en sus variantes RAW.
  - Clave conflictiva **presente** → observada (`last_sync_run_id` = run) → **no**
    es missing, aunque no se haya podido normalizar.
  - Variante RAW no observada de una clave presente → `missing_since` en esa variante.
- Si el snapshot falla o no se persiste completo, **no se marca ningún artículo**.

## Reconciliación con legacy

- **Qué se compara:** solo **conteos** contra `articulos.codigo_unico` (read-only):
  claves KORE presentes, artículos legacy, intersección, solo-KORE y solo-legacy. Se
  ejecuta solo con snapshot completo.
- **Método:** normalización REAL del importer legacy (`normalizeText`: whitespace
  colapsado + trim), comparación exacta case-sensitive.
- **Estado: `LEGACY_KEY_MAPPING_UNRESOLVED` (etiqueta vigente, evidencia nueva).**
  - KORE-25 auditó solo las 626 filas parciales de KORE-24 (4 familias) y obtuvo
    intersección 0; de ahí la hipótesis de claves distintas.
  - El run 3 (snapshot completo) midió **6704 / 6704** claves legacy presentes en KORE
    (10549 KORE, 3845 solo-KORE, 0 solo-legacy). El 0 anterior fue un **sesgo de
    muestra**, no un problema de mapeo.
  - Es coincidencia **por string**, no prueba que cada par sea el mismo artículo. Antes
    de reclasificar o de cualquier cutover, validar semántica (descripción/taxonomía)
    con una decisión explícita. No bloquea el shadow. No se modificaron códigos ni
    normalizaciones.

## Resolución con Númina

Las claves en cuarentena requieren una decisión externa: corrección en KORE (una sola
variante por `CODIGOUNICO`) o una regla de identidad explícita acordada.

**Nota segura (run 3, sin códigos ni valores):**

> ListarArticulos devuelve, en un mismo snapshot completo, **2** valores de
> `CODIGOUNICO` que coinciden al quitar espacios iniciales/finales pero tienen contenido
> distinto. Cada uno aparece con **2** variantes. En ambos casos el `CODIGOUNICO` crudo
> difiere solo en espacios (uno por la cantidad de espacios finales, otro por un
> espacio inicial), sin diferencias de whitespace interno.
> - Conflicto 1: difieren `CODIGOUNICO` (espacios), `DESCRIPCION`, `DESHABILITADO`, `OBSERVACIONES`.
> - Conflicto 2: difieren `CODIGOUNICO` (espacios), `DESCRIPCION`, `OBSERVACIONES`.
>
> Pregunta: ¿son artículos distintos cuyo código solo difiere en espacios (probable
> error de carga), o existe un identificador interno único que ListarArticulos no
> expone? ¿Cuál es la regla de unicidad de CODIGOUNICO en KORE?

Los códigos concretos, si Númina los necesita, se obtienen **aparte** y solo por el
operador autorizado (SQL Editor, join de `kore_article_identity_conflicts` con
`kore_raw_articulos` por `source_key`): nunca en logs, en el repo ni en reportes
generales.

## Historial de runs

| Run | Fase | Estrategia | Resultado | Causa |
|---|---|---|---|---|
| 1 | KORE-24 | 3 + F por familia | `failed` / `KORE_INVALID_DATA` | El parser exigía unicidad de `CODIGOUNICO`, que el contrato real no garantiza. Taxonomía (8/62/251) y 626 artículos de 4 familias persistidos; se preservan |
| 2 | KORE-25 | 4 POST full snapshot | `failed` / `CONFLICTING_DUPLICATE_ARTICLE` | 10551 filas, 10549 claves, 2 claves con contenido conflictivo, 0 duplicados exactos. Taxonomía 100% `unchanged`. Sin persistir artículos |
| 3 | KORE-26 | 4 POST full snapshot, identidad por variante | `partial` / `KORE_IDENTITY_CONFLICT` | 4/4 POST. 10551 filas → 10551 variantes RAW, 10549 claves; 0 duplicados exactos; 2 claves en cuarentena (2 variantes c/u); 10547 claves `resolved`. Taxonomía y las 626 filas previas `unchanged` (first_seen preservado). 0 missing. Legacy intacto |

## Limitación de transporte

**TRANSPORT_SECURITY_BLOCKER:** KORE usa HTTP en el puerto 89 sin TLS, así que la
`SecretKey` viaja en texto plano.
- Este runner manual corre en el mismo entorno local controlado que las
  validaciones anteriores.
- **No convertir en proceso automático ni ejecutar desde la nube** hasta resolver
  el transporte con un agente on-prem, VPN o proxy TLS
  (ver `KORE-real-data-sync-architecture.md`).

## Rollback

- Rollback = **no ejecutar el runner**. La UI no lee tablas `kore_*`, así que no
  hay impacto funcional.
- No se borran tablas automáticamente, y no hay migration down destructiva.
- Si hiciera falta eliminar el shadow, es una decisión explícita posterior
  (`drop` manual de tablas `kore_*`, sin afectar tablas legacy).
