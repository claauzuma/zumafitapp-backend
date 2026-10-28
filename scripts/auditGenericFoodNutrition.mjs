import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import config from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const frontendRoot = path.resolve(backendRoot, "..", "..", "zumafitront");
const outputDir = path.join(
  frontendRoot,
  "artifacts",
  process.argv.includes("--post-fix") ? "food-nutrition-audit-post-fix-2026-10-26" : "food-nutrition-audit-2026-10-26",
);
const sourceDir = path.join(os.tmpdir(), "zumafit-food-audit");
const saraPdf = path.join(sourceDir, "sara2.pdf");
const foundationDir = path.join(sourceDir, "usda-foundation");
const legacyDir = path.join(sourceDir, "usda-sr");

const SELECTED_IDS = new Set([
  // Cereales, tuberculos, pastas y panes simples (se excluyen lactales y marcas).
  39, 40, 42, 43, 49, 58, 105, 162, 163, 273, 362, 364, 365, 369, 374, 381, 391, 396, 397, 419, 432, 353,
  // Frutas por peso y sus variantes por unidad.
  35, 36, 51, 52, 53, 54, 102, 104, 114, 132, 148, 149, 150, 151, 169, 173, 207, 223, 239, 240,
  276, 277, 278, 279, 281, 287, 288, 289, 290, 299, 342, 343, 344, 345, 408, 409, 410, 411, 424, 515, 584,
  // Aceites, aceitunas, frutos secos, semillas, palta y huevo.
  1, 2, 3, 4, 34, 48, 94, 96, 224, 282, 286, 349, 361, 398, 415, 523, 524,
  // Lacteos genericos.
  247, 251, 258, 456, 460, 461,
  // Carnes, cortes, aves, pescados, mariscos y proteinas vegetales simples.
  47, 72, 88, 113, 115, 129, 165, 199, 222, 241, 270, 272, 291, 358, 360, 609, 402, 403, 404, 405,
  412, 517, 519, 528, 541, 543,
  // Verduras simples. "Verduras" generico se conserva pero se marca como no comparable.
  62, 79, 117, 159, 492, 520, 544, 587, 605, 607, 77, 160, 263,
]);

