/**
 * Normalización inteligente liviana (heurísticas + similitud textual).
 * Sin APIs externas ni dependencias pesadas.
 */

export type NormalizationField = "localidad" | "marca" | "modelo";

export type NormalizationMethod =
  | "exact"
  | "dictionary"
  | "alias"
  | "contains"
  | "similarity"
  | "title_case"
  | "rejected";

export type NormalizationResult = {
  original: string;
  canonical: string | null;
  confidence: number;
  method: NormalizationMethod;
};

export type EquivalenceGroup = {
  field: NormalizationField;
  canonical: string;
  variants: string[];
};

export type SmartNormalizationReport = {
  localidadesUnificadas: number;
  marcasUnificadas: number;
  modelosUnificados: number;
  filasExcluidasPorNormalizacion: number;
  /** Total de filas excluidas en el pipeline (calidad + normalización). */
  filasExcluidasAutomaticamente: number;
  topEquivalencias: EquivalenceGroup[];
};

const SIMILARITY_THRESHOLD = 0.82;
const SIMILARITY_THRESHOLD_STRICT = 0.88;

const JUNK_EXACT = new Set([
  "",
  "-",
  "--",
  "—",
  "?",
  "??",
  "n/a",
  "na",
  "s/d",
  "sd",
  "sin dato",
  "sin datos",
  "no informado",
  "no aplica",
  "null",
  "undefined",
  "xxx",
  "test",
  "prueba",
  ".",
  "..",
]);

/** Clave comparación: minúsculas, sin tildes, sin puntuación extra. */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[._/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function stringSimilarity(a: string, b: string): number {
  const keyA = normalizeKey(a);
  const keyB = normalizeKey(b);
  if (!keyA && !keyB) return 1;
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 1;
  if (keyA.includes(keyB) || keyB.includes(keyA)) {
    const ratio = Math.min(keyA.length, keyB.length) / Math.max(keyA.length, keyB.length);
    return 0.85 + ratio * 0.15;
  }
  const distance = levenshtein(keyA, keyB);
  const maxLen = Math.max(keyA.length, keyB.length);
  return 1 - distance / maxLen;
}

export function isJunkValue(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  const key = normalizeKey(trimmed);
  if (JUNK_EXACT.has(key)) return true;
  if (/^\d+$/.test(key)) return true;
  if (key.length === 1) return true;
  return false;
}

export function isJunkLocalidad(value: string | null | undefined): boolean {
  return isJunkValue(value);
}

export function isJunkMarca(value: string | null | undefined): boolean {
  if (isJunkValue(value)) return true;
  const key = normalizeKey(String(value));
  return ["generico", "generica", "universal", "sin marca", "s/marca"].includes(key);
}

export function isJunkModelo(value: string | null | undefined): boolean {
  if (isJunkValue(value)) return true;
  const key = normalizeKey(String(value));
  return ["generico", "universal", "sin modelo", "s/modelo", "todos"].includes(key);
}

export function isRowCompletelyEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    return false;
  });
}

const LOCALIDAD_CANONICAL: Record<string, string> = {
  montevideo: "Montevideo",
  "buenos aires": "Buenos Aires",
  cordoba: "Córdoba",
  rosario: "Rosario",
  mendoza: "Mendoza",
  neuquen: "Neuquén",
  "bahia blanca": "Bahía Blanca",
  "la plata": "La Plata",
  salto: "Salto",
  paysandu: "Paysandú",
  melo: "Melo",
  minas: "Minas",
  maldonado: "Maldonado",
  colonia: "Colonia",
  rivera: "Rivera",
  tacuarembo: "Tacuarembó",
  artigas: "Artigas",
  florida: "Florida",
  durazno: "Durazno",
  "treinta y tres": "Treinta y Tres",
  "san jose": "San José",
  trinidad: "Trinidad",
  "rio negro": "Río Negro",
  "fray bentos": "Fray Bentos",
  "mar del plata": "Mar del Plata",
  tandil: "Tandil",
  olavarria: "Olavarría",
  "santa fe": "Santa Fe",
  parana: "Paraná",
  resistencia: "Resistencia",
  posadas: "Posadas",
  salta: "Salta",
  tucuman: "Tucumán",
  "santiago del estero": "Santiago del Estero",
  "la rioja": "La Rioja",
  catamarca: "Catamarca",
  jujuy: "Jujuy",
  "san luis": "San Luis",
  "san juan": "San Juan",
  "rio cuarto": "Río Cuarto",
  bariloche: "Bariloche",
  ushuaia: "Ushuaia",
  "comodoro rivadavia": "Comodoro Rivadavia",
  "trelew rawson": "Trelew",
  trelew: "Trelew",
};

