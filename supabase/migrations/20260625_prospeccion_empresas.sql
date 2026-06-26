-- Prospección Empresas: persistencia compartida vía Supabase
-- Ejecutar MANUALMENTE en el SQL Editor de Supabase antes de probar /prospeccion-empresas.
--
-- POLÍTICA DE SEGURIDAD (prototipo interno):
-- Las políticas RLS abajo permiten lectura/inserción/actualización/borrado anónimo
-- (acceso directo desde el browser con la clave pública, igual que helpdesk_tickets).
-- ENDURECER con auth real y RLS por usuario antes de cualquier exposición pública.
--
-- Aditivo y NO destructivo: solo crea tablas nuevas prospeccion_*. No toca
-- helpdesk_tickets, commercial_campaigns, solicitudes ni el dataset.

-- ─────────────────────────────────────────── 1) Empresas / oportunidades

create table if not exists public.prospeccion_empresas (
  id                 text primary key,
  nombre             text not null,
  nombre_canonico    text null,
  rubro              text null,
  subrubro           text null,
  tipo_organizacion  text null,
  direccion          text null,
  departamento       text null,
  ciudad             text null,
  localidad          text null,
  web                text null,
  fuente             text null,
  etapa              text null,
  prioridad          text null,
  semaforo           text null,   -- opcional: se calcula en frontend, se persiste por conveniencia
  es_sugerida        boolean not null default false,
  requiere_revision  boolean not null default false,
  flota              jsonb not null default '{}'::jsonb,
  proveedor          jsonb not null default '{}'::jsonb,
  necesidades        jsonb not null default '[]'::jsonb,
  contactos          jsonb not null default '[]'::jsonb,
  actividades        jsonb not null default '[]'::jsonb,
  propuestas         jsonb not null default '[]'::jsonb,
  observaciones      text null,
  meta               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists prospeccion_empresas_rubro_idx
  on public.prospeccion_empresas (rubro);
create index if not exists prospeccion_empresas_etapa_idx
  on public.prospeccion_empresas (etapa);
create index if not exists prospeccion_empresas_prioridad_idx
  on public.prospeccion_empresas (prioridad);
create index if not exists prospeccion_empresas_requiere_revision_idx
  on public.prospeccion_empresas (requiere_revision);
create index if not exists prospeccion_empresas_updated_at_desc_idx
  on public.prospeccion_empresas (updated_at desc);

-- ─────────────────────────────────────────── 2) Necesidades / oportunidades de producto

create table if not exists public.prospeccion_necesidades_producto (
  id            text primary key,
  producto      text not null,
  rubro         text null,
  menciones     integer not null default 1,
  potencial     text null,
  estado        text null,
  empresas      jsonb not null default '[]'::jsonb,
  observaciones text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists prospeccion_necesidades_producto_rubro_idx
  on public.prospeccion_necesidades_producto (rubro);
create index if not exists prospeccion_necesidades_producto_estado_idx
  on public.prospeccion_necesidades_producto (estado);

-- ─────────────────────────────────────────── 3) Catálogos editables