const GROUPS = [
  { ids: [39], sara: "arroz blanco crudo", usda: ["rice", "white", "long-grain", "regular", "raw", "unenriched"] },
  { ids: [40], sara: "arroz blanco hervido", usda: ["rice", "white", "long-grain", "regular", "cooked", "unenriched"] },
  { ids: [42], sara: "arroz integral crudo", usda: ["rice", "brown", "long-grain", "raw"] },
  { ids: [43], sara: "arroz integral hervido", usda: ["rice", "brown", "long-grain", "cooked"] },
  { ids: [49], sara: "avena arrollada cruda", usda: ["cereals", "oats", "regular", "quick", "dry"] },
  { ids: [58], sara: "batata cruda", usda: ["sweet potato", "raw", "unprepared"] },
  { ids: [105], sara: "choclo crudo", usda: ["corn", "sweet", "yellow", "raw"] },
  { ids: [162], sara: "fideos secos crudos", usda: ["pasta", "dry", "unenriched"] },
  { ids: [163], sara: "fideos secos hervidos", usda: ["pasta", "cooked", "unenriched", "without", "added", "salt"] },
  { ids: [273], sara: "maiz grano entero crudo", usda: ["corn", "grain", "yellow"] },
  { ids: [362, 365], sara: "pan frances o pan casero sin agregado de grasa o aceite", usda: ["bread", "white", "commercially prepared"] },
  { ids: [364, 374], sara: "pan frances o pan casero sin agregado de grasa o aceite", usda: ["bread", "french", "vienna"] },
  { ids: [369], sara: "pan de centeno", usda: ["bread", "rye"] },
  { ids: [381], sara: "pan negro sin levadura", usda: ["bread", "whole-wheat", "commercially prepared"] },
  { ids: [391], sara: "papa cruda", usda: ["potatoes", "flesh", "skin", "raw"] },
  { ids: [396], sara: "papaya", usda: ["papayas", "raw"] },
  { ids: [397], sara: "uva pasa", usda: ["raisins", "seedless"] },
  { ids: [419], sara: "harina de maiz cruda", usda: ["cornmeal", "whole-grain", "yellow"] },
  { ids: [432], sara: "papa pure instantaneo polvo", usda: ["potatoes", "dehydrated", "flakes", "without milk"] },
  { ids: [353], sara: "noquis de papa envasados crudos", usda: ["potato", "gnocchi"] },

  { ids: [35], sara: "anana", usda: ["pineapple", "raw", "all varieties"] },
  { ids: [36], sara: "arandanos", usda: ["blueberries", "raw"] },
  { ids: [51, 52, 53, 54], sara: "banana", usda: ["bananas", "raw"] },
  { ids: [102], sara: "cereza", usda: ["cherries", "sweet", "raw"] },
  { ids: [104], sara: "chirimoya", usda: ["cherimoya", "raw"] },
  { ids: [114], sara: "ciruela", usda: ["plums", "raw"] },
  { ids: [132], sara: "damasco", usda: ["apricots", "raw"] },
  { ids: [148, 149, 150, 151], sara: "durazno", usda: ["peaches", "yellow", "raw"] },
  { ids: [169], sara: "frambuesa", usda: ["raspberries", "raw"] },
  { ids: [173], sara: "frutilla", usda: ["strawberries", "raw"] },
  { ids: [207], sara: "granada", usda: ["pomegranates", "raw"] },
  { ids: [223], sara: "higo", usda: ["figs", "raw"] },
  { ids: [239, 240], sara: "kiwi", usda: ["kiwifruit", "green", "raw"] },
  { ids: [276, 277, 278, 279], sara: "mandarina", usda: ["tangerines", "raw"] },
  { ids: [281], sara: "mango", usda: ["mangos", "raw"] },
  { ids: [287, 288, 289, 290], sara: "manzana con piel", usda: ["apples", "raw", "with skin"] },
  { ids: [299], sara: "melon", usda: ["melons", "cantaloupe", "raw"] },
  { ids: [342, 343, 344, 345], sara: "naranja", usda: ["oranges", "raw", "all commercial varieties"] },
  { ids: [408, 409, 410, 411], sara: "pera", usda: ["pears", "raw"] },
  { ids: [424], sara: "pomelo", usda: ["grapefruit", "raw", "pink", "red"] },
  { ids: [515], sara: "sandia", usda: ["watermelon", "raw"] },
  { ids: [584], sara: "uva", usda: ["grapes", "red", "green", "raw"] },

  { ids: [1], sara: "aceite de coco", usda: ["oil", "coconut"] },
  { ids: [2], sara: "aceite de oliva", usda: ["oil", "olive", "extra virgin"] },
  { ids: [3], sara: "aceituna negra", usda: ["olives", "ripe", "canned", "small-extra large"] },
  { ids: [4], sara: "aceituna verde", usda: ["olives", "pickled", "canned"] },
  { ids: [34], sara: "almendra", usda: ["nuts", "almonds", "whole", "raw"] },
  { ids: [48], sara: "avellana", usda: ["nuts", "hazelnuts", "filberts"] },
  { ids: [94], sara: "castana", usda: ["nuts", "chestnuts", "european", "raw", "peeled"] },
  { ids: [96], sara: "castana de caju", usda: ["nuts", "cashew", "raw"] },
  { ids: [224], sara: "huevo de gallina entero crudo", usda: ["egg", "whole", "raw", "fresh"] },
  { ids: [282], sara: "mani tostado sin sal", usda: ["peanuts", "all types", "raw"] },
  { ids: [286, 398], sara: "mantequilla de mani", usda: ["peanut butter", "smooth", "without salt"] },
  { ids: [349], sara: "nuez", usda: ["nuts", "walnuts", "english"] },
  { ids: [361], sara: "palta", usda: ["avocados", "raw", "all commercial varieties"] },
  { ids: [415], sara: "pistacho salado", usda: ["nuts", "pistachio", "raw"] },
  { ids: [523], sara: "semilla de girasol", usda: ["seeds", "sunflower", "kernels", "dried"] },
  { ids: [524], sara: "semilla de lino", usda: ["seeds", "flaxseed"] },

  { ids: [247], sara: "leche fluida descremada fortificada con vitaminas a y d", usda: ["milk", "nonfat", "fluid", "vitamin a", "vitamin d"] },
  { ids: [251], sara: "leche descremada en polvo fortificada con vitaminas a y d", usda: ["milk", "dry", "nonfat", "regular"] },
  { ids: [258], sara: "leche entera fluida con vitaminas a y d", usda: ["milk", "whole", "3.25%", "milkfat", "vitamin d"] },
  { ids: [456], sara: "queso cremoso", usda: ["cheese", "queso", "fresco"] },
  { ids: [460], sara: "queso cremoso", usda: ["cheese", "mozzarella", "low moisture", "part-skim"] },
  { ids: [461], sara: "queso porsalut sin sal light", usda: ["cheese", "port de salut"] },

  { ids: [47], sara: "atun enlatado al natural", usda: ["fish", "tuna", "light", "canned", "water", "drained solids"] },
  { ids: [72, 129, 358, 360, 402, 541], sara: "vacuno cortes magros promedio crudo", usda: ["beef", "round", "top round", "lean only", "raw"] },
  { ids: [113], sara: "vacuno cortes semigrasos promedio crudo", usda: ["beef", "steak", "lean", "fat", "raw"] },
  { ids: [88], sara: "cerdo promedio crudo", usda: ["pork", "fresh", "loin", "lean only", "raw"] },
  { ids: [115], sara: "huevo de gallina clara cruda", usda: ["egg", "white", "raw", "fresh"] },
  { ids: [165], sara: "merluza cruda", usda: ["fish", "haddock", "raw"] },
  { ids: [199, 241], sara: "langostino", usda: ["crustaceans", "shrimp", "mixed species", "raw"] },
  { ids: [222], sara: "higado crudo", usda: ["beef", "variety meats", "liver", "raw"] },
  { ids: [270], sara: "cerdo promedio crudo", usda: ["pork", "fresh", "loin", "tenderloin", "lean only", "raw"] },
  { ids: [272], sara: "pescados de mar", usda: ["fish", "sea bass", "mixed species", "raw"] },
  { ids: [291], sara: "langostino", usda: ["crustaceans", "shrimp", "mixed species", "raw"] },
  { ids: [609], sara: "pollo sin piel crudo", usda: ["chicken", "broilers", "fryers", "leg", "meat only", "raw"] },
  { ids: [403], sara: "pavo crudo", usda: ["turkey", "breast", "meat only", "raw"] },
  { ids: [404], sara: "pollo pechuga sin piel crudo", usda: ["chicken", "breast", "boneless", "skinless", "raw"] },
  { ids: [405], sara: "pollo con piel crudo", usda: ["chicken", "breast", "meat", "skin", "raw"] },
  { ids: [412], sara: "pescados de mar", usda: ["fish", "whitefish", "mixed species", "raw"] },
  { ids: [517], sara: "sardinas enlatadas al natural", usda: ["fish", "sardine", "atlantic", "canned", "oil", "drained solids"] },
  { ids: [519], sara: "seitan", usda: ["seitan", "cooked"] },
  { ids: [528], sara: "soja texturizada", usda: ["soy", "protein", "textured"] },
  { ids: [543], sara: "tofu", usda: ["tofu", "raw", "firm", "prepared with calcium"] },

  { ids: [62], sara: "berenjena cruda", usda: ["eggplant", "raw"] },
  { ids: [79], sara: "zapallito crudo", usda: ["squash", "summer", "zucchini", "raw"] },
  { ids: [117], sara: "coliflor crudo", usda: ["cauliflower", "raw"] },
  { ids: [159], sara: "esparrago crudo", usda: ["asparagus", "raw"] },
  { ids: [492], sara: "remolacha cruda", usda: ["beets", "raw"] },
  { ids: [520], sara: "semilla de zapallo", usda: ["seeds", "pumpkin", "squash", "whole", "roasted"] },
  { ids: [544], sara: "tomate crudo", usda: ["tomatoes", "red", "ripe", "raw"] },
  { ids: [605], sara: "zanahoria cruda", usda: ["carrots", "raw"] },
  { ids: [607], sara: "zapallo crudo", usda: ["squash", "winter", "butternut", "raw"] },
  { ids: [77], sara: "brocoli crudo", usda: ["broccoli", "raw"] },
  { ids: [160], sara: "espinaca cruda", usda: ["spinach", "raw"] },
  { ids: [263], sara: "lechuga cruda", usda: ["lettuce", "green leaf", "raw"] },
];

