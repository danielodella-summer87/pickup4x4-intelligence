-- KORE-24 — Shadow sync de catálogo (taxonomía + artículos) KORE → Supabase.
--
-- ALCANCE: crea SOLO tablas nuevas `kore_*`. No altera, trunca ni borra tablas
-- existentes (clientes, ventas, articulos, aplicaciones, importaciones,
-- oportunidades, ni ninguna otra). La UI no lee estas tablas.
--
-- APLICACIÓN: ejecutar este archivo de forma aislada (SQL Editor o
-- `supabase db query -f`). NO usar `supabase db push`: aplicaría también
-- migraciones históricas marcadas como "no ejecutar sin aprobación".
--
-- SEGURIDAD: RLS habilitado SIN políticas y sin grants a anon/authenticated.
-- Solo el runner local server-side (service role) escribe. No se guardan
-- secretos ni XML crudo.
--
-- HISTORIAL: sin ON DELETE CASCADE. Borrar un sync run o una fila RAW no puede
-- arrastrar historial KORE en silencio. No se hace borrado físico por ausencia:
-- se usa `missing_since`.
--
-- ROLLBACK: no ejecutar el runner. No hay migration down destructiva.

-- ─────────────────────────────────────────────────────────────────────────────
-- Sync runs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kore_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'kore' check (source = 'kore'),
  operation_group text not null,
  sync_mode text not null,
  status text not null check (status in ('running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_unchanged integer not null default 0 check (rows_unchanged >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  requests_attempted integer not null default 0 check (requests_attempted >= 0),
  requests_succeeded integer not null default 0 check (requests_succeeded >= 0),
  requests_failed integer not null default 0 check (requests_failed >= 0),
  error_category text null,
  -- Métricas agregadas (solo conteos, nunca valores de negocio).
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kore_sync_runs_group_started_idx
  on public.kore_sync_runs (operation_group, started_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RAW — representación fiel de los modelos lib/kore (raw + normalizado)
-- source_key = clave natural normalizada serializada (JSON array).
-- sync_run_id = último sync run que observó la fila.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kore_raw_familias (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null,
  codigo_familia_raw text not null,
  descripcion text not null,
  descripcion_raw text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kore_raw_grupos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null,
  codigo_familia_raw text not null,
  codigo_grupo text not null,
  codigo_grupo_raw text not null,
  descripcion text not null,
  descripcion_raw text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kore_raw_subgrupos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null,
  codigo_familia_raw text not null,
  codigo_grupo text not null,
  codigo_grupo_raw text not null,
  codigo_subgrupo text not null,
  codigo_subgrupo_raw text not null,
  descripcion text not null,
  descripcion_raw text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kore_raw_articulos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_unico text not null,
  codigo_unico_raw text not null,
  -- Taxonomía: null = tag ausente en KORE; "" = blank KORE taxonomy record.
  codigo_familia text null,
  codigo_familia_raw text null,
  codigo_grupo text null,
  codigo_grupo_raw text null,
  codigo_subgrupo text null,
  codigo_subgrupo_raw text null,
  descripcion text not null,
  basico smallint null check (basico in (0, 1)),
  minimo smallint null check (minimo in (0, 1)),
  exento smallint null check (exento in (0, 1)),
  deshabilitado smallint null check (deshabilitado in (0, 1)),
  controla_stock smallint null check (controla_stock in (0, 1)),
  observaciones text not null,
  -- Partición (filtro CodigoFamilia) del request que observó la fila por última vez.
  request_codigo_familia text not null,
  sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- NORMALIZED SOURCE — entidades KORE consistentes (NO dominio Pickup4x4)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kore_familias (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null unique,
  descripcion text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  raw_id uuid not null references public.kore_raw_familias(id),
  last_sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kore_grupos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null,
  codigo_grupo text not null,
  -- Relación materializada solo si la familia existe (null = huérfano observado).
  familia_id uuid null references public.kore_familias(id),
  descripcion text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  raw_id uuid not null references public.kore_raw_grupos(id),
  last_sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo_familia, codigo_grupo)
);

create table if not exists public.kore_subgrupos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_familia text not null,
  codigo_grupo text not null,
  codigo_subgrupo text not null,
  grupo_id uuid null references public.kore_grupos(id),
  descripcion text not null,
  descuento_maximo double precision null,
  autonumerado integer null,
  raw_id uuid not null references public.kore_raw_subgrupos(id),
  last_sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo_familia, codigo_grupo, codigo_subgrupo)
);

create table if not exists public.kore_articulos (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  codigo_unico text not null unique,
  codigo_familia text null,
  codigo_grupo text null,
  codigo_subgrupo text null,
  familia_id uuid null references public.kore_familias(id),
  grupo_id uuid null references public.kore_grupos(id),
  subgrupo_id uuid null references public.kore_subgrupos(id),
  descripcion text not null,
  observaciones text not null,
  basico smallint null check (basico in (0, 1)),
  minimo smallint null check (minimo in (0, 1)),
  exento smallint null check (exento in (0, 1)),
  deshabilitado smallint null check (deshabilitado in (0, 1)),
  controla_stock smallint null check (controla_stock in (0, 1)),
  raw_id uuid not null references public.kore_raw_articulos(id),
  last_sync_run_id uuid not null references public.kore_sync_runs(id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Índices (FKs y trazabilidad)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists kore_raw_familias_run_idx on public.kore_raw_familias (sync_run_id);
create index if not exists kore_raw_grupos_run_idx on public.kore_raw_grupos (sync_run_id);
create index if not exists kore_raw_subgrupos_run_idx on public.kore_raw_subgrupos (sync_run_id);
create index if not exists kore_raw_articulos_run_idx on public.kore_raw_articulos (sync_run_id);
create index if not exists kore_familias_run_idx on public.kore_familias (last_sync_run_id);
create index if not exists kore_familias_raw_idx on public.kore_familias (raw_id);
create index if not exists kore_grupos_run_idx on public.kore_grupos (last_sync_run_id);
create index if not exists kore_grupos_raw_idx on public.kore_grupos (raw_id);
create index if not exists kore_grupos_familia_idx on public.kore_grupos (familia_id);
create index if not exists kore_subgrupos_run_idx on public.kore_subgrupos (last_sync_run_id);
create index if not exists kore_subgrupos_raw_idx on public.kore_subgrupos (raw_id);
create index if not exists kore_subgrupos_grupo_idx on public.kore_subgrupos (grupo_id);
create index if not exists kore_articulos_run_idx on public.kore_articulos (last_sync_run_id);
create index if not exists kore_articulos_raw_idx on public.kore_articulos (raw_id);
create index if not exists kore_articulos_familia_idx on public.kore_articulos (familia_id);
create index if not exists kore_articulos_grupo_idx on public.kore_articulos (grupo_id);
create index if not exists kore_articulos_subgrupo_idx on public.kore_articulos (subgrupo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: habilitado, sin políticas. Sin acceso anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kore_sync_runs enable row level security;
alter table public.kore_raw_familias enable row level security;
alter table public.kore_raw_grupos enable row level security;
alter table public.kore_raw_subgrupos enable row level security;
alter table public.kore_raw_articulos enable row level security;
alter table public.kore_familias enable row level security;
alter table public.kore_grupos enable row level security;
alter table public.kore_subgrupos enable row level security;
alter table public.kore_articulos enable row level security;

revoke all on table
  public.kore_sync_runs,
  public.kore_raw_familias,
  public.kore_raw_grupos,
  public.kore_raw_subgrupos,
  public.kore_raw_articulos,
  public.kore_familias,
  public.kore_grupos,
  public.kore_subgrupos,
  public.kore_articulos
from anon, authenticated;
