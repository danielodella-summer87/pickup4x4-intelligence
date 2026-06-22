/**
 * Pickup 4x4 Intelligence — Análisis comercial de archivos importados (read-only).
 *
 * Fuentes de verdad (no se cruzan donde los datos no lo permiten):
 *  - consolidado_articulos_2023_2026.xlsx → ranking histórico de artículos (unidades/año). Clave: Cod. Único.
 *  - reporte_lonas_2023_2026_normalizado.xlsx → rotación mensual + stock de la línea lonas. Clave: Código (= Cod. Único). Header en fila 3.
 *  - Diario-20260619-084547.xls → actividad comercial a nivel comprobante (facturación/cliente/vendedor). Clave: Nro.Cuenta. SIN detalle de artículo.
 *
 * Limitación estructural: el Diario no tiene código de artículo → no hay cruce venta↔artículo (ni facturación por artículo) con estos insumos.
 */
const XLSX = require("xlsx");
const path = require("path");
const DIR = path.join(__dirname, "..", "..", "public", "imports");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => "U$S " + Math.round(n).toLocaleString("en-US");
const idxOf = (head, re) => head.findIndex((h) => re.test(String(h)));

function load(file, sheet, headerRow) {
  const wb = XLSX.readFile(path.join(DIR, file), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false });
  return { head: rows[headerRow], data: rows.slice(headerRow + 1).filter((r) => r && r.some((c) => c != null)) };
}

console.log("================ PICKUP 4x4 — ANÁLISIS COMERCIAL ================\n");

