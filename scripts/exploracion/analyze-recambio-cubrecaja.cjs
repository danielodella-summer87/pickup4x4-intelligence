/**
 * Pickup 4x4 — Campaña de RECAMBIO de CUBRE CAJAS (standalone, unidades).
 *
 * Objetivo: detectar clientes que compraron cubre caja HACE MÁS TIEMPO para ofrecerles reemplazo.
 * Variable rectora: ANTIGÜEDAD de la ÚLTIMA compra de cubre caja (más vieja = más prioridad).
 * Orden de priorización (explícito): 1) antigüedad última compra  2) frecuencia (nº compras)  3) cantidad.
 * Compras muy recientes (<6 meses) → baja prioridad / excluir (acaban de renovar).
 *
 * Fuente: ranking_articulos_2023..2026.xlsx (detalle artículo↔cliente↔fecha↔cantidad). Sin importe → unidades.
 * Universo cubre cajas: Grupo "Cubre Cajas" o descripción ~ /cubre caja/i.
 * Fecha de referencia (hoy): 2026-06-19 (fin del período del ranking 2026).
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "..", "public", "imports");
const OUT = path.join(__dirname, "output");
fs.mkdirSync(OUT, { recursive: true });
const REF = new Date("2026-06-19");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const S = (v) => (v == null ? "" : String(v).trim());
const months = (d) => Math.round((REF - d) / (1000 * 60 * 60 * 24 * 30.44));
const isCubre = (grupo, desc) => /cubre\s*caja/i.test(grupo) || /cubre\s*caja/i.test(desc);
const isAnon = (razon) => /consumo final|consumidor final|mostrador|sin datos|mercado libre/i.test(razon);
const csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");

// --- Parseo de líneas de cubre caja ---
const cubreLines = [];
for (const y of ["2023", "2024", "2025", "2026"]) {
  const wb = XLSX.readFile(path.join(DIR, `ranking_articulos_${y}.xlsx`), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  let grupo = "";
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    if (S(r[3])) grupo = S(r[3]);
    const codigo = S(r[6]), cuenta = S(r[12]), nroComp = S(r[11]), desc = S(r[7]);
    if (!codigo || !cuenta || !nroComp) continue;
    if (!isCubre(grupo, desc)) continue;
    const fecha = r[9] instanceof Date ? r[9] : (r[9] ? new Date(r[9]) : null);
    if (!fecha || isNaN(fecha)) continue;
    cubreLines.push({ codigo, desc, cuenta, razon: S(r[13]), nroComp, fecha, cant: num(r[14]) });
  }
}
console.log("================ CAMPAÑA RECAMBIO CUBRE CAJAS ================\n");
console.log(`Líneas de cubre caja: ${cubreLines.length} | artículos: ${new Set(cubreLines.map(l=>l.codigo)).size} | cuentas: ${new Set(cubreLines.map(l=>l.cuenta)).size}`);
console.log(`Fecha de referencia (hoy): ${REF.toISOString().slice(0,10)}\n`);

// --- Agregado por cliente (solo compras reales: cant > 0) ---
const byCli = new Map();
for (const l of cubreLines) {
  if (l.cant <= 0) continue; // NC / devoluciones no cuentan como compra para recencia
  let c = byCli.get(l.cuenta);
  if (!c) { c = { cuenta: l.cuenta, razon: l.razon, unidades: 0, comps: new Set(), fechas: [], modelos: new Map() }; byCli.set(l.cuenta, c); }
  if (!c.razon && l.razon) c.razon = l.razon;
  c.unidades += l.cant; c.comps.add(l.nroComp); c.fechas.push(l.fecha);
  c.modelos.set(l.desc, (c.modelos.get(l.desc) || 0) + l.cant);
}

function tier(m) {
  if (m < 6) return { p: "EXCLUIR (reciente)", rank: 0 };
  if (m < 12) return { p: "Baja", rank: 1 };
  if (m < 24) return { p: "Media", rank: 2 };
  if (m < 36) return { p: "Alta", rank: 3 };
  return { p: "Muy alta", rank: 4 };
}

const clientes = [...byCli.values()].map((c) => {
  const ult = new Date(Math.max(...c.fechas.map(d=>d.getTime())));
  const pri = new Date(Math.min(...c.fechas.map(d=>d.getTime())));
  const m = months(ult);
  const t = tier(m);
  const nCompras = c.comps.size;
  const recurrente = nCompras >= 2;
  const modelos = [...c.modelos.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  let obs = [];
  if (recurrente && t.rank >= 3) obs.push("comprador recurrente enfriado");
  if (t.rank === 4) obs.push("última compra >3 años");
  if (isAnon(c.razon)) obs.push("cuenta anónima/mostrador — no contactable");
  return { cuenta: c.cuenta, razon: c.razon, ultima: ult.toISOString().slice(0,10), meses: m,
    primera: pri.toISOString().slice(0,10), unidades: Math.round(c.unidades), nCompras, recurrente,
    modelo: modelos[0] || "", nModelos: modelos.length, tier: t.p, tierRank: t.rank,
    anon: isAnon(c.razon), obs: obs.join("; ") };
});

// Score de priorización: tier (antigüedad) domina; luego frecuencia; luego cantidad.
const contactables = clientes.filter((c) => !c.anon && c.tierRank >= 1);
contactables.sort((a, b) => b.tierRank - a.tierRank || b.nCompras - a.nCompras || b.unidades - a.unidades || b.meses - a.meses);

// --- CSV de campaña ---
fs.writeFileSync(path.join(OUT, "campania_recambio_cubrecaja.csv"), csv([
  ["prioridad","cuenta","razon_social","ultima_compra","meses_desde_ultima","primera_compra","unidades_hist","n_compras","modelo_principal","n_modelos","observaciones"],
  ...contactables.map((c) => [c.tier,c.cuenta,c.razon,c.ultima,c.meses,c.primera,c.unidades,c.nCompras,c.modelo,c.nModelos,c.obs]),
]));

// --- Distribución por tramo ---
const dist = {}; clientes.forEach((c) => dist[c.tier] = (dist[c.tier]||0)+1);
console.log("# Distribución de cuentas por antigüedad de última compra de cubre caja:");
["Muy alta","Alta","Media","Baja","EXCLUIR (reciente)"].forEach((k)=>console.log(`  ${k.padEnd(20)} ${String(dist[k]||0).padStart(4)} cuentas`));
const anonCount = clientes.filter(c=>c.anon).length;
console.log(`  (de las cuales anónimas/mostrador excluidas: ${anonCount})`);

console.log(`\n# Cuentas contactables priorizadas: ${contactables.length}`);
console.log("\n# TOP 20 PARA CONTACTAR (más antiguas primero; luego recurrencia y volumen):");
console.log("  Pri        Cuenta  Razón social                  Últ.compra  Meses  Compras  Unid  Modelo");
contactables.slice(0, 20).forEach((c) => console.log(
  `  ${c.tier.padEnd(9)} ${c.cuenta.padEnd(6)} ${c.razon.slice(0,28).padEnd(28)} ${c.ultima}  ${String(c.meses).padStart(4)}  ${String(c.nCompras).padStart(6)}  ${String(c.unidades).padStart(4)}  ${c.modelo.slice(0,26)}`));

console.log("\n# Foco: compradores RECURRENTES que se enfriaron (≥2 compras, última ≥2 años) — máxima conversión esperada:");
contactables.filter(c=>c.recurrente && c.tierRank>=3).slice(0,12).forEach((c)=>console.log(
  `  ${c.cuenta.padEnd(6)} ${c.razon.slice(0,30).padEnd(30)} ${c.nCompras} compras, últ ${c.ultima} (${c.meses}m), ${c.unidades}u`));

console.log("\nCSV escrito: scripts/output/campania_recambio_cubrecaja.csv");
console.log("================ FIN ================");
