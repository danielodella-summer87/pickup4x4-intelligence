/**
 * Pickup 4x4 — Reporte HTML legible de la campaña de recambio (cubre caja + lona).
 * Lee la base operativa vigente (CAMPANIA_recambio_FINAL.csv) y genera un único HTML autocontenido
 * para LECTURA COMERCIAL: resumen ejecutivo + ranking de candidatos + oportunidades agrupadas.
 * No inventa datos. No toca la app. Fecha referencia: 2026-06-19.
 */
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "output");
const S = (v) => (v == null ? "" : String(v).trim());
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function parseCSV(text) {
  const out = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch === "\r") {} else cur += ch; }
  if (cur.length || row.length) { row.push(cur); out.push(row); } return out;
}

const raw = parseCSV(fs.readFileSync(path.join(OUT, "CAMPANIA_recambio_FINAL.csv"), "utf8")).filter((r) => r.length > 1);
const head = raw.shift();
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const data = raw.map((r) => Object.fromEntries(head.map((h, i) => [h, S(r[i])])));

const RANK = { "Prioridad alta": 4, "Prioridad media": 3, "Prioridad baja": 2, "No contactar todavía": 1, "No contactar (no identificable)": 0 };
const PCLASS = { "Prioridad alta": "alta", "Prioridad media": "media", "Prioridad baja": "baja", "No contactar todavía": "no", "No contactar (no identificable)": "anon" };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// --- Contactabilidad real (con lo que existe hoy: nunca tel/email) ---
function contactab(d) {
  if (d.estado_llave_cruce.startsWith("REVISAR")) return { txt: "Revisar llave antes de contactar", cls: "warn" };
  if (d.localidad && d.vendedor_real) return { txt: "Ubicable: zona + vendedor", cls: "ok" };
  if (d.localidad) return { txt: "Ubicable: zona", cls: "ok" };
  if (d.rut) return { txt: "Solo cuenta/RUT", cls: "warn" };
  return { txt: "Mínimo (sin zona ni RUT)", cls: "bad" };
}
// "Listo para trabajar" = candidato contactable, ubicable y sin alerta de llave
const esCandidato = (d) => RANK[d.prioridad_comercial] >= 2; // alta/media/baja
const listoParaTrabajar = (d) => esCandidato(d) && !!d.localidad && !d.estado_llave_cruce.startsWith("REVISAR") && !!d.rut;

// --- Conteos ---
const tot = data.length;
const byPrio = {}; data.forEach((d) => byPrio[d.prioridad_comercial] = (byPrio[d.prioridad_comercial] || 0) + 1);
const candidatos = data.filter(esCandidato);
const listos = data.filter(listoParaTrabajar);
const reqInfo = candidatos.filter((d) => !listoParaTrabajar(d));
const conRut = data.filter((d) => d.rut).length;
const conZona = data.filter((d) => d.localidad).length;
const conVend = data.filter((d) => d.vendedor_real).length;

