/**
 * Pickup 4x4 Intelligence — Cruce comercial real ARTÍCULO ↔ CLIENTE (standalone, unidades).
 *
 * Fuente de verdad (detalle): ranking_articulos_2023..2026.xlsx (KORE "Ranking Por Articulos").
 *   Layout: 6 filas preámbulo, header en fila índice 8, detalle desde fila 9.
 *   Cada línea de detalle = una transacción: Cod.Único(6) Descripción(7) Fecha(9) Comprob.(10)
 *   N°Comprob(11) Cuenta(12) Razón Social(13) Cant.línea(14). Grupo/SubGrupo/Stock solo en cabecera de grupo.
 * Apoyo: reporte_lonas_2023_2026_normalizado.xlsx → set autoritativo de códigos de la línea LONAS.
 * Limitación real: los rankings NO traen importe/precio → todo es UNIDADES, no facturación ni margen.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "..", "public", "imports");
const OUT = path.join(__dirname, "output");
fs.mkdirSync(OUT, { recursive: true });

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const S = (v) => (v == null ? "" : String(v).trim());
const csv = (rows) => rows.map((r) => r.map((c) => {
  const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(",")).join("\n");

// ---- Set autoritativo de códigos LONAS (desde el reporte normalizado, header fila 3) ----
const lonasWb = XLSX.readFile(path.join(DIR, "reporte_lonas_2023_2026_normalizado.xlsx"));
const lonasRows = XLSX.utils.sheet_to_json(lonasWb.Sheets["Rotacion_Normalizada"], { header: 1, raw: true, defval: null, blankrows: false });
const LONA_CODES = new Set(lonasRows.slice(3).map((r) => S(r[0])).filter(Boolean));

// ---- Parseo de los 4 rankings → tabla de hechos ----
const FILES = ["2023", "2024", "2025", "2026"].map((y) => ({ y, f: `ranking_articulos_${y}.xlsx` }));
const facts = []; // {anio, fecha, codigo, desc, grupo, subgrupo, cuenta, razon, comp, nroComp, cant}
const artMeta = new Map(); // codigo -> {desc, grupo, subgrupo}

for (const { f } of FILES) {
  const wb = XLSX.readFile(path.join(DIR, f), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  let grupo = "", subgrupo = "";
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    if (S(r[3])) grupo = S(r[3]);        // Grupo en cabecera de grupo
    if (S(r[5])) subgrupo = S(r[5]);     // SubGrupo en cabecera de grupo
    const codigo = S(r[6]); const cuenta = S(r[12]); const nroComp = S(r[11]);
    if (!codigo || !cuenta || !nroComp) continue;          // filtra subtotales/totales
    const cant = num(r[14]); if (cant === 0 && r[14] == null) continue;
    const fecha = r[9] instanceof Date ? r[9] : (r[9] ? new Date(r[9]) : null);
    const anio = fecha && !isNaN(fecha) ? fecha.getFullYear() : null;
    const desc = S(r[7]);
    if (!artMeta.has(codigo)) artMeta.set(codigo, { desc, grupo, subgrupo });
    facts.push({ anio, fecha, codigo, desc, grupo, subgrupo, cuenta, razon: S(r[13]), comp: S(r[10]), nroComp, cant });
  }
}

const isLona = (codigo, grupo) => LONA_CODES.has(codigo) || /lona|cubre caja/i.test(grupo || "") || /lona/i.test(artMeta.get(codigo)?.desc || "");

console.log("================ CRUCE ARTÍCULO ↔ CLIENTE (unidades) ================\n");
console.log(`Transacciones (líneas detalle): ${facts.length.toLocaleString()}`);
console.log(`Artículos distintos: ${artMeta.size} | Cuentas distintas: ${new Set(facts.map(f=>f.cuenta)).size} | Comprobantes: ${new Set(facts.map(f=>f.nroComp)).size}`);
console.log(`Unidades netas totales: ${Math.round(facts.reduce((a,f)=>a+f.cant,0)).toLocaleString()}`);
console.log(`Universo LONAS/CUBRE CAJAS: ${[...new Set(facts.filter(f=>isLona(f.codigo,f.grupo)).map(f=>f.codigo))].length} artículos`);

// ---- Resumen por ARTÍCULO ----
const byArt = new Map();
for (const f of facts) {
  let a = byArt.get(f.codigo);
  if (!a) { a = { codigo: f.codigo, desc: f.desc, grupo: f.grupo, cant: 0, clientes: new Map(), comps: new Set(), anios: new Set() }; byArt.set(f.codigo, a); }
  a.cant += f.cant; a.comps.add(f.nroComp); if (f.anio) a.anios.add(f.anio);
  a.clientes.set(f.cuenta, (a.clientes.get(f.cuenta) || 0) + f.cant);
}
const artSummary = [...byArt.values()].map((a) => {
  const top = [...a.clientes.entries()].sort((x, y) => y[1] - x[1])[0] || ["", 0];
  const topCuenta = top[0], topUnid = top[1];
  return { codigo: a.codigo, desc: a.desc, grupo: a.grupo, lona: isLona(a.codigo, a.grupo),
    unidades: Math.round(a.cant), nClientes: a.clientes.size, nComprobantes: a.comps.size,
    topCuenta, topUnid: Math.round(topUnid), shareTop: a.cant > 0 ? +(topUnid / a.cant * 100).toFixed(1) : 0,
    anios: [...a.anios].sort().join("|") };
}).sort((x, y) => y.unidades - x.unidades);

// ---- Resumen por CLIENTE ----
const byCli = new Map();
for (const f of facts) {
  let c = byCli.get(f.cuenta);
  if (!c) { c = { cuenta: f.cuenta, razon: f.razon, cant: 0, arts: new Map(), comps: new Set(), anios: new Set(), lonaCant: 0 }; byCli.set(f.cuenta, c); }
  if (!c.razon && f.razon) c.razon = f.razon;
  c.cant += f.cant; c.comps.add(f.nroComp); if (f.anio) c.anios.add(f.anio);
  c.arts.set(f.codigo, (c.arts.get(f.codigo) || 0) + f.cant);
  if (isLona(f.codigo, f.grupo)) c.lonaCant += f.cant;
}
const cliSummary = [...byCli.values()].map((c) => {
  const top = [...c.arts.entries()].sort((x, y) => y[1] - x[1])[0] || ["", 0];
  return { cuenta: c.cuenta, razon: c.razon, unidades: Math.round(c.cant), nArticulos: c.arts.size,
    nComprobantes: c.comps.size, topArticulo: top[0], topArticuloUnid: Math.round(top[1]),
    lonaUnid: Math.round(c.lonaCant), anios: [...c.anios].sort().join("|") };
}).sort((x, y) => y.unidades - x.unidades);

// ---- Escritura de CSVs ----
fs.writeFileSync(path.join(OUT, "hechos_articulo_cliente.csv"), csv([
  ["anio","fecha","codigo","descripcion","grupo","cuenta","razon_social","comprobante","nro_comprobante","cantidad"],
  ...facts.map((f) => [f.anio||"", f.fecha&&!isNaN(f.fecha)?f.fecha.toISOString().slice(0,10):"", f.codigo, f.desc, f.grupo, f.cuenta, f.razon, f.comp, f.nroComp, f.cant]),
]));
fs.writeFileSync(path.join(OUT, "resumen_por_articulo.csv"), csv([
  ["codigo","descripcion","grupo","es_lona","unidades","n_clientes","n_comprobantes","top_cuenta","top_unidades","share_top_%","anios_activos"],
  ...artSummary.map((a) => [a.codigo,a.desc,a.grupo,a.lona?"SI":"",a.unidades,a.nClientes,a.nComprobantes,a.topCuenta,a.topUnid,a.shareTop,a.anios]),
]));
fs.writeFileSync(path.join(OUT, "resumen_por_cliente.csv"), csv([
  ["cuenta","razon_social","unidades","n_articulos","n_comprobantes","top_articulo","top_articulo_unid","unid_lonas","anios_activos"],
  ...cliSummary.map((c) => [c.cuenta,c.razon,c.unidades,c.nArticulos,c.nComprobantes,c.topArticulo,c.topArticuloUnid,c.lonaUnid,c.anios]),
]));

// ---- LONAS/CUBRE: oportunidades ----
const lonaArts = artSummary.filter((a) => a.lona);
const lonaOpp = [];
// dependencia: lona con share top cliente >= 60% y >= 20 u
const dependencia = lonaArts.filter((a) => a.shareTop >= 60 && a.unidades >= 20);
// reactivación: cuentas que compraron lonas en 2023/2024 y nada en 2025/2026
const reactiv = cliSummary.filter((c) => c.lonaUnid > 0 && /2023|2024/.test(c.anios) && !/2025|2026/.test(c.anios));
fs.writeFileSync(path.join(OUT, "lonas_oportunidades.csv"), csv([
  ["tipo","codigo_o_cuenta","detalle","metrica"],
  ...dependencia.map((a) => ["DEPENDENCIA_1_CLIENTE", a.codigo, `${a.desc} | top ${a.topCuenta}`, `${a.shareTop}% en 1 cliente (${a.unidades}u)`]),
  ...reactiv.map((c) => ["REACTIVACION_LONA", c.cuenta, `${c.razon} | activo ${c.anios}`, `${c.lonaUnid}u lonas, sin compra 25/26`]),
]));

console.log("\n# TOP 10 ARTÍCULOS por unidades (con amplitud de clientes):");
artSummary.slice(0, 10).forEach((a, i) => console.log(`  ${String(i+1).padStart(2)}. ${a.codigo.padEnd(12)} ${a.desc.slice(0,30).padEnd(30)} ${String(a.unidades).padStart(5)}u | ${String(a.nClientes).padStart(3)} clientes | top ${a.shareTop}%`));

console.log("\n# TOP 10 CLIENTES por unidades (amplitud de artículos / frecuencia):");
cliSummary.slice(0, 10).forEach((c, i) => console.log(`  ${String(i+1).padStart(2)}. ${c.cuenta.padEnd(7)} ${c.razon.slice(0,28).padEnd(28)} ${String(c.unidades).padStart(5)}u | ${String(c.nArticulos).padStart(3)} arts | ${String(c.nComprobantes).padStart(4)} comp.`));

console.log("\n# LONAS/CUBRE — Top 10 por unidades + cliente dominante:");
lonaArts.slice(0, 10).forEach((a, i) => console.log(`  ${String(i+1).padStart(2)}. ${a.codigo.padEnd(12)} ${a.desc.slice(0,28).padEnd(28)} ${String(a.unidades).padStart(4)}u | ${String(a.nClientes).padStart(3)} cli | top ${a.topCuenta}=${a.shareTop}%`));

console.log("\n# LONAS/CUBRE — Top cuentas de la línea:");
[...cliSummary].filter(c=>c.lonaUnid>0).sort((a,b)=>b.lonaUnid-a.lonaUnid).slice(0,10).forEach((c,i)=>console.log(`  ${String(i+1).padStart(2)}. ${c.cuenta.padEnd(7)} ${c.razon.slice(0,30).padEnd(30)} ${String(c.lonaUnid).padStart(4)}u lonas/cubre`));

console.log(`\n# OPORTUNIDADES detectadas:`);
console.log(`  · Dependencia de 1 cliente (≥60% en lonas/cubre, ≥20u): ${dependencia.length} artículos`);
dependencia.slice(0,5).forEach(a=>console.log(`      ${a.codigo} ${a.desc.slice(0,30)} → ${a.shareTop}% en cuenta ${a.topCuenta}`));
console.log(`  · Reactivación (compraron lonas en 23/24, nada en 25/26): ${reactiv.length} cuentas`);
[...reactiv].sort((a,b)=>b.lonaUnid-a.lonaUnid).slice(0,5).forEach(c=>console.log(`      ${c.cuenta} ${c.razon.slice(0,28)} (${c.lonaUnid}u, ${c.anios})`));
const repetidores = cliSummary.filter(c=>c.nComprobantes>=10).length;
console.log(`  · Cuentas recurrentes (≥10 comprobantes): ${repetidores}`);

console.log("\nCSVs escritos en scripts/output/:");
fs.readdirSync(OUT).forEach((f) => console.log("  -", f, `(${fs.statSync(path.join(OUT,f)).size.toLocaleString()} bytes)`));
console.log("\n================ FIN ================");
