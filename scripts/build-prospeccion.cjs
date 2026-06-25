/**
 * build-prospeccion.cjs — Fase 2 del módulo Prospección Empresas.
 *
 * Lee los Excel reales de prospección y genera un JSON seed consolidado:
 *   public/imports/Canales de Venta.xlsx  (matriz por columnas: rubros, sugeridas)
 *   public/imports/contactos.xlsx         (tabla: empresa, contacto, flota, estado)
 *      ->  public/data/prospeccion.json
 *
 * Reglas de producto:
 *  - contactos.xlsx es fuente PRIORITARIA (trae contacto/flota/estado).
 *  - Canales de Venta.xlsx aporta rubros y empresas SUGERIDAS (las que no están
 *    en contactos entran con esSugerida=true).
 *  - Consolidación por clave canónica de empresa (sin acentos, alias, sufijos).
 *  - Antel => rubro "telecomunicaciones" + tipoOrganizacion "estado".
 *
 * NO toca Supabase, SQL ni importadores existentes. Solo genera el JSON seed.
 * Reproducible: `npm run prospeccion:build`.
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "public", "imports");
const OUT_DIR = path.join(ROOT, "public", "data");
const OUT = path.join(OUT_DIR, "prospeccion.json");
const SEED_VERSION = "prospeccion-excel-v1";
// Fecha fija de generación (sin hora) para que el seed sea estable entre corridas.
const GENERATED_AT = new Date().toISOString().slice(0, 10);

const FILE_CONTACTOS = "contactos.xlsx";
const FILE_CANALES = "Canales de Venta.xlsx";

const warnings = [];
const duplicates = [];

// ───────────────────────────────────────────── utilidades de texto

const S = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const stripAccents = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");

function titleCase(name) {
  return S(name)
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/\b(Y|De|Del|La|El|E)\b/g, (m) => m.toLowerCase());
}

// Palabras que no aportan a la identidad de la empresa.
const STOP = new Set([
  "sa", "srl", "ltda", "rent", "a", "car", "the", "rental",
  "de", "del", "la", "el", "y", "e",
  "ingenieria", "construccion", "constrccion", "construcciones", "constructora",
]);
// Correcciones de typos a nivel token.
const TOKEN_FIX = { guiterrez: "gutierrez", serdecon: "sertecon", terciarizan: "" };
// Alias de clave completa (variantes claras de la misma empresa).
const KEY_ALIAS = { "upm oriental": "upm forestal oriental" };

/** Clave canónica de empresa para consolidar/deduplicar. */
function canonical(name) {
  let s = stripAccents(String(name || "").toLowerCase());
  s = s.replace(/\([^)]*\)/g, " "); // quita alias entre paréntesis
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  const toks = s
    .split(/\s+/)
    .map((t) => (t in TOKEN_FIX ? TOKEN_FIX[t] : t))
    .filter((t) => t && !STOP.has(t));
  let key = toks.join(" ");
  if (KEY_ALIAS[key]) key = KEY_ALIAS[key];
  return key;
}

function idFromKey(key) {
  return "prospect-" + key.replace(/\s+/g, "-");
}

// ───────────────────────────────────────────── rubros / tipo organización

function normRubro(raw, fallback) {
  const s = stripAccents(S(raw).toLowerCase());
  if (!s) return fallback || "";
  if (/estado/.test(s)) return "estado";
  if (/forestal/.test(s)) return "forestal";
  if (/constructora|construccion/.test(s)) return "constructora";
  if (/telecom|internet|cable/.test(s)) return "telecomunicaciones";
  if (/aire|climatiz/.test(s)) return "climatizacion";
  if (/fachada|altura|seguridad/.test(s)) return "fachadas_altura";
  if (/alquilad|rent/.test(s)) return "alquiladora";
  return fallback || "";
}

const RUBRO_SUBLABEL = {
  estado: "Organismo público",
  forestal: "Forestal",
  constructora: "Construcción",
  telecomunicaciones: "Telecom / Internet / Cable",
  climatizacion: "Climatización",
  fachadas_altura: "Fachadas / altura / seguridad",
  alquiladora: "Rent a car / flotas",
  otro: "Sin clasificar",
};

