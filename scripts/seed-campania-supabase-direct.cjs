/**
 * Pickup 4x4 — Persiste la campaña de recambio en Supabase DIRECTO (sin la app / sin dev server).
 * Usa @supabase/supabase-js con el service role (bypassa RLS, como las API routes).
 * Lee la salida computada del pipeline (public/data/recambio.json) y la guarda en
 * commercial_campaigns (preset "recambio") + commercial_campaign_results.
 *
 * Idempotente: reusa el id de la campaña preset "recambio" si existe (misma identidad);
 * si no, la crea. Reemplaza siempre los results (delete + insert).
 *
 * Variables (de .env.local o del entorno): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Uso:  node scripts/seed-campania-supabase-direct.cjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "data", "recambio.json");
const PRESET = "recambio";

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
  console.error("No existe public/data/recambio.json. Ejecutá primero: node scripts/build-campania.cjs");
  process.exit(1);
}

function resultRow(campaignId, it) {
  return {
    campaign_id: campaignId,
    customer_number: it.cuenta || null,
    customer_name: it.razonSocial || null,
    fantasy_name: null,
    email: it.email || null,       // del LISTADO DE CUENTAS (cruce por CUENTA); null si no hay
    phone: it.telefono || null,
    whatsapp: it.celular || null,
    locality: it.zona || null,
    article_code: null,
    article_description: it.productoActual || null,
    sale_date: it.ultimaCompra || null,
    sale_age_months: typeof it.mesesDesdeUltima === "number" ? it.mesesDesdeUltima : null,
    invoice_number: null,
    compatible_vehicle: null,
    match_confidence: it.prioridad || null,
    suggested_action: it.recomendacion || null,
    observations: `${it.prioridad} · ${it.estadoContactabilidad}` + (it.productoSugerido ? ` · ${it.productoSugerido}` : ""),
    raw_json: it, // roundtrip fiel para la UI
  };
}

(async () => {
  const camp = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const meta = {
    name: "Recambio cubre cajas / lonas",
    type: "recambio",
    preset: PRESET,
    description: "Clientes que compraron cubre caja / lona, priorizados por antigüedad de la última compra para ofrecer recambio.",
    objective: "Contactar primero a quienes compraron hace más tiempo y ofrecer la renovación del cubre caja / lona.",
    status: "active",
    quality_summary_json: {
      generadoEl: camp.generadoEl,
      resumen: camp.resumen,
      origen: {
        datasets: ["ranking_articulos_2023..2026.xlsx", "Diario-20260619-084547.xls"],
        pipeline: "scripts/build-campania.cjs",
        llave: "CUENTA (RUT secundario)",
      },
    },
  };

  // 1) Buscar campaña existente por preset (idempotencia / misma identidad)
  const { data: found, error: findErr } = await supabase
    .from("commercial_campaigns")
    .select("id")
    .eq("preset", PRESET)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (findErr) throw new Error(`buscar campaña: ${findErr.message}`);

  let id;
  if (found && found.length) {
    id = found[0].id;
    const { error } = await supabase.from("commercial_campaigns").update(meta).eq("id", id);
    if (error) throw new Error(`update campaña: ${error.message}`);
    console.log(`Campaña existente reutilizada (misma identidad): ${id}`);
  } else {
    const { data, error } = await supabase.from("commercial_campaigns").insert(meta).select("id").single();
    if (error) throw new Error(`insert campaña: ${error.message}`);
    id = data.id;
    console.log(`Campaña creada: ${id}`);
  }

  // 2) Reemplazar results (delete + insert por lotes)
  const { error: delErr } = await supabase.from("commercial_campaign_results").delete().eq("campaign_id", id);
  if (delErr) throw new Error(`delete results: ${delErr.message}`);

  const rows = camp.items.map((it) => resultRow(id, it));
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("commercial_campaign_results").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`insert results [${i}]: ${error.message}`);
    inserted += Math.min(CHUNK, rows.length - i);
  }

  console.log(`Persistida en Supabase (directo): id=${id} · results=${inserted} · resumen total=${camp.resumen.total}`);
  console.log("OK");
})().catch((e) => { console.error("SEED FALLÓ:", e.message); process.exit(1); });