const LOCALIDAD_ALIASES: Record<string, string> = {
  mvd: "Montevideo",
  mdeo: "Montevideo",
  mvdeo: "Montevideo",
  montev: "Montevideo",
  "bs as": "Buenos Aires",
  bsas: "Buenos Aires",
  "b s a": "Buenos Aires",
  "capital federal": "Buenos Aires",
  caba: "Buenos Aires",
  "caba bs as": "Buenos Aires",
  "caba buenos aires": "Buenos Aires",
  "gba": "Buenos Aires",
  "gran buenos aires": "Buenos Aires",
  "neuquen cap": "Neuquén",
  "bahia bl": "Bahía Blanca",
  "b blanca": "Bahía Blanca",
  "mdp": "Mar del Plata",
  "mar del pl": "Mar del Plata",
};

const MARCA_CANONICAL: Record<string, string> = {
  toyota: "Toyota",
  ford: "Ford",
  chevrolet: "Chevrolet",
  volkswagen: "Volkswagen",
  vw: "Volkswagen",
  nissan: "Nissan",
  honda: "Honda",
  peugeot: "Peugeot",
  renault: "Renault",
  fiat: "Fiat",
  jeep: "Jeep",
  mitsubishi: "Mitsubishi",
  suzuki: "Suzuki",
  mercedes: "Mercedes-Benz",
  "mercedes benz": "Mercedes-Benz",
  "mercedes-benz": "Mercedes-Benz",
  bmw: "BMW",
  audi: "Audi",
  citroen: "Citroën",
  citroën: "Citroën",
  hyundai: "Hyundai",
  kia: "Kia",
  ram: "RAM",
  dodge: "Dodge",
  isuzu: "Isuzu",
  "great wall": "Great Wall",
  chery: "Chery",
  haval: "Haval",
};

const MARCA_ALIASES: Record<string, string> = {
  chevy: "Chevrolet",
  chev: "Chevrolet",
  gm: "Chevrolet",
  vw: "Volkswagen",
  volks: "Volkswagen",
  volksw: "Volkswagen",
  merc: "Mercedes-Benz",
  "merc benz": "Mercedes-Benz",
  "mercedes benz": "Mercedes-Benz",
  mb: "Mercedes-Benz",
};

const MODELO_CANONICAL: Record<string, string> = {
  hilux: "Hilux",
  amarok: "Amarok",
  ranger: "Ranger",
  s10: "S10",
  "s-10": "S10",
  l200: "L200",
  "l-200": "L200",
  frontier: "Frontier",
  navara: "Navara",
  np300: "NP300",
  oroch: "Oroch",
  toro: "Toro",
  strada: "Strada",
  saveiro: "Saveiro",
  f150: "F-150",
  "f-150": "F-150",
  maverick: "Maverick",
  bronco: "Bronco",
  everest: "Everest",
  triton: "Triton",
  pajero: "Pajero",
  montero: "Montero",
  "l200 triton": "L200",
  dmax: "D-Max",
  "d-max": "D-Max",
  colorado: "Colorado",
  canyon: "Canyon",
  "navara np300": "Navara",
  "frontier np300": "Frontier",
  sw4: "SW4",
  fortuner: "Fortuner",
  "land cruiser": "Land Cruiser",
  prado: "Prado",
  "4runner": "4Runner",
  pathfinder: "Pathfinder",
  xtrail: "X-Trail",
  "x-trail": "X-Trail",
  outlander: "Outlander",
  asx: "ASX",
  tiguan: "Tiguan",
  "amarok v6": "Amarok",
  "hilux srv": "Hilux",
  "hilux srx": "Hilux",
  "hilux 4x4": "Hilux",
  "ranger xlt": "Ranger",
  "ranger limited": "Ranger",
};

const MARCA_KEYS_FOR_STRIP = [
  ...Object.keys(MARCA_CANONICAL),
  ...Object.keys(MARCA_ALIASES).map(normalizeKey),
];