const ESTATALES = new Set(["inia", "intendencias", "centros comunales", "antel", "ose", "ute"]);

function inferTipoOrg(rubro, key) {
  if (key === "antel") return "estado";
  if (ESTATALES.has(key)) return "estado";
  if (rubro === "estado") return "estado";
  if (rubro === "alquiladora") return "alquiladora";
  return "privada";
}

// ───────────────────────────────────────────── lectura robusta de hojas

function readSheet(file) {
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) {
    warnings.push(`No se encontró ${file} en public/imports.`);
    return null;
  }
  const wb = XLSX.readFile(full, { cellDates: true, raw: false });
  const name = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    defval: null,
    blankrows: false,
  });
  return { sheetName: name, rows };
}

// ───────────────────────────────────────────── parseo de flota / fecha

function parseFlota(text) {
  const flota = {
    flotaPropia: "no_se_sabe",
    flotaTercerizada: "no_se_sabe",
    modeloMixto: "no_se_sabe",
    tiposVehiculo: [],
    usos: [],
    proximaRenovacion: "no_se_sabe",
  };
  const t = stripAccents(S(text).toLowerCase());
  if (!t) return flota;
  const propia = /propia/.test(t);
  const terc = /terciariz|terceriz|terciar|terceriz|tercer/.test(t);
  if (propia) flota.flotaPropia = "si";
  if (terc) flota.flotaTercerizada = "si";
  if (/mixt/.test(t) || (propia && terc)) {
    flota.modeloMixto = "si";
    flota.flotaPropia = flota.flotaPropia === "no_se_sabe" ? "si" : flota.flotaPropia;
    flota.flotaTercerizada = "si";
  }
  // Proveedor de flota tras ":" (ej "TERCIARIZAN: MURICAR,MULTICAR").
  const idx = S(text).indexOf(":");
  if (idx >= 0) {
    const prov = S(text)
      .slice(idx + 1)
      .split(/[,/]/)
      .map((x) => titleCase(x))
      .filter(Boolean)
      .join(", ");
    if (prov) flota.proveedorFlotaActual = prov;
  }
  return flota;
}

function parseVehiculos(text, flota) {
  const raw = S(text);
  if (!raw) return;
  flota.marcasModelos = titleCase(raw);
  const t = stripAccents(raw.toLowerCase());
  const tipos = new Set(flota.tiposVehiculo);
  if (/oroch|hilux|ranger|amarok|frontier|pickup|pick up|saveiro/.test(t)) tipos.add("pickups");
  if (/camioneta|partner|kangoo|berlingo|van|furgon/.test(t)) tipos.add("camionetas");
  if (/camion/.test(t)) tipos.add("camiones");
  flota.tiposVehiculo = [...tipos];
}

