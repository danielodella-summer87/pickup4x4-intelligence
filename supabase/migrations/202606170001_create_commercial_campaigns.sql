-- Campañas comerciales por artículos (PICKUP4X4-CAMPANAS-ARTICULOS-003)
-- Ejecutar manualmente en el SQL Editor de Supabase antes de probar /campanas.
--
-- SEGURIDAD: el acceso es exclusivamente vía API routes con service role
-- (app/api/campaigns/*). Se habilita RLS SIN políticas anónimas: el service role
-- bypassa RLS, y anon/authenticated quedan sin acceso por defecto (no se otorgan
-- grants). No endurece ni afecta tablas existentes; es seguro y NO destructivo.

create table if not exists public.commercial_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text null,
  preset text null,
  description text null,
  objective text null,
  status text not null default 'draft',
  filters_json jsonb null,
  quality_summary_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete cascade,
  input_code text null,
  input_description text null,
  input_category text null,
  input_brand_model text null,
  observations text null,
  matched_article_code text null,
  matched_article_description text null,
  validation_status text null,
  match_confidence text null,
  source text null,
  raw_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_campaign_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete cascade,
  customer_number text null,
  customer_name text null,
  fantasy_name text null,
  email text null,
  phone text null,
  whatsapp text null,
  locality text null,
  article_code text null,
  article_description text null,
  sale_date date null,
  sale_age_months integer null,
  invoice_number text null,
  compatible_vehicle text null,
  match_confidence text null,
  suggested_action text null,
  observations text null,
  raw_json jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists commercial_campaigns_updated_at_desc_idx
  on public.commercial_campaigns (updated_at desc);
create index if not exists commercial_campaigns_status_idx
  on public.commercial_campaigns (status);
create index if not exists commercial_campaign_items_campaign_idx
  on public.commercial_campaign_items (campaign_id);
create index if not exists commercial_campaign_results_campaign_idx
  on public.commercial_campaign_results (campaign_id);

-- Trigger updated_at para campañas e items.
create or replace function public.set_commercial_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commercial_campaigns_set_updated_at on public.commercial_campaigns;
create trigger commercial_campaigns_set_updated_at
  before update on public.commercial_campaigns
  for each row
  execute function public.set_commercial_campaigns_updated_at();

drop trigger if exists commercial_campaign_items_set_updated_at on public.commercial_campaign_items;
create trigger commercial_campaign_items_set_updated_at
  before update on public.commercial_campaign_items
  for each row
  execute function public.set_commercial_campaigns_updated_at();

-- RLS habilitado sin políticas: solo el service role (API routes) accede.
alter table public.commercial_campaigns enable row level security;
alter table public.commercial_campaign_items enable row level security;
alter table public.commercial_campaign_results enable row level security;