function matchFromMaps(
  key: string,
  canonicalMap: Record<string, string>,
  aliasMap: Record<string, string>,
): { canonical: string; method: NormalizationMethod; confidence: number } | null {
  if (canonicalMap[key]) {
    return { canonical: canonicalMap[key], method: "dictionary", confidence: 1 };
  }
  if (aliasMap[key]) {
    return { canonical: aliasMap[key], method: "alias", confidence: 0.98 };
  }

  for (const [aliasKey, canonical] of Object.entries(aliasMap)) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) {
      if (Math.min(key.length, aliasKey.length) >= 3) {
        return { canonical, method: "contains", confidence: 0.9 };
      }
    }
  }

  return null;
}

function bestSimilarityMatch(
  key: string,
  candidates: string[],
): { canonical: string; score: number } | null {
  let best: { canonical: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = stringSimilarity(key, normalizeKey(candidate));
    if (!best || score > best.score) {
      best = { canonical: candidate, score };
    }
  }

  return best;
}

export class NormalizationRegistry {
  private readonly groups = new Map<string, EquivalenceGroup>();
  filasExcluidasPorNormalizacion = 0;

  record(field: NormalizationField, original: string, canonical: string): void {
    const trimmed = original.trim();
    if (!trimmed || !canonical) return;
    if (normalizeKey(trimmed) === normalizeKey(canonical)) return;

    const groupKey = `${field}::${normalizeKey(canonical)}`;
    const existing = this.groups.get(groupKey);
    if (existing) {
      if (!existing.variants.includes(trimmed)) {
        existing.variants.push(trimmed);
      }
      return;
    }

    this.groups.set(groupKey, {
      field,
      canonical,
      variants: [trimmed],
    });
  }

  incrementExclusions(count = 1): void {
    this.filasExcluidasPorNormalizacion += count;
  }

  getEquivalenceGroups(): EquivalenceGroup[] {
    return [...this.groups.values()];
  }

  buildReport(): SmartNormalizationReport {
    const groups = this.getEquivalenceGroups();
    const localidades = groups.filter((g) => g.field === "localidad");
    const marcas = groups.filter((g) => g.field === "marca");
    const modelos = groups.filter((g) => g.field === "modelo");

    const topEquivalencias = [...groups]
      .sort((a, b) => b.variants.length - a.variants.length)
      .slice(0, 12);

    return {
      localidadesUnificadas: localidades.length,
      marcasUnificadas: marcas.length,
      modelosUnificados: modelos.length,
      filasExcluidasPorNormalizacion: this.filasExcluidasPorNormalizacion,
      filasExcluidasAutomaticamente: this.filasExcluidasPorNormalizacion,
      topEquivalencias,
    };
  }
}

export function normalizeLocalidad(
  input: string | null | undefined,
  registry?: NormalizationRegistry,
): NormalizationResult {
  const original = String(input ?? "").trim();

  if (isJunkLocalidad(original)) {
    return { original, canonical: null, confidence: 0, method: "rejected" };
  }

  const key = normalizeKey(original);
  const direct = matchFromMaps(key, LOCALIDAD_CANONICAL, LOCALIDAD_ALIASES);
  if (direct) {
    registry?.record("localidad", original, direct.canonical);
    return { original, ...direct };
  }

  const candidates = [...new Set(Object.values(LOCALIDAD_CANONICAL))];
  const similar = bestSimilarityMatch(key, candidates);
  if (similar && similar.score >= SIMILARITY_THRESHOLD) {
    registry?.record("localidad", original, similar.canonical);
    return {
      original,
      canonical: similar.canonical,
      confidence: similar.score,
      method: "similarity",
    };
  }

  if (/^[a-z0-9\s.-]{3,}$/i.test(original)) {
    const titled = toTitleCase(original);
    const titledKey = normalizeKey(titled);
    const titledMatch = matchFromMaps(titledKey, LOCALIDAD_CANONICAL, LOCALIDAD_ALIASES);
    if (titledMatch) {
      registry?.record("localidad", original, titledMatch.canonical);
      return { original, ...titledMatch };
    }
    const titledSimilar = bestSimilarityMatch(titledKey, candidates);
    if (titledSimilar && titledSimilar.score >= SIMILARITY_THRESHOLD_STRICT) {
      registry?.record("localidad", original, titledSimilar.canonical);
      return {
        original,
        canonical: titledSimilar.canonical,
        confidence: titledSimilar.score,
        method: "similarity",
      };
    }
    if (titledSimilar && titledSimilar.score >= 0.75) {
      registry?.record("localidad", original, titled);
      return {
        original,
        canonical: titled,
        confidence: titledSimilar.score,
        method: "title_case",
      };
    }
  }

  return { original, canonical: null, confidence: 0, method: "rejected" };
}

