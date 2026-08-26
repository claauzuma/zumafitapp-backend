import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts", "food-combination-diversity", "2026-08-24T18-00-00-000Z");

const files = Object.freeze({
  candidateBefore: "combination-probe-baseline.json",
  candidateAfter: "combination-probe-after.json",
  dailyBefore: "real-generation-smoke-diversity-baseline.json",
  dailyAfter: "real-generation-smoke-diversity-after.json",
});
const nutrients = ["kcal", "proteina", "carbs", "grasas"];
const mealTypes = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];

function rounded(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function timing(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const percentile = (position) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * position))] || 0;
  return {
    samples: sorted.length,
    averageMs: rounded(sorted.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length)),
    p50Ms: rounded(percentile(0.5)),
    p95Ms: rounded(percentile(0.95)),
    maxMs: rounded(sorted.at(-1) || 0),
  };
}

function counts(values = []) {
  const measured = timing(values);
  return {
    samples: measured.samples,
    average: measured.averageMs,
    p50: measured.p50Ms,
    p95: measured.p95Ms,
    max: measured.maxMs,
  };
}

function nutritionErrors(runs = []) {
  return Object.fromEntries(nutrients.map((nutrient) => {
    const values = runs.map((run) => Math.abs(Number(run?.difference?.[nutrient] || 0)));
    return [nutrient, {
      samples: values.length,
      averageAbsoluteError: rounded(values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)),
      maxAbsoluteError: rounded(Math.max(0, ...values)),
    }];
  }));
}

function dailyPerformance(runs = []) {
  const successful = runs.filter((run) => run.status === "OK");
  const meals = successful.flatMap((run) => run.meals || []);
  return {
    allDayRuns: timing(runs.map((run) => Number(run.elapsedMs))),
    successfulDayRuns: timing(successful.map((run) => Number(run.elapsedMs))),
    totalMealGeneration: timing(meals.map((meal) => Number(meal?.solverMeta?.elapsedMs))),
    solverRounds: timing(meals.map((meal) => (meal?.solverMeta?.rounds || [])
      .reduce((total, round) => total + Number(round.elapsedMs || 0), 0))),
    solverCandidateExecutions: counts(meals.map((meal) => Number(meal?.solverMeta?.totalCandidateExecutions))),
  };
}

function exampleMeals(report) {
  const wanted = ["desayuno", "almuerzo", "merienda", "cena", "snack", "colacion"];
  return wanted.map((type) => {
    const runs = report.runs.filter((run) => run.status === "OK");
    const preferred = runs.find((run) => (run.meals || []).some((meal) => meal.type === type && meal.structure !== "P1+C1"));
    const fallback = preferred || runs.find((run) => (run.meals || []).some((meal) => meal.type === type));
    const meal = (fallback?.meals || []).find((entry) => entry.type === type);
    return meal ? { seed: fallback.seed, ...meal } : null;
  }).filter(Boolean);
}

function candidateRows(before, after) {
  return mealTypes.map((mealType) => {
    const baseline = before.probes.find((probe) => probe.mealType === mealType && probe.limit === 32);
    const current = after.probes.find((probe) => probe.mealType === mealType && probe.limit === 32);
    return {
      mealType,
      before: {
        candidateCount: baseline.candidateCount,
        ...baseline.roleCounts,
        candidatesGeneratedBeforeLimit: baseline.generatorMeta.candidatesGeneratedBeforeLimit,
        candidateGenerationTiming: baseline.candidateGenerationTiming,
      },
      after: {
        candidateCount: current.candidateCount,
        ...current.roleCounts,
        candidatesGeneratedBeforeLimit: current.generatorMeta.candidatesGeneratedBeforeLimit,
        candidateGenerationTiming: current.candidateGenerationTiming,
        structures: current.structures,
      },
    };
  });
}

function solverRows(before, after) {
  return mealTypes.map((mealType) => {
    const summarize = (report) => {
      const probe = report.solverProbes.find((entry) => entry.mealType === mealType);
      return {
        target: probe.target,
        status: probe.status,
        recommended: probe.recommended,
        selectedStructure: probe.alternative?.structure || null,
        candidateExecutions: probe.meta?.totalCandidateExecutions || 0,
        physicalSolutions: probe.meta?.quantitySolutionsFound || 0,
        recommendedSolutions: probe.meta?.recommendedSolutionsFound || 0,
        solverRoundsMs: rounded((probe.meta?.rounds || []).reduce((total, round) => total + Number(round.elapsedMs || 0), 0)),
        totalElapsedMs: probe.elapsedMs,
      };
    };
    return { mealType, before: summarize(before), after: summarize(after) };
  });
}

function dailySuccess(report) {
  return Object.fromEntries([3, 4, 5, 6].map((count) => {
    const runs = report.runs.filter((run) => run.requestedMealCount === count);
    return [count, {
      successful: runs.filter((run) => run.status === "OK").length,
      total: runs.length,
    }];
  }));
}

