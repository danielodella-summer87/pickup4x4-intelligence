# KORE-28 — Rehearsal de cutover del catálogo

- **Alcance:** catálogo y taxonomía desde KORE normalizado; ventas, clientes y
  aplicaciones siguen en legacy.
- **Default commiteado:** `legacy`. El modo `kore` fue un rehearsal local temporal.
- **Sin** llamadas SOAP a KORE, shadow sync, escrituras en Supabase ni migraciones.
- Sin códigos ni datos concretos: solo conteos.
- **Resultado:** `NOT_READY_FOR_CATALOG_CUTOVER` (ver [Blockers](#blockers)).

## 1. Gate de reconciliación (read-only, antes de conectar la app)

Join **exacto** por `codigo_unico`, el mismo que usa la app.

| Métrica | Valor |
|---|---|
| legacyArticleCount | 6704 |
| koreResolvedActiveCount | 10547 |
| legacyKeysFoundInKoreResolved | 6704 |
| legacyKeysMissingFromKoreResolved | 0 |
| legacyKeysMappedToConflict | 0 |
| legacyKeysMappedToMissing | 0 |
| koreResolvedOnly | 3843 |
| Claves legacy que solo matchean con normalización del importer | 0 |
| Códigos KORE alterados por la normalización legacy | 0 |

El 6704/6704 de KORE-26 (snapshot RAW) se confirma sobre **resolved + activo**: la
cuarentena y el missing no le quitan cobertura a legacy.

## 2. Impacto de los conflictos

Las 2 claves en cuarentena (`identity_status = conflict`) no tienen referencias:

| Referencia | Claves | Filas |
|---|---|---|
| ventas | 0 | 0 |
| aplicaciones | 0 | 0 |
| catálogo legacy (`articulos`) | 0 | 0 |
| campañas: ítems (`matched_article_code`, `input_code`) | 0 | 0 |
| campañas: resultados (`article_code`) | 0 | 0 |

**Excluirlas no rompe ninguna referencia legacy.**

## 3. Modelo de fuentes mixto

- **Semántica KORE-28** (`lib/data/sources.ts`):
  - `kore` = catálogo KORE **normalizado ya persistido** (`kore_articulos` resolved +
    activo, taxonomía activa), leído server-side. **Nunca** SOAP desde la app. Solo
    para el dominio catálogo.
  - `shadow` = solo observación/comparación. Pedirla como fuente visible da error
    (`SHADOW_OBSERVATION_ONLY`).
  - Modo `mixed` = `catalog: kore` + `sales/customers/applications: legacy`.
- **Configuración** (`lib/data/source-config.ts`, única lectura):
  `NEXT_PUBLIC_PICKUP_CATALOG_SOURCE` (default: la global) y
  `NEXT_PUBLIC_PICKUP_DATA_SOURCE` (default `legacy`). Next las **inyecta en build**,
  en servidor y cliente. La fuente **nunca** sale de la request.
- **Provenance:** la respuesta de `/api/supabase/load-dataset` incluye
  `provenance.sources` por dominio, estado del catálogo, claves en cuarentena
  excluidas, conteos de taxonomía y métricas de join. El dataset **no** se etiqueta
  como "KORE" en bloque.
- **Chequeo cruzado en el cliente:** si la procedencia del servidor no coincide con la
  configuración del cliente → error `SOURCE_CONFIG_MISMATCH`.

### Boundary

```
browser (DatasetContext)
  → GET /api/supabase/load-dataset          (sin parámetros de fuente, Cache-Control: no-store)
  → lib/data/active-dataset-server.ts       (server-only)
      ├─ legacy: loadDatasetFromSupabaseServer   (ventas, clientes, aplicaciones [+ catálogo si legacy])
      └─ kore:   @/lib/kore-catalog (server-only, service role, solo SELECT)
                   → kore_articulos (resolved + missing_since IS NULL)
                   → kore_familias / kore_grupos / kore_subgrupos (missing_since IS NULL)
```

- Ningún client component importa service role, `@/lib/supabase/server`,
  `lib/kore`, `lib/kore-sync` ni `@/lib/kore-catalog` (test estático).
- En el browser, `@supabase/supabase-js` solo aparece en el cliente público
  preexistente (clave publishable; `kore_*` tiene RLS sin políticas).
- La proyección del repository no incluye variantes RAW, hashes ni la tabla de
  conflictos.

### Sin fallbacks

| Situación con `catalog=kore` | Resultado |
|---|---|
| Repository con error / no configurado | `error` `KORE_CATALOG_UNAVAILABLE`, sin dataset |
| Conteo ≠ artículos leídos | `error` `KORE_CATALOG_INCONSISTENT` |
| 0 artículos aptos | `empty` `KORE_CATALOG_EMPTY` |
| Ventas/clientes legacy no disponibles | `error` `LEGACY_UNAVAILABLE` (no hay dataset parcial oculto) |
| Legacy sin datos + KORE OK | Catálogo KORE + dominios legacy **vacíos explícitos** |
| Error de red en el cliente | `error`; **no** se usan copias Excel de sesión/locales (serían catálogo legacy) |

Además, en modo mixto:
- la importación de Excel y "Guardar en Supabase" están deshabilitados, porque escribirían
  el catálogo legacy;
- el dataset mixto **no** se guarda como copia de sesión.

## 4. Mapeo de campos del artículo

Modelo de la app: `lib/models/articulo.ts` → `Articulo`.

| Campo actual | Fuente KORE | Fuente legacy | Derivado | Disponible con catalog=kore | Clasificación | Acción |
|---|---|---|---|---|---|---|
| `codigoUnico` | `CODIGOUNICO` (trim) | `articulos.codigo_unico` | — | sí | KORE_CORE | desde KORE (join exacto 100%) |
| `descripcion` | `DESCRIPCION` | `articulos.descripcion` | — | sí | KORE_CORE | desde KORE; sin fallback legacy |
| `rubro` | `CODIGOFAMILIA` | `articulos.rubro` (Excel "Familia") | — | sí (blank → sin rubro) | KORE_CORE | desde KORE: legacy `rubro` = código de familia KORE en 6704/6704 |
| `categoria` | `CODIGOGRUPO` | `articulos.categoria` (Excel "Grupo") | — | sí (blank → sin categoría) | KORE_CORE | desde KORE: legacy `categoria` = código de grupo KORE en 6704/6704 |
| `activo` | NOT `DESHABILITADO` | no persistido (siempre `true` al cargar) | negación del flag | sí | KORE_CORE | desde KORE; **cambia visibilidad** (ver blockers) |
| `marcaArticulo` | — (no en `ListarArticulos`) | `articulos.marca` (0 filas pobladas) | — | no | NOT_AVAILABLE | ausente; no se fabrica |
| `stock` | — (dominio stock, sin pipeline) | no persistido | — | no | NOT_AVAILABLE | ausente; sin cutover de stock |
| `precioLista` | — (dominio precios, sin pipeline) | no persistido | — | no | NOT_AVAILABLE | ausente; sin cutover de precios |
| `unidadMedida` | — | no persistido | — | no | NOT_AVAILABLE | ausente |
| subgrupo / flags `BASICO`, `MINIMO`, `EXENTO`, `CONTROLASTOCK`, `OBSERVACIONES` | sí | — | — | en el repository | APP_ONLY (sin uso) | no se agregan al modelo (sin consumidor) |
| taxonomía (familias/grupos/subgrupos + descripciones) | `kore_familias/grupos/subgrupos` activas | no persistida | — | sí (`dataset.catalogTaxonomy`) | KORE_CORE | desde KORE; nunca se reconstruye desde legacy |
| cantidad de ventas por artículo | — | `ventas` | join por código | sí | DERIVED_FROM_LEGACY | join explícito en consumidores |
| aplicaciones marca/modelo | — | `aplicaciones` (+ marcas/modelos) | join por código | sí | LEGACY_ENRICHMENT | sigue legacy (sin pipeline `ListarMarcasModelos`) |
| oportunidades | — | `oportunidades` (detectadas en import legacy) | — | sí | DERIVED_FROM_LEGACY | siguen legacy |
| calidad de import (`dataQuality`, `applicationAudit`, `warnings`) | — | `importaciones.observaciones` | — | sí | LEGACY_ENRICHMENT | describen el import legacy, no el catálogo KORE |

## 5. Cobertura de joins (runtime, catalog=kore)

| Métrica | Valor |
|---|---|
| catalogArticles | 10547 |
| catalogArticlesWithSales | 59 |
| catalogArticlesWithApplications | 5511 |
| catalogOnlyArticles (KORE-only) | 3843 |
| legacyCatalogArticlesNotInCatalog | 0 |
| saleItemsTotal / con artículo / sin artículo | 70 / 69 / 1 |
| applicationsTotal / con artículo / sin artículo | 11129 / 11129 / 0 |

- **Venta huérfana:** su código no existe ni en KORE ni en el catálogo legacy (ya era
  huérfana en legacy, donde con catálogo legacy hay 2 huérfanas). Se conserva tal cual.
- **Comparación con el default legacy:** ventas con artículo 68/70 y aplicaciones
  11129/11129. El catálogo KORE **mejora** la cobertura de ventas en 1.

## 6. Resultado del cutover local

Ejecución de la **ruta real** `GET /api/supabase/load-dataset` y de los consumidores
reales de páginas, contra Supabase (solo lectura). Se usaron hooks de resolución de
Node fuera del repo.

| | default (legacy) | rehearsal (catalog=kore) |
|---|---|---|
| provenance | legacy ×4 | catalog kore · resto legacy |
| status / Cache-Control | ready / no-store | ready / no-store |
| Decisión del cliente | apply `supabase` (copia de sesión) | apply `mixed` (sin copia local) |
| `/articulos` filas = loader = repository | 6704 = 6704 | **10547 = 10547 = 10547** |
| Conflictos excluidos | — | 2 |
| Taxonomía activa | — | 8 / 62 / 251 |
| Opciones rubro / categoría | 2 / 45 | 7 / 59 |
| Artículos con aplicaciones / sin aplicaciones | 5511 / 1193 | 5511 / 5036 |
| Artículos con stock o precio | 0 | 0 (no se fabrican) |
| Artículos `activo=false` | 0 | 965 |
| Dashboard (clientes / registros venta / artículos / aplicaciones) | 11177 / 58 / 6704 / 11129 | 11177 / 58 / 10547 / 11129 |
| Clientes / ventas / vehículos | 11177 / 70 / 793 | 11177 / 70 / 793 |
| Oportunidades (DB) | 12 | 12 |

- **`/articulos`:** búsqueda, filtros por rubro/categoría/aplicaciones y límite visible
  de 100 filas funcionan con 10547 artículos. Tolera 0 ventas y 0 aplicaciones, y los
  artículos solo-KORE aparecen con conteos en 0.
- **Clientes y ventas:** sin cambios (legacy).
- **Builds:**
  - A (default) y B (`NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore`) compilan.
  - Se verificó el valor inyectado en los chunks.
  - Después del rehearsal se reconstruyó el default. No se modificó `.env.local`.
- **No ejecutado:** render de páginas en browser. La app exige sesión (`proxy.ts`) y no
  se usaron credenciales.

## 7. Payload y performance

| | default | catalog=kore |
|---|---|---|
| Respuesta `load-dataset` | 16,2 MB | 16,8 MB |
| `articulos` en la respuesta | 0,86 MB | 1,37 MB (+0,5 MB) |
| `catalogTaxonomy` | — | 0,03 MB |
| Tiempo de la ruta (local → Supabase) | ~6,0 s | ~7,7 s |
| Construcción de filas en consumidores | < 50 ms | < 50 ms |

- **`activeData`:** se quitó el campo sin uso que duplicaba el dataset en la respuesta
  (6,2 MB en default y 6,7 MB con kore). Antes la respuesta legacy pesaba ~22 MB.
- **Paginación:** el repository pagina de a 1000 filas. La arquitectura actual manda el
  **dataset completo** al browser, igual que legacy; no se agregó paginación de UI. El
  costo del catálogo KORE es +0,5 MB.
- **Costo dominante (preexistente, no KORE):** `dataQuality`, 10 MB de metadata del
  import legacy.
- **Sin O(N²) en caminos activos:** todo usa Map/Set.
  `getArticulosConConteoAplicaciones` es O(artículos × aplicaciones), pero no tiene
  consumidores.
- **Sin cache nueva:** las route handlers no se cachean y la respuesta lleva
  `no-store`.

## 8. Blockers

1. **Semántica `activo` ← `DESHABILITADO` (decisión de negocio).**
   - Hay 965 artículos KORE deshabilitados: 453 están en el catálogo legacy y 512 son
     solo-KORE.
   - 327 tienen aplicaciones legacy; ninguno tiene ventas.
   - Legacy nunca persistió `activo`, así que los mostraba activos.
   - Con catálogo KORE, `/distribuidor` (mostrador) y el editor de productos de
     propuestas **dejan de mostrar** esos 453.
   - El mapeo es fiel a KORE, pero cambia comportamiento visible: requiere confirmación.
2. **Validación de páginas renderizadas autenticadas.**
   - Se validaron la ruta real y los consumidores de páginas.
   - No se renderizaron las páginas en browser con sesión.
   - Requiere que un operador autorizado recorra `/`, `/dashboard`, `/articulos`,
     `/clientes`, `/ventas` y `/distribuidor` en un build con `catalog=kore`.

**No son blockers (aislados y medidos):**
- las 2 claves en cuarentena (0 referencias);
- la venta huérfana preexistente;
- el payload grande preexistente (`dataQuality`).

## 9. Criterios para el cutover permanente

`READY_FOR_CATALOG_CUTOVER` requiere:

- [x] Loader KORE funcional (ruta real, loader = repository)
- [x] Sin fallback oculto (error/empty explícitos; sin legacy ni mock ni copias locales)
- [x] Conflictos en cuarentena y sin referencias
- [x] Referencias legacy cuantificadas (catálogo 100%, ventas 69/70, aplicaciones 100%)
- [x] Sin comportamiento destructivo (0 escrituras, sin `clearDataset`)
- [x] Boundary de seguridad intacto (tests estáticos + chunks del cliente)
- [ ] Consumidores principales validados **renderizados y autenticados** (blocker 2)
- [ ] Sin blocker de modelo de datos sin resolver (blocker 1: `activo`/`DESHABILITADO`)

Con ambos resueltos, el cutover permanente es un cambio de configuración
(`NEXT_PUBLIC_PICKUP_CATALOG_SOURCE=kore`) más un rebuild, sin cambios de código ni de
esquema.