/* ---------- 1) CONSOLIDADO: ranking de artículos ---------- */
const C = load("consolidado_articulos_2023_2026.xlsx", "Consolidado", 0);
const ci = {
  cod: idxOf(C.head, /^Cod\. ?Único/i), desc: idxOf(C.head, /Descripci/i), grupo: idxOf(C.head, /^Grupo/i),
  y23: idxOf(C.head, /2023$/), y24: idxOf(C.head, /2024$/), y25: idxOf(C.head, /2025$/),
  ytd: idxOf(C.head, /2026.*YTD/i), tot: idxOf(C.head, /Total/i), stock: idxOf(C.head, /Stock/i),
};
const arts = C.data.map((r) => ({
  cod: String(r[ci.cod]).trim(), desc: String(r[ci.desc] || ""), grupo: String(r[ci.grupo] || ""),
  y23: num(r[ci.y23]), y24: num(r[ci.y24]), y25: num(r[ci.y25]), ytd: num(r[ci.ytd]),
  tot: num(r[ci.tot]), stock: num(r[ci.stock]),
}));
const sum = (k) => arts.reduce((a, x) => a + x[k], 0);
console.log(`# 1. CONSOLIDADO — ${arts.length} artículos | unidades 2023-2026: ${sum("tot").toLocaleString()}`);
console.log("\nTop 12 por unidades 2023-2026:");
[...arts].sort((a, b) => b.tot - a.tot).slice(0, 12).forEach((a, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. ${a.cod.padEnd(12)} ${a.desc.slice(0, 34).padEnd(34)} tot=${String(a.tot).padStart(5)}  '25=${String(a.y25).padStart(4)} '26YTD=${String(a.ytd).padStart(4)} stk=${a.stock}`));

console.log("\nMomentum (2026 YTD anualizado ×2 vs 2025, con base relevante ≥30 u/2025):");
[...arts].filter((a) => a.y25 >= 30).map((a) => ({ ...a, g: (a.ytd * 2) - a.y25 }))
  .sort((a, b) => b.g - a.g).slice(0, 8)
  .forEach((a) => console.log(`  ↑ ${a.cod.padEnd(12)} ${a.desc.slice(0, 30).padEnd(30)} '25=${String(a.y25).padStart(4)} '26YTD=${String(a.ytd).padStart(4)} (proy=${a.ytd*2})`));

console.log("\nRiesgo quiebre (demanda reciente alta, stock bajo: stock < 2026 YTD):");
[...arts].filter((a) => a.ytd >= 15 && a.stock < a.ytd).sort((a, b) => b.ytd - a.ytd).slice(0, 10)
  .forEach((a) => console.log(`  ! ${a.cod.padEnd(12)} ${a.desc.slice(0, 32).padEnd(32)} '26YTD=${String(a.ytd).padStart(4)} stock=${String(a.stock).padStart(4)}`));

const dead = arts.filter((a) => a.stock > 0 && a.y25 === 0 && a.ytd === 0);
console.log(`\nStock inmovilizado (stock>0 y 0 ventas 2025-2026): ${dead.length} artículos, ${dead.reduce((s,a)=>s+a.stock,0)} unidades retenidas`);
[...dead].sort((a, b) => b.stock - a.stock).slice(0, 6).forEach((a) => console.log(`  · ${a.cod.padEnd(12)} ${a.desc.slice(0,32).padEnd(32)} stock=${a.stock}`));

/* ---------- 2) LONAS: rotación mensual ---------- */
const L = load("reporte_lonas_2023_2026_normalizado.xlsx", "Rotacion_Normalizada", 2);
const lcod = 0, ldesc = 1, lstockFis = idxOf(L.head, /Stock F[íi]sico/i);
const venCols = L.head.map((h, i) => ({ h: String(h), i })).filter((c) => /Ven\.?$/i.test(c.h));
const recentCols = venCols.slice(0, 6).map((c) => c.i); // las 6 más recientes (06/26..01/26)
const lonas = L.data.map((r) => ({
  cod: String(r[lcod]).trim(), desc: String(r[ldesc] || ""), stock: num(r[lstockFis]),
  totVen: venCols.reduce((a, c) => a + num(r[c.i]), 0),
  recVen: recentCols.reduce((a, i) => a + num(r[i]), 0),
}));
console.log(`\n\n# 2. LONAS — ${lonas.length} productos | ${venCols.length} meses | unidades período: ${lonas.reduce((s,x)=>s+x.totVen,0).toLocaleString()}`);
console.log("Top 10 lonas por rotación (período completo):");
[...lonas].sort((a, b) => b.totVen - a.totVen).slice(0, 10).forEach((a, i) =>
  console.log(`  ${String(i+1).padStart(2)}. ${a.cod.padEnd(12)} ${a.desc.slice(0,34).padEnd(34)} tot=${String(a.totVen).padStart(4)} últ6m=${String(a.recVen).padStart(3)} stk=${a.stock}`));
const lonaDead = lonas.filter((a) => a.stock > 0 && a.recVen === 0);
console.log(`\nLonas con stock inmovilizado (stock>0, 0 ventas últimos 6m): ${lonaDead.length} | unidades: ${lonaDead.reduce((s,a)=>s+a.stock,0)}`);
[...lonaDead].sort((a,b)=>b.stock-a.stock).slice(0,6).forEach((a)=>console.log(`  · ${a.cod.padEnd(12)} ${a.desc.slice(0,34).padEnd(34)} stock=${a.stock}`));

/* ---------- 3) DIARIO: comercial ---------- */
const D = load("Diario-20260619-084547.xls", "Diario", 0);
const di = { fecha: 0, cuenta: idxOf(D.head, /Nro\.?Cuenta/i), nombre: idxOf(D.head, /Nombre Cuenta/i),
  comp: idxOf(D.head, /Comprob/i), total: idxOf(D.head, /^Total$/i), vend: idxOf(D.head, /Vend\.?Comp/i) };
const ventas = D.data.filter((r) => r[di.cuenta] != null && num(r[di.total]) !== 0).map((r) => ({
  fecha: r[di.fecha] instanceof Date ? r[di.fecha] : new Date(r[di.fecha]),
  cuenta: String(r[di.cuenta]).trim(), nombre: String(r[di.nombre] || ""),
  comp: String(r[di.comp] || ""), total: num(r[di.total]), vend: String(r[di.vend] || "").trim(),
}));
const totalFact = ventas.reduce((a, v) => a + v.total, 0);
console.log(`\n\n# 3. DIARIO — ${ventas.length} comprobantes | facturación total: ${money(totalFact)}`);
const byYear = {}; ventas.forEach((v) => { const y = v.fecha.getFullYear(); byYear[y] = (byYear[y] || 0) + v.total; });
console.log("Facturación por año:", Object.entries(byYear).sort().map(([y, t]) => `${y}=${money(t)}`).join("  "));

const byClient = {}; ventas.forEach((v) => { byClient[v.cuenta] = byClient[v.cuenta] || { n: v.nombre, t: 0, c: 0 }; byClient[v.cuenta].t += v.total; byClient[v.cuenta].c++; });
const clients = Object.entries(byClient).map(([cuenta, o]) => ({ cuenta, ...o })).sort((a, b) => b.t - a.t);
console.log(`\nClientes distintos: ${clients.length}`);
console.log("Top 12 clientes por facturación:");
clients.slice(0, 12).forEach((c, i) => console.log(`  ${String(i+1).padStart(2)}. ${c.cuenta.padEnd(7)} ${c.n.slice(0,30).padEnd(30)} ${money(c.t).padStart(14)}  (${c.c} comp.)`));
const top10pct = Math.ceil(clients.length * 0.1);
const shareTop10 = clients.slice(0, top10pct).reduce((a, c) => a + c.t, 0) / totalFact * 100;
console.log(`\nConcentración: top ${top10pct} clientes (10%) = ${shareTop10.toFixed(1)}% de la facturación`);

const byVend = {}; ventas.forEach((v) => { byVend[v.vend] = (byVend[v.vend] || 0) + v.total; });
console.log("\nFacturación por vendedor/canal (top 8):");
Object.entries(byVend).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([v, t]) => console.log(`  ${(v||"(sin dato)").slice(0,30).padEnd(30)} ${money(t).padStart(14)} (${(t/totalFact*100).toFixed(1)}%)`));

console.log("\n================ FIN ================");
