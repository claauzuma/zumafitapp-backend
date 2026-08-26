import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  mealCompositionOverlap,
  normalizeMealComposition,
} from "../servicio/mealCompositionDiversity.js";

const directory = path.resolve("artifacts", "automatic-daily-menu-audit");
const beforeFile = path.join(directory, "automatic-daily-menu-functional-audit.json");
const afterFile = path.join(directory, "automatic-daily-menu-functional-audit-daily-diversity-after.json");
const jsonFile = path.join(directory, "automatic-daily-composition-diversity-comparison.json");
const markdownFile = path.join(directory, "AUTOMATIC_DAILY_COMPOSITION_DIVERSITY_COMPARISON.md");

function composition(meal = {}) {
  return meal.composition?.foodIds?.length
    ? normalizeMealComposition(meal.composition)
    : normalizeMealComposition({ foods: meal.foods || [] });
}

function analyzeCase(entry = {}) {
  const meals = (entry.result?.meals || [])
    .filter((meal) => meal.orchestrationStatus === "generated")
    .map((meal) => ({ ...meal, composition: composition(meal) }));
  const pairs = [];
  for (let left = 0; left < meals.length; left += 1) {
    for (let right = left + 1; right < meals.length; right += 1) {
      const overlap = mealCompositionOverlap(meals[left].composition, meals[right].composition);
      if (!overlap.exact && !overlap.highOverlap) continue;
      pairs.push({
        leftType: meals[left].type,
        rightType: meals[right].type,
        leftFoods: meals[left].foods.map((food) => `${food.name} ${food.quantity} ${food.unit}`),
        rightFoods: meals[right].foods.map((food) => `${food.name} ${food.quantity} ${food.unit}`),
        ...overlap,
      });
    }
  }
  return {
    id: entry.id,
    group: entry.group,
    generatedMeals: meals.length,
    uniqueCompositions: new Set(meals.map((meal) => meal.composition.fingerprint)).size,
    exactRepeats: pairs.filter((pair) => pair.exact).length,
    highOverlaps: pairs.filter((pair) => pair.highOverlap).length,
    pairs,
  };
}

function analyze(report = {}) {
  const cases = (report.cases || []).map(analyzeCase);
  const matrix = cases.filter((entry) => entry.group === "daily-matrix");
  const summary = (values) => ({
    cases: values.length,
    generatedMeals: values.reduce((sum, entry) => sum + entry.generatedMeals, 0),
    exactRepeats: values.reduce((sum, entry) => sum + entry.exactRepeats, 0),
    highOverlaps: values.reduce((sum, entry) => sum + entry.highOverlaps, 0),
  });
  return { all: summary(cases), dailyMatrix: summary(matrix), cases };
}

const before = JSON.parse(await readFile(beforeFile, "utf8"));
const after = JSON.parse(await readFile(afterFile, "utf8"));
const report = {
  generatedAt: new Date().toISOString(),
  definition: {
    exact: "mismo conjunto de foodId, ignorando cantidad, unidad y orden",
    highOverlap: "al menos dos alimentos y Jaccard >= 0.60 o containment >= 0.80",
  },
  before: analyze(before),
  after: analyze(after),
};
report.delta = {
  dailyMatrixExactRepeats: report.after.dailyMatrix.exactRepeats - report.before.dailyMatrix.exactRepeats,
  dailyMatrixHighOverlaps: report.after.dailyMatrix.highOverlaps - report.before.dailyMatrix.highOverlaps,
};

await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const lines = [
  "# Comparación de diversidad semántica diaria",
  "",
  `- Exactas en matriz diaria: ${report.before.dailyMatrix.exactRepeats} → ${report.after.dailyMatrix.exactRepeats}.`,
  `- Solapamientos altos en matriz diaria: ${report.before.dailyMatrix.highOverlaps} → ${report.after.dailyMatrix.highOverlaps}.`,
  `- Definición exacta: ${report.definition.exact}.`,
  `- Definición solapamiento alto: ${report.definition.highOverlap}.`,
  "",
  "## Pares detectados antes",
  "",
];
for (const entry of report.before.cases.filter((item) => item.pairs.length)) {
  for (const pair of entry.pairs) {
    lines.push(`- ${entry.id}: ${pair.leftType} [${pair.leftFoods.join(" + ")}] ↔ ${pair.rightType} [${pair.rightFoods.join(" + ")}]; exact=${pair.exact}; J=${pair.jaccard}; containment=${pair.containment}.`);
  }
}
lines.push("", "## Pares detectados después", "");
for (const entry of report.after.cases.filter((item) => item.pairs.length)) {
  for (const pair of entry.pairs) {
    lines.push(`- ${entry.id}: ${pair.leftType} [${pair.leftFoods.join(" + ")}] ↔ ${pair.rightType} [${pair.rightFoods.join(" + ")}]; exact=${pair.exact}; J=${pair.jaccard}; containment=${pair.containment}.`);
  }
}
await writeFile(markdownFile, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ jsonFile, markdownFile, before: report.before.dailyMatrix, after: report.after.dailyMatrix, delta: report.delta }, null, 2));
