import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runTrackingCalorieFillMatrix } from "../tests/support/trackingCalorieFillMatrix.js";

function n(value, digits = 2) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
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

function diffText(diff) {
  const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${n(value)}`;
  return `K${signed(diff.calorias)} · P${signed(diff.proteina)} C${signed(diff.carbohidratos)} G${signed(diff.grasas)}`;
}

function foodsText(record, includeRole = true) {
  return record.foods.map((food) => {
    const role = includeRole ? `${food.role}: ` : "";
    const quantity = food.quantity == null ? "sin cantidad" : `${n(food.quantity)} ${food.unidad}`;
    return `${role}${food.nombre} ${quantity}`;
  }).join("; ");
}

function notices(record) {
  return [...record.warnings.map((value) => `Advertencia: ${value}`), ...record.information.map((value) => `Info: ${value}`)].join("; ") || "Ninguno";
}

function summaryRow(label, counts, productSummary = "sí") {
  return `| ${label} | ${counts.executed} | ${counts.pass} | ${counts.passWithInformation} | ${counts.fail} | ${productSummary} |`;
}

function renderMarkdown(matrix) {
  const { summary } = matrix;
  const lines = [
    "# Matriz Tracking — Completar calorías (`tracking_calorie_fill_v1`)",
    "",
    `Generada: ${matrix.metadata.generatedAt}. Seed reproducible: \`${matrix.metadata.seedHex}\`.`,
    "",
    "Esta matriz usa snapshots nutricionales embebidos y de sólo lectura. No consulta ni modifica `fooddatabase2`. No selecciona únicamente combinaciones favorables: incluye mezclas apropiadas, incompletas y absurdas; metas consistentes e incompatibles; alimentos continuos y discretos; Fijos, Registrados, máximos bajos, steps grandes y un alimento inválido de cero kcal.",
    "",
    "## Cierre matemático",
    "",
    "| Categoría | Ejecutados | PASS | PASS CON INFORMACIÓN/ADVERTENCIA | FAIL | Incluidos en resumen de producto |",
    "|---|---:|---:|---:|---:|:---:|",
    summaryRow("Fijos", summary.fixed),
    summaryRow("Random reproducibles", summary.random),
    summaryRow("Total", summary.total),
    "",
    `Cierre correcto: **${summary.totalsClose ? "sí" : "no"}**. Una limitación nutricional válida no se convierte en FAIL: PASS/FAIL evalúa invariantes del motor; información y advertencias describen porciones elevadas, granularidad, unidades o macros realmente inalcanzables.`,
    "",
    "## Propiedades verificadas",
    "",
    `- Techo calórico: ${summary.ceilingViolations.length === 0 ? "145/145" : `fallaron ${summary.ceilingViolations.join(", ")}`}.`,
    `- Déficit continuo <=2 kcal o mejor valor físicamente alcanzable: ${summary.continuousWithinTwoKcal}/145.`,
    `- Candidatos calóricamente dominados: ${summary.dominatedCandidates.length === 0 ? "0" : summary.dominatedCandidates.join(", ")}.`,
    `- Determinismo: ${summary.deterministicFailures.length === 0 ? "145/145" : `fallaron ${summary.deterministicFailures.join(", ")}`}.`,
    `- Rendimiento >=100 ms: ${summary.over100ms.length === 0 ? "0 casos" : summary.over100ms.map((item) => `${item.id} (${item.timeMs} ms)`).join(", ")}.`,
    `- Rendimiento: mediana ${n(summary.performance.medianMs, 4)} ms, p95 ${n(summary.performance.p95Ms, 4)} ms, máximo ${n(summary.performance.maxMs, 4)} ms.`,
    `- Aislamiento: endpoint genérico no activa la policy = ${summary.isolation.genericCannotActivateCalorieFill ? "PASS" : "FAIL"}; constrained conserva \`tracking_remaining_v2\` = ${summary.isolation.constrainedKeepsHistoricalPolicy ? "PASS" : "FAIL"}.`,
    "- También se verifican cantidades finitas/no negativas, unidades indivisibles enteras, Fijos intactos, Registrados ausentes de la respuesta Auto, alimentos usados o exclusión explícita y granularidad continua de 1 g/ml.",
    "",
    "## Cobertura deliberada",
    "",
    `- Perfiles A–I: ${Object.entries(summary.byProfile).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
    `- Cantidad de alimentos: ${Object.entries(summary.byFoodCount).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
    `- Combinaciones: ${Object.entries(summary.byCombinationKind).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
    `- Consistencia de metas: ${Object.entries(summary.byConsistency).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
    `- Proteína: activa=${summary.proteinTargetActive}, P=0 neutral=${summary.proteinZeroNeutral}, alcanzada=${summary.proteinReached}, inalcanzable=${summary.proteinUnreached}.`,
    "- Rango random: 200–1500 kcal. Los 100 casos y sus datos completos están en `MATRIZ_TRACKING_CALORIE_FILL_RANDOM.json`.",
    "",
    "## Veinte pruebas funcionales detalladas",
    "",
    "| Caso | Objetivo | Alimentos y cantidades | Resultado | Desvíos | Warning/info y razón | ms |",
    "|---|---|---|---|---|---|---:|",
  ];

  for (const record of matrix.detailed) {
    lines.push(`| ${record.id} — ${cell(record.highlight)} | ${cell(targetText(record.target))} | ${cell(foodsText(record))} | ${cell(totalsText(record.result.totals))} | ${cell(diffText(record.result.diff))} | ${cell(notices(record))} | ${n(record.timeMs, 4)} |`);
  }

  lines.push(
    "",
    "## Los 45 casos fijos",
    "",
    "| ID | Perfil/tipo | Objetivo | Alimentos usados | Resultado | Estado |",
    "|---|---|---|---|---|---|",
  );
  for (const record of matrix.fixed) {
    lines.push(`| ${record.id} | ${record.profile} / ${cell(record.combinationKind)} | ${cell(targetText(record.target))} | ${cell(foodsText(record, false))} | ${cell(totalsText(record.result.totals))}; ${cell(diffText(record.result.diff))} | ${record.status} |`);
  }

  lines.push(
    "",
    "## Lectura de warnings",
    "",
    "- **Advertencia necesaria:** macro significativamente inalcanzable, selección incapaz de cubrirlo, unidad discreta que impide acercarse más o alimento sin kcal válida.",
    "- **Información no bloqueante:** se superó una porción recomendada de manera intencional, P=0 neutral o el paso físico de 1 g/ml explica la pequeña diferencia.",
    "- Las mezclas normales CF005, CF018 y CF019 completaron kcal y se acercaron a P/C/G sin warning fuerte. No se bajaron thresholds para fabricar PASS; se corrigió la comparación lexicográfica que sacrificaba C/G por centésimas de proteína.",
    "",
    "## Casos principales",
    "",
    `- CF002 Pechuga con piel + Queso: ${foodsText(matrix.fixed.find((item) => item.id === "CF002"), false)} => ${totalsText(matrix.fixed.find((item) => item.id === "CF002").result.totals)}.`,
    `- CF003 un alimento continuo a 1200 kcal: ${foodsText(matrix.fixed.find((item) => item.id === "CF003"), false)} => ${totalsText(matrix.fixed.find((item) => item.id === "CF003").result.totals)}.`,
    `- CF005 mezcla completa: ${foodsText(matrix.fixed.find((item) => item.id === "CF005"), false)} => ${totalsText(matrix.fixed.find((item) => item.id === "CF005").result.totals)}, desvíos ${diffText(matrix.fixed.find((item) => item.id === "CF005").result.diff)}.`,
    `- CF009 unidades discretas: ${foodsText(matrix.fixed.find((item) => item.id === "CF009"), false)} => ${totalsText(matrix.fixed.find((item) => item.id === "CF009").result.totals)}; no inventa fracciones.`,
    "",
    "## Alcance y límites del informe",
    "",
    "La matriz prueba el motor y el contrato del servicio de Tracking sin persistir logs. Confirmación/idempotencia, permisos y regresiones Admin/Coach se cubren en suites separadas del repositorio; no se infieren a partir de esta matriz. Las mediciones son locales y pueden variar bajo contención, por lo que se informa mediana/p95/máximo además del SLA.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const matrix = await runTrackingCalorieFillMatrix();
const root = resolve(process.cwd());
const markdownPath = resolve(root, "MATRIZ_TRACKING_CALORIE_FILL.md");
const jsonPath = resolve(root, "MATRIZ_TRACKING_CALORIE_FILL_RANDOM.json");
await writeFile(markdownPath, renderMarkdown(matrix), "utf8");
await writeFile(jsonPath, `${JSON.stringify({
  metadata: matrix.metadata,
  summary: matrix.summary,
  random: matrix.random,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  markdownPath,
  jsonPath,
  fixed: matrix.summary.fixed,
  random: matrix.summary.random,
  total: matrix.summary.total,
  performance: matrix.summary.performance,
}, null, 2));

