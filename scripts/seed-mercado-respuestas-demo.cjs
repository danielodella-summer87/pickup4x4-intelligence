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
// Alineado a la estructura vigente de la encuesta `estado-mercado-4x4`
// (ver supabase/migrations/20260629_inteligencia_mercado.sql):
//   - opcion_unica  → mercado-situacion (string de las opciones)
//   - escala        → mercado-actividad (número 1..5)
//   - opcion_multiple → marcas-mas-vendidas, productos-mas-vendidos,
//     productos-menos-vendidos, productos-dificiles, tendencias-nuevas,
//     clientes-comportamiento (arrays con las ETIQUETAS EXACTAS de las opciones,
//     salvo valores "Otro" libres permitidos por permiteOtro).
//   - texto_largo   → productos-importar, competencia-acciones, tecnologia-cambios,
//     oportunidades-detectadas, necesidades-no-cubiertas, empresas-interesantes,
//     ideas-distribuidor (strings).
// La pregunta `marcas-en-crecimiento` ya NO existe en el cuestionario y se quitó.
// Reuso intencional de términos (marcas, productos, oportunidades) para que
// Tendencias y Oportunidades muestren agregación / repetidos.
const DEMOS = [
  {
    nombre: "Martín Pereyra", empresa: "Repuestos del Norte", depto: "Salto",
    r: {
      "mercado-situacion": "En crecimiento", "mercado-actividad": 4,
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "Volkswagen Amarok"],
      "productos-mas-vendidos": ["Cubre caja", "Lona marítima", "Estribos"],
      "productos-menos-vendidos": ["Iluminación LED", "Organizadores de caja"],
      "productos-dificiles": ["Snorkel", "Suspensión / refuerzos", "Accesorios para nuevas marcas"],
      "productos-importar": "Snorkels, lonas marítimas, portaequipajes de techo",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo", "Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Comparan más precios antes de comprar", "Preguntan más por instalación y garantía"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Nissan Frontier", "Chevrolet S10"],
      "productos-mas-vendidos": ["Lona marítima", "Barras / accesorios deportivos"],
      "productos-menos-vendidos": ["Cubre caja"],
      "productos-dificiles": ["Snorkel", "Cubre caja"],
      "productos-importar": "Snorkels, cubrecajas roll-up",
      "tendencias-nuevas": ["Más preocupación por precio y financiación", "Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Comparan más precios antes de comprar", "Priorizan precio por encima de marca"],
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
      "marcas-mas-vendidas": ["Ford Ranger", "Toyota Hilux", "Volkswagen Amarok"],
      "productos-mas-vendidos": ["Estribos", "Cubre caja", "Defensas"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Suspensión / refuerzos", "Snorkel"],
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": ["Más interés por equipamiento estético / deportivo", "Clientes más cautelosos antes de comprar"],
      "clientes-comportamiento": ["Demoran más en tomar la decisión", "Siguen valorando productos de mejor calidad"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "GWM Poer"],
      "productos-mas-vendidos": ["Lona marítima", "Enganche"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Cubre caja", "Accesorios para nuevas marcas"],
      "productos-importar": "Cubrecajas roll-up, enganches reforzados",
      "tendencias-nuevas": ["Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Priorizan confiabilidad, respaldo y reventa", "Buscan más financiación"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Volkswagen Amarok", "Nissan Frontier"],
      "productos-mas-vendidos": ["Cubre caja", "Estribos"],
      "productos-menos-vendidos": ["Iluminación LED", "Organizadores de caja"],
      "productos-dificiles": ["Snorkel", "Suspensión / refuerzos"],
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo", "Más preocupación por precio y financiación"],
      "clientes-comportamiento": ["Buscan más financiación", "Preguntan más por instalación y garantía"],
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
      "marcas-mas-vendidas": ["Ford Ranger", "Toyota Hilux", "Chevrolet S10"],
      "productos-mas-vendidos": ["Defensas", "Estribos", "Lona marítima"],
      "productos-menos-vendidos": ["Cubre caja"],
      "productos-dificiles": ["Suspensión / refuerzos"],
      "productos-importar": "Suspensiones reforzadas, defensas",
      "tendencias-nuevas": ["Más interés por equipamiento estético / deportivo"],
      "clientes-comportamiento": ["Priorizan confiabilidad, respaldo y reventa"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger"],
      "productos-mas-vendidos": ["Lona marítima", "Enganche"],
      "productos-menos-vendidos": ["Organizadores de caja", "Iluminación LED"],
      "productos-dificiles": ["Snorkel", "Cubre caja"],
      "productos-importar": "Cubrecajas roll-up, snorkels",
      "tendencias-nuevas": ["Más preocupación por precio y financiación", "Menor movimiento general del mercado"],
      "clientes-comportamiento": ["Comparan más precios antes de comprar", "Buscan productos más económicos"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Nissan Frontier", "Ford Ranger"],
      "productos-mas-vendidos": ["Lona marítima", "Barras / accesorios deportivos"],
      "productos-menos-vendidos": ["Cubre caja"],
      "productos-dificiles": ["Snorkel"],
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo"],
      "clientes-comportamiento": ["Están más atentos a promociones"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "GWM Poer"],
      "productos-mas-vendidos": ["Cubre caja", "Defensas"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Suspensión / refuerzos", "Accesorios para nuevas marcas"],
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo", "Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Priorizan confiabilidad, respaldo y reventa", "Siguen valorando productos de mejor calidad"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Volkswagen Amarok", "Ford Ranger"],
      "productos-mas-vendidos": ["Estribos", "Cubre caja"],
      "productos-menos-vendidos": ["Organizadores de caja"],
      "productos-dificiles": ["Snorkel", "Suspensión / refuerzos"],
      "productos-importar": "Snorkels, lonas marítimas",
      "tendencias-nuevas": ["Mayor consulta por pickups híbridas o eléctricas", "Más interés por equipamiento estético / deportivo"],
      "clientes-comportamiento": ["Siguen valorando productos de mejor calidad"],
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
      "marcas-mas-vendidas": ["Ford Ranger", "Toyota Hilux", "Nissan Frontier"],
      "productos-mas-vendidos": ["Lona marítima", "Enganche", "Estribos"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Cubre caja"],
      "productos-importar": "Cubrecajas roll-up, enganches reforzados",
      "tendencias-nuevas": ["Más preocupación por precio y financiación"],
      "clientes-comportamiento": ["Compran solo lo necesario", "Comparan más precios antes de comprar"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "Chevrolet S10"],
      "productos-mas-vendidos": ["Cubre caja", "Lona marítima"],
      "productos-menos-vendidos": ["Iluminación LED", "Organizadores de caja"],
      "productos-dificiles": ["Snorkel"],
      "productos-importar": "Snorkels, suspensiones reforzadas",
      "tendencias-nuevas": ["No noto cambios importantes por ahora"],
      "clientes-comportamiento": ["Siguen valorando productos de mejor calidad"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "Volkswagen Amarok"],
      "productos-mas-vendidos": ["Estribos", "Defensas", "Cubre caja"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Suspensión / refuerzos", "Snorkel"],
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo"],
      "clientes-comportamiento": ["Buscan más financiación"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Nissan Frontier"],
      "productos-mas-vendidos": ["Lona marítima", "Barras / accesorios deportivos"],
      "productos-menos-vendidos": ["Organizadores de caja"],
      "productos-dificiles": ["Snorkel", "Cubre caja"],
      "productos-importar": "Cubrecajas roll-up, portaequipajes de techo",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo", "Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Priorizan confiabilidad, respaldo y reventa"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "GWM Poer"],
      "productos-mas-vendidos": ["Lona marítima", "Enganche"],
      "productos-menos-vendidos": ["Iluminación LED", "Organizadores de caja"],
      "productos-dificiles": ["Snorkel", "Suspensión / refuerzos"],
      "productos-importar": "Snorkels, lonas marítimas",
      "tendencias-nuevas": ["Más preocupación por precio y financiación", "Menor movimiento general del mercado"],
      "clientes-comportamiento": ["Comparan más precios antes de comprar", "Buscan productos más económicos"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "Nissan Frontier"],
      "productos-mas-vendidos": ["Cubre caja", "Estribos"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Suspensión / refuerzos"],
      "productos-importar": "Suspensiones reforzadas, snorkels",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo"],
      "clientes-comportamiento": ["Priorizan confiabilidad, respaldo y reventa", "Compran solo lo necesario"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Volkswagen Amarok", "Ford Ranger"],
      "productos-mas-vendidos": ["Estribos", "Lona marítima", "Defensas"],
      "productos-menos-vendidos": ["Iluminación LED"],
      "productos-dificiles": ["Snorkel"],
      "productos-importar": "Snorkels, portaequipajes de techo",
      "tendencias-nuevas": ["Mayor consulta por accesorios de protección y trabajo", "Más preocupación por precio y financiación"],
      "clientes-comportamiento": ["Buscan más financiación"],
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
      "marcas-mas-vendidas": ["Toyota Hilux", "Ford Ranger", "GWM Poer"],
      "productos-mas-vendidos": ["Lona marítima", "Cubre caja"],
      "productos-menos-vendidos": ["Organizadores de caja", "Iluminación LED"],
      "productos-dificiles": ["Snorkel", "Accesorios para nuevas marcas"],
      "productos-importar": "Cubrecajas roll-up, snorkels",
      "tendencias-nuevas": ["Mayor interés por marcas chinas o nuevas marcas"],
      "clientes-comportamiento": ["Priorizan precio por encima de marca", "Están más atentos a promociones"],
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
