-- Investigación "Calidad y Postventa": encuesta interna (ventas, instalación,
-- postventa/RMA, calidad) sobre errores de compatibilidad, información
-- incompleta, RMA, cotización, retrabajos, reclamos, stock y comunicación
-- interna. Alimenta el panel dedicado "Calidad/RMA"
-- (ver lib/inteligencia-mercado/calidad-rma.ts).
--
-- NO EJECUTAR todavía sin aprobación explícita. Cuando se apruebe:
--   1) Correr este archivo en el SQL Editor de Supabase (aditivo, mismo
--      patrón que 20260629_inteligencia_mercado.sql: reutiliza las tablas
--      mercado_investigaciones/mercado_respuestas ya existentes, no crea
--      tablas nuevas ni toca la investigación "estado-mercado-4x4").
--   2) La investigación queda en estado 'borrador' (no aparece en /encuesta
--      ni acepta respuestas hasta que se cambie a 'activa' desde el panel).
--   3) NO carga respuestas de prueba — mercado_respuestas queda intacta.
--
-- captura_distribuidor = false: la landing NO pide Empresa/Giro/Departamento
-- (pensados para distribuidores externos). Identidad interna (Nombre, Área/
-- Rol, Sucursal) va como preguntas normales del bloque "Quién sos".

insert into public.mercado_investigaciones
  (id, slug, titulo, descripcion, estado, intro, agradecimiento,
   captura_distribuidor, comentario_final_titulo, bloques)
