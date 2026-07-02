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
  'Queremos entender cómo está cambiando el mercado de pickups en tu zona desde la mirada de quienes están en contacto directo con clientes, vehículos y accesorios. La encuesta lleva 3 o 4 minutos y nos ayuda a tomar mejores decisiones sobre productos, importaciones, stock, tendencias y oportunidades comerciales.',
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
      "titulo": "Marcas y modelos",
      "descripcion": "Marcá la marca y, si aplica, el o los modelos con más movimiento. Podés elegir varias.",
      "preguntas": [
        {"id": "marcas-mas-vendidas", "tipo": "jerarquico", "titulo": "¿Qué marcas o modelos de pickups ves con más movimiento o consulta hoy en tu zona?", "etiqueta": "marca", "opciones": [
          {"valor": "Toyota", "hijos": ["Hilux", "Otra"]},
          {"valor": "Ford", "hijos": ["Ranger", "F-150", "Maverick", "Otra"]},
          {"valor": "Volkswagen", "hijos": ["Amarok", "Otra"]},
          {"valor": "Chevrolet", "hijos": ["S10", "Otra"]},
          {"valor": "Nissan", "hijos": ["Frontier", "Otra"]},
          {"valor": "RAM", "hijos": ["Rampage", "1500", "Otra"]},
          {"valor": "Mitsubishi", "hijos": ["L200", "Otra"]},
          {"valor": "Fiat", "hijos": ["Toro", "Strada", "Otra"]},
          {"valor": "BYD", "hijos": ["Shark", "Otra"]},
          {"valor": "GWM", "hijos": ["Poer", "Otra"]},
          {"valor": "JAC", "hijos": ["T8", "T9", "Otra"]},
          {"valor": "Peugeot", "hijos": ["Landtrek", "Otra"]},
          {"valor": "Renault", "hijos": ["Oroch", "Otra"]},
          {"valor": "Otra"}
        ]}
      ]
    },
    {
      "id": "b-productos",
      "titulo": "Productos",
      "descripcion": "Marcá la categoría y, si aplica, el o los accesorios con más movimiento. Podés elegir varias opciones.",
      "preguntas": [
        {"id": "productos-mas-vendidos", "tipo": "jerarquico", "titulo": "¿Podés marcar en qué categoría de accesorios se enfoca más la búsqueda de tu clientela?", "etiqueta": "producto", "opciones": [
          {"valor": "Protección y trabajo", "hijos": ["Cubre cárter", "Defensas", "Suspensión / refuerzos", "Otra"]},
          {"valor": "Carga y transporte", "hijos": ["Cubre caja", "Lona marítima", "Enganche", "Portaequipajes", "Organizadores de caja", "Otra"]},
          {"valor": "Acceso y estética", "hijos": ["Estribos", "Barras / accesorios deportivos", "Otra"]},
          {"valor": "Iluminación y electricidad", "hijos": ["Iluminación LED", "Otra"]},
          {"valor": "Off-road y aventura", "hijos": ["Snorkel", "Otra"]},
          {"valor": "Seguridad", "hijos": ["Otra"]},
          {"valor": "Repuestos y mantenimiento", "hijos": ["Otra"]},
          {"valor": "Otros", "hijos": ["Otra"]}
        ]},
        {"id": "productos-menos-vendidos", "tipo": "opcion_multiple", "titulo": "¿Qué productos notás que ya no generan interés en las consultas de tus clientes?", "etiqueta": "producto", "permiteOtro": true, "opciones": ["Lona marítima", "Cubre caja", "Estribos", "Enganche", "Barras / accesorios deportivos", "Cubre cárter", "Defensas", "Iluminación LED", "Portaequipajes", "Organizadores de caja", "Snorkel", "Suspensión / refuerzos", "No noto caída clara"]},
        {"id": "productos-dificiles", "tipo": "opcion_multiple", "titulo": "¿Qué productos considerás que podrían tener interés, pero hoy no hay en plaza o tienen un precio demasiado alto como para poder ofrecerlos?", "etiqueta": "barrera", "permiteOtro": true, "opciones": ["Lona marítima", "Cubre caja", "Estribos", "Enganche", "Barras / accesorios deportivos", "Cubre cárter", "Defensas", "Iluminación LED", "Portaequipajes", "Organizadores de caja", "Snorkel", "Suspensión / refuerzos", "Repuestos específicos", "Accesorios para nuevas marcas"]},
        {"id": "productos-importar", "tipo": "texto_largo", "titulo": "¿Qué deberíamos importar o investigar mejor?", "etiqueta": "importacion", "placeholder": "Contanos qué oportunidad ves que hoy no estamos cubriendo…"}
      ]
    },
    {
      "id": "b-tendencias",
      "titulo": "Nuevas tendencias que estás notando",
      "descripcion": "Marcá todas las que apliquen.",
      "preguntas": [
        {"id": "tendencias-nuevas", "tipo": "opcion_multiple", "titulo": "¿Qué nuevas tendencias estás notando en el mercado?", "etiqueta": "tendencia", "permiteOtro": true, "opciones": ["Mayor consulta por pickups híbridas o eléctricas", "Más interés por bajo consumo", "Más preocupación por precio y financiación", "Más búsqueda de vehículos usados antes que 0 km", "Mayor interés por marcas chinas o nuevas marcas", "Clientes más cautelosos antes de comprar", "Mayor consulta por accesorios de protección y trabajo", "Más interés por equipamiento estético / deportivo", "Menor movimiento general del mercado", "No noto cambios importantes por ahora"]}
      ]
    },
    {
      "id": "b-comportamiento",
      "titulo": "Cómo está cambiando el comportamiento de los clientes",
      "descripcion": "Marcá todas las que apliquen.",
      "preguntas": [
        {"id": "clientes-comportamiento", "tipo": "opcion_multiple", "titulo": "¿Cómo está cambiando el comportamiento de los clientes?", "etiqueta": "cliente", "permiteOtro": true, "opciones": ["Comparan más precios antes de comprar", "Demoran más en tomar la decisión", "Consultan más, pero concretan menos", "Buscan más financiación", "Priorizan precio por encima de marca", "Priorizan confiabilidad, respaldo y reventa", "Buscan productos más económicos", "Siguen valorando productos de mejor calidad", "Preguntan más por instalación y garantía", "Están más atentos a promociones", "Compran solo lo necesario", "No noto cambios importantes por ahora"]}
      ]
    },
    {
      "id": "b-competencia",
      "titulo": "Competencia",
      "preguntas": [
        {"id": "competencia-acciones", "tipo": "texto_largo", "titulo": "¿Conocés más de un proveedor de accesorios? ¿Podés indicarnos cuáles?", "etiqueta": "competencia"}
      ]
    },
    {
      "id": "b-tecnologia",
      "titulo": "Nuevas tecnologías",
      "preguntas": [
        {"id": "tecnologia-adaptacion", "tipo": "opcion_unica", "titulo": "¿Cómo se adaptan tus clientes a las nuevas tecnologías?", "etiqueta": "tecnologia", "opciones": ["Son conservadores y prefieren lo que ya está probado", "La mayoría quiere incorporar esos cambios rápidamente", "Prefieren lo tradicional por miedo a complicarse con fallas o reparaciones", "En general siguen la tendencia del mercado y no tienen en cuenta esos factores"]}
      ]
    },
    {
      "id": "b-necesidades",
      "titulo": "Necesidades y oportunidades",
      "preguntas": [
        {"id": "necesidad-proveedor", "tipo": "texto_largo", "titulo": "¿Qué tipo de productos o servicios te gustaría que un proveedor pudiera ofrecerte y hoy nadie te está resolviendo?", "etiqueta": "necesidad"}
      ]
    },
    {
      "id": "b-evaluacion-pickup4x4",
      "titulo": "Evaluación de Pickup4x4",
      "descripcion": "Cómo nos ves frente a otros proveedores. Cada punto es independiente.",
      "preguntas": [
        {"id": "eval-calidad", "tipo": "opcion_unica", "titulo": "Calidad de los productos", "etiqueta": "evaluacion", "opciones": ["Peor", "Igual", "Un poco mejor", "Mejor"]},
        {"id": "eval-precios", "tipo": "opcion_unica", "titulo": "Precios", "etiqueta": "evaluacion", "opciones": ["Más bajos", "Igual", "Un poco más altos", "Más altos"]},
        {"id": "eval-servicio", "tipo": "opcion_unica", "titulo": "Servicio de instalación, horarios y tiempos de entrega", "etiqueta": "evaluacion", "opciones": ["Peor", "Igual", "Mejor"]},
        {"id": "eval-variedad", "tipo": "opcion_unica", "titulo": "Variedad de productos", "etiqueta": "evaluacion", "opciones": ["Menor variedad", "Igual", "Mayor variedad"]},
        {"id": "eval-financiacion", "tipo": "opcion_unica", "titulo": "Planes de financiación", "etiqueta": "evaluacion", "opciones": ["Menos planes y menos flexibles", "Igual de flexibles", "Más planes y mayor flexibilidad"]},
        {"id": "eval-atencion", "tipo": "opcion_unica", "titulo": "Atención y asesoramiento", "etiqueta": "evaluacion", "opciones": ["Peor", "Igual", "Mejor"]},
        {"id": "eval-comunicacion", "tipo": "opcion_unica", "titulo": "Comunicación de ofertas, promociones y nuevos productos", "etiqueta": "evaluacion", "opciones": ["Mala comunicación", "Igual", "Mejor comunicación"]},
        {"id": "eval-sugerencias", "tipo": "texto_largo", "titulo": "¿Qué sugerencia nos harías para mejorar nuestros productos, servicios, comunicación o atención?", "etiqueta": "comentario"}
      ]
    }
  ]
  $json$::jsonb
)
-- Idempotente y NO destructivo: re-ejecutar esta migración ACTUALIZA la
-- definición de la encuesta (intro + bloques/preguntas) sin tocar las
-- respuestas ya cargadas (viven en mercado_respuestas) ni el estado que se
-- haya fijado desde el panel. Así se aplican nuevas preguntas/opciones sin
-- perder datos reales ni demos.
on conflict (id) do update set
  titulo                  = excluded.titulo,
  descripcion             = excluded.descripcion,
  intro                   = excluded.intro,
  agradecimiento          = excluded.agradecimiento,
  comentario_final_titulo = excluded.comentario_final_titulo,
  bloques                 = excluded.bloques;
