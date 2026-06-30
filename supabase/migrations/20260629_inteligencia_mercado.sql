-- Inteligencia de Mercado: motor de investigaciones de mercado.
-- Ejecutar MANUALMENTE en el SQL Editor de Supabase antes de probar
-- /inteligencia-mercado y la landing pública /encuesta/[slug].
--
-- Aditivo y NO destructivo: solo crea tablas nuevas mercado_*. No toca
-- prospeccion_*, helpdesk_tickets, commercial_campaigns, solicitudes ni el dataset.
--
-- POLÍTICA DE SEGURIDAD (prototipo interno):
--   * mercado_investigaciones: acceso anónimo total (el panel admin edita con la
--     clave pública, igual que el resto de los módulos). ENDURECER con auth real
--     antes de exponer la edición públicamente.
--   * mercado_respuestas: LECTURA anónima (para el panel) pero la ESCRITURA pasa
--     SOLO por la API con service role. La landing pública NO inserta directo con
--     la clave anónima -> respuestas a prueba de manipulación desde el browser.

-- ─────────────────────────────────────────── 1) Investigaciones (definición)

create table if not exists public.mercado_investigaciones (
  id                     text primary key,
  slug                   text not null unique,
  titulo                 text not null,
  descripcion            text not null default '',
  estado                 text not null default 'borrador', -- borrador | activa | cerrada
  intro                  text not null default '',
  agradecimiento         text not null default '',
  captura_distribuidor   boolean not null default true,
  comentario_final_titulo text not null default '',
  bloques                jsonb not null default '[]'::jsonb,
  meta                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists mercado_investigaciones_estado_idx
  on public.mercado_investigaciones (estado);
create index if not exists mercado_investigaciones_updated_at_desc_idx
  on public.mercado_investigaciones (updated_at desc);

-- ─────────────────────────────────────────── 2) Respuestas