const freq = (arr, key) => { const m = {}; arr.forEach((d) => { const k = d[key] || "(sin dato)"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const tipoFreq = freq(data, "tipo_cubierta");
const vehFreq = freq(candidatos, "categoria_vehiculo");
const zonaFreq = freq(candidatos.filter((d) => d.localidad), "localidad");
const vendFreq = freq(candidatos.filter((d) => d.vendedor_real), "vendedor_real");
// producto más frecuente (recortado)
const prodM = {}; candidatos.forEach((d) => { const k = d.producto_linea.slice(0, 46); prodM[k] = (prodM[k] || 0) + 1; });
const prodFreq = Object.entries(prodM).sort((a, b) => b[1] - a[1]).slice(0, 10);

// --- Ranking ordenado (solo candidatos: alta/media/baja) ---
const ranking = [...candidatos].sort((a, b) =>
  RANK[b.prioridad_comercial] - RANK[a.prioridad_comercial] ||
  num(b.meses_desde_ultima) - num(a.meses_desde_ultima) ||
  num(b.n_compras) - num(a.n_compras));

// --- Patrones comerciales (derivados, no inventados) ---
const reventa = candidatos.filter((d) => /reventa\/taller/.test(d.observacion)).length;
const viejos3a = candidatos.filter((d) => num(d.meses_desde_ultima) >= 36).length;
const recurrentes = candidatos.filter((d) => num(d.n_compras) >= 2).length;
const patrones = [
  `<b>${candidatos.length}</b> candidatos contactables (alta+media+baja). El resto (${tot - candidatos.length}) compró hace &lt;6 meses o no es identificable.`,
  `<b>${viejos3a}</b> candidatos con la última compra hace <b>≥3 años</b>: máxima urgencia de recambio.`,
  `<b>${recurrentes}</b> candidatos son recurrentes (≥2 compras) — relación ya existente, más fácil de reactivar.`,
  `<b>${reventa}</b> candidatos tienen perfil reventa/taller: requieren un pitch distinto (volumen / mostrador), no recambio individual.`,
  `Producto dominante: <b>${esc(prodFreq[0] ? prodFreq[0][0] : "")}</b>; vehículos top: <b>${vehFreq.slice(0,3).map(([k])=>esc(k)).join(", ")}</b>.`,
  `<b>0</b> cuentas con teléfono/email (no existe esa fuente en el proyecto): el contacto directo está frenado hasta conseguir ese export.`,
];

// --- HTML ---
const card = (n, label, cls) => `<div class="card ${cls}"><div class="n">${n}</div><div class="l">${label}</div></div>`;
const tableFreq = (rows, h1, h2, max = 12) => `<table><thead><tr><th>${h1}</th><th class="r">${h2}</th></tr></thead><tbody>` +
  rows.slice(0, max).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${v}</td></tr>`).join("") + `</tbody></table>`;

const rankingRows = ranking.map((d, i) => {
  const c = contactab(d);
  return `<tr class="p-${PCLASS[d.prioridad_comercial]}">
    <td class="r">${i + 1}</td>
    <td>${esc(d.cuenta)}</td>
    <td><b>${esc(d.razon_social)}</b>${d.cuentas_fusionadas ? `<span class="tag">unificada ${esc(d.cuentas_fusionadas)}</span>` : ""}</td>
    <td>${esc(d.localidad || "—")}</td>
    <td class="prod">${esc(d.producto_linea)}<span class="sub">${esc(d.tipo_cubierta)} · ${esc(d.categoria_vehiculo)}</span></td>
    <td>${esc(d.ultima_compra)}</td>
    <td class="r">${d.meses_desde_ultima}</td>
    <td class="r">${d.n_compras}</td>
    <td><span class="pill ${PCLASS[d.prioridad_comercial]}">${esc(d.prioridad_comercial.replace("Prioridad ", ""))}</span></td>
    <td>${esc(d.recomendacion_accion)}</td>
    <td><span class="dot ${c.cls}"></span>${esc(c.txt)}</td>
  </tr>`;
}).join("");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campaña recambio cubre cajas / lonas — Pickup 4x4</title>
<style>
:root{--alta:#d63b3b;--media:#e08a1e;--baja:#c7a912;--no:#8a8f98;--ok:#2e9e5b;--warn:#e08a1e;--bad:#d63b3b}
*{box-sizing:border-box}body{font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2127;margin:0;background:#f5f6f8}
.wrap{max-width:1180px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:17px;margin:30px 0 10px;border-bottom:2px solid #e6e8eb;padding-bottom:6px}
.muted{color:#6b7178}.disc{background:#fff5e6;border:1px solid #f0d9a8;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:13px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.card{background:#fff;border:1px solid #e6e8eb;border-radius:10px;padding:12px 16px;min-width:120px;flex:1}
.card .n{font-size:24px;font-weight:700}.card .l{font-size:12px;color:#6b7178}
.card.alta{border-top:3px solid var(--alta)}.card.media{border-top:3px solid var(--media)}.card.baja{border-top:3px solid var(--baja)}.card.no{border-top:3px solid var(--no)}.card.ok{border-top:3px solid var(--ok)}.card.bad{border-top:3px solid var(--bad)}
ul.pat{margin:8px 0;padding-left:18px}ul.pat li{margin:5px 0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6e8eb;border-radius:8px;overflow:hidden;font-size:13px}
th,td{padding:7px 9px;text-align:left;border-bottom:1px solid #eef0f2;vertical-align:top}
th{background:#fafbfc;font-size:12px;color:#4a5059;position:sticky;top:0}
td.r,th.r{text-align:right}
.cols{display:flex;flex-wrap:wrap;gap:18px}.cols>div{flex:1;min-width:280px}
.prod{max-width:280px}.prod .sub{display:block;font-size:11px;color:#8a8f98}
.pill{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:600;color:#fff}
.pill.alta{background:var(--alta)}.pill.media{background:var(--media)}.pill.baja{background:var(--baja)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.dot.ok{background:var(--ok)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.tag{display:inline-block;margin-left:6px;font-size:10px;color:#6b7178;background:#eef0f2;border-radius:4px;padding:0 5px}
tr.p-alta td:first-child{box-shadow:inset 3px 0 0 var(--alta)}
.scroll{max-height:560px;overflow:auto;border-radius:8px;border:1px solid #e6e8eb}
.scroll table{border:0}
.foot{margin:24px 0 8px;color:#8a8f98;font-size:12px}
</style></head><body><div class="wrap">

<h1>Campaña de recambio — cubre cajas / lonas</h1>
<div class="muted">Pickup 4x4 Intelligence · standalone · referencia 2026-06-19 · ${tot} cuentas en la base</div>
<div class="disc"><b>Dato clave:</b> la base <b>no</b> tiene teléfono ni email (no existe esa fuente en el proyecto). Hoy las cuentas son <b>ubicables por zona y vendedor</b>, no contactables por llamada/mail. El contacto directo queda frenado hasta conseguir ese export.</div>

<h2>1 · Resumen ejecutivo</h2>
<div class="cards">
  ${card(tot, "Candidatos totales", "")}
  ${card(byPrio["Prioridad alta"] || 0, "Prioridad alta", "alta")}
  ${card(byPrio["Prioridad media"] || 0, "Prioridad media", "media")}
  ${card(byPrio["Prioridad baja"] || 0, "Prioridad baja", "baja")}
  ${card((byPrio["No contactar todavía"] || 0) + (byPrio["No contactar (no identificable)"] || 0), "No contactar aún", "no")}
</div>
<div class="cards">
  ${card(listos.length, "Listos para trabajar (ubicables + RUT, sin alertas)", "ok")}
  ${card(reqInfo.length, "Candidatos que requieren más info", "bad")}
  ${card(`${Math.round(conZona / tot * 100)}%`, "Con zona", "")}
  ${card(`${Math.round(conRut / tot * 100)}%`, "Con RUT", "")}
  ${card("0", "Con teléfono/email", "bad")}
</div>
<b>Patrones comerciales</b>
<ul class="pat">${patrones.map((p) => `<li>${p}</li>`).join("")}</ul>

<h2>2 · Ranking principal de candidatos <span class="muted">(${ranking.length} contactables, ordenados por prioridad y antigüedad)</span></h2>
<div class="scroll"><table><thead><tr>
  <th class="r">#</th><th>Cuenta</th><th>Razón social</th><th>Zona</th><th>Producto actual (recambio a ofrecer)</th>
  <th>Últ. compra</th><th class="r">Meses</th><th class="r">Compras</th><th>Prioridad</th><th>Acción recomendada</th><th>Contactabilidad</th>
</tr></thead><tbody>${rankingRows}</tbody></table></div>
<div class="muted" style="margin-top:6px">“Producto actual” = la cubierta que ya compró; el recambio es ofrecerle reemplazarla. No se muestran las ${tot - ranking.length} cuentas “no contactar” (compra reciente o no identificable).</div>

<h2>3 · Oportunidades agrupadas</h2>
<div class="cols">
  <div><b>Por tipo de cubierta</b> (toda la base)${tableFreq(tipoFreq, "Tipo", "Cuentas")}</div>
  <div><b>Por vehículo / modelo</b> (candidatos)${tableFreq(vehFreq, "Vehículo", "Cuentas")}</div>
</div>
<div class="cols" style="margin-top:16px">
  <div><b>Por zona</b> (candidatos con localidad)${tableFreq(zonaFreq, "Localidad", "Cuentas")}</div>
  <div><b>Por vendedor</b> (candidatos con vendedor real)${tableFreq(vendFreq, "Vendedor", "Cuentas")}</div>
</div>
<div class="cols" style="margin-top:16px">
  <div><b>Productos más frecuentes</b> (candidatos)${tableFreq(prodFreq, "Producto", "Cuentas", 10)}</div>
  <div><b>Estado para trabajar</b>${tableFreq([["Listos (ubicables + RUT, sin alertas)", listos.length],["Requieren más info (sin RUT / sin zona / a revisar)", reqInfo.length],["Frenados por falta de tel/email (todos)", candidatos.length]], "Situación", "Cuentas", 5)}</div>
</div>

<div class="foot">Generado desde CAMPANIA_recambio_FINAL.csv · sin datos inventados · cubre cajas (rígido) + lonas marítimas.</div>
</div></body></html>`;

fs.writeFileSync(path.join(OUT, "CAMPANIA_recambio_REPORTE.html"), html);
console.log("Reporte generado: scripts/output/CAMPANIA_recambio_REPORTE.html");
console.log(`  Candidatos: ${candidatos.length} | Listos para trabajar: ${listos.length} | Requieren más info: ${reqInfo.length} | Con tel/email: 0`);
console.log(`  Prioridad alta ${byPrio["Prioridad alta"]||0} · media ${byPrio["Prioridad media"]||0} · baja ${byPrio["Prioridad baja"]||0} · no contactar ${(byPrio["No contactar todavía"]||0)+(byPrio["No contactar (no identificable)"]||0)}`);
