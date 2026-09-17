# KORE-27 — Fuentes de datos explícitas (preparación de cutover)

- **Estado:** preparado. **Sin cutover:** la UI sigue usando legacy.
- **Sin KORE en vivo, sin sync, sin migraciones.**

## Fuentes y dominios

Definidas en `lib/data/sources.ts`.

> **Actualizado en KORE-28** (ver `KORE-catalog-cutover-rehearsal.md`): `kore` quedó habilitada
> para el catálogo, leyendo el catálogo KORE normalizado persistido; `shadow` quedó como solo
> observación. El default sigue siendo `legacy`.

| Fuente | Qué es | Estado en la app |
|---|---|---|
| `legacy` | Tablas Supabase cargadas desde Excel (+ copia local del Excel importado) | **DEFAULT** en todos los dominios |
| `mock` | Datos de ejemplo | Solo explícita y para todos los dominios a la vez |
| `kore` | Catálogo KORE normalizado persistido (`kore_articulos` resolved + activo, taxonomía activa) vía loader server-side. Nunca SOAP desde la app | Solo dominio catálogo; modo `mixed` |
| `shadow` | Observación/comparación de `kore_*` | Nunca fuente visible (`SHADOW_OBSERVATION_ONLY`) |

| Dominio | Fuentes habilitadas |
|---|---|
| `catalog` | legacy, mock, kore |
| `sales` | legacy, mock (ventas = legacy) |
| `customers` | legacy, mock |
| `applications` | legacy, mock |

### Configuración

| Variable | Valores | Default |
|---|---|---|
| `NEXT_PUBLIC_PICKUP_DATA_SOURCE` | `legacy` | `mock` | `legacy` |
| `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE` | `legacy` | `mock` | `kore` (`shadow` → error) | la global |

Las variables se inyectan en **build** (servidor y cliente): cambiarlas exige un rebuild.

Una configuración inválida (valor desconocido, mock mezclado con datos reales, fuente no
permitida para el dominio o shadow como fuente visible) es un **error explícito**: no se cargan datos y
no se cae a otra fuente.

## Sin fallback silencioso

- **Legacy vacío** → estado `empty` (`LEGACY_EMPTY`), dataset vacío. **Nunca mock.**
- **Supabase no disponible y sin copia local** → estado `error` (`LEGACY_UNAVAILABLE`).
- **Mientras carga** → dataset vacío con estado `loading` (antes mostraba mock).
- **Orden legacy** (`lib/data/dataset-hydration.ts`): Supabase → Excel de la sesión → Excel
  persistido localmente.
- `lib/data/insights.ts` y `distribuidor-insights.ts` ya no usan mock como parámetro por
  defecto.
- **UI:** `useActiveDataset()` expone `dataMode`, `dataSources`, `status`, `isEmpty` e
  `isMock` (solo mock explícito).

## Cambiar de fuente nunca borra datos

- **Resolver fuentes es puro:** no toca almacenamiento ni Supabase.
- **Eliminado** `clearDataset` del contexto: borraba las tablas legacy en Supabase y se
  usaba desde los botones "Volver a datos mock".
- **Eliminado** el endpoint `POST /api/supabase/clear-dataset` y su helper cliente.
- **`clearLocalDataset`:** borra solo la copia local del navegador. Supabase queda intacto.
- **Importación de Excel:** es la única operación que reemplaza tablas legacy (sin
  cambios).

## Catálogo desacoplado de ventas

`lib/data/dataset-import-validation.ts`: un dataset con artículos, aplicaciones y clientes
válidos se puede importar con **ventas = 0**. Queda la advertencia `SIN_VENTAS` y las
ventas se suman después con el Diario de Ventas. Sin artículos sigue bloqueando.

## Repository de catálogo KORE (server-only, solo lectura)

`@/lib/kore-catalog` (`import "server-only"`):

- **Aptos:** solo `identity_status = 'resolved' AND missing_since IS NULL`
  (`ELIGIBLE_ARTICLE_FILTERS`, única definición).
- **Cuarentena:** las claves en conflicto quedan excluidas por la query, también en la
  búsqueda puntual.
- **Fail-closed:** una fila no apta devuelta por la fuente → `KoreCatalogIntegrityError`
  (nunca se descarta en silencio).
- **API:** `listEligibleArticles`, `findEligibleArticle`, `countArticles`. Solo
  `select`: sin escrituras, sin KORE, sin sync.
- **Uso:** ningún módulo de UI lo importa (test). El cutover será un paso posterior y
  explícito.

**Validación read-only (2026-09-17):** 10547 aptos (listado = count), 2 en cuarentena
excluidos, 0 resolved missing, 10549 total. Tablas legacy y shadow sin cambios.

## Tests

`npm run test:data`: fuentes, hidratación, validación de import, guardas estáticas de
aislamiento y repository con reader falso y adaptador Supabase simulado.
