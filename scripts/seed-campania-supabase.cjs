/**
 * Pickup 4x4 — Persiste la campaña de recambio (cubre caja + lona) en Supabase.
 * Lee la salida computada del pipeline (public/data/recambio.json) y la guarda como una
 * campaña persistida usando las API routes existentes (service role) — NO toca la DB directo.
 *
 * Idempotente: si ya existe una campaña con preset "recambio", reusa su id (misma identidad)
 * y reemplaza meta + results; si no, la crea. Regenerar = correr el pipeline y volver a correr este seed.
 *
 * Uso:  node scripts/seed-campania-supabase.cjs            (usa http://localhost:3000)
 *       BASE_URL=http://localhost:3137 node scripts/seed-campania-supabase.cjs
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PRESET = "recambio";
const SRC = path.join(__dirname, "..", "public", "data", "recambio.json");

async function jfetch(url, opts) {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body.ok === false) {
    throw new Error(`${opts?.method || "GET"} ${url} -> ${res.status}: ${body.errorMessage || text.slice(0, 200)}`);
  }
  return body;
}

function toResult(it) {
  return {
    customerNumber: it.cuenta || null,
    customerName: it.razonSocial || null,
    fantasyName: null,
    email: null,          // no existe la fuente en el proyecto: no se inventa
    phone: null,
    whatsapp: null,
    locality: it.zona || null,
    articleCode: null,
    articleDescription: it.productoActual || null,
    saleDate: it.ultimaCompra || null,
    saleAgeMonths: typeof it.mesesDesdeUltima === "number" ? it.mesesDesdeUltima : null,
    invoiceNumber: null,
    compatibleVehicle: null,
    matchConfidence: it.prioridad || null,
    suggestedAction: it.recomendacion || null,
    observations: `${it.prioridad} · ${it.estadoContactabilidad}` + (it.productoSugerido ? ` · ${it.productoSugerido}` : ""),
    raw: it, // roundtrip fiel: prioridad, productoSugerido, estadoContactabilidad, vendedor, flags...
  };
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error("No existe public/data/recambio.json. Ejecutá primero: node scripts/build-campania.cjs");
    process.exit(1);
  }
  const camp = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const meta = {
    name: "Recambio cubre cajas / lonas",
    type: "recambio",
    preset: PRESET,
    description: "Clientes que compraron cubre caja / lona, priorizados por antigüedad de la última compra para ofrecer recambio.",
    objective: "Contactar primero a quienes compraron hace más tiempo y ofrecer la renovación del cubre caja / lona.",
    status: "active",
    filters: null,
    qualitySummary: {
      generadoEl: camp.generadoEl,
      resumen: camp.resumen,
      origen: {
        datasets: ["ranking_articulos_2023..2026.xlsx", "Diario-20260619-084547.xls"],
        pipeline: "scripts/build-campania.cjs",
        llave: "CUENTA (RUT secundario)",
      },
    },
  };

  // 1) Buscar campaña existente (idempotencia por preset)
  const list = await jfetch(`${BASE}/api/campaigns`);
  const existing = (list.campaigns || []).find((c) => c.preset === PRESET);

  let id;
  if (existing) {
    id = existing.id;
    await jfetch(`${BASE}/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(meta) });
    console.log(`Campaña existente reutilizada (misma identidad): ${id}`);
  } else {
    const created = await jfetch(`${BASE}/api/campaigns`, { method: "POST", body: JSON.stringify(meta) });
    id = created.campaign.id;
    console.log(`Campaña creada: ${id}`);
  }

  // 2) Reemplazar results (delete + insert) con los items computados
  const results = camp.items.map(toResult);
  const saved = await jfetch(`${BASE}/api/campaigns/${id}/results`, { method: "POST", body: JSON.stringify({ results }) });

  console.log(`Persistida en Supabase: id=${id} · results=${saved.count} · resumen total=${camp.resumen.total}`);
  console.log("OK");
})().catch((e) => { console.error("SEED FALLÓ:", e.message); process.exit(1); });
