/**
 * Pickup 4x4 — PIPELINE ÚNICO de la campaña de recambio de cubre cajas + lonas (standalone).
 * Lee rankings 2023..2026 + el libro Diario, y produce UNA verdad operativa por propósito:
 *   1) CAMPANIA_recambio_FINAL.csv     -> base operativa única (negocio + lista para contacto)
 *   2) CAMPANIA_recambio_RESUMEN.csv   -> resumen ejecutivo (prioridades, tipos, vehículos, calidad de llave)
 *   3) CAMPANIA_recambio_AUDITORIA.csv -> log técnico de unificación de duplicados
 *
 * Reglas fijadas:
 *   - Producto = grupos "Cubre Cajas" + "Lonas Marítimas" (sin accesorios).
 *   - Prioridad rectora = antigüedad de la última compra (>=24m alta, >=12 media, >=6 baja, <6 no).
 *   - Llave principal = CUENTA; control secundario = RUT.
 *   - Duplicados (mismo RUT + razón) se fusionan recomputando la historia combinada.
 *   - Sin teléfono/email (no existen en la fuente): columnas preparadas, NO se inventan datos.
 *   - Fecha referencia: 2026-06-19.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "public", "imports");
const OUT = path.join(__dirname, "output");
const REF = new Date("2026-06-19");
const S = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const months = (d) => Math.round((REF - d) / (1000 * 60 * 60 * 24 * 30.44));
const csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
const TIT = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const isCover = (g, d) => /^(cubre cajas|lonas mar[ií]timas)$/i.test(g) && /cubre\s*caja|^lona\b/i.test(d);
const tipoDe = (d) => (/^lona\b/i.test(d) ? "Lona marítima" : "Cubre caja rígido");
const isAnon = (r) => /consumo final|consumidor final|mostrador|sin datos|mercado libre/i.test(r);
const validRut = (r) => r && r !== "00.000.000.0000" && !/^0[\.0]*$/.test(r) && r !== "00.001.111.1111";

// --- Fusiones confirmadas (superviviente <- absorbidas). Conservador: mismo RUT + misma razón. ---
const MERGES = [
  { survivor: "5154", absorb: ["4426"], etiqueta: "PEREZ AUTOMÓVILES SAS" },
  { survivor: "192",  absorb: ["191"],  etiqueta: "ENILDOR" },
];
const CANON = new Map();
const MERGED_INTO = new Map();
for (const m of MERGES) { MERGED_INTO.set(m.survivor, m.absorb); for (const a of m.absorb) CANON.set(a, m.survivor); }
const canon = (c) => CANON.get(c) || c;
// Par NO fusionado (RUT y razón distintos): se marca, no se toca.
const REVIEW_PAIR = new Map([["6451", "5421"], ["5421", "6451"]]);

const VEHICLES = ["Hilux Revo","Hilux","Revo","Ranger","Amarok","S10","Colorado","L-200","L200","Triton","Frontier","NP300","Saveiro","Oroch","Strada","Duster","Berlingo","Wingle","Sportero","Dmax","D-Max","Toro","Montana","Maverick","Alaskan","Kangoo","Partner","Silverado","Navara","Hoggar"];
const vehiculo = (desc) => { for (const v of VEHICLES) if (new RegExp(v.replace(/[-]/g, "\\-?"), "i").test(desc)) return v.replace("L200","L-200"); return "Otro/genérico"; };

// --- Parseo cubiertas con mapa de fusión aplicado ---
const lines = [];
for (const y of ["2023","2024","2025","2026"]) {
  const wb = XLSX.readFile(path.join(DIR, `ranking_articulos_${y}.xlsx`), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  let grupo = "";
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    if (S(r[3])) grupo = S(r[3]);
    const codigo = S(r[6]), cuentaRaw = S(r[12]), nroComp = S(r[11]), desc = S(r[7]);
    if (!codigo || !cuentaRaw || !nroComp || !isCover(grupo, desc)) continue;
    const fecha = r[9] instanceof Date ? r[9] : (r[9] ? new Date(r[9]) : null);
    if (!fecha || isNaN(fecha)) continue;
    lines.push({ cuenta: canon(cuentaRaw), desc, razon: S(r[13]), nroComp, fecha, cant: num(r[14]) });
  }
}

// --- Diario: RUT + localidad + vendedor real por cuenta ---
// El campo Vend.Cue mezcla vendedores reales con etiquetas de canal (web, recomendado, redes); se filtran.
const GENERIC = /mostrador|sin datos|sin funcionario|mercado libre|google|competencia|distribuidor|^\s*$/i;
const CHANNEL = /recomendado|^web$|cliente frecuente|proveedor|amigo|conocido|instagram|facebook|redes sociales|mercado pago|vio el local|^pickup$|no especificado/i;
const wbD = XLSX.readFile(path.join(DIR, "Diario-20260619-084547.xls"), { cellDates: true });
const drows = XLSX.utils.sheet_to_json(wbD.Sheets["Diario"], { header: 1, raw: true, defval: null, blankrows: false });
const dia = new Map(); // cuenta -> {rut:{}, loc:{}, vend:{}}
for (let i = 1; i < drows.length; i++) {
  const r = drows[i]; if (!r) continue;
  const cta = S(r[4]); if (!cta) continue;
  let o = dia.get(cta); if (!o) { o = { rut: {}, loc: {}, vend: {} }; dia.set(cta, o); }
  const rut = S(r[19]); if (validRut(rut)) o.rut[rut] = (o.rut[rut] || 0) + 1;
  const loc = S(r[21]); if (loc && !/sin localidad/i.test(loc)) o.loc[loc] = (o.loc[loc] || 0) + 1;
  const vc = S(r[14]), vcomp = S(r[13]);
  const v = !GENERIC.test(vc) ? vc : (!GENERIC.test(vcomp) ? vcomp : "");
  if (v && !CHANNEL.test(v)) o.vend[v] = (o.vend[v] || 0) + 1;
}
const top = (obj) => { const e = Object.entries(obj); return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : ""; };
// agrega survivor + absorbidas (mismo titular)
const aggDia = (cuenta, campo) => {
  const ctas = [cuenta, ...(MERGED_INTO.get(cuenta) || [])];
  const agg = {};
  for (const c of ctas) { const o = dia.get(c); if (o) for (const [k, v] of Object.entries(o[campo])) agg[k] = (agg[k] || 0) + v; }
  return agg;
};
const rutDe = (cuenta) => top(aggDia(cuenta, "rut"));
const locDe = (cuenta) => { const l = top(aggDia(cuenta, "loc")); return l ? TIT(l.toLowerCase()) : ""; };
const vendDe = (cuenta) => top(aggDia(cuenta, "vend"));

// --- Contactos (LISTADO DE CUENTAS.xlsx) — llave principal CUENTA=Nro, validación secundaria RUT=RUC ---
// Aporta teléfono / celular / email reales. Si el archivo no está, se sigue sin contacto.
// Se descartan emails del propio vendedor (pickup4x4.uy): no son contacto del cliente.
// Cabecera en la fila 3: Nro(0) Teléfono(4) Localidad(6) RUC(7) Email(8) Celular(9).
const normRut = (v) => S(v).replace(/[^0-9]/g, "");
const contactos = new Map();     // Nro/Número Cliente (cuenta) -> {tel,cel,email,loc,sector}
const contactosPorRut = new Map(); // RUC normalizado -> {tel,cel,email,...}
const LISTADO = path.join(DIR, "LISTADO_DE_CUENTAS.xlsx");
if (fs.existsSync(LISTADO)) {
  const wbL = XLSX.readFile(LISTADO);
  const lrows = XLSX.utils.sheet_to_json(wbL.Sheets[wbL.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  // Mapeo por NOMBRE de encabezado (robusto a reordenes/renombres: "Nro." o "Número Cliente", con o sin Fax/Vendedor).
  const norm = (s) => S(s).toLowerCase();
  let hi = -1;
  for (let i = 0; i < Math.min(10, lrows.length); i++) {
    if ((lrows[i] || []).map(norm).some((c) => /n[uú]mero cliente|^nro\.?$/.test(c))) { hi = i; break; }
  }
  if (hi >= 0) {
    const H = (lrows[hi] || []).map(norm);
    const col = (re) => H.findIndex((c) => re.test(c));
    const cCta = col(/n[uú]mero cliente|^nro\.?$/);
    const cTel = col(/^tel[eé]fono$/);          // exacto: evita "Teléfono T"
    const cCel = col(/celular|cecular/);
    const cEmail = col(/e-?mail|correo/);
    const cRuc = col(/^ruc$|^rut$/);
    for (let i = hi + 1; i < lrows.length; i++) {
      const r = lrows[i]; if (!r) continue;
      const nro = cCta >= 0 ? S(r[cCta]) : ""; if (!nro) continue;
      let o = contactos.get(nro); if (!o) { o = { tel: "", cel: "", email: "" }; contactos.set(nro, o); }
      const tel = cTel >= 0 ? S(r[cTel]) : "", cel = cCel >= 0 ? S(r[cCel]) : "", email = cEmail >= 0 ? S(r[cEmail]) : "";
      if (tel && !o.tel) o.tel = tel;
      if (cel && !o.cel) o.cel = cel;
      if (email && !o.email && !/@pickup4x4\.uy/i.test(email)) o.email = email;
      const rut = cRuc >= 0 ? normRut(r[cRuc]) : "";
      if (rut.length >= 10 && !contactosPorRut.has(rut)) contactosPorRut.set(rut, o);
    }
  }
}
const hayContacto = (o) => !!(o && (o.tel || o.cel || o.email));
const contactoDe = (cuenta) => {
  const ctas = [cuenta, ...(MERGED_INTO.get(cuenta) || [])];
  const acc = { tel: "", cel: "", email: "" };
  // 1) llave principal: número de cuenta
  for (const c of ctas) { const o = contactos.get(c); if (o) { acc.tel = acc.tel || o.tel; acc.cel = acc.cel || o.cel; acc.email = acc.email || o.email; } }
  // 2) validación/recuperación secundaria por RUT (si no hubo match por número)
  if (!hayContacto(acc)) {
    const o = contactosPorRut.get(normRut(rutDe(cuenta)));
    if (o) { acc.tel = o.tel; acc.cel = o.cel; acc.email = o.email; }
  }
  return acc;
};

// --- Agregado por cuenta canónica ---
const byCli = new Map();
for (const l of lines) {
  if (l.cant <= 0) continue;
  let c = byCli.get(l.cuenta);
  if (!c) { c = { cuenta: l.cuenta, razon: l.razon, unidades: 0, comps: new Set(), fechas: [], modelos: new Map() }; byCli.set(l.cuenta, c); }
  if (!c.razon && l.razon) c.razon = l.razon;
  c.unidades += l.cant; c.comps.add(l.nroComp); c.fechas.push(l.fecha);
  c.modelos.set(l.desc, (c.modelos.get(l.desc) || 0) + l.cant);
}

const NIVEL = { ALTA: "Prioridad alta", MEDIA: "Prioridad media", BAJA: "Prioridad baja", NO: "No contactar todavía", ANON: "No contactar (no identificable)" };
const nivelDe = (meses, anon) => { if (anon) return NIVEL.ANON; if (meses >= 24) return NIVEL.ALTA; if (meses >= 12) return NIVEL.MEDIA; if (meses >= 6) return NIVEL.BAJA; return NIVEL.NO; };
const rankNivel = { [NIVEL.ALTA]: 4, [NIVEL.MEDIA]: 3, [NIVEL.BAJA]: 2, [NIVEL.NO]: 1, [NIVEL.ANON]: 0 };

const rows = [...byCli.values()].map((c) => {
  const ult = new Date(Math.max(...c.fechas.map((d) => d.getTime())));
  const meses = months(ult);
  const anon = isAnon(c.razon);
  const nivel = nivelDe(meses, anon);
  const nCompras = c.comps.size;
  const recurrente = nCompras >= 2;
  const modelosArr = [...c.modelos.entries()].sort((a, b) => b[1] - a[1]);
  const modelo = modelosArr[0] ? modelosArr[0][0] : "";
  const reventa = nCompras >= 5 || modelosArr.length >= 4;
  const tipos = new Set(modelosArr.map(([d]) => tipoDe(d)));
  const tipo = tipos.size > 1 ? "Cubre caja + Lona" : tipoDe(modelo);
  let rec, obs = [];
  if (anon) rec = "No contactar (mostrador/anónimo)";
  else if (reventa) rec = "Revisar manualmente (perfil reventa/taller)";
  else if (nivel === NIVEL.ALTA && recurrente) rec = "Contactar ya — recambio prioritario";
  else if (nivel === NIVEL.ALTA) rec = "Contactar ya — recambio";
  else if (nivel === NIVEL.MEDIA) rec = "Contactar en segunda ola";
  else if (nivel === NIVEL.BAJA) rec = "No contactar aún (seguimiento futuro)";
  else rec = "No contactar (compra reciente)";
  if (meses >= 36) obs.push("última compra >3 años");
  if (recurrente && rankNivel[nivel] >= 3) obs.push("recurrente enfriado");
  if (reventa) obs.push("posible reventa/taller — pitch distinto");

  const fusion = MERGED_INTO.get(c.cuenta);
  if (fusion) obs.unshift(`unificada con cuenta ${fusion.join("/")} (mismo RUT/razón)`);
  const rut = rutDe(c.cuenta);
  let estadoLlave;
  if (REVIEW_PAIR.has(c.cuenta)) estadoLlave = `REVISAR — vínculo con cuenta ${REVIEW_PAIR.get(c.cuenta)} pero RUT/razón distintos (no fusionar sin confirmación)`;
  else if (fusion) estadoLlave = "OK — unificada (duplicado resuelto)";
  else if (rut) estadoLlave = "OK — cuenta única + RUT validado";
  else estadoLlave = "OK — cuenta única (sin RUT de backup todavía)";

  return { cuenta: c.cuenta, razon: c.razon, rut, localidad: locDe(c.cuenta), vendedor: vendDe(c.cuenta),
    tipo, modelo, vehiculo: vehiculo(modelo), ultima: ult.toISOString().slice(0, 10), meses,
    unidades: Math.round(c.unidades), nCompras, nivel, rec, estadoLlave,
    fusionadas: fusion ? fusion.join("/") : "", obs: obs.join("; ") };
});
rows.sort((a, b) => rankNivel[b.nivel] - rankNivel[a.nivel] || b.nCompras - a.nCompras || b.meses - a.meses || b.unidades - a.unidades);

// === 1) BASE OPERATIVA ÚNICA (negocio + lista para contacto) ===
// Columnas de contacto preparadas; cruce futuro = JOIN por CUENTA, validación por RUT. No se inventan datos.
fs.writeFileSync(path.join(OUT, "CAMPANIA_recambio_FINAL.csv"), csv([
  ["cuenta","razon_social","rut","localidad","vendedor_real","tipo_cubierta","producto_linea","categoria_vehiculo",
   "ultima_compra","meses_desde_ultima","cantidad_historica","n_compras","prioridad_comercial","recomendacion_accion",
   "estado_llave_cruce","cuentas_fusionadas","observacion",
   "telefono","email","fuente_contacto","estado_contactabilidad","observacion_contacto"],
  ...rows.map((r) => [r.cuenta, r.razon, r.rut, r.localidad, r.vendedor, r.tipo, r.modelo, r.vehiculo,
    r.ultima, r.meses, r.unidades, r.nCompras, r.nivel, r.rec, r.estadoLlave, r.fusionadas, r.obs,
    "", "", "pendiente_export_contactos", "sin_contacto_aun", ""]),
]));

// === 2) RESUMEN EJECUTIVO ===
const cnt = {}; rows.forEach((r) => cnt[r.nivel] = (cnt[r.nivel] || 0) + 1);
const tipoFreq = {}; rows.forEach((r) => tipoFreq[r.tipo] = (tipoFreq[r.tipo] || 0) + 1);
const vehFreq = {}; rows.filter((r) => rankNivel[r.nivel] >= 2).forEach((r) => vehFreq[r.vehiculo] = (vehFreq[r.vehiculo] || 0) + 1);
const conRut = rows.filter((r) => r.rut).length;
const conLoc = rows.filter((r) => r.localidad).length;
const conVend = rows.filter((r) => r.vendedor).length;
const revisar = rows.filter((r) => r.estadoLlave.startsWith("REVISAR")).length;
fs.writeFileSync(path.join(OUT, "CAMPANIA_recambio_RESUMEN.csv"), csv([
  ["seccion","item","valor"],
  ["Totales","Cuentas en campaña (únicas por CUENTA)", rows.length],
  ["Prioridad","Prioridad alta", cnt[NIVEL.ALTA] || 0],
  ["Prioridad","Prioridad media", cnt[NIVEL.MEDIA] || 0],
  ["Prioridad","Prioridad baja", cnt[NIVEL.BAJA] || 0],
  ["Prioridad","No contactar todavía", cnt[NIVEL.NO] || 0],
  ["Prioridad","No contactar (no identificable)", cnt[NIVEL.ANON] || 0],
  ...Object.entries(tipoFreq).sort((a, b) => b[1] - a[1]).map(([k, v]) => ["Tipo de cubierta", k, v]),
  ["Llave/control","Con RUT de backup", `${conRut} (${(conRut / rows.length * 100).toFixed(0)}%)`],
  ["Llave/control","Con localidad/zona", `${conLoc} (${(conLoc / rows.length * 100).toFixed(0)}%)`],
  ["Llave/control","Con vendedor real", `${conVend} (${(conVend / rows.length * 100).toFixed(0)}%)`],
  ["Llave/control","Cuentas marcadas REVISAR", revisar],
  ["Contactabilidad","Con teléfono/email", "0 (no existe la fuente en el proyecto)"],
  ...Object.entries(vehFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ["Vehículo (contactables)", k, v]),
]));

// === 3) AUDITORÍA de unificación ===
const find = (cta) => rows.find((r) => r.cuenta === cta) || {};
const audit = [["caso","cuenta_superviviente","cuentas_absorbidas","razon_social","rut","criterio","conflicto","prioridad_resultante","estado"]];
for (const m of MERGES) {
  const r = find(m.survivor);
  audit.push(["FUSIÓN", m.survivor, m.absorb.join("/"), r.razon || m.etiqueta, r.rut || "",
    "Mismo RUT y misma razón social → misma empresa con 2 nº de cuenta. Historia combinada; prioridad recomputada por antigüedad.",
    "Sin conflicto", r.nivel || "", "Unificado — 1 fila final"]);
}
const a = find("6451"), b = find("5421");
audit.push(["NO FUSIÓN", "6451 y 5421 (se mantienen separadas)", "-", "CHECOS SAS / Joaquim Simon",
  `${a.rut || ""} vs ${b.rut || ""}`,
  "RUT y razón social DISTINTOS; la cuenta 5421 mezcla varias razones (CHECOS, IS MOTORS, Joaquim Simon). No es un duplicado limpio.",
  "CONFLICTO — entidades distintas", `${a.nivel || "?"} / ${b.nivel || "?"}`, "REVISAR manual — no fusionado"]);
fs.writeFileSync(path.join(OUT, "CAMPANIA_recambio_AUDITORIA.csv"), csv(audit));

// === 4) JSON PERSISTIDO para la pantalla /campanas (solo-lectura) ===
// Se sirve como estático en /data/recambio.json. La UI sólo lo lee: sin recálculo, sin Supabase, sin /api.
const esCand = (r) => rankNivel[r.nivel] >= 2; // alta/media/baja
const listo = (r) => esCand(r) && !!r.localidad && !r.estadoLlave.startsWith("REVISAR") && !!r.rut;
const estadoContact = (r, ct) => {
  if (ct.tel || ct.cel || ct.email) {
    const partes = [];
    if (ct.tel || ct.cel) partes.push("teléfono");
    if (ct.email) partes.push("email");
    return `Contactable: ${partes.join(" + ")}`;
  }
  if (r.estadoLlave.startsWith("REVISAR")) return "Revisar llave antes de contactar";
  if (r.localidad && r.vendedor) return "Ubicable: zona + vendedor (sin tel/email)";
  if (r.localidad) return "Ubicable: zona (sin tel/email)";
  if (r.rut) return "Solo cuenta/RUT";
  return "Mínimo (sin zona ni RUT)";
};
const items = rows.map((r) => {
  const ct = contactoDe(r.cuenta);
  return {
    prioridad: r.nivel,
    cuenta: r.cuenta,
    razonSocial: r.razon,
    productoActual: r.modelo,
    ultimaCompra: r.ultima,
    mesesDesdeUltima: r.meses,
    productoSugerido: `Recambio ${r.tipo} — ${r.vehiculo}`,
    recomendacion: r.rec,
    telefono: ct.tel,
    celular: ct.cel,
    email: ct.email,
    estadoContactabilidad: estadoContact(r, ct),
    vendedor: r.vendedor,
    zona: r.localidad,
    esCandidato: esCand(r),
    listoParaTrabajar: listo(r),
  };
});
const hasContacto = (it) => !!(it.telefono || it.celular || it.email);
const cands = items.filter((it) => it.esCandidato);
const resumenJson = {
  total: rows.length,
  alta: cnt[NIVEL.ALTA] || 0,
  media: cnt[NIVEL.MEDIA] || 0,
  baja: cnt[NIVEL.BAJA] || 0,
  noContactar: (cnt[NIVEL.NO] || 0) + (cnt[NIVEL.ANON] || 0),
  listasParaTrabajar: rows.filter(listo).length,
  // Contactabilidad real (cruce con LISTADO DE CUENTAS):
  conTelefono: items.filter((it) => it.telefono || it.celular).length,
  conEmail: items.filter((it) => it.email).length,
  conContacto: items.filter(hasContacto).length,
  sinContacto: items.filter((it) => !hasContacto(it)).length,
  frenadasPorContacto: cands.filter((it) => !hasContacto(it)).length, // candidatos aún sin tel/email
};
const PUB = path.join(__dirname, "..", "public", "data");
fs.mkdirSync(PUB, { recursive: true });
fs.writeFileSync(path.join(PUB, "recambio.json"), JSON.stringify({ generadoEl: "2026-06-19", resumen: resumenJson, items }, null, 2));

// --- Consola ---
console.log("======= PIPELINE CAMPAÑA RECAMBIO (cubre caja + lona) — salida consolidada =======\n");
console.log("Base operativa:", rows.length, "cuentas únicas |", `RUT ${conRut} · localidad ${conLoc} · vendedor ${conVend} · REVISAR ${revisar}`);
["Prioridad alta","Prioridad media","Prioridad baja","No contactar todavía","No contactar (no identificable)"].forEach((k) =>
  console.log(`  ${k.padEnd(34)} ${String(cnt[k] || 0).padStart(4)}`));
console.log("\nSalidas vigentes:");
console.log("  CAMPANIA_recambio_FINAL.csv      -> base operativa única (negocio + lista para contacto)");
console.log("  CAMPANIA_recambio_RESUMEN.csv    -> resumen ejecutivo");
console.log("  CAMPANIA_recambio_AUDITORIA.csv  -> log de unificación de duplicados");
console.log("  public/data/recambio.json        -> JSON solo-lectura para la pantalla /campanas");
console.log(`     resumen: total ${resumenJson.total} · alta ${resumenJson.alta} · con-contacto ${resumenJson.conContacto} (tel ${resumenJson.conTelefono} / email ${resumenJson.conEmail}) · sin-contacto ${resumenJson.sinContacto}`);
console.log("=================== FIN ===================");