create table if not exists public.mercado_respuestas (
  id                  text primary key,
  investigacion_id    text not null references public.mercado_investigaciones (id) on delete cascade,
  investigacion_slug  text not null,
  distribuidor_nombre text null,
  empresa             text null,
  departamento        text null,
  contacto            text null,
  respuestas          jsonb not null default '{}'::jsonb, -- keyed por pregunta.id
  comentario_libre    text null,
  meta                jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists mercado_respuestas_investigacion_idx
  on public.mercado_respuestas (investigacion_id);
create index if not exists mercado_respuestas_departamento_idx
  on public.mercado_respuestas (departamento);
create index if not exists mercado_respuestas_created_at_desc_idx
  on public.mercado_respuestas (created_at desc);

-- ─────────────────────────────────────────── Trigger updated_at

create or replace function public.set_mercado_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mercado_investigaciones_set_updated_at on public.mercado_investigaciones;
create trigger mercado_investigaciones_set_updated_at
  before update on public.mercado_investigaciones
  for each row
  execute function public.set_mercado_updated_at();

-- ─────────────────────────────────────────── RLS + políticas

alter table public.mercado_investigaciones enable row level security;
alter table public.mercado_respuestas      enable row level security;

-- Investigaciones: anon total (prototipo, edición desde el panel con clave pública).
drop policy if exists mercado_investigaciones_anon_all on public.mercado_investigaciones;
create policy mercado_investigaciones_anon_all
  on public.mercado_investigaciones
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Respuestas: el panel LEE con anon; la inserción va por la API (service role,
-- que ignora RLS). No damos insert/update/delete a anon a propósito.
drop policy if exists mercado_respuestas_anon_select on public.mercado_respuestas;
create policy mercado_respuestas_anon_select
  on public.mercado_respuestas
  for select
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.mercado_investigaciones to anon, authenticated;
grant select on public.mercado_respuestas to anon, authenticated;

-- ─────────────────────────────────────────── Seed: investigación de ejemplo

insert into public.mercado_investigaciones
  (id, slug, titulo, descripcion, estado, intro, agradecimiento,
   captura_distribuidor, comentario_final_titulo, bloques)
values (
  'seed-estado-mercado-4x4',
  'estado-mercado-4x4',
  'Estado del mercado 4x4',
  'Tu mirada como distribuidor sobre el mercado de pickups y vehículos 4x4 en Uruguay.',
  'activa',
  'Esta es una entrevista breve (3 a 5 minutos). Queremos conocer tu visión real del mercado para tomar mejores decisiones comerciales. No hay respuestas correctas: nos interesa tu experiencia.',
  '¡Gracias por compartir tu visión! Tu aporte ayuda a anticipar tendencias y oportunidades para toda la red.',
  true,
  'Comentario libre: lo que quieras agregar',
  $json$
  [
    {
      "id": "b-mercado",
      "titulo": "Estado del mercado",
      "descripcion": "Cómo ves la situación general hoy.",
      "preguntas": [
        {"id": "mercado-situacion", "tipo": "opcion_unica", "titulo": "¿Cómo ves el mercado 4x4 en este momento?", "etiqueta": "mercado", "requerida": true, "opciones": ["En crecimiento", "Estable", "En caída", "No estoy seguro"]},
        {"id": "mercado-actividad", "tipo": "escala", "titulo": "Nivel de actividad de ventas en los últimos 3 meses", "etiqueta": "mercado", "escala": {"min": 1, "max": 5, "etiquetaMin": "Muy bajo", "etiquetaMax": "Muy alto"}}
      ]
    },
    {
      "id": "b-marcas",
      "titulo": "Marcas",
      "preguntas": [
        {"id": "marcas-mas-vendidas", "tipo": "texto_corto", "titulo": "¿Qué marcas son las más vendidas en tu zona?", "etiqueta": "marca", "placeholder": "Ej: Toyota, Ford, VW…"},
        {"id": "marcas-en-crecimiento", "tipo": "texto_corto", "titulo": "¿Qué marca está creciendo o ganando terreno?", "etiqueta": "marca"}
      ]
    },
    {
      "id": "b-productos",
      "titulo": "Productos",
      "preguntas": [
        {"id": "productos-mas-vendidos", "tipo": "texto_largo", "titulo": "Productos / repuestos más vendidos", "etiqueta": "producto"},
        {"id": "productos-menos-vendidos", "tipo": "texto_largo", "titulo": "Productos que están perdiendo mercado", "etiqueta": "producto"},
        {"id": "productos-dificiles", "tipo": "texto_largo", "titulo": "Productos difíciles de conseguir", "etiqueta": "barrera"},
        {"id": "productos-importar", "tipo": "texto_largo", "titulo": "¿Qué deberíamos importar que hoy falta?", "etiqueta": "importacion"}
      ]
    },
    {
      "id": "b-tendencias",
      "titulo": "Tendencias",
      "preguntas": [
        {"id": "tendencias-nuevas", "tipo": "texto_largo", "titulo": "Nuevas tendencias que estás notando", "etiqueta": "tendencia"},
        {"id": "clientes-comportamiento", "tipo": "texto_largo", "titulo": "¿Cómo está cambiando el comportamiento de los clientes?", "etiqueta": "cliente"}
      ]
    },
    {
      "id": "b-competencia",
      "titulo": "Competencia",
      "preguntas": [
        {"id": "competencia-acciones", "tipo": "texto_largo", "titulo": "¿Qué está haciendo la competencia que te llama la atención?", "etiqueta": "competencia"}
      ]
    },
    {
      "id": "b-tecnologia",
      "titulo": "Nuevas tecnologías",
      "preguntas": [
        {"id": "tecnologia-cambios", "tipo": "texto_largo", "titulo": "Cambios tecnológicos relevantes (híbridos, eléctricos, accesorios, etc.)", "etiqueta": "tecnologia"}
      ]
    },
    {
      "id": "b-oportunidades",
      "titulo": "Oportunidades",
      "preguntas": [
        {"id": "oportunidades-detectadas", "tipo": "texto_largo", "titulo": "Oportunidades comerciales que detectaste", "etiqueta": "oportunidad"},
        {"id": "necesidades-no-cubiertas", "tipo": "texto_largo", "titulo": "Necesidades que hoy nadie está resolviendo", "etiqueta": "necesidad"},
        {"id": "empresas-interesantes", "tipo": "texto_largo", "titulo": "Empresas interesantes para visitar", "etiqueta": "empresa"},
        {"id": "ideas-distribuidor", "tipo": "texto_largo", "titulo": "Ideas de negocio que se te ocurren", "etiqueta": "idea"}
      ]
    }
  ]
  $json$::jsonb
)
on conflict (id) do nothing;
