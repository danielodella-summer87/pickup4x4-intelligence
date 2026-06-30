/**
 * Pickup 4x4 — Seed de RESPUESTAS DEMO para Inteligencia de Mercado.
 *
 * Inserta ~18 respuestas claramente demo en `mercado_respuestas`, apuntando a la
 * investigación activa `estado-mercado-4x4`, para poder evaluar la analítica del
 * panel (Resumen / Tendencias / Oportunidades / Comentarios) con datos reales.
 *
 * Características:
 *   - DEMO evidente: nombre con prefijo "[Demo] ", contacto "@demo.test",
 *     y meta.demo = true en cada fila.
 *   - Idempotente: ids deterministas `demo-resp-estado-mercado-4x4-NN` + upsert
 *     onConflict=id → re-ejecutar NO duplica.
 *   - Seguro: NO toca el esquema, NO modifica investigaciones, NO borra datos
 *     reales. La limpieza (--clean) borra SOLO filas con id `demo-resp-%`.
 *
 * Uso (revisar antes de correr):
 *   node scripts/seed-mercado-respuestas-demo.cjs          # inserta/actualiza demos
 *   node scripts/seed-mercado-respuestas-demo.cjs --clean  # borra SOLO las demos
 *
 * Variables (de .env.local o entorno): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const SLUG = "estado-mercado-4x4";
const ID_PREFIX = "demo-resp-estado-mercado-4x4-";

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

// ── Datos demo ───────────────────────────────────────────────────────────────
// Reuso intencional de términos (marcas, productos a importar, oportunidades)
// para que Tendencias y Oportunidades muestren agregación / repetidos.
const DEMOS = [
  {
    nombre: "Martín Pereyra", empresa: "Repuestos del Norte", depto: "Salto",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, Ford, VW",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Cubrecajas roll-up, lonas marítimas, estribos",
      "productos-menos-vendidos": "Antenas, fundas de tela",
      "productos-dificiles": "Snorkels, amortiguadores reforzados",
      "productos-importar": "Snorkels, lonas marítimas, portaequipajes de techo",
      "tendencias-nuevas": "Más demanda de accesorios para camping y overlanding",
      "clientes-comportamiento": "Compran online y retiran en local",
      "competencia-acciones": "Bajaron precios en cubrecajas importados",
      "tecnologia-cambios": "Primeras consultas por pickups híbridas",
      "oportunidades-detectadas": "Accesorios para camping, kits de overlanding",
      "necesidades-no-cubiertas": "Cubrecajas para modelos chinos nuevos",
      "empresas-interesantes": "Agro El Ceibo, Transportes Litoral",
      "ideas-distribuidor": "Armar combos de accesorios para 0km",
    },
    comentario: "El cliente del agro está invirtiendo fuerte, hay oportunidad en accesorios de trabajo.",
    daysAgo: 27,
  },
  {
    nombre: "Lucía Fernández", empresa: "AutoParts Costa", depto: "Maldonado",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Nissan, Chevrolet",
      "marcas-en-crecimiento": "JAC",
      "productos-mas-vendidos": "Lonas marítimas, barras antivuelco",
      "productos-menos-vendidos": "Cubrecajas de fibra",
      "productos-dificiles": "Snorkels",
      "productos-importar": "Snorkels, cubrecajas roll-up",
      "tendencias-nuevas": "Turismo 4x4 en la costa, alquiler de pickups",
      "clientes-comportamiento": "Más sensibles al precio que antes",
      "competencia-acciones": "Marketing fuerte en redes sociales",
      "tecnologia-cambios": "Interés en cámaras de retroceso y sensores",
      "oportunidades-detectadas": "Equipamiento para turismo aventura",
      "necesidades-no-cubiertas": "Service especializado en accesorios",
      "empresas-interesantes": "Rental 4x4 Punta, Camping Oceánico",
      "ideas-distribuidor": "Alianzas con rentadoras de la zona",
    },
    comentario: "En temporada alta la demanda se multiplica, conviene stock anticipado.",
    daysAgo: 25,
  },
  {
    nombre: "Diego Sosa", empresa: "4x4 Center", depto: "Montevideo",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 5,
      "marcas-mas-vendidas": "Ford, Toyota, VW",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Estribos, cubrecajas roll-up, defensas",
      "productos-menos-vendidos": "Fundas de tela",
      "productos-dificiles": "Amortiguadores reforzados, snorkels",
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": "Personalización y estética off-road",
      "clientes-comportamiento": "Investigan mucho antes de comprar",
      "competencia-acciones": "Importadores directos compitiendo en precio",
      "tecnologia-cambios": "Híbridos y eléctricos empiezan a aparecer",
      "oportunidades-detectadas": "Kits de overlanding, suspensiones premium",
      "necesidades-no-cubiertas": "Repuestos para marcas chinas",
      "empresas-interesantes": "Constructora Vial Sur, Logística Capital",
      "ideas-distribuidor": "Showroom con vehículos equipados de muestra",
    },
    comentario: "La personalización es el gran driver en la capital, márgenes altos.",
    daysAgo: 24,
  },
  {
    nombre: "Ana Rodríguez", empresa: "Campo y Ruta", depto: "Paysandú",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Ford, Great Wall",
      "marcas-en-crecimiento": "Great Wall",
      "productos-mas-vendidos": "Lonas marítimas, enganches",
      "productos-menos-vendidos": "Antenas",
      "productos-dificiles": "Cubrecajas para modelos chinos",
      "productos-importar": "Cubrecajas roll-up, enganches reforzados",
      "tendencias-nuevas": "Entrada de marcas chinas al agro",
      "clientes-comportamiento": "Fidelidad a la marca que ya conocen",
      "competencia-acciones": "Financiación en cuotas sin interés",
      "tecnologia-cambios": "Consultan por conectividad y GPS",
      "oportunidades-detectadas": "Equipamiento para ganadería y agro",
      "necesidades-no-cubiertas": "Cubrecajas para modelos chinos nuevos",
      "empresas-interesantes": "Estancia La Querencia, Cooperativa Agraria",
      "ideas-distribuidor": "Catálogo específico por rubro (agro, construcción)",
    },
    comentario: "Las marcas chinas crecen rápido y faltan accesorios compatibles.",
    daysAgo: 22,
  },
  {
    nombre: "Federico Methol", empresa: "Pickup Store", depto: "Canelones",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, VW, Nissan",
      "marcas-en-crecimiento": "VW",
      "productos-mas-vendidos": "Cubrecajas roll-up, estribos",
      "productos-menos-vendidos": "Fundas de tela, antenas",
      "productos-dificiles": "Snorkels, suspensiones reforzadas",
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": "Overlanding y viajes largos en familia",
      "clientes-comportamiento": "Buscan financiación y combos",
      "competencia-acciones": "Promos agresivas online",
      "tecnologia-cambios": "Híbridos en consulta, todavía pocos",
      "oportunidades-detectadas": "Kits de overlanding, camping",
      "necesidades-no-cubiertas": "Asesoramiento técnico de instalación",
      "empresas-interesantes": "Distribuidora Ruta 8, Camping del Este",
      "ideas-distribuidor": "Servicio de instalación a domicilio",
    },
    comentario: "Falta un buen servicio de instalación, ahí hay un diferencial claro.",
    daysAgo: 20,
  },
  {
    nombre: "Valentina Castro", empresa: "Off Road Uy", depto: "Colonia",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Ford, Toyota, Chevrolet",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Defensas, estribos, lonas marítimas",
      "productos-menos-vendidos": "Cubrecajas de fibra",
      "productos-dificiles": "Amortiguadores reforzados",
      "productos-importar": "Suspensiones reforzadas, defensas",
      "tendencias-nuevas": "Estética off-road urbana",
      "clientes-comportamiento": "Compran por recomendación",
      "competencia-acciones": "Apertura de nuevos locales",
      "tecnologia-cambios": "Sensores y cámaras cada vez más pedidos",
      "oportunidades-detectadas": "Accesorios estéticos premium",
      "necesidades-no-cubiertas": "Repuestos para marcas chinas",
      "empresas-interesantes": "Frigorífico Colonia, Vitivinícola del Plata",
      "ideas-distribuidor": "Programa de fidelización con puntos",
    },
    comentario: null,
    daysAgo: 19,
  },
  {
    nombre: "Gonzalo Bentancur", empresa: "Frontera 4x4", depto: "Rivera",
    r: {
      "mercado-situacion": "En caída", "mercado-actividad": 2,
      "marcas-mas-vendidas": "Toyota, Ford",
      "marcas-en-crecimiento": "JAC",
      "productos-mas-vendidos": "Lonas marítimas, enganches",
      "productos-menos-vendidos": "Antenas, fundas",
      "productos-dificiles": "Snorkels, cubrecajas roll-up",
      "productos-importar": "Cubrecajas roll-up, snorkels",
      "tendencias-nuevas": "Compra cruzada en frontera con Brasil",
      "clientes-comportamiento": "Comparan precios con Brasil",
      "competencia-acciones": "Productos importados de Brasil más baratos",
      "tecnologia-cambios": "Poco interés en eléctricos por ahora",
      "oportunidades-detectadas": "Productos que no se consiguen del lado brasileño",
      "necesidades-no-cubiertas": "Garantía y posventa local",
      "empresas-interesantes": "Transportes Frontera, Maderera del Norte",
      "ideas-distribuidor": "Diferenciarse por garantía y servicio",
    },
    comentario: "La competencia con Brasil aprieta, hay que jugar con servicio y garantía.",
    daysAgo: 18,
  },
  {
    nombre: "Carolina Núñez", empresa: "Ruta Sur Repuestos", depto: "Rocha",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Nissan, Ford",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Lonas marítimas, barras",
      "productos-menos-vendidos": "Fundas de tela",
      "productos-dificiles": "Snorkels",
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": "Turismo de naturaleza y pesca",
      "clientes-comportamiento": "Estacional, fuerte en verano",
      "competencia-acciones": "Ferias y eventos off-road",
      "tecnologia-cambios": "Interés creciente en GPS y comunicación",
      "oportunidades-detectadas": "Equipamiento para pesca y camping",
      "necesidades-no-cubiertas": "Stock en temporada baja",
      "empresas-interesantes": "Camping Oceánico, Pesca Deportiva Rocha",
      "ideas-distribuidor": "Pack 'aventura' para turistas",
    },
    comentario: null,
    daysAgo: 16,
  },
  {
    nombre: "Sebastián Olivera", empresa: "Mecánica Central", depto: "Tacuarembó",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, Ford, Great Wall",
      "marcas-en-crecimiento": "Great Wall",
      "productos-mas-vendidos": "Cubrecajas roll-up, defensas",
      "productos-menos-vendidos": "Antenas",
      "productos-dificiles": "Suspensiones reforzadas",
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": "Pickups como vehículo de trabajo principal",
      "clientes-comportamiento": "Priorizan durabilidad",
      "competencia-acciones": "Talleres ofreciendo accesorios",
      "tecnologia-cambios": "Consultas por sistemas de tracción",
      "oportunidades-detectadas": "Equipamiento de trabajo pesado",
      "necesidades-no-cubiertas": "Repuestos para marcas chinas",
      "empresas-interesantes": "Forestal del Norte, Agropecuaria San José",
      "ideas-distribuidor": "Convenios con empresas forestales",
    },
    comentario: "La forestación demanda mucho accesorio de trabajo pesado.",
    daysAgo: 15,
  },
  {
    nombre: "Paula Methol", empresa: "Accesorios del Este", depto: "Maldonado",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, VW, Ford",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Estribos, cubrecajas roll-up",
      "productos-menos-vendidos": "Fundas de tela",
      "productos-dificiles": "Snorkels, amortiguadores reforzados",
      "productos-importar": "Snorkels, lonas marítimas",
      "tendencias-nuevas": "Overlanding de lujo",
      "clientes-comportamiento": "Alto poder adquisitivo en la zona",
      "competencia-acciones": "Importación directa por particulares",
      "tecnologia-cambios": "Eléctricos en aumento en Punta del Este",
      "oportunidades-detectadas": "Accesorios premium, camping de lujo",
      "necesidades-no-cubiertas": "Productos de gama alta",
      "empresas-interesantes": "Inmobiliaria del Este, Hotel de Campo",
      "ideas-distribuidor": "Línea premium diferenciada",
    },
    comentario: null,
    daysAgo: 13,
  },
  {
    nombre: "Rodrigo Píriz", empresa: "Taller San José 4x4", depto: "San José",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Ford, Toyota, Nissan",
      "marcas-en-crecimiento": "VW",
      "productos-mas-vendidos": "Lonas marítimas, enganches, estribos",
      "productos-menos-vendidos": "Antenas",
      "productos-dificiles": "Cubrecajas roll-up",
      "productos-importar": "Cubrecajas roll-up, enganches reforzados",
      "tendencias-nuevas": "Pickups en logística de cercanía",
      "clientes-comportamiento": "Compran cuando renuevan vehículo",
      "competencia-acciones": "Precios bajos en lo importado",
      "tecnologia-cambios": "Poco movimiento en híbridos aún",
      "oportunidades-detectadas": "Accesorios para reparto y logística",
      "necesidades-no-cubiertas": "Entrega rápida de repuestos",
      "empresas-interesantes": "Logística Capital, Distribuidora Ruta 1",
      "ideas-distribuidor": "Entrega express en 24h",
    },
    comentario: "La logística urbana está creciendo, hay demanda de accesorios de carga.",
    daysAgo: 12,
  },
  {
    nombre: "Florencia Long", empresa: "Pampa Repuestos", depto: "Florida",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Ford, Chevrolet",
      "marcas-en-crecimiento": "Great Wall",
      "productos-mas-vendidos": "Cubrecajas roll-up, lonas marítimas",
      "productos-menos-vendidos": "Fundas de tela, antenas",
      "productos-dificiles": "Snorkels",
      "productos-importar": "Snorkels, suspensiones reforzadas",
      "tendencias-nuevas": "Demanda estable del sector agropecuario",
      "clientes-comportamiento": "Conservadores, buscan lo conocido",
      "competencia-acciones": "Atención personalizada como diferencial",
      "tecnologia-cambios": "Interés bajo en nuevas tecnologías",
      "oportunidades-detectadas": "Equipamiento para ganadería y agro",
      "necesidades-no-cubiertas": "Asesoramiento técnico",
      "empresas-interesantes": "Tambo La Esperanza, Cabaña Florida",
      "ideas-distribuidor": "Visitas técnicas a establecimientos rurales",
    },
    comentario: null,
    daysAgo: 11,
  },
  {
    nombre: "Mauricio Da Silva", empresa: "Litoral Motors", depto: "Río Negro",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, Ford, VW",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Estribos, defensas, cubrecajas roll-up",
      "productos-menos-vendidos": "Antenas",
      "productos-dificiles": "Suspensiones reforzadas, snorkels",
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": "Crecimiento por polo industrial / celulosa",
      "clientes-comportamiento": "Empresas comprando flotas",
      "competencia-acciones": "Licitaciones para flotas",
      "tecnologia-cambios": "Telemetría y gestión de flotas",
      "oportunidades-detectadas": "Equipamiento para flotas corporativas",
      "necesidades-no-cubiertas": "Soluciones para gestión de flotas",
      "empresas-interesantes": "UPM Servicios, Constructora Vial Sur",
      "ideas-distribuidor": "Paquetes corporativos para flotas",
    },
    comentario: "Las flotas corporativas son la gran oportunidad de la región.",
    daysAgo: 9,
  },
  {
    nombre: "Natalia Cabrera", empresa: "Sierras 4x4", depto: "Lavalleja",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Nissan",
      "marcas-en-crecimiento": "JAC",
      "productos-mas-vendidos": "Lonas marítimas, barras antivuelco",
      "productos-menos-vendidos": "Fundas",
      "productos-dificiles": "Snorkels, cubrecajas roll-up",
      "productos-importar": "Cubrecajas roll-up, portaequipajes de techo",
      "tendencias-nuevas": "Turismo de aventura en las sierras",
      "clientes-comportamiento": "Mix de trabajo y recreación",
      "competencia-acciones": "Poca competencia local directa",
      "tecnologia-cambios": "GPS y comunicación en zonas sin señal",
      "oportunidades-detectadas": "Equipamiento para turismo aventura",
      "necesidades-no-cubiertas": "Comunicación en zonas rurales",
      "empresas-interesantes": "Turismo Sierras, Minera del Este",
      "ideas-distribuidor": "Kits de comunicación off-grid",
    },
    comentario: null,
    daysAgo: 8,
  },
  {
    nombre: "Andrés Viera", empresa: "Norte Grande Repuestos", depto: "Artigas",
    r: {
      "mercado-situacion": "En caída", "mercado-actividad": 2,
      "marcas-mas-vendidas": "Toyota, Ford, Great Wall",
      "marcas-en-crecimiento": "Great Wall",
      "productos-mas-vendidos": "Lonas marítimas, enganches",
      "productos-menos-vendidos": "Antenas, fundas",
      "productos-dificiles": "Snorkels, amortiguadores reforzados",
      "productos-importar": "Snorkels, lonas marítimas",
      "tendencias-nuevas": "Compra en frontera, presión de precios",
      "clientes-comportamiento": "Muy sensibles al precio",
      "competencia-acciones": "Productos brasileños más baratos",
      "tecnologia-cambios": "Poco interés en eléctricos",
      "oportunidades-detectadas": "Productos no disponibles en frontera",
      "necesidades-no-cubiertas": "Garantía y posventa local",
      "empresas-interesantes": "Arrocera del Norte, Citrícola Artigas",
      "ideas-distribuidor": "Servicio posventa como diferencial",
    },
    comentario: "Sin un buen posventa no se le gana a la compra en frontera.",
    daysAgo: 6,
  },
  {
    nombre: "Soledad Methol", empresa: "Centro Sur 4x4", depto: "Durazno",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Ford, Nissan",
      "marcas-en-crecimiento": "VW",
      "productos-mas-vendidos": "Cubrecajas roll-up, estribos",
      "productos-menos-vendidos": "Fundas de tela",
      "productos-dificiles": "Suspensiones reforzadas",
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": "Pickups para contratistas rurales",
      "clientes-comportamiento": "Buscan resistencia y bajo mantenimiento",
      "competencia-acciones": "Combos de accesorios + instalación",
      "tecnologia-cambios": "Interés en tracción y suspensión",
      "oportunidades-detectadas": "Equipamiento de trabajo pesado",
      "necesidades-no-cubiertas": "Repuestos para marcas chinas",
      "empresas-interesantes": "Contratista Rural Centro, Agro Durazno",
      "ideas-distribuidor": "Combos trabajo pesado con instalación",
    },
    comentario: null,
    daysAgo: 5,
  },
  {
    nombre: "Joaquín Rivero", empresa: "Soriano Motors", depto: "Soriano",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": "Toyota, VW, Ford",
      "marcas-en-crecimiento": "Toyota",
      "productos-mas-vendidos": "Estribos, lonas marítimas, defensas",
      "productos-menos-vendidos": "Antenas",
      "productos-dificiles": "Snorkels",
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": "Agroindustria pujante, renovación de flotas",
      "clientes-comportamiento": "Empresas y productores invierten",
      "competencia-acciones": "Financiación atractiva",
      "tecnologia-cambios": "Gestión de flotas y telemetría",
      "oportunidades-detectadas": "Equipamiento para flotas corporativas",
      "necesidades-no-cubiertas": "Soluciones para gestión de flotas",
      "empresas-interesantes": "Molino Dolores, Agroindustria Mercedes",
      "ideas-distribuidor": "Paquetes corporativos para flotas",
    },
    comentario: "La renovación de flotas en el agro es constante, conviene estar presente.",
    daysAgo: 3,
  },
  {
    nombre: "Gabriela Suárez", empresa: "Este Profundo Accesorios", depto: "Cerro Largo",
    r: {
      "mercado-situacion": "Estable", "mercado-actividad": 3,
      "marcas-mas-vendidas": "Toyota, Ford, Great Wall",
      "marcas-en-crecimiento": "Great Wall",
      "productos-mas-vendidos": "Lonas marítimas, cubrecajas roll-up",
      "productos-menos-vendidos": "Fundas, antenas",
      "productos-dificiles": "Snorkels, cubrecajas para chinos",
      "productos-importar": "Cubrecajas roll-up, snorkels",
      "tendencias-nuevas": "Marcas chinas ganando terreno en el agro",
      "clientes-comportamiento": "Abiertos a probar marcas nuevas",
      "competencia-acciones": "Promos de financiación",
      "tecnologia-cambios": "Consultas por conectividad",
      "oportunidades-detectadas": "Equipamiento para ganadería y agro",
      "necesidades-no-cubiertas": "Cubrecajas para modelos chinos nuevos",
      "empresas-interesantes": "Estancia La Querencia, Frigorífico Melo",
      "ideas-distribuidor": "Catálogo específico para marcas chinas",
    },
    comentario: null,
    daysAgo: 1,
  },
];

function buildRow(demo, index) {
  const nn = String(index + 1).padStart(2, "0");
  const createdAt = new Date(
    Date.now() - demo.daysAgo * 86400000 - (index % 8) * 3600000,
  ).toISOString();
  return {
    id: `${ID_PREFIX}${nn}`,
    investigacion_id: null, // se completa con el id real resuelto por slug
    investigacion_slug: SLUG,
    distribuidor_nombre: `[Demo] ${demo.nombre}`,
    empresa: demo.empresa,
    departamento: demo.depto,
    contacto: `${demo.nombre.split(" ")[0].toLowerCase()}@demo.test`,
    respuestas: demo.r,
    comentario_libre: demo.comentario,
    meta: { demo: true, seededBy: "seed-mercado-respuestas-demo" },
    created_at: createdAt,
  };
}

(async () => {
  const supabase = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clean = process.argv.includes("--clean");

  if (clean) {
    const { data, error } = await supabase
      .from("mercado_respuestas")
      .delete()
      .like("id", `${ID_PREFIX}%`)
      .select("id");
    if (error) throw new Error(`clean: ${error.message}`);
    console.log(`Limpieza OK · ${data ? data.length : 0} respuesta(s) demo eliminada(s).`);
    console.log("OK");
    return;
  }

  // 1) Resolver el id real de la investigación por slug (y validar que exista)
  const { data: inv, error: invErr } = await supabase
    .from("mercado_investigaciones")
    .select("id, slug, estado")
    .eq("slug", SLUG)
    .maybeSingle();
  if (invErr) throw new Error(`buscar investigación: ${invErr.message}`);
  if (!inv) {
    console.error(`No existe la investigación con slug "${SLUG}". ¿Corriste la migración?`);
    process.exit(1);
  }
  if (inv.estado !== "activa") {
    console.warn(`Aviso: la investigación "${SLUG}" está en estado "${inv.estado}" (no "activa"). Se siembran respuestas igual.`);
  }

  // 2) Construir filas con el investigacion_id real
  const rows = DEMOS.map(buildRow).map((row) => ({ ...row, investigacion_id: inv.id }));

  // 3) Upsert idempotente por id
  const { data, error } = await supabase
    .from("mercado_respuestas")
    .upsert(rows, { onConflict: "id" })
    .select("id");
  if (error) throw new Error(`upsert respuestas demo: ${error.message}`);

  console.log(`Sembradas/actualizadas ${data ? data.length : rows.length} respuestas demo en "${SLUG}" (id=${inv.id}).`);
  console.log("Para limpiar luego:  node scripts/seed-mercado-respuestas-demo.cjs --clean");
  console.log("OK");
})().catch((e) => {
  console.error("SEED FALLÓ:", e.message);
  process.exit(1);
});