function markdown(report) {
  const lines = [
    "# Comparación de diversidad estructural del combinador",
    "",
    `Generado: ${report.generatedAt}`,
    "",
    "## Seguridad de Mongo",
    "",
    `- Baseline sin cambios: ${report.safety.baselineGenerationUnchanged}`,
    `- Después sin cambios: ${report.safety.afterGenerationUnchanged}`,
    `- Catálogo: ${report.safety.totalFoods} alimentos`,
    "",
    "## Candidatos con límite 32",
    "",
    "| Meal type | P1+C1 antes/después | P2 | C2 | V | F | G | Estructuras únicas | Tiempo medio ms |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  report.candidates.forEach((row) => lines.push(
    `| ${row.mealType} | ${row.before.baseOnly}/${row.after.baseOnly} | ${row.before.P2}/${row.after.P2} | ${row.before.C2}/${row.after.C2} | ${row.before.V}/${row.after.V} | ${row.before.F}/${row.after.F} | ${row.before.G}/${row.after.G} | ${row.before.uniqueStructures}/${row.after.uniqueStructures} | ${row.before.candidateGenerationTiming.averageMs}/${row.after.candidateGenerationTiming.averageMs} |`
  ));
  lines.push("", "## Éxito diario", "", "| Comidas | Antes | Después |", "|---:|---:|---:|");
  [3, 4, 5, 6].forEach((count) => lines.push(
    `| ${count} | ${report.dailySuccess.before[count].successful}/${report.dailySuccess.before[count].total} | ${report.dailySuccess.after[count].successful}/${report.dailySuccess.after[count].total} |`
  ));
  lines.push("", "## Error nutricional absoluto — mismos 16 seeds exitosos en ambos", "", "| Nutriente | Promedio antes/después | Máximo antes/después |", "|---|---:|---:|");
  nutrients.forEach((nutrient) => lines.push(
    `| ${nutrient} | ${report.nutrition.paired.before[nutrient].averageAbsoluteError}/${report.nutrition.paired.after[nutrient].averageAbsoluteError} | ${report.nutrition.paired.before[nutrient].maxAbsoluteError}/${report.nutrition.paired.after[nutrient].maxAbsoluteError} |`
  ));
  lines.push("", "## Performance diaria", "", "| Métrica | Antes | Después |", "|---|---:|---:|");
  for (const key of ["allDayRuns", "successfulDayRuns", "totalMealGeneration", "solverRounds"]) {
    const before = report.performance.before[key];
    const after = report.performance.after[key];
    lines.push(`| ${key} (avg/p50/p95/max) | ${before.averageMs}/${before.p50Ms}/${before.p95Ms}/${before.maxMs} | ${after.averageMs}/${after.p50Ms}/${after.p95Ms}/${after.maxMs} |`);
  }
  lines.push(`| solverCandidateExecutions (avg/p50/p95/max) | ${report.performance.before.solverCandidateExecutions.average}/${report.performance.before.solverCandidateExecutions.p50}/${report.performance.before.solverCandidateExecutions.p95}/${report.performance.before.solverCandidateExecutions.max} | ${report.performance.after.solverCandidateExecutions.average}/${report.performance.after.solverCandidateExecutions.p50}/${report.performance.after.solverCandidateExecutions.p95}/${report.performance.after.solverCandidateExecutions.max} |`);
  lines.push("", "## Ejemplos posteriores", "");
  report.examples.forEach((meal) => {
    lines.push(`### ${meal.type} — ${meal.structure}`, "", `Seed: ${meal.seed}`, `Target: ${JSON.stringify(meal.target)}`, `Actual: ${JSON.stringify(meal.actual)}`, "");
    meal.foods.forEach((food) => lines.push(`- ${food.name}: ${food.quantity} ${food.unit} — ${food.kcal} kcal, P ${food.protein}, C ${food.carbs}, G ${food.fat}`));
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [candidateBefore, candidateAfter, dailyBefore, dailyAfter] = await Promise.all(
    Object.values(files).map(async (file) => JSON.parse(await readFile(path.join(directory, file), "utf8")))
  );
  const pairedBefore = dailyBefore.runs.filter((run) => run.status === "OK" && dailyAfter.runs.some((after) => (
    after.status === "OK" && after.requestedMealCount === run.requestedMealCount && after.run === run.run
  )));
  const pairedAfter = pairedBefore.map((before) => dailyAfter.runs.find((after) => (
    after.status === "OK" && after.requestedMealCount === before.requestedMealCount && after.run === before.run
  )));
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: files,
    safety: {
      totalFoods: candidateAfter.safety.totalAfter,
      baselineGenerationUnchanged: candidateBefore.safety.generationUnchanged && dailyBefore.safety.generationUnchanged,
      afterGenerationUnchanged: candidateAfter.safety.generationUnchanged && dailyAfter.safety.generationUnchanged,
    },
    candidates: candidateRows(candidateBefore, candidateAfter),
    individualSolver: solverRows(candidateBefore, candidateAfter),
    dailySuccess: { before: dailySuccess(dailyBefore), after: dailySuccess(dailyAfter) },
    nutrition: {
      allSuccessful: {
        before: nutritionErrors(dailyBefore.runs.filter((run) => run.status === "OK")),
        after: nutritionErrors(dailyAfter.runs.filter((run) => run.status === "OK")),
      },
      paired: { before: nutritionErrors(pairedBefore), after: nutritionErrors(pairedAfter) },
    },
    performance: {
      before: dailyPerformance(dailyBefore.runs),
      after: dailyPerformance(dailyAfter.runs),
    },
    baselineFailures: dailyBefore.runs.filter((run) => run.status !== "OK"),
    afterFailures: dailyAfter.runs.filter((run) => run.status !== "OK"),
    examples: exampleMeals(dailyAfter),
    metadataBasedCulinaryReview: dailyAfter.runs.flatMap((run) => (run.meals || [])
      .filter((meal) => ["almuerzo", "cena"].includes(meal.type) && meal.structure.split("+").includes("F"))
      .map((meal) => ({ seed: run.seed, mealType: meal.type, structure: meal.structure, foods: meal.foods.map((food) => food.name) }))),
  };
  await writeFile(path.join(directory, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "COMPARISON.md"), markdown(report), "utf8");
  console.log(JSON.stringify({ safety: report.safety, dailySuccess: report.dailySuccess, nutrition: report.nutrition.paired, performance: report.performance }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
