# Campaña de recambio — cubre cajas + lonas (standalone)

Un solo script genera todo: **`scripts/build-campania.cjs`**.
Fuentes: `public/imports/ranking_articulos_2023..2026.xlsx` + `public/imports/Diario-20260619-084547.xls`.
Llave principal: **CUENTA**. Control secundario: **RUT**. Fecha de referencia: 2026-06-19.

Regenerar todo:

```bash
node scripts/build-campania.cjs
```

## Salidas vigentes (una verdad por propósito)

| Archivo | Para qué | Quién lo usa |
|---|---|---|
| **`CAMPANIA_recambio_FINAL.csv`** | Base operativa única: 431 cuentas priorizadas por antigüedad, deduplicadas, con RUT/localidad/vendedor y columnas de contacto preparadas (`telefono`, `email`, `fuente_contacto`, `estado_contactabilidad`, `observacion_contacto`). | **Negocio** (trabajar la campaña) **y** cruce futuro de contactos. |
| `CAMPANIA_recambio_RESUMEN.csv` | Resumen ejecutivo: conteos por prioridad, tipo de cubierta, vehículos, calidad de llave. | Negocio (vista rápida). |
| `CAMPANIA_recambio_AUDITORIA.csv` | Log técnico: qué duplicados se fusionaron, criterio y conflictos. | Auditoría / técnico. |
| **`CAMPANIA_recambio_REPORTE.html`** | Reporte visual legible (resumen ejecutivo + ranking + oportunidades agrupadas). Abrir en navegador. Generar con `node scripts/build-reporte.cjs`. | **Negocio** (lectura / decisión). |

## Campaña persistida (Supabase)

La campaña de recambio se guarda como **entidad persistida** en Supabase (tablas `commercial_campaigns`
+ `commercial_campaign_results`, preset `recambio`). Flujo de (re)generación:

**Camino preferido — standalone, NO necesita el dev server:**

```bash
./scripts/campania.sh   # (o npm run campania) build + persiste DIRECTO en Supabase

# o por partes:
npm run campania:build  # node scripts/build-campania.cjs           -> base + public/data/recambio.json (input del seed)
npm run campania:seed   # node scripts/seed-campania-supabase-direct.cjs -> persiste directo en Supabase
```

Variables necesarias (de `.env.local` o del entorno): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
(el seed las carga solo desde `.env.local`). Idempotente: reusa el id de la campaña preset `recambio`.

> Alternativa legacy (requiere `npm run dev` arriba, persiste vía API routes): `npm run campania:seed:api`.

`public/data/recambio.json` es el **artefacto computado / input del seed** (ya no lo lee la UI directo).
La pantalla `/campanas` lee la campaña **persistida** vía `/api/campaigns` (loader `lib/campanas/recambio-data.ts`).
El seed es idempotente: reusa el id de la campaña preset `recambio` si ya existe.

## Cruce futuro con contactos

Cuando llegue el export con teléfonos/emails: `JOIN` por **CUENTA**, validar por **RUT**, completar
`telefono`/`email`, setear `fuente_contacto` y mover `estado_contactabilidad` de `sin_contacto_aun`.
No se inventan datos de contacto: hoy no existe esa fuente en el proyecto.

> Nota: los scripts exploratorios viven en `scripts/exploracion/` (regenerables, fuera de este flujo).
> Si se ejecutan, escriben en `scripts/exploracion/output/` y no tocan estas salidas vigentes.