export function normalizeMarca(
  input: string | null | undefined,
  registry?: NormalizationRegistry,
): NormalizationResult {
  const original = String(input ?? "").trim();

  if (isJunkMarca(original)) {
    return { original, canonical: null, confidence: 0, method: "rejected" };
  }

  const key = normalizeKey(original);
  const direct = matchFromMaps(key, MARCA_CANONICAL, MARCA_ALIASES);
  if (direct) {
    registry?.record("marca", original, direct.canonical);
    return { original, ...direct };
  }

  const candidates = [...new Set(Object.values(MARCA_CANONICAL))];
  const similar = bestSimilarityMatch(key, candidates);
  if (similar && similar.score >= SIMILARITY_THRESHOLD) {
    registry?.record("marca", original, similar.canonical);
    return {
      original,
      canonical: similar.canonical,
      confidence: similar.score,
      method: "similarity",
    };
  }

  const titled = toTitleCase(original);
  if (titled.length >= 2) {
    const titledKey = normalizeKey(titled);
    const titledMatch = matchFromMaps(titledKey, MARCA_CANONICAL, MARCA_ALIASES);
    if (titledMatch) {
      registry?.record("marca", original, titledMatch.canonical);
      return { original, ...titledMatch };
    }
  }

  return { original, canonical: null, confidence: 0, method: "rejected" };
}

function stripMarcaFromModelo(raw: string, marcaCanonica?: string): string {
  let working = raw.trim();
  const key = normalizeKey(working);

  if (marcaCanonica) {
    const marcaKey = normalizeKey(marcaCanonica);
    working = working.replace(new RegExp(`\\b${marcaKey}\\b`, "gi"), " ");
  }

  for (const marcaToken of MARCA_KEYS_FOR_STRIP) {
    if (marcaToken.length < 2) continue;
    working = working.replace(new RegExp(`\\b${marcaToken}\\b`, "gi"), " ");
  }

  working = working.replace(/\b(4x4|4wd|awd|diesel|tdi|v6|v8|srv|srx|xlt|limited)\b/gi, " ");
  return working.replace(/\s+/g, " ").trim();
}

export function normalizeModelo(
  input: string | null | undefined,
  marcaCanonica?: string,
  registry?: NormalizationRegistry,
): NormalizationResult {
  const original = String(input ?? "").trim();

  if (isJunkModelo(original)) {
    return { original, canonical: null, confidence: 0, method: "rejected" };
  }

  const stripped = stripMarcaFromModelo(original, marcaCanonica);
  const key = normalizeKey(stripped || original);

  const direct = matchFromMaps(key, MODELO_CANONICAL, {});
  if (direct) {
    registry?.record("modelo", original, direct.canonical);
    return { original, ...direct };
  }

  const candidates = [...new Set(Object.values(MODELO_CANONICAL))];
  const similar = bestSimilarityMatch(key, candidates);
  if (similar && similar.score >= SIMILARITY_THRESHOLD) {
    registry?.record("modelo", original, similar.canonical);
    return {
      original,
      canonical: similar.canonical,
      confidence: similar.score,
      method: "similarity",
    };
  }

  const compact = key.replace(/\s+/g, "");
  const compactMatch = Object.entries(MODELO_CANONICAL).find(
    ([modelKey]) => modelKey.replace(/\s+/g, "") === compact,
  );
  if (compactMatch) {
    registry?.record("modelo", original, compactMatch[1]);
    return {
      original,
      canonical: compactMatch[1],
      confidence: 0.9,
      method: "contains",
    };
  }

  const token = stripped.split(/\s+/).filter((t) => t.length >= 3)[0];
  if (token) {
    const tokenKey = normalizeKey(token);
    const tokenMatch = matchFromMaps(tokenKey, MODELO_CANONICAL, {});
    if (tokenMatch) {
      registry?.record("modelo", original, tokenMatch.canonical);
      return { original, ...tokenMatch };
    }
  }

  return { original, canonical: null, confidence: 0, method: "rejected" };
}
