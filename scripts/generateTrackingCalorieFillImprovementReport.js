import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runTrackingCalorieFillImprovementMatrix } from "../tests/support/trackingCalorieFillImprovementMatrix.js";

function n(value, digits = 2) {
  const number = Number(value || 0);
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function cell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replace(/\s+/g, " ").trim() || "—";
}

function targetText(target) {
  return `${n(target.kcal)} kcal · P${n(target.proteina)} C${n(target.carbs)} G${n(target.grasas)}`;
}

function totalsText(totals) {
  return `${n(totals.calorias)} kcal · P${n(totals.proteina)} C${n(totals.carbohidratos)} G${n(totals.grasas)}`;
}

function foodsText(foods) {
  return foods.map((food) => `${food.role} ${food.name}: ${n(food.quantity)} ${food.unit}`).join("; ");
}

function diffText(diff) {
  const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${n(value)}`;
  return `K${signed(diff.kcal)} · P${signed(diff.proteina)} C${signed(diff.carbs)} G${signed(diff.grasas)}`;
}

function constrainedText(row) {
  if (!row.constrained) return "—";
  return `${totalsText(row.constrained.totals)}; ${foodsText(row.constrained.foods)}`;
}

function render(matrix) {
  const outsideCalorieZone = matrix.rows.filter((row) => row.calorieDeficit > 1 + 1e-6);
  const lines = [
    "# Matriz dirigida de mejora — Tracking `calorie_fill`",
    "",
    `Generada: ${matrix.generatedAt}. Todos los alimentos son fixtures nutricionales embebidos de sólo lectura; esta ejecución no consulta ni modifica \`fooddatabase2\`.`,
    "",
    "## Resumen",
    "",
    `- Ejecutados: ${matrix.summary.executed} (${matrix.summary.normal} normales, ${matrix.summary.limited} limitados y ${matrix.summary.extreme} extremos).`,
    `- Metas distintas: ${matrix.summary.uniqueTargets}.`,
    `- Comparaciones directas con \`constrained\`: ${matrix.summary.comparedWithConstrained}.`,
    `- Dentro de 1 kcal: ${matrix.summary.withinOneKcal}/${matrix.summary.executed}.`,
    `- Fuera de la zona por granularidad física: ${outsideCalorieZone.map((row) => `${row.id} (${n(row.calorieDeficit)} kcal)`).join(", ") || "ninguno"}.`,
    `- Excesos del techo: ${matrix.summary.overCeiling.length}.`,
    `- Resultados no deterministas: ${matrix.summary.nondeterministic.length}.`,
    `- Fallos de contratos: ${matrix.summary.failures.length}.`,
    "",
    "La prioridad evaluada es: no superar el techo; entrar en la zona de 1 kcal o acercarse todo lo físicamente posible; alcanzar y aproximar proteína; balancear carbohidratos y grasas. Una selección incompleta puede completar calorías y aun así advertir macros imposibles.",
    "",
    "## Resultados detallados",
    "",
    "| ID | Nivel y caso | Meta | Cantidades `calorie_fill` | Resultado | Desvíos | Déficit kcal | Proteína | Avisos | ms |",
    "|---|---|---|---|---|---|---:|---|---|---:|",
  ];

  for (const row of matrix.rows) {
    lines.push(`| ${row.id} | ${cell(`${row.level}: ${row.label}`)} | ${cell(targetText(row.target))} | ${cell(foodsText(row.foods))} | ${cell(totalsText(row.totals))} | ${cell(diffText(row.diff))} | ${n(row.calorieDeficit, 3)} | ${row.proteinReached ? "alcanzada/neutral" : "no alcanzada"} | ${cell(row.warnings.join("; ") || "ninguno")} | ${n(row.timeMs, 4)} |`);
  }

  lines.push(
    "",
    "## Comparaciones con Respetar porciones",
    "",
    "| ID | `constrained` | `calorie_fill` | Diferencia principal |",
    "|---|---|---|---|",
  );
  for (const row of matrix.rows.filter((entry) => entry.constrained)) {
    const constrainedDeficit = row.constrained.calorieDeficit;
    const improvement = constrainedDeficit - row.calorieDeficit;
    lines.push(`| ${row.id} | ${cell(constrainedText(row))} | ${cell(`${totalsText(row.totals)}; ${foodsText(row.foods)}`)} | ${cell(`reduce el déficit calórico en ${n(improvement)} kcal; calorie_fill puede superar recomendaciones, no el techo`)} |`);
  }

  lines.push(
    "",
    "## Lectura funcional",
    "",
    "- Los casos normales combinan fuentes de proteína, carbohidratos y grasas; si los alimentos permiten aproximar los macros, el motor usa esa mezcla dentro de la zona calórica.",
    "- Los casos limitados verifican fuentes faltantes, cantidades Fijas, unidades enteras y selecciones con sólo uno o dos perfiles.",
    "- Los casos extremos verifican 1200–1500 kcal, seis alimentos del mismo perfil, P/C/G en cero y metas fuertemente incompatibles.",
    "- `supera porciones recomendadas` es información esperable del modo Completar calorías; los mínimos, máximos y steps recomendados no bloquean este modo.",
    "- `macros limitados` no significa que el cálculo calórico falló: indica que la selección no tiene la composición necesaria para cuadrar esos macros.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const matrix = await runTrackingCalorieFillImprovementMatrix();
const markdownPath = resolve(process.cwd(), "MATRIZ_TRACKING_CALORIE_FILL_MEJORA.md");
const jsonPath = resolve(process.cwd(), "MATRIZ_TRACKING_CALORIE_FILL_MEJORA.json");
await writeFile(markdownPath, render(matrix), "utf8");
await writeFile(jsonPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  markdownPath,
  jsonPath,
  summary: matrix.summary,
}, null, 2));
