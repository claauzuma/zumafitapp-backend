import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";

import {
  GENERATION_MEAL_TYPES,
  GENERATION_ROLES,
  normalizeFoodGenerationForRead,
  validateFoodGenerationPatch,
} from "../servicio/foodGenerationMetadata.js";

dotenv.config();

const uri = process.env.MONGO_URI || process.env.STRCNX;
const dbName = process.env.MONGO_DB || process.env.BASE || "test";
const collectionName = "fooddatabase2";
const artifactsRoot = path.resolve("artifacts", "food-generation-curation");
const command = process.argv[2] || "--plan";
const commandFile = process.argv[3] ? path.resolve(process.argv[3]) : null;

const ALL_MEALS = Object.freeze({ breakfast: true, lunch: true, snack: true, dinner: true, extraSnack: true });
const MAIN_MEALS = Object.freeze({ breakfast: false, lunch: true, snack: false, dinner: true, extraSnack: false });
const LIGHT_MEALS = Object.freeze({ breakfast: true, lunch: false, snack: true, dinner: false, extraSnack: true });
const AVOCADO_MEALS = Object.freeze({ breakfast: true, lunch: true, snack: true, dinner: true, extraSnack: false });

function first(document, keys, fallback = "") {
  for (const key of keys) {
    const value = document?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function clean(value = "") {
  return String(value || "").trim();
}

function token(value = "") {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function foodView(document) {
  const category = clean(first(document, ["Categoria", "Categoría", "categoria", "categoriaZumaFit", "Fuente", "fuente"]));
  const subcategory = clean(first(document, ["subcategoria", "subcategoría", "subcategoriaZumaFit", "Subcategoria", "Subcategoría"]));
  const macros = {
    kcal: numberOrNull(first(document, ["Calorias", "calorias", "kcal", "kcalUnidad", "kcal100", "kcal_100g_ml"], null)),
    protein: numberOrNull(first(document, ["Proteinas", "proteinas", "proteina", "protein", "proteinaUnidad", "proteina100", "proteina_100g_ml"], null)),
    carbs: numberOrNull(first(document, ["Carbohidratos", "carbohidratos", "carbs", "hidratos", "carbohidratosUnidad", "carbohidratos100", "carbohidratos_100g_ml"], null)),
    fat: numberOrNull(first(document, ["Grasas", "grasas", "fat", "grasasUnidad", "grasas100", "grasas_100g_ml"], null)),
  };
  const name = clean(first(document, ["Alimentos", "alimentos", "nombre", "name"], "Sin nombre"));
  return {
    id: String(document._id),
    alimentoId: document.alimentoId ?? null,
    name,
    nameToken: token(name),
    category,
    categoryToken: token(category),
    subcategory,
    subcategoryToken: token(subcategory),
    tags: Array.isArray(document.tags) ? document.tags.map(clean).filter(Boolean) : [],
    unit: clean(first(document, ["Unidad", "unidad", "unidadBase"])),
    macros,
    active: document.activo !== false,
    requiresReview: document.requiereRevision === true,
    duplicateNameUnit: document.duplicadoNombreUnidad === true,
    rawGenerationPresent: Object.prototype.hasOwnProperty.call(document, "generation"),
    rawGeneration: document.generation,
    generation: normalizeFoodGenerationForRead(document.generation),
    document,
  };
}

function flags(enabled = []) {
  const selected = new Set(enabled);
  return Object.fromEntries(GENERATION_ROLES.map((role) => [role, selected.has(role)]));
}

function meals(value) {
  return Object.fromEntries(GENERATION_MEAL_TYPES.map((mealType) => [mealType, value?.[mealType] === true]));
}

function assignment(food, { roles, mealTypes, reason, source }) {
  return {
    generation: {
      mode: "GENERIC",
      roles: flags(roles),
      mealTypes: meals(mealTypes),
      portionRule: structuredClone(food.generation.portionRule),
    },
    reason,
    source,
  };
}

function isInvalidShadow(food) {
  return food.alimentoId === null && !food.unit
    && Object.values(food.macros).every((value) => value === 0 || value === null);
}

function classification(food) {
  if (food.generation.mode === "DISABLED") return null;
  if (isInvalidShadow(food)) return null;

  const name = food.nameToken;
  const category = food.categoryToken;
  const subcategory = food.subcategoryToken;

  // Reglas explícitas del pedido. Frutas y equivalentes nominales claros tienen
  // prioridad incluso si son variantes o están inactivos; activo sigue siendo
  // el filtro independiente que impide sugerir registros deshabilitados.
  if (category === "frutas" || ["papaya", "pasas de uva"].includes(name)) {
    return assignment(food, {
      roles: ["F"], mealTypes: ALL_MEALS,
      reason: "Fruta inequívoca: rol F y disponibilidad en los cinco momentos.",
      source: "REGLA_EXPLICITA_FRUTAS",
    });
  }

  // Los registros marcados para revisión/inactivos no se promueven por
  // inferencia. Las restantes reglas nominales explícitas sí pueden incluir
  // duplicados claros, tal como jamón cocido, queso cremoso o whey.
  if (food.requiresReview || !food.active) return null;

  if (name === "huevos" || name === "claras de huevos") {
    return assignment(food, {
      roles: ["P1", "P2"], mealTypes: ALL_MEALS,
      reason: "Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.",
      source: "REGLA_EXPLICITA_HUEVOS",
    });
  }

  if (name.includes("jamon cocido")) {
    return assignment(food, {
      roles: ["P2"], mealTypes: LIGHT_MEALS,
      reason: "Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.",
      source: "REGLA_EXPLICITA_JAMON_COCIDO",
    });
  }

  if (name.includes("queso cremoso") || name.includes("cremon cremoso")) {
    return assignment(food, {
      roles: ["P2", "G"], mealTypes: LIGHT_MEALS,
      reason: "Queso cremoso: proteína secundaria y complemento graso para comidas livianas.",
      source: "REGLA_EXPLICITA_QUESO_CREMOSO",
    });
  }

  if (name.includes("leche descremada") || name.includes("deslactosada descremada")) {
    return assignment(food, {
      roles: ["P2"], mealTypes: LIGHT_MEALS,
      reason: "Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.",
      source: "REGLA_EXPLICITA_LECHE_DESCREMADA",
    });
  }

  if (name.includes("whey protein") || name.includes("proteina whey")) {
    return assignment(food, {
      roles: ["P1", "P2"], mealTypes: LIGHT_MEALS,
      reason: "Whey inequívoca: fuente proteica principal/secundaria fuera de platos principales.",
      source: "REGLA_EXPLICITA_WHEY",
    });
  }

  const wholeNut = ["almendras", "avellanas", "castanas", "castanas de caju", "mani", "nueces peladas", "pistachos"].includes(name);
  if (wholeNut) {
    return assignment(food, {
      roles: ["G"], mealTypes: ALL_MEALS,
      reason: "Fruto seco inequívoco: complemento graso utilizable también en platos principales.",
      source: "REGLA_EXPLICITA_FRUTOS_SECOS",
    });
  }

  if (name === "palta") {
    return assignment(food, {
      roles: ["G"], mealTypes: AVOCADO_MEALS,
      reason: "Palta: complemento graso para desayuno, almuerzo, merienda y cena.",
      source: "REGLA_EXPLICITA_PALTA",
    });
  }

  if (name.startsWith("aceite de ")) {
    return assignment(food, {
      roles: ["G"], mealTypes: MAIN_MEALS,
      reason: "Aceite alimentario: complemento graso limitado a almuerzo y cena.",
      source: "REGLA_EXPLICITA_ACEITES",
    });
  }

  const pastaOrRice = (
    name === "arroz" || name === "arroz (cocido)" || name === "arroz integral" || name === "arroz integral (cocido)"
    || /(^| )(fideos?|tallarines?|spaghetti|ravioles?|noquis)( |$)/.test(name)
    || ["fideos", "pastas"].includes(subcategory)
  ) && !/(inflado|cereal|tostad|gallet|arrocita|mani)/.test(name);
  if (pastaOrRice) {
    return assignment(food, {
      roles: ["C1"], mealTypes: MAIN_MEALS,
      reason: "Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.",
      source: "REGLA_EXPLICITA_ARROZ_PASTA",
    });
  }

  const explicitMainProtein = /(pechuga|churrasco magro|higado)/.test(name);
  if (explicitMainProtein) {
    return assignment(food, {
      roles: ["P1"], mealTypes: MAIN_MEALS,
      reason: "Corte o proteína principal expresamente solicitada para almuerzo/cena.",
      source: "REGLA_EXPLICITA_PROTEINAS_PRINCIPALES",
    });
  }

  const genericBread = name.startsWith("pan ") || name === "pan";
  const excludedBread = /(rallado|panqueque|hamburguesa|pancho)/.test(name);
  if (genericBread && !excludedBread && (!food.duplicateNameUnit || name === "pan blanco")) {
    return assignment(food, {
      roles: ["C1", "C2"], mealTypes: LIGHT_MEALS,
      reason: name === "pan blanco"
        ? "Pan blanco: carbohidrato principal/secundario para desayuno, merienda y snack extra."
        : "Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.",
      source: name === "pan blanco" ? "REGLA_EXPLICITA_PAN_BLANCO" : "INFERENCIA_ALTA_PAN_SIMPLE",
    });
  }

  // A partir de aquí sólo se infieren componentes reutilizables, activos, sin
  // marcas de duplicado y con identidad culinaria inequívoca.
  if (food.duplicateNameUnit) return null;

  const excludedProtein = /(bastonc|hamburg|empanad|milanesa|medallon|salchich|tarta|tallarines|jamon|lomo embuchado)/.test(name);
  const mainProteinCategory = category === "proteinas" && [
    "pescados y mariscos", "carne vacuna", "cerdo", "pollo", "proteina general", "soja",
  ].includes(subcategory);
  if (mainProteinCategory && !excludedProtein) {
    return assignment(food, {
      roles: ["P1"], mealTypes: MAIN_MEALS,
      reason: "Carne, pescado o proteína vegetal principal inequívoca y reutilizable.",
      source: "INFERENCIA_ALTA_PROTEINA_PRINCIPAL",
    });
  }

  const excludedVegetable = /(ajo|semillas|pure de tomate|pure de zapallo|veggies|plato de verduras|zanahoriias)/.test(name);
  if (category === "verduras" && !excludedVegetable) {
    return assignment(food, {
      roles: ["V"], mealTypes: MAIN_MEALS,
      reason: "Verdura simple inequívoca para acompañar almuerzo/cena.",
      source: "INFERENCIA_ALTA_VERDURA",
    });
  }

  if (["batatas", "papas", "choclo entero", "maiz", "pure de papas (general)"].includes(name) || name.startsWith("polenta")) {
    return assignment(food, {
      roles: ["C1"], mealTypes: MAIN_MEALS,
      reason: "Tubérculo o cereal simple utilizado como carbohidrato principal de plato.",
      source: "INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL",
    });
  }

  if (name === "avena instantanea" || name === "copos de maiz sin azucar") {
    return assignment(food, {
      roles: ["C1", "C2"], mealTypes: LIGHT_MEALS,
      reason: "Cereal simple de desayuno/merienda: carbohidrato principal o secundario.",
      source: "INFERENCIA_ALTA_CEREAL_DESAYUNO",
    });
  }

  if (["galletas de arroz", "galletitas de agua", "tostadas clasicas", "tostadas de arroz", "tostadas de mesa"].includes(name)) {
    return assignment(food, {
      roles: ["C1", "C2"], mealTypes: LIGHT_MEALS,
      reason: "Galleta/tostada simple y genérica para desayuno, merienda o snack extra.",
      source: "INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO",
    });
  }

  if (name.includes("yogurt") || name.includes("yogurisimo")) {
    return assignment(food, {
      roles: ["P2"], mealTypes: LIGHT_MEALS,
      reason: "Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.",
      source: "INFERENCIA_ALTA_YOGUR",
    });
  }

  if (["leche entera", "leche parcialmente descremada (veronica)"].includes(name)) {
    return assignment(food, {
      roles: ["P2"], mealTypes: LIGHT_MEALS,
      reason: "Leche simple: proteína secundaria para desayuno, merienda y snack extra.",
      source: "INFERENCIA_ALTA_LECHE",
    });
  }

  if (["mantequilla de mani", "pasta de mani", "pasta de mani sin tacc"].includes(name)) {
    return assignment(food, {
      roles: ["G"], mealTypes: LIGHT_MEALS,
      reason: "Pasta de fruto seco: complemento graso para comidas livianas.",
      source: "INFERENCIA_ALTA_UNTABLE_FRUTO_SECO",
    });
  }

  if (["semillas de chia", "semillas de girasol", "semillas de lino", "semillas de sesamo", "semillas de calabaza"].includes(name)) {
    return assignment(food, {
      roles: ["G"], mealTypes: ALL_MEALS,
      reason: "Semilla comestible inequívoca utilizada como complemento graso.",
      source: "INFERENCIA_ALTA_SEMILLAS",
    });
  }

  if (["aceitunas negras", "aceitunas verdes"].includes(name)) {
    return assignment(food, {
      roles: ["G"], mealTypes: MAIN_MEALS,
      reason: "Aceituna: complemento graso salado para almuerzo/cena.",
      source: "INFERENCIA_ALTA_COMPLEMENTO_GRASO",
    });
  }

  return null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

function withoutGeneration(document) {
  const copy = structuredClone(document);
  delete copy.generation;
  return copy;
}

function hash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function generationChanged(food, next) {
  return stableJson(food.generation) !== stableJson(next);
}

function completePortionRule(rule = {}) {
  const ranged = rule.min !== null && rule.max !== null && rule.step !== null;
  const discrete = Array.isArray(rule.allowedValues) && rule.allowedValues.length > 0;
  return !!rule.unit && (ranged || discrete);
}

function modeCounts(foods, plannedById = new Map()) {
  const counts = { GENERIC: 0, EXPLICIT_ONLY: 0, DISABLED: 0 };
  foods.forEach((food) => {
    const mode = plannedById.get(food.id)?.generation.mode || food.generation.mode;
    counts[mode] = (counts[mode] || 0) + 1;
  });
  return counts;
}

function coverage(foods, plannedById = new Map()) {
  return Object.fromEntries(GENERATION_MEAL_TYPES.map((mealType) => [mealType,
    Object.fromEntries(GENERATION_ROLES.map((role) => [role, foods.filter((food) => {
      const generation = plannedById.get(food.id)?.generation || food.generation;
      return food.active && generation.mode === "GENERIC"
        && generation.mealTypes[mealType] === true && generation.roles[role] === true;
    }).length]))
  ]));
}

function manualReviewEntry(food) {
  let doubt = "No tiene una clasificación de alta confianza dentro de las reglas conservadoras.";
  let suggestion = "Mantener EXPLICIT_ONLY hasta revisión manual.";
  if (isInvalidShadow(food)) {
    doubt = "Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.";
    suggestion = "Revisar duplicación/validez del documento antes de asignarle generation.";
  } else if (food.requiresReview || !food.active) {
    doubt = `Registro ${food.requiresReview ? "marcado para revisión" : ""}${food.requiresReview && !food.active ? " e " : ""}${!food.active ? "inactivo" : ""}.`;
    suggestion = "Resolver primero el estado/revisión; no promover automáticamente.";
  } else if (food.duplicateNameUnit) {
    doubt = "Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.";
    suggestion = "Elegir manualmente el registro canónico y configurar sólo ese.";
  } else if (/(garbanzo|lenteja|poroto|frijol|arveja|quinoa)/.test(food.nameToken)) {
    doubt = "Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.";
    suggestion = "Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.";
  } else if (/(queso|ricota|casancrem|mendicrim)/.test(food.nameToken)) {
    doubt = "Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.";
    suggestion = "Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.";
  } else if (/(bondiola|hamburg|milanesa|medallon|salchich|morcilla|mortadela|salame|panceta|chorizo)/.test(food.nameToken)) {
    doubt = "Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.";
    suggestion = "Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.";
  }
  return {
    id: food.id,
    alimentoId: food.alimentoId,
    name: food.name,
    category: food.category,
    subcategory: food.subcategory,
    currentGeneration: food.generation,
    doubt,
    suggestion,
  };
}

function portionProposal(food, generation) {
  let suggestion = "Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.";
  if (/^pechuga de pollo con piel$/.test(food.nameToken)) {
    suggestion = "Revisar si puede reutilizar g, min 100, max 350, step 10 de Pechuga de pollo; no aplicado automáticamente.";
  } else if (/whey protein/.test(food.nameToken) && generation.portionRule.min === 20 && generation.portionRule.max === 50) {
    suggestion = "La regla histórica ya aporta min 20, max 50 y step 5; falta confirmar unit='g'.";
  } else if (/^arroz/.test(food.nameToken)) {
    suggestion = "Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.";
  }
  return {
    id: food.id,
    alimentoId: food.alimentoId,
    name: food.name,
    portionRule: generation.portionRule,
    suggestion,
  };
}

function planMarkdown(plan) {
  const lines = [
    "# Plan de curación de generation",
    "",
    `- Base/colección: ${plan.database}/${plan.collection}`,
    `- Total auditado: ${plan.before.total}`,
    `- Documentos a modificar: ${plan.changes.length}`,
    `- GENERIC antes → después: ${plan.before.modes.GENERIC} → ${plan.after.modes.GENERIC}`,
    `- Revisión manual: ${plan.manualReview.length}`,
    `- GENERIC sin portionRule completa después: ${plan.portionProposals.length}`,
    "",
    "## Cambios de roles/mealTypes",
    "",
  ];
  const grouped = Map.groupBy(plan.changes, (change) => change.source);
  for (const [source, changes] of grouped) {
    lines.push(`### ${source}`, "");
    changes.forEach((change) => {
      const beforeRoles = GENERATION_ROLES.filter((role) => change.before.roles[role]).join(", ") || "—";
      const afterRoles = GENERATION_ROLES.filter((role) => change.after.roles[role]).join(", ") || "—";
      const beforeMeals = GENERATION_MEAL_TYPES.filter((meal) => change.before.mealTypes[meal]).join(", ") || "—";
      const afterMeals = GENERATION_MEAL_TYPES.filter((meal) => change.after.mealTypes[meal]).join(", ") || "—";
      lines.push(`- ${change.alimentoId ?? "sin alimentoId"} · ${change.name} · ${change.before.mode} → ${change.after.mode} · roles ${beforeRoles} → ${afterRoles} · momentos ${beforeMeals} → ${afterMeals} · ${change.reason}`);
    });
    lines.push("");
  }
  lines.push("## Requieren revisión manual", "");
  plan.manualReview.forEach((entry) => lines.push(`- ${entry.alimentoId ?? entry.id} · ${entry.name} · ${entry.category || "Sin categoría"} · ${entry.doubt} Sugerencia: ${entry.suggestion}`));
  lines.push("", "## Porciones propuestas/no aplicadas", "");
  plan.portionProposals.forEach((entry) => lines.push(`- ${entry.alimentoId ?? entry.id} · ${entry.name} · ${entry.suggestion}`));
  return `${lines.join("\n")}\n`;
}

async function buildPlan(collection) {
  const documents = await collection.find({}).sort({ _id: 1 }).toArray();
  const foods = documents.map(foodView);
  const plannedById = new Map();
  const changes = [];
  const manualReview = [];

  foods.forEach((food) => {
    const proposed = classification(food);
    if (proposed) {
      validateFoodGenerationPatch(proposed.generation, food.rawGeneration);
      if (stableJson(proposed.generation.portionRule) !== stableJson(food.generation.portionRule)) {
        throw new Error(`La propuesta intentó modificar portionRule: ${food.name}.`);
      }
    }
    if (proposed) plannedById.set(food.id, proposed);
    if (proposed && generationChanged(food, proposed.generation)) {
      changes.push({
        id: food.id,
        alimentoId: food.alimentoId,
        name: food.name,
        category: food.category,
        subcategory: food.subcategory,
        beforeGenerationPresent: food.rawGenerationPresent,
        beforeRawGeneration: food.rawGeneration ?? null,
        before: food.generation,
        after: proposed.generation,
        reason: proposed.reason,
        source: proposed.source,
        nonGenerationHash: hash(withoutGeneration(food.document)),
      });
    } else if (!proposed && (
      isInvalidShadow(food) || food.requiresReview || !food.active || food.duplicateNameUnit
      || /(garbanzo|lenteja|poroto|frijol|arveja|quinoa|queso|ricota|casancrem|mendicrim|bondiola|hamburg|milanesa|medallon|salchich|morcilla|mortadela|salame|panceta|chorizo)/.test(food.nameToken)
    )) {
      manualReview.push(manualReviewEntry(food));
    }
  });

  const afterGenerations = new Map([...plannedById].map(([id, proposed]) => [id, proposed]));
  const portionProposals = foods.flatMap((food) => {
    const generation = afterGenerations.get(food.id)?.generation || food.generation;
    return generation.mode === "GENERIC" && !completePortionRule(generation.portionRule)
      ? [portionProposal(food, generation)] : [];
  });
  const beforeCoverage = coverage(foods);
  const afterCoverage = coverage(foods, afterGenerations);
  const snapshot = changes.map((change) => ({
    id: change.id,
    alimentoId: change.alimentoId,
    name: change.name,
    beforeGenerationPresent: change.beforeGenerationPresent,
    beforeRawGeneration: change.beforeRawGeneration,
    afterGeneration: change.after,
    nonGenerationHash: change.nonGenerationHash,
  }));
  const now = new Date();
  const runId = now.toISOString().replace(/[:.]/g, "-");
  const plan = {
    schemaVersion: 1,
    runId,
    createdAt: now.toISOString(),
    database: dbName,
    collection: collectionName,
    safety: {
      updateOperator: "$set generation only",
      nutritionFieldsChanged: false,
      namesChanged: false,
      documentsInserted: 0,
      documentsDeleted: 0,
      portionRulesChanged: 0,
      reversibleSnapshotEntries: snapshot.length,
    },
    before: { total: foods.length, modes: modeCounts(foods), coverage: beforeCoverage },
    after: { total: foods.length, modes: modeCounts(foods, afterGenerations), coverage: afterCoverage },
    changes,
    manualReview,
    portionProposals,
  };
  const directory = path.join(artifactsRoot, runId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "curation-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "curation-plan.md"), planMarkdown(plan), "utf8");
  await writeFile(path.join(directory, "rollback-snapshot.json"), `${JSON.stringify({
    schemaVersion: 1,
    runId,
    database: dbName,
    collection: collectionName,
    totalBefore: foods.length,
    entries: snapshot,
  }, null, 2)}\n`, "utf8");
  return { plan, directory };
}

async function applyPlan(client, planPath) {
  if (!planPath) throw new Error("--apply necesita la ruta de curation-plan.json.");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  if (plan.database !== dbName || plan.collection !== collectionName) throw new Error("El plan apunta a otra base o colección.");
  const collection = client.db(dbName).collection(collectionName);
  const currentTotal = await collection.countDocuments({});
  if (currentTotal !== plan.before.total) throw new Error(`El total cambió: plan=${plan.before.total}, actual=${currentTotal}.`);

  const currentDocuments = await collection.find({ _id: { $in: plan.changes.map((change) => new ObjectId(change.id)) } }).toArray();
  if (currentDocuments.length !== plan.changes.length) throw new Error("No se pudieron releer todos los documentos del plan.");
  for (const change of plan.changes) {
    const current = currentDocuments.find((document) => String(document._id) === change.id);
    const currentGenerationPresent = Object.prototype.hasOwnProperty.call(current, "generation");
    if (currentGenerationPresent !== change.beforeGenerationPresent) throw new Error(`Cambió generation antes de aplicar: ${change.name}.`);
    if (change.beforeGenerationPresent && stableJson(current.generation) !== stableJson(change.beforeRawGeneration)) {
      throw new Error(`Cambió generation antes de aplicar: ${change.name}.`);
    }
    if (hash(withoutGeneration(current)) !== change.nonGenerationHash) throw new Error(`Cambió un campo no-generation: ${change.name}.`);
  }

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const change of plan.changes) {
        const filter = change.beforeGenerationPresent
          ? { _id: new ObjectId(change.id), generation: change.beforeRawGeneration }
          : { _id: new ObjectId(change.id), generation: { $exists: false } };
        const result = await collection.updateOne(filter, { $set: { generation: change.after } }, { session });
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new Error(`No se pudo actualizar de forma individual y segura: ${change.name}.`);
        }
      }
    });
  } finally {
    await session.endSession();
  }

  const afterDocuments = await collection.find({}).sort({ _id: 1 }).toArray();
  const foods = afterDocuments.map(foodView);
  const mismatches = plan.changes.filter((change) => {
    const food = foods.find((entry) => entry.id === change.id);
    return !food || stableJson(food.generation) !== stableJson(change.after)
      || hash(withoutGeneration(food.document)) !== change.nonGenerationHash;
  });
  const verification = {
    appliedAt: new Date().toISOString(),
    totalBefore: plan.before.total,
    totalAfter: foods.length,
    modified: plan.changes.length,
    mismatches,
    modes: modeCounts(foods),
    coverage: coverage(foods),
    roles: Object.fromEntries(GENERATION_ROLES.map((role) => [role, foods.filter((food) => food.active && food.generation.mode === "GENERIC" && food.generation.roles[role]).length])),
    mealTypes: Object.fromEntries(GENERATION_MEAL_TYPES.map((meal) => [meal, foods.filter((food) => food.active && food.generation.mode === "GENERIC" && food.generation.mealTypes[meal]).length])),
    genericWithoutCompletePortionRule: foods.filter((food) => food.generation.mode === "GENERIC" && !completePortionRule(food.generation.portionRule)).length,
  };
  if (verification.totalAfter !== verification.totalBefore || mismatches.length) throw new Error("La verificación posterior no coincide con el plan.");
  const outputPath = path.join(path.dirname(planPath), "apply-verification.json");
  await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  return { verification, outputPath };
}

