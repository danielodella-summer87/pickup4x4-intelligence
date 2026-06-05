-- Mesa de ayuda: tickets compartidos vía Supabase
-- Ejecutar manualmente en el SQL Editor de Supabase antes de probar /mesa-de-ayuda.
--
-- POLÍTICA DE SEGURIDAD (prototipo):
-- Las políticas RLS abajo permiten lectura, inserción y actualización anónima.
-- Endurecer con auth real y RLS por usuario antes de producción.

create table if not exists public.helpdesk_tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  status text not null default 'nuevo',
  priority text not null default 'media',
  type text not null default 'sugerencia',
  module text not null default 'General',
  created_by text null,
  screenshot_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint helpdesk_tickets_status_check check (
    status in ('nuevo', 'en_revision', 'en_proceso', 'resuelto', 'cerrado')
  ),
  constraint helpdesk_tickets_priority_check check (
    priority in ('baja', 'media', 'alta', 'critica')
  ),
  constraint helpdesk_tickets_type_check check (
    type in ('error', 'mejora', 'sugerencia', 'consulta')
  )
);

create index if not exists helpdesk_tickets_status_idx
  on public.helpdesk_tickets (status);

create index if not exists helpdesk_tickets_priority_idx
  on public.helpdesk_tickets (priority);

create index if not exists helpdesk_tickets_type_idx
  on public.helpdesk_tickets (type);

create index if not exists helpdesk_tickets_module_idx
  on public.helpdesk_tickets (module);

create index if not exists helpdesk_tickets_created_at_desc_idx
  on public.helpdesk_tickets (created_at desc);

create or replace function public.set_helpdesk_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists helpdesk_tickets_set_updated_at on public.helpdesk_tickets;

create trigger helpdesk_tickets_set_updated_at
  before update on public.helpdesk_tickets
  for each row
  execute function public.set_helpdesk_tickets_updated_at();

alter table public.helpdesk_tickets enable row level security;

drop policy if exists helpdesk_tickets_anon_select on public.helpdesk_tickets;
drop policy if exists helpdesk_tickets_anon_insert on public.helpdesk_tickets;
drop policy if exists helpdesk_tickets_anon_update on public.helpdesk_tickets;

create policy helpdesk_tickets_anon_select
  on public.helpdesk_tickets
  for select
  to anon, authenticated
  using (true);

create policy helpdesk_tickets_anon_insert
  on public.helpdesk_tickets
  for insert
  to anon, authenticated
  with check (true);

create policy helpdesk_tickets_anon_update
  on public.helpdesk_tickets
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.helpdesk_tickets to anon, authenticated;
