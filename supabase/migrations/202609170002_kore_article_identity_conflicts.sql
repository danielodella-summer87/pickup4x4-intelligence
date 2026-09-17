-- KORE-26 — Identidad de artículos: variantes source y cuarentena de conflictos.
--
-- EVIDENCIA: el XSD real de ListarArticulos NO declara CODIGOUNICO único, y el full
-- snapshot de KORE-25 devolvió claves repetidas con contenido distinto. No existe
-- otro ID source confirmado, así que no se inventa una PK global.
--
-- ALCANCE: modifica SOLO kore_raw_articulos y kore_articulos, y crea
-- kore_article_identity_conflicts. No toca tablas legacy ni otras tablas kore_*.
-- No borra filas: las filas existentes se adaptan in place (first_seen_at intacto).
--
-- MODELO:
--   RAW         una fila por VARIANTE source: (source_key, content_hash).
--               source_variant_key = sha256_hex(content_hash || '\n' || source_key)
--               content_hash ya es SHA-256 del contenido source canónico, y su largo
--               fijo (64) hace la concatenación inequívoca. observed_occurrences =
--               filas idénticas observadas para esa variante en el último snapshot.
--   NORMALIZED  una fila por source_key. identity_status:
--               resolved = exactamente una variante → materializada;
--               conflict = más de una variante → SIN elegir variante (contenido null).
--   CONFLICTS   una fila por source_key conflictiva; solo nombres de fields, nunca
--               valores. status open/resolved (resolución explícita, no automática).
--
-- APLICACIÓN: aislada (`supabase db query -f`). NO usar `supabase db push`.
-- SEGURIDAD: RLS sin políticas; sin acceso anon/authenticated. Sin ON DELETE CASCADE.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- RAW: source_key deja de ser única; la identidad física es la variante.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kore_raw_articulos add column if not exists source_variant_key text null;
alter table public.kore_raw_articulos add column if not exists observed_occurrences integer not null default 1;

-- Filas existentes (KORE-24): el parser exigía unicidad por respuesta → 1 ocurrencia.
update public.kore_raw_articulos
   set source_variant_key = encode(sha256(convert_to(content_hash || E'\n' || source_key, 'UTF8')), 'hex')
 where source_variant_key is null;

alter table public.kore_raw_articulos alter column source_variant_key set not null;

alter table public.kore_raw_articulos drop constraint if exists kore_raw_articulos_source_key_key;

alter table public.kore_raw_articulos
  add constraint kore_raw_articulos_source_variant_key_key unique (source_variant_key);
alter table public.kore_raw_articulos
  add constraint kore_raw_articulos_source_key_content_hash_key unique (source_key, content_hash);
alter table public.kore_raw_articulos
  add constraint kore_raw_articulos_source_variant_key_check
  check (source_variant_key = encode(sha256(convert_to(content_hash || E'\n' || source_key, 'UTF8')), 'hex'));
alter table public.kore_raw_articulos
  add constraint kore_raw_articulos_observed_occurrences_check check (observed_occurrences >= 1);

create index if not exists kore_raw_articulos_source_key_idx on public.kore_raw_articulos (source_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- NORMALIZED: estado explícito de identidad. Una clave en conflicto no tiene
-- variante canónica: contenido, relaciones y raw_id quedan null.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kore_articulos add column if not exists identity_status text not null default 'resolved';
alter table public.kore_articulos add column if not exists identity_conflict_since timestamptz null;

alter table public.kore_articulos alter column raw_id drop not null;
alter table public.kore_articulos alter column content_hash drop not null;
alter table public.kore_articulos alter column descripcion drop not null;
alter table public.kore_articulos alter column observaciones drop not null;

alter table public.kore_articulos
  add constraint kore_articulos_identity_status_check check (identity_status in ('resolved', 'conflict'));
alter table public.kore_articulos
  add constraint kore_articulos_identity_consistency_check check (
    (
      identity_status = 'resolved'
      and identity_conflict_since is null
      and raw_id is not null
      and content_hash is not null
      and descripcion is not null
      and observaciones is not null
    )
    or (
      identity_status = 'conflict'
      and identity_conflict_since is not null
      and raw_id is null
      and content_hash is null
      and descripcion is null
      and observaciones is null
      and codigo_familia is null
      and codigo_grupo is null
      and codigo_subgrupo is null
      and familia_id is null
      and grupo_id is null
      and subgrupo_id is null
      and basico is null
      and minimo is null
      and exento is null
      and deshabilitado is null
      and controla_stock is null
    )
  );

create index if not exists kore_articulos_identity_status_idx on public.kore_articulos (identity_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFLICTS: una fila por clave conflictiva. Sin valores source ni payloads.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kore_article_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_sync_run_id uuid not null references public.kore_sync_runs(id),
  variant_count integer not null check (variant_count >= 2),
  -- Solo nombres de los 11 fields source de ListarArticulos.
  differing_fields text[] not null check (
    cardinality(differing_fields) >= 1
    and differing_fields <@ array[
      'CODIGOUNICO', 'CODIGOFAMILIA', 'CODIGOGRUPO', 'CODIGOSUBGRUPO', 'DESCRIPCION',
      'BASICO', 'MINIMO', 'EXENTO', 'DESHABILITADO', 'CONTROLASTOCK', 'OBSERVACIONES'
    ]::text[]
  ),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kore_article_identity_conflicts_resolution_check check ((status = 'resolved') = (resolved_at is not null))
);

create index if not exists kore_article_identity_conflicts_run_idx on public.kore_article_identity_conflicts (last_sync_run_id);
create index if not exists kore_article_identity_conflicts_status_idx on public.kore_article_identity_conflicts (status);

alter table public.kore_article_identity_conflicts enable row level security;
revoke all on table public.kore_article_identity_conflicts from anon, authenticated;

commit;