values (
  'seed-calidad-postventa',
  'calidad-postventa',
  'Calidad y Postventa',
  'Relevamiento interno de errores, compatibilidad, instalación, reclamos y RMA para reducir retrabajos y mejorar el proceso.',
  'borrador',
  'Esta encuesta es interna: ventas, instalación, postventa/RMA y calidad. Nos ayuda a detectar dónde se originan los errores más frecuentes y a definir acciones concretas para reducirlos. Lleva 4 a 5 minutos.',
  '¡Gracias! Tu aporte ayuda a detectar puntos críticos del proceso y a definir mejoras concretas.',
  false,
  '¿Algo más que quieras agregar sobre errores, procesos o mejoras?',
  $json$
  [
    {
      "id": "b-identidad",
      "titulo": "Quién sos",
      "descripcion": "Para poder segmentar los resultados por área y sucursal.",
      "preguntas": [
        {"id": "nombre", "tipo": "texto_corto", "titulo": "Tu nombre", "placeholder": "Opcional"},
        {"id": "area-rol", "tipo": "opcion_unica", "titulo": "Área / rol", "etiqueta": "area_origen", "requerida": true, "opciones": ["Ventas", "Instalación", "Postventa / RMA", "Calidad", "Otro"]},
        {"id": "sucursal", "tipo": "opcion_unica", "titulo": "Sucursal / sede", "etiqueta": "area_origen", "requerida": true, "opciones": ["Casa central", "Taller / instalación", "Depósito", "Ventas / atención comercial", "Administración", "Postventa / RMA", "No aplica", "Otro"]}
      ]
    },
    {
      "id": "b-compatibilidad",
      "titulo": "Compatibilidad vehículo/producto",
      "preguntas": [
        {"id": "compat-frecuencia", "tipo": "escala", "titulo": "¿Con qué frecuencia se detectan errores de compatibilidad vehículo/producto?", "etiqueta": "compatibilidad", "requerida": true, "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Muy frecuente"}},
        {"id": "compat-etapa", "tipo": "opcion_unica", "titulo": "¿En qué etapa se suele detectar el error?", "etiqueta": "compatibilidad", "opciones": ["Cotización", "Venta", "Instalación", "Postventa", "No sé"]},
        {"id": "compat-caso", "tipo": "texto_largo", "titulo": "Contános un caso reciente", "etiqueta": "compatibilidad", "placeholder": "Opcional"}
      ]
    },
    {
      "id": "b-info-instalacion",
      "titulo": "Información de ventas a instalación",
      "preguntas": [
        {"id": "info-frecuencia", "tipo": "escala", "titulo": "¿Con qué frecuencia la información que llega a instalación está incompleta?", "etiqueta": "informacion_incompleta", "requerida": true, "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "info-falta", "tipo": "opcion_multiple", "titulo": "¿Qué datos faltan con más frecuencia?", "etiqueta": "informacion_incompleta", "opciones": ["Modelo/año del vehículo", "Accesorios ya instalados", "Medidas", "Dirección o datos del cliente", "Otro", "No sé"]}
      ]
    },
    {
      "id": "b-rma",
      "titulo": "RMA y devoluciones",
      "preguntas": [
        {"id": "rma-fotos", "tipo": "escala", "titulo": "¿Con qué frecuencia un RMA llega sin fotos?", "etiqueta": "rma", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "rma-causa", "tipo": "escala", "titulo": "¿Con qué frecuencia un RMA llega sin causa probable registrada?", "etiqueta": "rma", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "rma-solucion", "tipo": "escala", "titulo": "¿Con qué frecuencia falta registrar la solución aplicada?", "etiqueta": "rma", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "rma-causa-principal", "tipo": "opcion_unica", "titulo": "Causa principal más frecuente de RMA", "etiqueta": "rma", "opciones": ["Falla de producto", "Error de instalación", "Incompatibilidad", "Producto no correspondía al pedido", "Otro", "No sé"]}
      ]
    },
    {
      "id": "b-cotizacion",
      "titulo": "Cotización e instalación",
      "preguntas": [
        {"id": "cotiz-instalacion", "tipo": "escala", "titulo": "¿Con qué frecuencia una cotización no contempla la instalación?", "etiqueta": "cotizacion", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "cotiz-precio", "tipo": "escala", "titulo": "¿Con qué frecuencia el precio final queda mal informado o incompleto?", "etiqueta": "cotizacion", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "cotiz-impacto", "tipo": "opcion_unica", "titulo": "¿Cuál es el impacto más frecuente de este problema?", "etiqueta": "cotizacion", "opciones": ["Retraso de entrega", "Reclamo del cliente", "Pérdida de venta", "Costo extra no facturado", "No sé"]}
      ]
    },
    {
      "id": "b-retrabajo",
      "titulo": "Retrabajos y control final",
      "preguntas": [
        {"id": "retrabajo-frecuencia", "tipo": "escala", "titulo": "¿Con qué frecuencia hay retrabajos por falta de control final?", "etiqueta": "retrabajo", "requerida": true, "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "retrabajo-etapa", "tipo": "opcion_unica", "titulo": "¿En qué etapa suele fallar el control?", "etiqueta": "retrabajo", "opciones": ["Antes de instalar", "Durante la instalación", "Control final", "Entrega al cliente", "No sé"]}
      ]
    },
    {
      "id": "b-reclamos",
      "titulo": "Reclamos del cliente",
      "preguntas": [
        {"id": "reclamo-motivo", "tipo": "opcion_multiple", "titulo": "¿Cuál es el motivo más frecuente de reclamo del cliente?", "etiqueta": "reclamo", "opciones": ["Ruido", "Ajuste", "Filtración", "Expectativa mal comunicada", "Otro", "No sé"]},
        {"id": "reclamo-caso", "tipo": "texto_largo", "titulo": "Contános un caso reciente de reclamo", "etiqueta": "comentario", "placeholder": "Opcional"}
      ]
    },
    {
      "id": "b-stock",
      "titulo": "Stock y piezas",
      "preguntas": [
        {"id": "stock-frecuencia", "tipo": "escala", "titulo": "¿Con qué frecuencia falta stock o piezas al momento de instalar?", "etiqueta": "stock", "escala": {"min": 1, "max": 5, "etiquetaMin": "Nunca", "etiquetaMax": "Siempre"}},
        {"id": "stock-tipo", "tipo": "opcion_multiple", "titulo": "¿Qué suele faltar?", "etiqueta": "stock", "opciones": ["Producto principal", "Tornillería / soportes", "Insumos", "Piezas de repuesto", "Otro", "No sé"]}
      ]
    },
    {
      "id": "b-comunicacion",
      "titulo": "Comunicación interna",
      "preguntas": [
        {"id": "comunicacion-interna", "tipo": "opcion_unica", "titulo": "¿Cómo calificás la comunicación interna entre ventas, instalación y postventa?", "etiqueta": "comunicacion", "requerida": true, "opciones": ["Muy mala", "Mala", "Regular", "Buena", "Muy buena"]}
      ]
    },
    {
      "id": "b-severidad",
      "titulo": "Severidad general",
      "preguntas": [
        {"id": "severidad-general", "tipo": "opcion_unica", "titulo": "En general, ¿qué tan graves te parecen los errores que mencionaste en esta encuesta?", "etiqueta": "severidad", "requerida": true, "opciones": ["Leve", "Moderado", "Grave", "Muy grave"]}
      ]
    }
  ]
  $json$::jsonb
)
-- Idempotente y NO destructivo: re-ejecutar esta migración ACTUALIZA la
-- definición de la encuesta (intro + bloques/preguntas) sin tocar las
-- respuestas ya cargadas ni el estado (activa/borrador/cerrada) que se haya
-- fijado desde el panel.
on conflict (id) do update set
  titulo                  = excluded.titulo,
  descripcion             = excluded.descripcion,
  intro                   = excluded.intro,
  agradecimiento          = excluded.agradecimiento,
  comentario_final_titulo = excluded.comentario_final_titulo,
  bloques                 = excluded.bloques;