async function restoreSnapshot(client, snapshotPath) {
  if (!snapshotPath) throw new Error("--restore necesita la ruta de rollback-snapshot.json.");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (snapshot.database !== dbName || snapshot.collection !== collectionName) throw new Error("El snapshot apunta a otra base o colección.");
  const collection = client.db(dbName).collection(collectionName);
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const entry of snapshot.entries) {
        const update = entry.beforeGenerationPresent
          ? { $set: { generation: entry.beforeRawGeneration } }
          : { $unset: { generation: "" } };
        const result = await collection.updateOne(
          { _id: new ObjectId(entry.id), generation: entry.afterGeneration },
          update,
          { session }
        );
        if (result.matchedCount !== 1) throw new Error(`No se pudo restaurar de forma segura: ${entry.name}.`);
      }
    });
  } finally {
    await session.endSession();
  }
  return { restored: snapshot.entries.length };
}

async function main() {
  if (!uri) throw new Error("Falta MONGO_URI o STRCNX en el entorno.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    if (command === "--plan") {
      const result = await buildPlan(client.db(dbName).collection(collectionName));
      console.log(JSON.stringify({
        planPath: path.join(result.directory, "curation-plan.json"),
        snapshotPath: path.join(result.directory, "rollback-snapshot.json"),
        total: result.plan.before.total,
        changes: result.plan.changes.length,
        modesBefore: result.plan.before.modes,
        modesAfter: result.plan.after.modes,
        manualReview: result.plan.manualReview.length,
        incompletePortionsAfter: result.plan.portionProposals.length,
        coverageAfter: result.plan.after.coverage,
      }, null, 2));
      return;
    }
    if (command === "--apply") {
      console.log(JSON.stringify(await applyPlan(client, commandFile), null, 2));
      return;
    }
    if (command === "--restore") {
      console.log(JSON.stringify(await restoreSnapshot(client, commandFile), null, 2));
      return;
    }
    throw new Error(`Comando desconocido: ${command}.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
