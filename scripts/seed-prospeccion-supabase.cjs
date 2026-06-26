/**
 * Pickup 4x4 — Siembra Prospección Empresas en Supabase DIRECTO (sin la app / sin dev server).
 * Usa @supabase/supabase-js con el service role (bypassa RLS, como las API routes).
 * Lee el seed local public/data/prospeccion.json (NO commiteado) y lo persiste en
 * prospeccion_empresas + prospeccion_necesidades_producto, y siembra los catálogos
 * editables (rubros / etapas / tipos de actividad / departamentos) si están vacíos.
 *
 * NO destructivo / idempotente: upsert con onConflict "id" + ignoreDuplicates:true
 * ("on conflict do nothing") → nunca pisa filas que el operador ya editó.
 *
 * Variables (de .env.local o del entorno): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Requisito previo: ejecutar la migración supabase/migrations/20260625_prospeccion_empresas.sql
 * en el SQL Editor de Supabase.
 * Uso:  node scripts/seed-prospeccion-supabase.cjs   (o:  npm run prospeccion:seed:supabase)
 *
 * Para un reseed que SÍ pise (force), cambiar ignoreDuplicates a false (no recomendado).
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "data", "prospeccion.json");

// --- Cargar .env.local de forma mínima (sin dependencias) si faltan en el entorno ---
function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue; // el entorno tiene prioridad
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL || !KEY) {
  console.error("Faltan variables: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (revisá .env.local).");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error("No existe public/data/prospeccion.json. Ejecutá primero: npm run prospeccion:build");
  process.exit(1);
}

const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ── Catálogos por defecto ───────────────────────────────────────────────────
const RUBROS = [
  ["estado", "Estado uruguayo"],
  ["forestal", "Forestales"],
  ["constructora", "Constructoras"],
  ["telecomunicaciones", "Telecom / Internet / Cable"],
  ["climatizacion", "Aire acondicionado / climatización"],
  ["fachadas_altura", "Fachadas / altura / seguridad"],
  ["alquiladora", "Alquiladoras / flotas tercerizadas"],
  ["otro", "Otro / revisar"],
];
const ETAPAS = [
  ["lead_detectado", "Lead detectado"],
  ["llamada_inicial_pendiente", "Llamada inicial pendiente"],
  ["datos_basicos_relevados", "Datos básicos relevados"],
  ["referente_identificado", "Referente identificado"],
  ["visita_coordinada", "Visita coordinada"],
  ["presentacion_enviada", "Presentación enviada"],
  ["necesidades_relevadas", "Necesidades relevadas"],
  ["propuesta_preparacion", "Propuesta en preparación"],
  ["propuesta_enviada", "Propuesta enviada"],
  ["seguimiento_negociacion", "Seguimiento / negociación"],
  ["ganada", "Ganada"],
  ["perdida", "Perdida"],
  ["sin_oportunidad", "Sin oportunidad actual"],
];
const TIPOS_ACTIVIDAD = [
  ["llamada", "Llamada"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["reunion", "Reunión"],
  ["visita", "Visita"],
  ["enviar_propuesta", "Enviar propuesta"],
  ["validar_propuesta", "Validar propuesta"],
  ["seguimiento", "Seguimiento"],
  ["pedir_contacto", "Pedir contacto"],
  ["relevar_flota", "Relevar flota"],
  ["revisar_proveedor", "Revisar proveedor"],
  ["otro", "Otro"],
];
const DEPARTAMENTOS = [
  "Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno", "Flores",
  "Florida", "Lavalleja", "Maldonado", "Montevideo", "Paysandú", "Río Negro",
  "Rivera", "Rocha", "Salto", "San José", "Soriano", "Tacuarembó", "Treinta y Tres",
];

function empresaRow(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    nombre_canonico: slug(p.nombre),
    rubro: p.rubro ?? null,
    subrubro: p.subrubro ?? null,
    tipo_organizacion: p.tipoOrganizacion ?? null,
    direccion: p.direccion ?? null,
    departamento: p.departamento ?? null,
    ciudad: p.ciudad ?? null,
    localidad: p.localidad ?? null,
    web: p.web ?? null,
    fuente: p.fuente ?? null,
    etapa: p.etapa ?? null,
    prioridad: p.prioridad ?? null,
    semaforo: null,
    es_sugerida: Boolean(p.esSugerida),
    requiere_revision: Boolean(p.revisar),
    flota: p.flota ?? {},
    proveedor: p.proveedor ?? {},
    necesidades: p.necesidades ?? [],
    contactos: p.contactos ?? [],
    actividades: p.actividades ?? [],
    propuestas: p.propuestas ?? [],
    observaciones: p.observaciones ?? null,
    meta: {
      categoriaSugerida: p.categoriaSugerida ?? null,
      creadoEn: p.creadoEn ?? null,
      actualizadoEn: p.actualizadoEn ?? null,
      ultimoContacto: p.ultimoContacto ?? null,
    },
  };
}

function necesidadRow(o) {
  return {
    id: o.id,
    producto: o.producto,
    rubro: o.rubro ?? null,
    menciones: typeof o.menciones === "number" ? o.menciones : 1,
    potencial: o.potencial ?? null,
    estado: o.estado ?? null,
    empresas: o.empresaSolicitante ? [o.empresaSolicitante] : [],
    observaciones: o.comentario ?? null,
  };
}

async function upsertChunked(supabase, table, rows, label) {
  if (!rows.length) {
    console.log(`  ${label}: 0 filas en el seed.`);
    return;
  }
  const CHUNK = 200;
  let sent = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(slice, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`upsert ${table} [${i}]: ${error.message}`);
    sent += slice.length;
  }
  console.log(`  ${label}: ${sent} filas enviadas (existentes se conservan, on-conflict-do-nothing).`);
}

async function seedCatalogIfEmpty(supabase, table, rows, label) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log(`  ${label}: ya tiene ${count} filas, se omite.`);
    return;
  }
  const { error: insErr } = await supabase
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (insErr) throw new Error(`seed ${table}: ${insErr.message}`);
  console.log(`  ${label}: sembrado con ${rows.length} filas.`);
}

(async () => {
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const prospects = Array.isArray(data.prospects) ? data.prospects : [];
  const opps = Array.isArray(data.productOpportunities) ? data.productOpportunities : [];
  const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log("======= SEED PROSPECCIÓN → SUPABASE (service role, no destructivo) =======");
  console.log(`Seed local: prospects=${prospects.length} · productOpportunities=${opps.length}`);

  console.log("Empresas:");
  await upsertChunked(supabase, "prospeccion_empresas", prospects.map(empresaRow), "prospeccion_empresas");

  console.log("Oportunidades de producto:");
  await upsertChunked(supabase, "prospeccion_necesidades_producto", opps.map(necesidadRow), "prospeccion_necesidades_producto");

  console.log("Catálogos (solo si están vacíos):");
  await seedCatalogIfEmpty(
    supabase,
    "prospeccion_rubros",
    RUBROS.map(([id, nombre], i) => ({ id, nombre, descripcion: null, orden: i + 1, activo: true, meta: {} })),
    "prospeccion_rubros",
  );
  await seedCatalogIfEmpty(
    supabase,
    "prospeccion_etapas",
    ETAPAS.map(([id, nombre], i) => ({ id, nombre, descripcion: null, orden: i + 1, activo: true, meta: {} })),
    "prospeccion_etapas",
  );
  await seedCatalogIfEmpty(
    supabase,
    "prospeccion_tipos_actividad",
    TIPOS_ACTIVIDAD.map(([id, nombre], i) => ({ id, nombre, descripcion: null, orden: i + 1, activo: true, meta: {} })),
    "prospeccion_tipos_actividad",
  );

  // Departamentos: la migración ya los siembra; reforzamos idempotente (no falla si existen).
  console.log("Departamentos:");
  const deptoRows = DEPARTAMENTOS.map((nombre, i) => ({ id: slug(nombre), nombre, orden: i + 1, activo: true }));
  const { error: depErr } = await supabase
    .from("prospeccion_departamentos")
    .upsert(deptoRows, { onConflict: "id", ignoreDuplicates: true });
  if (depErr) throw new Error(`seed prospeccion_departamentos: ${depErr.message}`);
  console.log(`  prospeccion_departamentos: ${deptoRows.length} filas enviadas (idempotente).`);

  console.log("=================== FIN ===================");
  console.log("OK");
})().catch((e) => {
  console.error("SEED FALLÓ:", e.message);
  process.exit(1);
});