/** Fecha de un valor Date/string -> "YYYY-MM-DD" (usa UTC para no correr el día). */
function parseFecha(v) {
  if (!v) return undefined;
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getUTCFullYear();
    const m = `${v.getUTCMonth() + 1}`.padStart(2, "0");
    const d = `${v.getUTCDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = S(v);
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;
  }
  return undefined;
}

/** Extrae nombre + teléfono embebido de celdas tipo "MARIA EUGENIA-COMPRAS-097540358". */
function splitNamePhone(text) {
  const raw = S(text);
  if (!raw) return { name: "", phone: "" };
  const m = raw.match(/(\d[\d\s.]{6,}\d)/); // primer grupo de dígitos largo
  const phone = m ? m[1].replace(/[.\s]+/g, " ").trim() : "";
  let name = raw;
  if (m) name = raw.slice(0, m.index).replace(/[-–:]+\s*$/, "").trim();
  name = name.replace(/-?\s*compras\s*$/i, "").replace(/[-–]\s*$/, "").trim();
  return { name: titleCase(name), phone };
}

function looksLikePhone(text) {
  const digits = S(text).replace(/\D/g, "");
  return digits.length >= 7 && /^[\d\s().+-]+$/.test(S(text));
}

// ───────────────────────────────────────────── estado de comunicación

function estadoContacto(estadoTxt) {
  const t = stripAccents(S(estadoTxt).toLowerCase());
  if (!t) return "no_contactado";
  if (/no respond|no contesta|no atend/.test(t)) return "no_respondio";
  if (/logre comunic|reunion|hablabamos luego|llamar luego|luego/.test(t)) return "pidio_llamar_luego";
  if (/derivo|deriv/.test(t)) return "derivo";
  if (/respond|contest/.test(t)) return "respondio";
  return "contactado";
}

function viaToTipo(viaTxt) {
  const t = stripAccents(S(viaTxt).toLowerCase());
  if (/whatsapp/.test(t) && !/llamada/.test(t)) return "whatsapp";
  if (/mail/.test(t)) return "email";
  if (/llamada/.test(t)) return "llamada";
  return "otro";
}

function inferEtapa(rec) {
  if (rec.esSugerida && rec.contactos.length === 0) return "lead_detectado";
  const est = rec.contactos[0] && rec.contactos[0].estado;
  if (est === "respondio" || est === "pidio_llamar_luego" || est === "derivo") {
    return "datos_basicos_relevados";
  }
  if (est === "no_respondio") return "llamada_inicial_pendiente";
  if (rec.contactos.length > 0) return "llamada_inicial_pendiente";
  return "lead_detectado";
}

function localidadFromDir(dir) {
  const t = stripAccents(S(dir).toUpperCase());
  if (/MVDEO|MDEO|MVD|MONTEVIDEO/.test(t)) {
    return { localidad: "Montevideo", departamento: "Montevideo" };
  }
  return {};
}

// ───────────────────────────────────────────── construir base de registros

const byKey = new Map();

function ensureRecord(nombre) {
  const key = canonical(nombre);
  if (!key) return null;
  let rec = byKey.get(key);
  if (!rec) {
    rec = {
      key,
      id: idFromKey(key),
      nombre: titleCase(nombre),
      rubro: "",
      tipoOrganizacion: "",
      contactos: [],
      flota: parseFlota(""),
      proveedor: { tieneProveedorActual: "no_se_sabe", competidores: [] },
      necesidades: [],
      propuestas: [],
      actividades: [],
      observaciones: "",
      fuente: "",
      esSugerida: false,
      fromContactos: false,
      fromCanales: false,
      ultimoContacto: undefined,
    };
    byKey.set(key, rec);
  }
  return rec;
}

// ── 1) contactos.xlsx (prioritario)
let totalFromContactos = 0;
const contactos = readSheet(FILE_CONTACTOS);
if (contactos) {
  const { rows } = contactos;
  // detectar header por nombre
  const norm = (s) => stripAccents(S(s).toLowerCase());
  let hi = rows.findIndex((r) => (r || []).map(norm).some((c) => /^nombre$/.test(c)));
  if (hi < 0) hi = 0;
  const H = (rows[hi] || []).map(norm);
  const col = (re) => H.findIndex((c) => re.test(c));
  const C = {
    rubro: col(/^rubro$/),
    nombre: col(/^nombre$/),
    dir: col(/direccion/),
    tel: col(/^tel$/),
    compras: col(/^compras$/),
    contacto2: col(/nombre de contacto|tel y\/o/),
    mail: col(/mail/),
    horarios: col(/horario/),
    comunique: col(/me comunique/),
    flota: col(/flota/),
    vehiculos: col(/vehiculos/),
    via: col(/via de comunic/),
    fecha: col(/fecha de comunic/),
    estado: col(/estado de la comunic/),
  };
  const get = (r, k) => (C[k] >= 0 ? S(r[C[k]]) : "");

  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const nombre = get(r, "nombre");
    if (!nombre) continue;
    const rec = ensureRecord(nombre);
    if (!rec) continue;
    rec.fromContactos = true;
    rec.fuente = "excel_contactos";
    totalFromContactos++;

    // rubro
    const rr = normRubro(get(r, "rubro"), "");
    if (rr) rec.rubro = rr;

    // dirección / localidad
    const dir = get(r, "dir");
    if (dir) {
      rec.direccion = dir;
      Object.assign(rec, localidadFromDir(dir));
    }

    // contacto principal (de COMPRAS) + tel/mail/horario de la fila
    const comprasRaw = get(r, "compras");
    const { name: compName, phone: compPhone } = splitNamePhone(comprasRaw);
    const tel = get(r, "tel");
    const mail = get(r, "mail");
    const horario = get(r, "horarios");
    const estadoTxt = get(r, "estado");
    const estContacto = estadoContacto(estadoTxt);

    if (compName || tel || mail || compPhone) {
      const c = {
        id: `c-${rec.key.replace(/\s+/g, "-")}-1`,
        nombre: compName || "Contacto de compras",
        area: "compras",
        estado: estContacto,
      };
      if (tel) c.telefono = tel;
      if (compPhone) c.whatsapp = compPhone;
      if (mail && !/@pickup4x4\.uy/i.test(mail)) c.email = mail;
      if (horario) c.horarioRecomendado = horario;
      rec.contactos.push(c);
    }

    // contacto secundario (col "TEL y/o NOMBRE de CONTACTO")
    const c2 = get(r, "contacto2");
    if (c2) {
      if (looksLikePhone(c2) && rec.contactos[0] && !rec.contactos[0].whatsapp) {
        rec.contactos[0].whatsapp = c2;
      } else if (!looksLikePhone(c2)) {
        const { name: n2, phone: p2 } = splitNamePhone(c2);
        rec.contactos.push({
          id: `c-${rec.key.replace(/\s+/g, "-")}-2`,
          nombre: n2 || c2,
          estado: "contactado",
          esDerivador: true,
          ...(p2 ? { whatsapp: p2 } : {}),
        });
      }
    }

    // "me comuniqué con" -> derivador / nota
    const comunique = get(r, "comunique");
    if (comunique) {
      rec.observaciones = [rec.observaciones, `Se habló con: ${comunique}.`]
        .filter(Boolean)
        .join(" ");
    }

    // flota + vehículos
    rec.flota = parseFlota(get(r, "flota"));
    parseVehiculos(get(r, "vehiculos"), rec.flota);

    // actividad histórica desde via/fecha/estado
    const via = get(r, "via");
    const fecha = parseFecha(C.fecha >= 0 ? r[C.fecha] : null);
    if (via || fecha || estadoTxt) {
      rec.actividades.push({
        id: `act-${rec.key.replace(/\s+/g, "-")}-1`,
        tipo: viaToTipo(via),
        fecha: fecha || GENERATED_AT,
        estado: "realizada",
        resultadoObtenido: estadoTxt || undefined,
      });
      if (fecha) rec.ultimoContacto = fecha;
    }
    if (estadoTxt) {
      rec.observaciones = [rec.observaciones, `Última comunicación: ${estadoTxt}.`]
        .filter(Boolean)
        .join(" ");
    }
  }
}

// ── 2) Canales de Venta.xlsx (rubros + sugeridas)
let totalFromCanales = 0;
// Subcolumnas relevantes al módulo (las demás son canal/competencia, se ignoran
// como prospectos B2B de flota).
const RUBRO_COLS = new Set([
  "estado", "forestales", "constructoras",
  "telecomunicaciones e internet", "aire acondicionado", "mantenimiento de fachadas",
  "alquiladoras de auto",
]);

const canales = readSheet(FILE_CANALES);
const competidoresGlobales = [];
if (canales) {
  const { rows } = canales;
  const r0 = rows[0] || [];
  const r1 = rows[1] || [];
  const maxCols = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);

  for (let c = 0; c < maxCols; c++) {
    const top = stripAccents(S(r0[c]).toLowerCase());
    const sub = stripAccents(S(r1[c]).toLowerCase());
    const label = sub || top;

    // Competidores importadores -> lista global de competencia.
    if (/competidor/.test(top)) {
      for (let r = 2; r < rows.length; r++) {
        const v = S((rows[r] || [])[c]);
        if (v) competidoresGlobales.push(titleCase(v));
      }
      continue;
    }

    if (!RUBRO_COLS.has(label)) continue;
    const rubro = normRubro(label, "");
    if (!rubro) continue;

    for (let r = 2; r < rows.length; r++) {
      const nombre = S((rows[r] || [])[c]);
      if (!nombre) continue;
      totalFromCanales++;
      const rec = ensureRecord(nombre);
      if (!rec) continue;
      rec.fromCanales = true;
      if (!rec.rubro) rec.rubro = rubro; // contactos manda; Canales completa
      if (!rec.fuente) {
        rec.fuente = "excel_canales";
        rec.esSugerida = true; // sólo viene de Canales
      }
    }
  }
}
if (competidoresGlobales.length) {
  warnings.push(
    `Competencia (Canales): ${[...new Set(competidoresGlobales)].join(", ")} — referencia global, no asignada por empresa.`,
  );
}

// ───────────────────────────────────────────── post-proceso / Antel / etapas

const RUBRO_VALIDO = new Set([
  "estado", "forestal", "constructora", "telecomunicaciones",
  "climatizacion", "fachadas_altura", "alquiladora", "otro",
]);

// ¿El contacto principal tiene algún dato operativo usable?
function tieneContactoUtil(rec) {
  return rec.contactos.some(
    (c) => c.telefono || c.email || c.whatsapp || (c.nombre && !/^contacto/i.test(c.nombre)),
  );
}
function flotaConocida(rec) {
  const f = rec.flota;
  return f.flotaPropia === "si" || f.flotaTercerizada === "si";
}

let reviewNeeded = 0;
for (const rec of byKey.values()) {
  // Antel: telecom + estatal.
  if (rec.key === "antel") {
    rec.rubro = "telecomunicaciones";
    rec.tipoOrganizacion = "estado";
    rec.subrubro = "Telecom estatal";
    rec.observaciones = [rec.observaciones, "Organismo estatal (telecom)."]
      .filter(Boolean)
      .join(" ");
  }

  // Rubro sin clasificar -> "otro" (el operador lo corrige). No descartar.
  if (!rec.rubro || !RUBRO_VALIDO.has(rec.rubro)) {
    warnings.push(`Rubro no resuelto para "${rec.nombre}": se marcó "otro / revisar".`);
    rec.rubro = "otro";
  }

  if (!rec.tipoOrganizacion) rec.tipoOrganizacion = inferTipoOrg(rec.rubro, rec.key);
  if (!rec.subrubro) rec.subrubro = RUBRO_SUBLABEL[rec.rubro];
  if (!rec.fuente) {
    rec.fuente = "excel_canales";
    rec.esSugerida = true;
  }
  rec.etapa = inferEtapa(rec);
  rec.prioridad = rec.fromContactos ? "media" : "baja";

  // Marca de "revisar": importada con baja confianza / datos ambiguos.
  const motivos = [];
  if (rec.rubro === "otro") motivos.push("rubro sin clasificar");
  if (/\(/.test(rec.nombre)) motivos.push("nombre con alias ambiguo");
  if (rec.fromContactos && !tieneContactoUtil(rec) && !flotaConocida(rec)) {
    motivos.push("importada sin dato operativo");
  }
  if (motivos.length > 0) {
    rec.revisar = true;
    reviewNeeded++;
    rec.observaciones = [rec.observaciones, `Revisar: ${motivos.join("; ")}.`]
      .filter(Boolean)
      .join(" ");
  }
}

// Aviso conocido: Grinor / Saceem.
if (byKey.has("grinor") || byKey.has("saceem")) {
  warnings.push(
    'Grinor figura como constructora independiente y como alias "(GRINOR)" dentro de Saceem en contactos — revisar si son grupo antes de unificar.',
  );
}

// ───────────────────────────────────────────── armar CompanyProspect[]

function toProspect(rec) {
  return {
    id: rec.id,
    nombre: rec.nombre,
    rubro: rec.rubro,
    subrubro: rec.subrubro || undefined,
    tipoOrganizacion: rec.tipoOrganizacion,
    direccion: rec.direccion || undefined,
    localidad: rec.localidad || undefined,
    departamento: rec.departamento || undefined,
    web: undefined,
    observaciones: rec.observaciones || undefined,
    fuente: rec.fuente,
    esSugerida: rec.esSugerida || undefined,
    revisar: rec.revisar || undefined,
    etapa: rec.etapa,
    prioridad: rec.prioridad,
    contactos: rec.contactos,
    flota: rec.flota,
    proveedor: rec.proveedor,
    necesidades: rec.necesidades,
    propuestas: rec.propuestas,
    actividades: rec.actividades,
    creadoEn: GENERATED_AT,
    actualizadoEn: GENERATED_AT,
    ultimoContacto: rec.ultimoContacto || undefined,
  };
}

const prospects = [...byKey.values()].map(toProspect).sort((a, b) =>
  a.nombre.localeCompare(b.nombre, "es"),
);

// duplicados (informativo): registros que vinieron de ambos archivos.
let merged = 0;
let suggestedOnly = 0;
for (const rec of byKey.values()) {
  if (rec.fromContactos && rec.fromCanales) {
    merged++;
    duplicates.push({ empresa: rec.nombre, key: rec.key, fuentes: ["contactos", "canales"] });
  }
  if (!rec.fromContactos && rec.fromCanales) suggestedOnly++;
}

// ───────────────────────────────────────────── oportunidades de producto

const PROD_RULES = [
  { producto: "Soluciones de transporte de escaleras", rubros: ["telecomunicaciones", "fachadas_altura", "estado"], potencial: "alto", estado: "desarrollar" },
  { producto: "Organización de herramientas para técnicos móviles", rubros: ["climatizacion", "fachadas_altura", "telecomunicaciones"], potencial: "alto", estado: "buscar_proveedor" },
  { producto: "Soportes para líneas de vida", rubros: ["fachadas_altura"], potencial: "medio", estado: "idea" },
  { producto: "Equipamiento para cuadrillas", rubros: ["estado", "forestal"], potencial: "medio", estado: "evaluar" },
  { producto: "Cargadores eléctricos para flota", rubros: ["alquiladora", "constructora"], potencial: "medio", estado: "evaluar" },
];

const productOpportunities = PROD_RULES.map((rule, i) => {
  const empresas = prospects.filter((p) => rule.rubros.includes(p.rubro));
  return {
    id: `po-seed-${i + 1}`,
    producto: rule.producto,
    rubro: rule.rubros[0],
    empresaSolicitante: undefined,
    menciones: empresas.length,
    potencial: rule.potencial,
    comentario: `Deducida por rubro: ${rule.rubros.join(", ")}.`,
    estado: rule.estado,
  };
}).filter((po) => po.menciones > 0);

// ───────────────────────────────────────────── salida

const out = {
  seedVersion: SEED_VERSION,
  generatedAt: GENERATED_AT,
  sourceFiles: [FILE_CONTACTOS, FILE_CANALES],
  prospects,
  productOpportunities,
  audit: {
    totalFromContactos,
    totalFromCanales,
    merged,
    suggestedOnly,
    reviewNeeded,
    finalProspects: prospects.length,
    duplicates,
    warnings,
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

// ───────────────────────────────────────────── resumen consola

console.log("======= BUILD PROSPECCIÓN (seed desde Excel) =======");
console.log(`seedVersion: ${SEED_VERSION} | generatedAt: ${GENERATED_AT}`);
console.log(`Fuentes: ${FILE_CONTACTOS}, ${FILE_CANALES}`);
console.log(`Filas leídas de contactos: ${totalFromContactos}`);
console.log(`Empresas leídas de Canales (rubros del módulo): ${totalFromCanales}`);
console.log(`Prospects finales: ${prospects.length}`);
console.log(`  · enriquecidas (en ambos archivos): ${merged}`);
console.log(`  · sugeridas (solo Canales): ${suggestedOnly}`);
console.log(`  · marcadas para revisar: ${reviewNeeded}`);
const antel = prospects.find((p) => p.id === "prospect-antel");
console.log(
  `Antel -> rubro=${antel ? antel.rubro : "n/a"} | tipoOrg=${antel ? antel.tipoOrganizacion : "n/a"}`,
);
console.log(`Oportunidades de producto deducidas: ${productOpportunities.length}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach((w) => console.log("  ! " + w));
console.log(`\nSalida: ${path.relative(ROOT, OUT)}`);
console.log("=================== FIN ===================");