const unitWeights = new Map([
  [34, 1.2], [52, 101], [53, 136], [54, 118], [149, 130], [150, 175], [151, 150], [224, 50], [240, 69],
  [277, 76], [278, 120], [279, 88], [288, 149], [289, 227], [290, 182], [409, 148], [410, 230], [411, 178], [115, 33],
]);

function fold(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9%]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstJsonFile(directory) {
  return path.join(directory, fs.readdirSync(directory).find((name) => name.endsWith(".json")));
}

function parseSara() {
  const command = `npx --yes pdf-parse table "${saraPdf}" --format json`;
  const parsed = JSON.parse(execSync(command, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const entries = [];
  for (const page of parsed.pages || []) {
    for (const table of page.tables || []) {
      const foods = table.at(-1)?.[0] === "Alimento" ? table.at(-1) : null;
      const energy = table.at(-2);
      const protein = table.at(-4);
      const fat = table.at(-5);
      const carbs = table.find((row) => row[0] === "Carbohidratos disponibles");
      if (!foods || !energy || !protein || !fat || !carbs) continue;
      const offset = energy.length - foods.length;
      for (let index = 1; index < foods.length; index += 1) {
        const sourceName = String(foods[index] || "").replace(/\n/g, "").replace(/\s+/g, " ").trim();
        entries.push({
          source: "SARA 2",
          page: page.num,
          name: sourceName,
          key: fold(sourceName),
          kcal: number(energy[index + offset]),
          protein: number(protein[index + offset]),
          carbs: number(carbs[index + offset]),
          fat: number(fat[index + offset]),
        });
      }
    }
  }
  return entries;
}

function nutrient(food, ids) {
  const wanted = new Set(ids);
  const found = (food.foodNutrients || []).find((item) => wanted.has(Number(item?.nutrient?.id)) && Number.isFinite(Number(item?.amount)));
  return found ? Number(found.amount) : null;
}

function normalizeUsdaFood(food) {
  return {
    source: `USDA ${food.dataType}`,
    fdcId: food.fdcId,
    name: food.description,
    key: fold(food.description),
    kcal: nutrient(food, [1008, 2047, 2048]),
    protein: nutrient(food, [1003]),
    carbs: nutrient(food, [1005, 1072]),
    fat: nutrient(food, [1004]),
  };
}

function pickSara(entries, wanted) {
  if (!wanted) return null;
  const key = fold(wanted);
  const compact = key.replace(/\s+/g, "");
  return entries.find((entry) => entry.key === key)
    || entries.find((entry) => entry.key.replace(/\s+/g, "") === compact)
    || entries.find((entry) => entry.key.startsWith(key))
    || entries.find((entry) => entry.key.replace(/\s+/g, "").startsWith(compact))
    || entries.find((entry) => entry.key.includes(key));
}

function pickUsda(entries, tokens = []) {
  if (!tokens.length) return null;
  const wanted = tokens.map(fold);
  const unwanted = ["rind", "peel", "juice", "overripe", "cooked", "boiled", "frozen", "dried", "canned", "baby"];
  const candidates = entries.filter((entry) =>
    wanted.every((token) => entry.key.includes(token))
    && unwanted.every((token) => wanted.includes(token) || !entry.key.includes(token))
  );
  candidates.sort((left, right) => {
    const foundationBias = (right.source.includes("Foundation") ? 100 : 0) - (left.source.includes("Foundation") ? 100 : 0);
    if (foundationBias) return foundationBias;
    return left.name.length - right.name.length;
  });
  return candidates[0] || null;
}

function groupFor(id) {
  return GROUPS.find((group) => group.ids.includes(id)) || null;
}

function per100(food) {
  const unit = fold(food.Unidad);
  const direct = {
    kcal: Number(food.kcal100),
    protein: Number(food.proteina100),
    carbs: Number(food.carbohidratos100),
    fat: Number(food.grasas100),
  };
  if (["grs", "g", "gramos", "ml"].includes(unit) && Object.values(direct).every(Number.isFinite)) {
    return { ...direct, basis: "campo *100", weight: 100 };
  }
  if (["grs", "g", "gramos", "ml"].includes(unit)) {
    return {
      kcal: Number(food.Calorias) * 100,
      protein: Number(food.Proteinas) * 100,
      carbs: Number(food.Carbohidratos) * 100,
      fat: Number(food.Grasas) * 100,
      basis: "legacy por gramo x100",
      weight: 100,
    };
  }
  const declaredWeight = Number(food.pesoUnidadGramos);
  const weight = (Number.isFinite(declaredWeight) && declaredWeight > 0)
    ? declaredWeight
    : unitWeights.get(Number(food.alimentoId));
  if (weight) {
    const factor = 100 / weight;
    return {
      kcal: Number(food.Calorias) * factor,
      protein: Number(food.Proteinas) * factor,
      carbs: Number(food.Carbohidratos) * factor,
      fat: Number(food.Grasas) * factor,
      basis: `unidad convertida con ${weight} g`,
      weight,
    };
  }
  return { kcal: null, protein: null, carbs: null, fat: null, basis: "unidad sin peso", weight: null };
}

function deltaPct(actual, reference, floor) {
  if (!Number.isFinite(actual) || !Number.isFinite(reference)) return null;
  return ((actual - reference) / Math.max(Math.abs(reference), floor)) * 100;
}

function compare(actual, reference) {
  if (!reference || !Number.isFinite(actual.kcal)) return null;
  return {
    kcal: deltaPct(actual.kcal, reference.kcal, 25),
    protein: deltaPct(actual.protein, reference.protein, 2),
    carbs: deltaPct(actual.carbs, reference.carbs, 5),
    fat: deltaPct(actual.fat, reference.fat, 2),
  };
}

function significantScore(actual, reference, deltas) {
  if (!reference || !deltas) return 0;
  const tests = [
    ["kcal", 25], ["protein", 2], ["carbs", 5], ["fat", 2],
  ];
  return Math.max(0, ...tests.map(([key, absoluteFloor]) => {
    const absolute = Math.abs((actual[key] ?? 0) - (reference[key] ?? 0));
    return absolute < absoluteFloor ? 0 : Math.abs(deltas[key] ?? 0);
  }));
}

function severity(food, normalized, sara, usda, saraDelta, usdaDelta, closurePct) {
  const id = Number(food.alimentoId);
  if ([343, 344, 345].includes(id) && !normalized.kcal && !normalized.protein && !normalized.carbs && !normalized.fat) return "CRITICO";
  if (id === 165 && fold(food.Unidad || food.unidad) === "unid") return "CRITICO";
  if (id === 291 && food.activo !== false) return "ALTO";
  if (id === 291 && food.activo === false) return "NO_COMPARABLE";
  if (!Number.isFinite(normalized.kcal)) return "NO_COMPARABLE";
  if (!sara && !usda) return "NO_COMPARABLE";
  const scores = [
    sara ? significantScore(normalized, sara, saraDelta) : null,
    usda ? significantScore(normalized, usda, usdaDelta) : null,
  ].filter(Number.isFinite);
  // Si las dos tablas representan variedades/cortes distintos, una coincidencia
  // buena con cualquiera evita etiquetar como error un dato que sigue siendo plausible.
  const primary = Math.min(...scores);
  const bestDelta = sara && usda
    ? (significantScore(normalized, sara, saraDelta) <= significantScore(normalized, usda, usdaDelta) ? saraDelta : usdaDelta)
    : (saraDelta || usdaDelta);
  const likelyCarbConvention = primary >= 50
    && Math.abs(bestDelta?.kcal ?? 0) < 20
    && Math.abs(bestDelta?.protein ?? 0) < 30
    && Math.abs(bestDelta?.fat ?? 0) < 30;
  if (Math.abs(closurePct ?? 0) > 15 || (primary >= 50 && !likelyCarbConvention)) return "CRITICO";
  if (Math.abs(closurePct ?? 0) > 10 || primary >= 30) return "ALTO";
  if (Math.abs(closurePct ?? 0) > 5 || primary >= 15) return "MEDIO";
  return "OK";
}

function findingsFor(food, normalized, sara, usda, saraDelta, usdaDelta, closurePct, level) {
  const findings = [];
  const id = Number(food.alimentoId);
  if ([343, 344, 345].includes(id) && !normalized.kcal && !normalized.protein && !normalized.carbs && !normalized.fat) findings.push("Registro de naranja por unidad con todos los macros en cero; esta inactivo pero sigue marcado GENERIC.");
  if (id === 165 && fold(food.Unidad || food.unidad) === "unid") findings.push("La unidad dice Unid, pero los valores corresponden a una base por gramo; error de escala/unidad.");
  if (normalized.basis === "unidad sin peso") findings.push("No se puede convertir a 100 g: falta el peso neto/comestible de la unidad, feta o pote.");
  if (Math.abs(closurePct ?? 0) > 5) findings.push(`Las kcal difieren ${round(closurePct)}% del calculo 4P+4C+9G.`);
  const saraScore = sara ? significantScore(normalized, sara, saraDelta) : Infinity;
  const usdaScore = usda ? significantScore(normalized, usda, usdaDelta) : Infinity;
  const primaryDelta = saraScore <= usdaScore ? saraDelta : usdaDelta;
  const primaryName = saraScore <= usdaScore ? "SARA 2" : "USDA";
  if (primaryDelta && ["CRITICO", "ALTO", "MEDIO"].includes(level)) {
    const pieces = Object.entries(primaryDelta)
      .filter(([, value]) => Number.isFinite(value) && Math.abs(value) >= 15)
      .map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${round(value)}%`);
    if (pieces.length) findings.push(`Diferencia relevante vs ${primaryName}: ${pieces.join(", ")}.`);
  }
  if (sara && usda) {
    const refGap = Math.max(
      Math.abs(deltaPct(sara.kcal, usda.kcal, 25) ?? 0),
      Math.abs(deltaPct(sara.protein, usda.protein, 2) ?? 0),
      Math.abs(deltaPct(sara.carbs, usda.carbs, 5) ?? 0),
      Math.abs(deltaPct(sara.fat, usda.fat, 2) ?? 0),
    );
    if (refGap >= 30) findings.push("SARA 2 y USDA divergen >=30%; revisar variedad, corte, crudo/cocido o carbohidrato disponible vs total.");
  }
  if (id === 587) findings.push("'Verduras' no define una composicion reproducible; debe reemplazarse por ingredientes o una receta estandar.");
  if (id === 291) findings.push("'Mariscos' mezcla especies con perfiles muy distintos; quedó inactivo y debe reemplazarse por una especie y estado de cocción concretos.");
  return findings.join(" ");
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows, columns) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

function formatMacroSet(prefix, source) {
  return {
    [`${prefix}_kcal`]: round(source?.kcal),
    [`${prefix}_proteina`]: round(source?.protein),
    [`${prefix}_carbohidratos`]: round(source?.carbs),
    [`${prefix}_grasas`]: round(source?.fat),
  };
}

function markdown(rows, inventory) {
  const counts = Object.fromEntries(["CRITICO", "ALTO", "MEDIO", "OK", "NO_COMPARABLE"].map((level) => [level, rows.filter((row) => row.nivel === level).length]));
  const byCategory = [...new Set(rows.map((row) => row.categoria))].sort().map((category) => ({
    category,
    total: rows.filter((row) => row.categoria === category).length,
    issues: rows.filter((row) => row.categoria === category && row.nivel !== "OK").length,
  }));
  const top = rows.filter((row) => ["CRITICO", "ALTO"].includes(row.nivel));
  const medium = rows.filter((row) => row.nivel === "MEDIO");
  const nonComparable = rows.filter((row) => row.nivel === "NO_COMPARABLE");
  const macros = (row, prefix) => row[`${prefix}_alimento`]
    ? `${row[`${prefix}_kcal`] ?? "—"}/${row[`${prefix}_proteina`] ?? "—"}/${row[`${prefix}_carbohidratos`] ?? "—"}/${row[`${prefix}_grasas`] ?? "—"}`
    : "—";
  const sourceCoverage = {
    sara: rows.filter((row) => row.sara_alimento).length,
    usda: rows.filter((row) => row.usda_alimento).length,
    comparable: rows.filter((row) => row.base_comparacion !== "unidad sin peso").length,
  };

  return `# Auditoria nutricional de alimentos genericos base

Fecha de corte: 26 de octubre de 2026. Consulta de MongoDB realizada en modo lectura sobre \`fooddatabase2\`.

## Resultado ejecutivo

- Coleccion completa: **${inventory.total} registros**.
- Marcados \`generation.mode=GENERIC\`: **${inventory.generic}**.
- Alcance solicitado (alimentos simples/reales, frutas, verduras, carnes, huevos, cereales, pastas y panes simples; sin panes lactales, marcas y ultraprocesados): **${rows.length} documentos**.
- Comparables en base comun por 100 g: **${sourceCoverage.comparable}/${rows.length}**.
- Cobertura de referencia: SARA 2 **${sourceCoverage.sara}/${rows.length}**; USDA **${sourceCoverage.usda}/${rows.length}**.
- Hallazgos: **${counts.CRITICO} criticos**, **${counts.ALTO} altos**, **${counts.MEDIO} medios**, **${counts.NO_COMPARABLE} no comparables** y **${counts.OK} dentro de tolerancia**.

La prioridad argentina es SARA 2. USDA Foundation Foods 2026 y SR Legacy se usan como contraste internacional. Los carbohidratos de SARA son *disponibles*; USDA suele informar carbohidratos *por diferencia* (incluye fibra), por lo que una diferencia aislada de carbohidratos en frutas, verduras, semillas o integrales no se considera automaticamente un error.

## Criterio

- Se normalizaron los registros en gramos a 100 g usando los campos \`kcal100/proteina100/carbohidratos100/grasas100\`.
- En variantes por unidad con peso estandar identificable se convirtio la porcion a 100 g. Cuando Mongo no guarda peso de la unidad/pote/feta, el registro queda \`NO_COMPARABLE\`.
- Se verifico cierre energetico con 4 kcal/g de proteina, 4 kcal/g de carbohidrato y 9 kcal/g de grasa, la misma regla declarada por SARA 2.
- Umbral orientativo: medio desde 15%, alto desde 30% y critico desde 50%, siempre exigiendo tambien una diferencia absoluta minima para no sobrerreaccionar a trazas.
- Crudo y cocido no se intercambian. Si el nombre local no declara estado, la comparacion puede señalar una ambiguedad de modelado ademas de una diferencia numerica.

## Hallazgos criticos y altos

| Nivel | ID | Alimento | BD por 100 g (kcal/P/C/G) | SARA 2 (kcal/P/C/G) | USDA (kcal/P/C/G) | Diagnostico |
|---|---:|---|---|---|---|---|
${top.map((row) => `| ${row.nivel} | ${row.alimentoId} | ${row.alimento} | ${row.db_kcal ?? "—"}/${row.db_proteina ?? "—"}/${row.db_carbohidratos ?? "—"}/${row.db_grasas ?? "—"} | ${macros(row, "sara")} | ${macros(row, "usda")} | ${row.hallazgos || "—"} |`).join("\n") || "| — | — | Sin hallazgos | — | — | — | — |"}

## Diferencias medias

| ID | Alimento | BD (kcal/P/C/G) | SARA 2 | USDA | Diagnostico |
|---:|---|---|---|---|---|
${medium.map((row) => `| ${row.alimentoId} | ${row.alimento} | ${row.db_kcal ?? "—"}/${row.db_proteina ?? "—"}/${row.db_carbohidratos ?? "—"}/${row.db_grasas ?? "—"} | ${macros(row, "sara")} | ${macros(row, "usda")} | ${row.hallazgos || "—"} |`).join("\n") || "| — | Sin hallazgos | — | — | — | — |"}

## No comparables de forma segura

| ID | Alimento | Motivo |
|---:|---|---|
${nonComparable.map((row) => `| ${row.alimentoId} | ${row.alimento} | ${row.hallazgos || "No hay una referencia suficientemente especifica en las fuentes seleccionadas."} |`).join("\n") || "| — | Ninguno | — |"}

## Resumen por categoria

| Categoria | Auditados | Con observacion |
|---|---:|---:|
${byCategory.map((item) => `| ${item.category} | ${item.total} | ${item.issues} |`).join("\n")}

## Problemas de estructura que afectan la exactitud

1. **Unidad sin peso**: un valor por \`Unid\`, \`Pote\`, \`Feta\` o \`Reb\` no es trazable si no existe \`gramWeight\`/peso comestible. La energia puede cerrar internamente y aun asi estar cien veces fuera de escala.
2. **Estado de preparacion ausente**: carne, pollo, pescado, papa, maiz y pastas cambian mucho por agua al cocinarse. Nombres como “churrasco”, “pescado blanco” o “verduras” no alcanzan para fijar una composicion.
3. **Duplicados semanticos**: varios cortes vacunos comparten exactamente 131 kcal, 21,5 g P y 5 g G; eso parece un valor generico replicado, no datos especificos de cada corte.
4. **Categoria incorrecta**: papaya figura en Carbohidratos; semillas de calabaza figuran en Verduras; huevo figura en Grasas. No cambia las kcal, pero si afecta filtros y generacion automatica.
5. **Carbohidrato disponible vs total**: la aplicacion debe declarar cual guarda. Mezclar rotulado argentino/SARA (disponible) con USDA (por diferencia) produce discrepancias sistematicas en alimentos con fibra.

## Inventario excluido

Se excluyeron del cotejo numerico **${inventory.generic - rows.length} registros GENERIC** por ser de marca, panes lactales/de molde de marca, yogures comerciales, fiambres, suplementos, galletitas, tostadas industriales, pastas de marca o duplicados comerciales. No significa que esten correctos: quedaron fuera porque el pedido delimito alimentos base y no esos productos.

## Archivos

- \`comparacion-completa.csv\`: una fila por documento, con valores de Mongo, SARA 2, USDA, diferencias porcentuales y diagnostico.
- \`comparacion-completa.json\`: misma evidencia con precision completa y metadatos.
- \`inventario-alcance.json\`: IDs incluidos y conteos de la coleccion.

## Fuentes y limites

- Ministerio de Salud de la Nacion, **SARA 2: Tabla de composicion quimica de alimentos para Argentina**, 2022. Nutrientes por 100 g de porcion comestible; energia calculada con 4/4/9 y 7 kcal/g para alcohol.
- USDA **FoodData Central Foundation Foods**, abril de 2026, y **SR Legacy**, abril de 2018.
- SARA 2 es una compilacion para ENNyS 2; prioriza datos argentinos pero tambien integra USDA, tabla inglesa, alemana, FNDDS y rotulos. Una coincidencia no equivale necesariamente a analisis de laboratorio argentino del alimento concreto.
- Los valores naturales varian por cultivar, corte, grasa recortada, madurez, marca y coccion. Esta auditoria identifica incompatibilidades de catalogo; no reemplaza una ficha tecnica o analisis bromatologico del producto real.
`;
}

async function main() {
  for (const required of [saraPdf, foundationDir, legacyDir]) {
    if (!fs.existsSync(required)) throw new Error(`Falta fuente local de auditoria: ${required}`);
  }

  const saraEntries = parseSara();
  const foundation = JSON.parse(fs.readFileSync(firstJsonFile(foundationDir), "utf8")).FoundationFoods || [];
  const legacy = JSON.parse(fs.readFileSync(firstJsonFile(legacyDir), "utf8")).SRLegacyFoods || [];
  const usdaEntries = [...foundation, ...legacy].filter(Boolean).map(normalizeUsdaFood);

  const client = new MongoClient(config.STRCNX);
  await client.connect();
  let documents;
  let total;
  let generic;
  try {
    const collection = client.db(config.BASE).collection("fooddatabase2");
    [documents, total, generic] = await Promise.all([
      collection.find({ alimentoId: { $in: [...SELECTED_IDS] } }).sort({ alimentoId: 1 }).toArray(),
      collection.countDocuments({}),
      collection.countDocuments({ "generation.mode": "GENERIC" }),
    ]);
  } finally {
    await client.close();
  }

  const rows = documents.map((food) => {
    const id = Number(food.alimentoId);
    const group = groupFor(id);
    const normalized = per100(food);
    const sara = pickSara(saraEntries, group?.sara);
    const usda = pickUsda(usdaEntries, group?.usda);
    const saraDelta = compare(normalized, sara);
    const usdaDelta = compare(normalized, usda);
    const calculatedKcal = Number.isFinite(normalized.protein)
      ? normalized.protein * 4 + normalized.carbs * 4 + normalized.fat * 9
      : null;
    const closurePct = Number.isFinite(calculatedKcal) && normalized.kcal
      ? ((normalized.kcal - calculatedKcal) / normalized.kcal) * 100
      : null;
    const level = severity(food, normalized, sara, usda, saraDelta, usdaDelta, closurePct);
    return {
      alimentoId: id,
      alimento: food.Alimentos,
      categoria: food.categoriaZumaFit || food.Fuente || "Sin categoria",
      subcategoria: food.subcategoriaZumaFit || "",
      unidad: food.Unidad || "",
      activo: food.activo !== false,
      base_comparacion: normalized.basis,
      peso_unidad_g: normalized.weight === 100 ? null : normalized.weight,
      ...formatMacroSet("db", normalized),
      kcal_4p4c9g: round(calculatedKcal),
      diferencia_cierre_kcal_pct: round(closurePct),
      sara_alimento: sara?.name || "",
      sara_pagina: sara?.page || "",
      ...formatMacroSet("sara", sara),
      diferencia_sara_kcal_pct: round(saraDelta?.kcal),
      diferencia_sara_proteina_pct: round(saraDelta?.protein),
      diferencia_sara_carbohidratos_pct: round(saraDelta?.carbs),
      diferencia_sara_grasas_pct: round(saraDelta?.fat),
      usda_alimento: usda?.name || "",
      usda_fdc_id: usda?.fdcId || "",
      usda_fuente: usda?.source || "",
      ...formatMacroSet("usda", usda),
      diferencia_usda_kcal_pct: round(usdaDelta?.kcal),
      diferencia_usda_proteina_pct: round(usdaDelta?.protein),
      diferencia_usda_carbohidratos_pct: round(usdaDelta?.carbs),
      diferencia_usda_grasas_pct: round(usdaDelta?.fat),
      nivel: level,
      hallazgos: findingsFor(food, normalized, sara, usda, saraDelta, usdaDelta, closurePct, level),
    };
  });

  rows.sort((left, right) => {
    const rank = { CRITICO: 0, ALTO: 1, MEDIO: 2, NO_COMPARABLE: 3, OK: 4 };
    return rank[left.nivel] - rank[right.nivel] || left.alimento.localeCompare(right.alimento, "es");
  });

  const inventory = {
    auditedAt: new Date().toISOString(),
    database: config.BASE,
    collection: "fooddatabase2",
    total,
    generic,
    selected: rows.length,
    selectedIds: [...SELECTED_IDS].sort((a, b) => a - b),
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "comparacion-completa.json"), JSON.stringify({ inventory, rows }, null, 2) + "\n");
  fs.writeFileSync(path.join(outputDir, "inventario-alcance.json"), JSON.stringify(inventory, null, 2) + "\n");
  fs.writeFileSync(path.join(outputDir, "comparacion-completa.csv"), csv(rows, Object.keys(rows[0])));
  fs.writeFileSync(path.join(outputDir, "INFORME_AUDITORIA_NUTRICIONAL.md"), markdown(rows, inventory));
  console.log(JSON.stringify({ outputDir, inventory, levels: Object.groupBy(rows, (row) => row.nivel) }, null, 2));
}

await main();