create table if not exists public.prospeccion_rubros (
  id          text primary key,
  nombre      text not null,
  descripcion text null,
  orden       integer not null default 0,
  activo      boolean not null default true,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.prospeccion_etapas (
  id          text primary key,
  nombre      text not null,
  descripcion text null,
  orden       integer not null default 0,
  activo      boolean not null default true,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.prospeccion_tipos_actividad (
  id          text primary key,
  nombre      text not null,
  descripcion text null,
  orden       integer not null default 0,
  activo      boolean not null default true,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prospeccion_rubros_orden_idx
  on public.prospeccion_rubros (orden);
create index if not exists prospeccion_etapas_orden_idx
  on public.prospeccion_etapas (orden);
create index if not exists prospeccion_tipos_actividad_orden_idx
  on public.prospeccion_tipos_actividad (orden);

-- ─────────────────────────────────────────── 4) Departamentos de Uruguay

create table if not exists public.prospeccion_departamentos (
  id         text primary key,
  nombre     text not null,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.prospeccion_departamentos (id, nombre, orden) values
  ('artigas',        'Artigas',        1),
  ('canelones',      'Canelones',      2),
  ('cerro-largo',    'Cerro Largo',    3),
  ('colonia',        'Colonia',        4),
  ('durazno',        'Durazno',        5),
  ('flores',         'Flores',         6),
  ('florida',        'Florida',        7),
  ('lavalleja',      'Lavalleja',      8),
  ('maldonado',      'Maldonado',      9),
  ('montevideo',     'Montevideo',     10),
  ('paysandu',       'Paysandú',       11),
  ('rio-negro',      'Río Negro',      12),
  ('rivera',         'Rivera',         13),
  ('rocha',          'Rocha',          14),
  ('salto',          'Salto',          15),
  ('san-jose',       'San José',       16),
  ('soriano',        'Soriano',        17),
  ('tacuarembo',     'Tacuarembó',     18),
  ('treinta-y-tres', 'Treinta y Tres', 19)
on conflict (id) do nothing;

-- ─────────────────────────────────────────── Trigger updated_at (compartido)

create or replace function public.set_prospeccion_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prospeccion_empresas_set_updated_at on public.prospeccion_empresas;
create trigger prospeccion_empresas_set_updated_at
  before update on public.prospeccion_empresas
  for each row
  execute function public.set_prospeccion_updated_at();

drop trigger if exists prospeccion_necesidades_producto_set_updated_at on public.prospeccion_necesidades_producto;
create trigger prospeccion_necesidades_producto_set_updated_at
  before update on public.prospeccion_necesidades_producto
  for each row
  execute function public.set_prospeccion_updated_at();

drop trigger if exists prospeccion_rubros_set_updated_at on public.prospeccion_rubros;
create trigger prospeccion_rubros_set_updated_at
  before update on public.prospeccion_rubros
  for each row
  execute function public.set_prospeccion_updated_at();

drop trigger if exists prospeccion_etapas_set_updated_at on public.prospeccion_etapas;
create trigger prospeccion_etapas_set_updated_at
  before update on public.prospeccion_etapas
  for each row
  execute function public.set_prospeccion_updated_at();

drop trigger if exists prospeccion_tipos_actividad_set_updated_at on public.prospeccion_tipos_actividad;
create trigger prospeccion_tipos_actividad_set_updated_at
  before update on public.prospeccion_tipos_actividad
  for each row
  execute function public.set_prospeccion_updated_at();

-- ─────────────────────────────────────────── RLS + políticas (prototipo interno)
-- Acceso anónimo directo desde el browser. ENDURECER antes de exposición pública.

alter table public.prospeccion_empresas             enable row level security;
alter table public.prospeccion_necesidades_producto enable row level security;
alter table public.prospeccion_rubros               enable row level security;
alter table public.prospeccion_etapas               enable row level security;
alter table public.prospeccion_tipos_actividad      enable row level security;
alter table public.prospeccion_departamentos        enable row level security;

drop policy if exists prospeccion_empresas_anon_all on public.prospeccion_empresas;
create policy prospeccion_empresas_anon_all
  on public.prospeccion_empresas
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists prospeccion_necesidades_producto_anon_all on public.prospeccion_necesidades_producto;
create policy prospeccion_necesidades_producto_anon_all
  on public.prospeccion_necesidades_producto
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists prospeccion_rubros_anon_all on public.prospeccion_rubros;
create policy prospeccion_rubros_anon_all
  on public.prospeccion_rubros
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists prospeccion_etapas_anon_all on public.prospeccion_etapas;
create policy prospeccion_etapas_anon_all
  on public.prospeccion_etapas
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists prospeccion_tipos_actividad_anon_all on public.prospeccion_tipos_actividad;
create policy prospeccion_tipos_actividad_anon_all
  on public.prospeccion_tipos_actividad
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists prospeccion_departamentos_anon_all on public.prospeccion_departamentos;
create policy prospeccion_departamentos_anon_all
  on public.prospeccion_departamentos
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.prospeccion_empresas             to anon, authenticated;
grant select, insert, update, delete on public.prospeccion_necesidades_producto to anon, authenticated;
grant select, insert, update, delete on public.prospeccion_rubros               to anon, authenticated;
grant select, insert, update, delete on public.prospeccion_etapas               to anon, authenticated;
grant select, insert, update, delete on public.prospeccion_tipos_actividad      to anon, authenticated;
grant select, insert, update, delete on public.prospeccion_departamentos        to anon, authenticated;
