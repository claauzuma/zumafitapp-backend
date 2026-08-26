import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDayDistribution,
  nextSequentialMealTarget,
} from "../../../zumafitront/src/clientMenus/clientMenuDayPlanner.js";

const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!directory) throw new Error("Indicá el directorio de la curación.");

const roles = ["P1", "P2", "C1", "C2", "V", "F", "G"];
const mealTypes = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];
const dailyTarget = { kcal: 2140, proteina: 150, carbs: 250, grasas: 60 };

async function json(filename, base = directory) {
  return JSON.parse(await readFile(path.join(base, filename), "utf8"));
}

function enabled(flags = {}, keys = []) {
  return keys.filter((key) => flags?.[key] === true).join(", ") || "—";
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function csvCell(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${String(text ?? "").replaceAll('"', '""')}"`;
}

function breakfastTarget(seed) {
  const distribution = buildDayDistribution({
    mealTypes: ["desayuno", "almuerzo", "cena"],
    mode: "balanced",
    seed,
  });
  return nextSequentialMealTarget({
    rawRemaining: dailyTarget,
    remainingSlotWeights: distribution.weights,
    proteinMinimum: 10,
    proteinMaximum: 70,
  }).target;
}

function runLines(run) {
  if (run.status !== "OK") {
    const target = run.requestedMealCount === 3 ? breakfastTarget(run.seed) : null;
    return [
      `### ${run.requestedMealCount} comidas · corrida ${run.run} · ERROR`,
      "",
      `- Seed: ${run.seed}`,
      `- Código: ${run.code}`,
      `- Mensaje: ${run.error}`,
      ...(target ? [`- Target del desayuno que falló: ${target.kcal} kcal · P ${target.proteina} · C ${target.carbs} · G ${target.grasas}`] : []),
      `- Soluciones físicas encontradas: ${run.details?.quantitySolutionsFound ?? "—"}; recomendadas: ${run.details?.recommendedSolutionsFound ?? 0}.`,
      "",
    ];
  }
  const lines = [
    `### ${run.requestedMealCount} comidas · corrida ${run.run} · OK`,
    "",
    `- Seed: ${run.seed}`,
    `- Totales: ${round(run.totals.kcal)} kcal · P ${round(run.totals.proteina)} · C ${round(run.totals.carbs)} · G ${round(run.totals.grasas)}`,
    `- Diferencia: kcal ${round(run.difference.kcal)} · P ${round(run.difference.proteina)} · C ${round(run.difference.carbs)} · G ${round(run.difference.grasas)}`,
    "",
  ];
  run.meals.forEach((meal) => {
    lines.push(`#### ${meal.type} · ${meal.structure || "estructura no informada"}`, "");
    meal.foods.forEach((food) => lines.push(`- ${food.name}: ${food.quantity} ${food.unit} · ${food.kcal} kcal · P ${food.protein} · C ${food.carbs} · G ${food.fat}`));
    meal.culinaryWarnings.forEach((warning) => lines.push(`- ADVERTENCIA: ${warning}`));
    lines.push("");
  });
  return lines;
}

const plan = await json("curation-plan.json");
const verification = await json("apply-verification.json");
const smoke = await json("real-generation-smoke.json");
const extraSmoke = await json("real-generation-smoke-3-extra.json");
const combinationProbe = await json("combination-probe.json");
const audit = await json("catalog-audit.json", path.dirname(directory));
const allRuns = [...smoke.runs, ...extraSmoke.runs].sort((left, right) =>
  left.requestedMealCount - right.requestedMealCount || left.run - right.run
);
const successfulByCount = Object.fromEntries([3, 4, 5, 6].map((count) => [count, {
  ok: allRuns.filter((run) => run.requestedMealCount === count && run.status === "OK").length,
  failed: allRuns.filter((run) => run.requestedMealCount === count && run.status !== "OK").length,
}]));
const groupedChanges = Map.groupBy(plan.changes, (change) => change.category || "Sin categoría");
const groupedSources = Object.fromEntries([...Map.groupBy(plan.changes, (change) => change.source)].map(([source, changes]) => [source, changes.length]));
const realFlowProbe = combinationProbe.probes.filter((probe) => probe.limit === 32);

const lines = [
  "# Informe final · Curación masiva de generation",
  "",
  `Generado: ${new Date().toISOString()}`,
  "",
  "## Resumen",
  "",
  `- Alimentos revisados: ${plan.before.total}.`,
  `- Documentos modificados: ${plan.changes.length}.`,
  `- GENERIC: ${plan.before.modes.GENERIC} → ${verification.modes.GENERIC}.`,
  `- EXPLICIT_ONLY: ${plan.before.modes.EXPLICIT_ONLY} → ${verification.modes.EXPLICIT_ONLY}.`,
  `- DISABLED: ${plan.before.modes.DISABLED} → ${verification.modes.DISABLED}.`,
  `- Requieren revisión manual: ${plan.manualReview.length}.`,
  `- GENERIC sin portionRule completa: ${verification.genericWithoutCompletePortionRule}.`,
  `- Registros no modificados: ${plan.before.total - plan.changes.length}.`,
  "",
  "## Seguridad y reversibilidad",
  "",
  `- Total antes/después: ${verification.totalBefore}/${verification.totalAfter}.`,
  `- Mismatches posteriores: ${verification.mismatches.length}.`,
  `- Campos modificados: exclusivamente generation mediante $set.`,
  `- portionRule modificadas: ${plan.safety.portionRulesChanged}.`,
  `- Documentos creados/eliminados: ${plan.safety.documentsInserted}/${plan.safety.documentsDeleted}.`,
  `- Snapshot reversible: rollback-snapshot.json, ${plan.safety.reversibleSnapshotEntries} entradas.`,
  `- Comando de rollback disponible: node scripts/curateFoodGenerationCatalog.js --restore "${path.join(directory, "rollback-snapshot.json")}"`,
  "",
  "## Criterios aplicados",
  "",
  ...Object.entries(groupedSources).sort(([left], [right]) => left.localeCompare(right)).map(([source, count]) => `- ${source}: ${count}.`),
  "",
  "## Cobertura total configurada y pool activo",
  "",
  "| Rol | GENERIC configurados | GENERIC activos |",
  "|---|---:|---:|",
  ...roles.map((role) => `| ${role} | ${audit.summary.roles[role]} | ${verification.roles[role]} |`),
  "",
  "| MealType | GENERIC configurados | GENERIC activos |",
  "|---|---:|---:|",
  ...mealTypes.map((meal) => `| ${meal} | ${audit.summary.mealTypes[meal]} | ${verification.mealTypes[meal]} |`),
  "",
  "## Matriz activa mealType × role",
  "",
  "| MealType | P1 | P2 | C1 | C2 | V | F | G |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...mealTypes.map((meal) => `| ${meal} | ${roles.map((role) => verification.coverage[meal][role]).join(" | ")} |`),
  "",
  "El núcleo P1+C1 tiene cobertura en los cinco momentos. C2 está deliberadamente vacío en lunch/dinner y V está vacío en desayuno/snack/extraSnack por la lógica culinaria aplicada. Los demás opcionales tienen cobertura, aunque no necesariamente llegan al lote de candidatos del flujo real.",
  "",
  "## Comportamiento real del combinador sin modificarlo",
  "",
  "El flujo diario pide 32 candidatos. Con el ranking actual, los 32 fueron siempre estructuras P1+C1:",
  "",
  "| MealType | Candidatos | P1+C1 | Con roles opcionales |",
  "|---|---:|---:|---:|",
  ...realFlowProbe.map((probe) => `| ${probe.mealType} | ${probe.candidateCount} | ${probe.structures["P1+C1"] || 0} | ${probe.optionalStructureCandidates} |`),
  "",
  "Con limit=100 aparecieron C2 en breakfast/snack/extraSnack y F en lunch/dinner, pero el flujo diario actual usa 32. Esto es una limitación funcional preexistente del ranking/límite, no de cobertura del catálogo. No se modificó el combinador.",
  "",
  "## Pruebas reales diarias no persistentes",
  "",
  `- Corridas totales: ${allRuns.length}; exitosas: ${allRuns.filter((run) => run.status === "OK").length}; fallidas: ${allRuns.filter((run) => run.status !== "OK").length}.`,
  `- 3 comidas: ${successfulByCount[3].ok} OK / ${successfulByCount[3].failed} fallidas.`,
  `- 4 comidas: ${successfulByCount[4].ok} OK / ${successfulByCount[4].failed} fallidas.`,
  `- 5 comidas: ${successfulByCount[5].ok} OK / ${successfulByCount[5].failed} fallidas.`,
  `- 6 comidas: ${successfulByCount[6].ok} OK / ${successfulByCount[6].failed} fallidas.`,
  `- Fingerprint de generation antes/después de las pruebas: sin cambios (${smoke.safety.generationUnchanged && extraSmoke.safety.generationUnchanged}).`,
  `- Alertas culinarias automáticas: ${smoke.summary.culinaryWarnings + extraSmoke.summary.culinaryWarnings}.`,
  "",
  "Las seis fallas fueron desayunos de planes de tres comidas. El orquestador asignó entre 711 y 778 kcal y entre 49,9 y 54,5 g de proteína al desayuno. En cada caso el motor produjo 96 soluciones físicas, pero ninguna cumplió simultáneamente los umbrales recomendados. Los dos casos exitosos tuvieron desayunos de 635,6–654 kcal y 44,6–45,8 g de proteína. No se inventaron roles ni porciones para ocultar esta limitación.",
  "",
  "Las 11 corridas exitosas cerraron calorías con un desvío máximo de 1,9 kcal, pero no cerraron necesariamente los macros: el desvío absoluto promedio fue P 17,64 g, C 25,95 g y G 16,96 g; los máximos fueron P 36,03 g, C 50,85 g y G 32,48 g. Esto coincide con que el lote real sólo evaluó P1+C1 y no incorporó los roles opcionales configurados.",
  "",
  ...allRuns.flatMap(runLines),
  "## Cambios uno por uno, agrupados por categoría",
  "",
];

for (const [category, changes] of [...groupedChanges].sort(([left], [right]) => left.localeCompare(right, "es"))) {
  lines.push(`### ${category}`, "");
  changes.sort((left, right) => left.name.localeCompare(right.name, "es")).forEach((change) => {
    lines.push(
      `- ID Mongo ${change.id} · alimentoId ${change.alimentoId ?? "—"} · ${change.name}`,
      `  - Mode: ${change.before.mode} → ${change.after.mode}`,
      `  - Roles: ${enabled(change.before.roles, roles)} → ${enabled(change.after.roles, roles)}`,
      `  - MealTypes: ${enabled(change.before.mealTypes, mealTypes)} → ${enabled(change.after.mealTypes, mealTypes)}`,
      `  - Motivo: ${change.reason}`,
      `  - Clasificación: ${change.source}`
    );
  });
  lines.push("");
}

lines.push("## Requieren revisión manual", "");
plan.manualReview.forEach((entry) => {
  lines.push(
    `- ID Mongo ${entry.id} · alimentoId ${entry.alimentoId ?? "—"} · ${entry.name} · ${entry.category || "Sin categoría"}`,
    `  - Configuración actual: ${entry.currentGeneration.mode}; roles ${enabled(entry.currentGeneration.roles, roles)}; mealTypes ${enabled(entry.currentGeneration.mealTypes, mealTypes)}.`,
    `  - Duda: ${entry.doubt}`,
    `  - Sugerencia: ${entry.suggestion}`
  );
});

lines.push("", "## Porciones propuestas/no aplicadas", "");
plan.portionProposals.forEach((entry) => {
  lines.push(`- ${entry.alimentoId ?? entry.id} · ${entry.name} · actual ${JSON.stringify(entry.portionRule)} · ${entry.suggestion}`);
});

await writeFile(path.join(directory, "INFORME_FINAL_CURACION_GENERATION.md"), `${lines.join("\n")}\n`, "utf8");

const changeCsv = [
  ["mongoId", "alimentoId", "nombre", "categoria", "modeAntes", "modeDespues", "rolesAntes", "rolesDespues", "mealTypesAntes", "mealTypesDespues", "motivo", "clasificacion"],
  ...plan.changes.map((change) => [
    change.id, change.alimentoId ?? "", change.name, change.category,
    change.before.mode, change.after.mode,
    enabled(change.before.roles, roles), enabled(change.after.roles, roles),
    enabled(change.before.mealTypes, mealTypes), enabled(change.after.mealTypes, mealTypes),
    change.reason, change.source,
  ]),
].map((row) => row.map(csvCell).join(",")).join("\n");
await writeFile(path.join(directory, "cambios-documento-por-documento.csv"), `${changeCsv}\n`, "utf8");

const manualCsv = [
  ["mongoId", "alimentoId", "nombre", "categoria", "modeActual", "rolesActuales", "mealTypesActuales", "duda", "sugerencia"],
  ...plan.manualReview.map((entry) => [
    entry.id, entry.alimentoId ?? "", entry.name, entry.category,
    entry.currentGeneration.mode, enabled(entry.currentGeneration.roles, roles),
    enabled(entry.currentGeneration.mealTypes, mealTypes), entry.doubt, entry.suggestion,
  ]),
].map((row) => row.map(csvCell).join(",")).join("\n");
await writeFile(path.join(directory, "revision-manual.csv"), `${manualCsv}\n`, "utf8");

console.log(JSON.stringify({
  report: path.join(directory, "INFORME_FINAL_CURACION_GENERATION.md"),
  changesCsv: path.join(directory, "cambios-documento-por-documento.csv"),
  manualReviewCsv: path.join(directory, "revision-manual.csv"),
  changes: plan.changes.length,
  manualReview: plan.manualReview.length,
  runs: allRuns.length,
}, null, 2));
