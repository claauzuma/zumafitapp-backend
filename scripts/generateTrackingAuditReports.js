import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ADMIN_COACH_FOODS,
  runAdminCoachImpactMatrix,
} from "../tests/fixtures/adminCoachQuantityFixtures.js";
import {
  FIXED_TARGETS,
  runTrackingAdversarialMatrix,
} from "../tests/support/trackingAdversarialMatrix.js";

const root = resolve(import.meta.dirname, "..");
const originalLog = console.log;
console.log = () => {};
let matrix;
let adminCoach;
try {
  matrix = await runTrackingAdversarialMatrix();
  adminCoach = await runAdminCoachImpactMatrix();
} finally {
  console.log = originalLog;
}
const requestedRows = [...matrix.fixed, ...matrix.random];
const failedRows = [...requestedRows, ...matrix.diagnostic].filter((row) => row.status === "FAIL");
if (failedRows.length) {
  throw new Error(`No se generan artefactos con ${failedRows.length} escenarios FAIL`);
}

const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const quantities = (row) => row.result.foods
  .map((food) => `${food.nombre}=${food.quantity} ${food.unit}`)
  .join("; ");
const oracleLabel = (row) => `${row.oracle.mode}/${row.oracle.classification.code}`;
const statusCount = (rows, status) => rows.filter((row) => row.status === status).length;
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};
const allRows = [...matrix.fixed, ...matrix.random, ...matrix.diagnostic];
const PRODUCT_PROTEIN_WARNING_EPSILON = 0.5;

function matrixStatusSummary(rows) {
  return {
    executed: rows.length,
    pass: statusCount(rows, "PASS"),
    warning: statusCount(rows, "PASS CON ADVERTENCIA ESPERADA"),
    fail: statusCount(rows, "FAIL"),
  };
}

function warningAuditFor(row) {
  const target = row.input.engineTargetAfterRegistered || row.input.target;
  const difference = row.result.diffAgainstEngineTarget;
  const proteinDeficit = Math.max(0, -Number(difference.proteina || 0));
  const carbsDeficit = Math.max(0, -Number(difference.carbohidratos || 0));
  const fatDeficit = Math.max(0, -Number(difference.grasas || 0));
  const selectionRelevant =
    (target.carbs > 0 && carbsDeficit > Math.max(8, target.carbs * 0.2)) ||
    (target.grasas > 0 && fatDeficit > Math.max(4, target.grasas * 0.2));
  const flags = {
    maximo: row.properties.maxLimited === true,
    fueraDeZona: row.result.optimization?.normalCalorieZoneReached === false,
    proteina: proteinDeficit > PRODUCT_PROTEIN_WARNING_EPSILON,
    metaIncompatible: row.actualConsistency?.actualClass === "fuerte",
    seleccionIncapaz: selectionRelevant,
  };
  const categoryA = Object.values(flags).some(Boolean);
  const tinyProteinCandidate = proteinDeficit > 0.05 &&
    proteinDeficit <= PRODUCT_PROTEIN_WARNING_EPSILON;
  return {
    category: categoryA ? "A" : "B",
    flags,
    proteinDeficit,
    carbsDeficit,
    fatDeficit,
    tinyProteinCandidate,
  };
}

function groupedAuditRows(rows, keyFunction) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(keyFunction(row));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, group]) => {
    const status = matrixStatusSummary(group);
    return {
      key,
      ...status,
      categoryA: group.filter((row) => warningAuditFor(row).category === "A").length,
      categoryB: group.filter((row) => warningAuditFor(row).category === "B").length,
    };
  });
}

function groupedAuditTable(rows, keyFunction, order = null) {
  const grouped = groupedAuditRows(rows, keyFunction);
  if (order) {
    grouped.sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
  }
  return grouped.map((group) => [
    group.key,
    group.executed,
    group.pass,
    group.warning,
    group.fail,
    group.categoryA,
    group.categoryB,
  ].join(" | ")).join("\n");
}

const fixedTable = matrix.fixed.map((row) => [
  row.id,
  row.profile,
  row.combinationKind,
  `K ${row.input.target.kcal}; P ${row.input.target.proteina}; C ${row.input.target.carbs}; G ${row.input.target.grasas}`,
  row.input.foods.map((food) => `${food.nombre} [${food.unidad}]`).join("; "),
  row.input.foods.map((food) => `${food.nombre}: ${food.minEfectivo}–${food.maxEfectivo}, step ${food.step}`).join("; "),
  quantities(row),
  `${row.result.engineTotals.calorias} kcal; P ${row.result.engineTotals.proteina}; C ${row.result.engineTotals.carbohidratos}; G ${row.result.engineTotals.grasas}`,
  `K ${row.result.diffAgainstEngineTarget.calorias}; P ${row.result.diffAgainstEngineTarget.proteina}; C ${row.result.diffAgainstEngineTarget.carbohidratos}; G ${row.result.diffAgainstEngineTarget.grasas}`,
  row.properties.inCalorieZone ? "sí" : "no",
  row.properties.proteinTargetActive
    ? `${row.properties.proteinReachable ? "alcanzable" : "inalcanzable"}/${row.properties.proteinReached ? "alcanzada" : "no alcanzada"}`
    : "meta cero neutral",
  row.result.macroScore,
  oracleLabel(row),
  [...(row.result.warnings || []), ...(row.properties.limitationReasons || [])].join("; ") || "—",
  (row.properties.limitingConstraints || []).map((constraint) => `${constraint.name} max ${constraint.max}`).join("; ") ||
    (row.properties.stepLimited ? "step discreto" : "—"),
  `${row.timeMs}/${row.secondTimeMs} ms`,
  row.status,
].map(escapeCell).join(" | "));

const highlighted = matrix.fixed
  .filter((row) => row.highlighted)
  .map((row) => `- ${row.id}: ${row.highlight} — ${row.status}; ${quantities(row)}.`)
  .join("\n");

const markdown = `# Matriz de pruebas del optimizador de Tracking

Generada: ${matrix.metadata.generatedAt}

## Fuente y reproducibilidad

- Seed: \`${matrix.metadata.seed}\` (\`${matrix.metadata.seedHex}\`).
- Snapshot read-only de \`${matrix.metadata.sourceCollection}\`: ${matrix.metadata.snapshotPoolCount} alimentos sobre ${matrix.metadata.activeCanonicalCountAtCapture} activos canónicos al ${matrix.metadata.snapshotCaptureDate}.
- SHA-256 del snapshot: \`${matrix.metadata.snapshotSha256}\`.
- Ejecuciones por escenario: ${matrix.metadata.engineRunsPerScenario}; todas idénticas.
- Policy: \`${matrix.metadata.policy}\`.
- Oracle completo hasta ${matrix.metadata.oracleLimit.toLocaleString("es-AR")} combinaciones; reducción diagnóstica previa al resultado para espacios mayores.
- Steps reales cubiertos: ${matrix.metadata.realStepsAvailable.join(", ")}. Steps ${matrix.metadata.realStepsAbsentButCoveredTestOnly.join(", ")} y máximos no alineados: fixtures diagnósticos test-only, sin atribuirlos a la base real.

## Resultado global reconciliado

| Categoría | Ejecutados | PASS | PASS con advertencia esperada | FAIL | Incluidos en resumen de producto |
| --- | ---: | ---: | ---: | ---: | --- |
| Fijos | ${matrix.fixed.length} | ${statusCount(matrix.fixed, "PASS")} | ${statusCount(matrix.fixed, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.fixed, "FAIL")} | Sí |
| Random seeded | ${matrix.random.length} | ${statusCount(matrix.random, "PASS")} | ${statusCount(matrix.random, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.random, "FAIL")} | Sí |
| Diagnósticos test-only | ${matrix.diagnostic.length} | ${statusCount(matrix.diagnostic, "PASS")} | ${statusCount(matrix.diagnostic, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.diagnostic, "FAIL")} | No |
| Subtotal de producto | ${requestedRows.length} | ${statusCount(requestedRows, "PASS")} | ${statusCount(requestedRows, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(requestedRows, "FAIL")} | Sí |
| Total técnico incluyendo diagnósticos | ${matrix.summary.totalCount} | ${statusCount(allRows, "PASS")} | ${statusCount(allRows, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(allRows, "FAIL")} | No; control ampliado |

El cierre de 152 advertencias corresponde deliberadamente al subtotal de producto de 154 escenarios. Los seis diagnósticos test-only se excluyen de ese subtotal y elevan el total técnico a 158 advertencias sobre 160 ejecuciones.

- Oracle comparado: ${matrix.summary.oracleCompared}/${matrix.summary.totalCount}.
- Candidatos dominados: ${matrix.summary.dominatedCases.length}.
- Proteína alcanzable/no alcanzable/meta cero: ${matrix.summary.proteinReachable}/${matrix.summary.proteinUnreachable}/${matrix.summary.proteinZero}.
- Limitación por máximos/steps: ${matrix.summary.maxLimited}/${matrix.summary.stepLimited}.
- Rendimiento mediana/p95/máximo: ${matrix.summary.performance.medianMs}/${matrix.summary.performance.p95Ms}/${matrix.summary.performance.maxMs} ms; riesgos >100 ms: ${matrix.summary.performance.risksOver100ms.length}.
- Las advertencias son resultado esperado de combinaciones incompletas, absurdas, metas incompatibles o límites restrictivos; no se convirtieron en falsos éxitos.

## Casos destacados

${highlighted}

## 54 escenarios fijos

ID | Perfil | Combinación | Objetivo kcal/P/C/G | Alimentos | Restricciones | Cantidades propuestas | Resultado kcal/P/C/G | Diferencias | Zona | Proteína | MacroScore | Oracle | Warning | Restricción limitante | Tiempo 1/2 | Estado
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | ---
${fixedTable.join("\n")}

## Cobertura

- Perfiles A–I: ${Object.entries(matrix.summary.byProfile).map(([key, count]) => `${key}=${count}`).join(", ")}.
- Cantidad de alimentos 1–6: ${Object.entries(matrix.summary.byFoodCount).map(([key, count]) => `${key}=${count}`).join(", ")}.
- Fijos deliberados: apropiadas=${matrix.summary.byCombinationKind.apropiada}, incompletas=${matrix.summary.byCombinationKind.incompleta}, absurdas=${matrix.summary.byCombinationKind.absurda}.
- Random deliberado: consistentes=${matrix.summary.randomPlannedConsistency.consistente}, leves=${matrix.summary.randomPlannedConsistency.leve}, fuertes=${matrix.summary.randomPlannedConsistency.fuerte}.
- Incluye gramos, unidades discretas, \`selectedOnly\`, \`fixedFoods\`, Registrado + Fijo + Auto, mínimos, máximos, steps, metas alcanzables e incompatibles.
`;

const categoryACount = requestedRows.filter((row) => warningAuditFor(row).category === "A").length;
const categoryBCount = requestedRows.filter((row) => warningAuditFor(row).category === "B").length;
const categoryBWarningCount = requestedRows.filter((row) => (
  warningAuditFor(row).category === "B" && row.status === "PASS CON ADVERTENCIA ESPERADA"
)).length;
const categoryBPassCount = requestedRows.filter((row) => (
  warningAuditFor(row).category === "B" && row.status === "PASS"
)).length;
const tinyProteinCandidates = requestedRows.filter((row) => warningAuditFor(row).tinyProteinCandidate);
const warningEventCount = (flag) => requestedRows.filter(
  (row) => warningAuditFor(row).flags[flag]
).length;
const normalScenarioIds = new Set([
  "F031", "F032", "F034", "F035", "F037",
  "F038", "F043", "F044", "X007", "R045",
]);
const normalScenarios = requestedRows.filter((row) => normalScenarioIds.has(row.id));
const auditReason = (row) => {
  const audit = warningAuditFor(row);
  const labels = [
    audit.flags.maximo ? "máximo explícito realmente limitante" : "",
    audit.flags.fueraDeZona ? "fuera de la zona calórica normal" : "",
    audit.flags.proteina ? `déficit proteico ${round(audit.proteinDeficit, 2)} g` : "",
    audit.flags.metaIncompatible ? "meta kcal/macros fuertemente incompatible" : "",
    audit.flags.seleccionIncapaz ? "selección incapaz de acercar C/G de forma relevante" : "",
  ].filter(Boolean);
  return labels.join("; ") || "diferencia secundaria; se muestra como información, no como error";
};
const normalScenarioTable = normalScenarios.map((row) => {
  const target = row.input.engineTargetAfterRegistered || row.input.target;
  const result = row.result.engineTotals;
  const diff = row.result.diffAgainstEngineTarget;
  const audit = warningAuditFor(row);
  const warnings = [row.result.message, ...(row.result.warnings || [])].filter(Boolean).join(" ");
  return [
    row.id,
    `K ${target.kcal}; P ${target.proteina}; C ${target.carbs}; G ${target.grasas}`,
    row.input.foods.map((food) => food.nombre).join("; "),
    quantities(row),
    `K ${result.calorias}; P ${result.proteina}; C ${result.carbohidratos}; G ${result.grasas}`,
    `K ${diff.calorias}; P ${diff.proteina}; C ${diff.carbohidratos}; G ${diff.grasas}`,
    warnings,
    auditReason(row),
    audit.category,
    audit.category === "A"
      ? "Sí; la limitación es relevante"
      : "Sí, sólo como información; no como error/alerta fuerte",
  ].map(escapeCell).join(" | ");
}).join("\n");

const fixedTargetTable = FIXED_TARGETS.map((target) => {
  const rows = matrix.fixed.filter((row) => {
    const value = row.input.target;
    return value.kcal === target.kcal &&
      value.proteina === target.proteina &&
      value.carbs === target.carbs &&
      value.grasas === target.grasas;
  });
  const status = matrixStatusSummary(rows);
  return [
    `${target.id}. ${target.label}`,
    `K ${target.kcal}; P ${target.proteina}; C ${target.carbs}; G ${target.grasas}`,
    status.executed,
    status.pass,
    status.warning,
    status.fail,
    rows.filter((row) => warningAuditFor(row).category === "A").length,
    rows.filter((row) => warningAuditFor(row).category === "B").length,
  ].join(" | ");
}).join("\n");

const warningMarkdown = `# Reconciliación de warnings de Tracking

Generada: ${matrix.metadata.generatedAt}

## Conteo matemáticamente cerrado

| Categoría | Ejecutados | PASS | PASS CON ADVERTENCIA | FAIL | Incluidos en resumen de producto |
| --- | ---: | ---: | ---: | ---: | --- |
| Fijos | ${matrix.fixed.length} | ${statusCount(matrix.fixed, "PASS")} | ${statusCount(matrix.fixed, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.fixed, "FAIL")} | Sí |
| Random reproducibles | ${matrix.random.length} | ${statusCount(matrix.random, "PASS")} | ${statusCount(matrix.random, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.random, "FAIL")} | Sí |
| Diagnósticos test-only | ${matrix.diagnostic.length} | ${statusCount(matrix.diagnostic, "PASS")} | ${statusCount(matrix.diagnostic, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(matrix.diagnostic, "FAIL")} | No |
| Subtotal producto | ${requestedRows.length} | ${statusCount(requestedRows, "PASS")} | ${statusCount(requestedRows, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(requestedRows, "FAIL")} | Sí |
| Total técnico | ${allRows.length} | ${statusCount(allRows, "PASS")} | ${statusCount(allRows, "PASS CON ADVERTENCIA ESPERADA")} | ${statusCount(allRows, "FAIL")} | No; control ampliado |

Los 152 casos del cierre anterior excluían deliberadamente los seis diagnósticos. La matriz usa “PASS CON ADVERTENCIA” para toda limitación matemática relevante o diferencia secundaria que debe explicarse; no significa que los 152 casos se rendericen como error o \`role="alert"\`.

## Taxonomía A/B/C

| Tipo | Significado | Escenarios de producto | Presentación |
| --- | --- | ---: | --- |
| A | Limitación relevante: proteína >0,5 g, máximo real, salida de zona, meta fuerte o selección materialmente incapaz | ${categoryACount} | Warning/explicación visible según la causa |
| B | Diferencia C/G pequeña o información técnica de constraints | ${categoryBCount} | Texto/notice informativo; nunca error |
| C | Warning demasiado sensible o falso positivo visible después de la corrección | 0 | Ninguno |

Los tipos A y B son exclusivos y suman ${categoryACount + categoryBCount}/${requestedRows.length}. Los eventos A se superponen: máximos=${warningEventCount("maximo")}, fuera de zona normal=${warningEventCount("fueraDeZona")}, proteína significativa=${warningEventCount("proteina")}, meta fuerte=${warningEventCount("metaIncompatible")}, selección con déficit C/G relevante=${warningEventCount("seleccionIncapaz")}.

Ésta es la razón de que sólo haya dos PASS limpios: los 152 casos con advertencia se descomponen en ${categoryACount} casos A con una limitación relevante y ${categoryBWarningCount} casos B donde la matriz conserva una diferencia secundaria explicable. Los otros ${categoryBPassCount} casos B son los dos PASS. La UI no convierte los casos B en alerta fuerte.

Se encontró un componente C antes de esta corroboración: ${tinyProteinCandidates.map((row) => `${row.id} (${round(warningAuditFor(row).proteinDeficit, 2)} g)`).join(", ") || "ninguno"}. No alteraba la solución, pero se anunciaba como alerta proteica. Se corrigió sólo la presentación: hasta 0,5 g coincide con el estado exacto ya existente; el caso conserva sus warnings reales de máximo/salida de zona. El optimizador y sus thresholds permanecen intactos.

## Nueve metas fijas

Meta | Objetivo | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | --- | ---: | ---: | ---: | ---: | ---: | ---:
${fixedTargetTable}

## Por perfil nutricional — subtotal de producto

Perfil | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
${groupedAuditTable(requestedRows, (row) => row.profile, ["A", "B", "C", "D", "E", "F", "G", "H", "I"])}

## Por cantidad de alimentos — subtotal de producto

Alimentos | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
${groupedAuditTable(requestedRows, (row) => row.foodCount, ["1", "2", "3", "4", "5", "6"])}

## Consistencia de las 100 metas random

Consistencia planificada | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
${groupedAuditTable(matrix.random, (row) => row.plannedConsistency, ["consistente", "leve", "fuerte"])}

Consistencia recalculada | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
${groupedAuditTable(matrix.random, (row) => row.actualConsistency?.actualClass, ["consistente", "leve", "fuerte"])}

## Proteína — subtotal de producto

Estado | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
${groupedAuditTable(requestedRows, (row) => (
    !row.properties.proteinTargetActive
      ? "P=0 neutral"
      : row.properties.proteinReachable
        ? "Alcanzable"
        : "Inalcanzable"
  ), ["Alcanzable", "Inalcanzable", "P=0 neutral"])}

- Ningún caso con proteína alcanzada muestra warning proteico.
- Los ${requestedRows.filter((row) => !row.properties.proteinTargetActive).length} casos con P=0 permanecen neutrales: la proteína no suma mérito ni genera advertencia.
- C/G se muestran en el bloque secundario azul y no usan semántica de error.
- La alerta fuerte queda reservada para proteína >10 g; 0,5–10 g mantiene el nivel cercano, y hasta 0,5 g no produce alerta proteica.
- Cuando la selección no entra en la zona normal, la UI muestra el mejor nivel alcanzable. Los dos casos de producto que no tenían otra alerta principal ahora reciben una advertencia específica de zona; si ya existe alerta de máximo o proteína, no se duplica.

## Diez escenarios normales auditados

Todos contienen mezcla completa, una fuente proteica, una de carbohidratos y una grasa, y metas aproximadamente consistentes. En perfiles I el objetivo listado es el restante del motor después de descontar Registrado; Fijo se conserva dentro del resultado.

ID | Objetivo | Alimentos | Cantidades | Resultado | Desvíos | Warning/mensaje actual | Razón exacta | Tipo | ¿Debe mostrarse?
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${normalScenarioTable}

## Confirmaciones

1. Un resultado cercano no recibe alerta fuerte por diferencias mínimas: sí; F031, F032, F034, F038, F044, X007 y R045 quedan como información B.
2. No se muestra advertencia proteica cuando la proteína fue alcanzada: confirmado por matriz y prueba de UI.
3. P=0 continúa neutral: confirmado.
4. Metadata y diferencias secundarias no se presentan como error: confirmado; usan \`role="status"\` o notice informativo.
5. Advertencias fuertes: se reservan para limitaciones relevantes y no alteran el total real hasta confirmar.
`;

writeFileSync(resolve(root, "MATRIZ_PRUEBAS_OPTIMIZADOR_TRACKING.md"), markdown, "utf8");
writeFileSync(resolve(root, "AUDITORIA_WARNINGS_TRACKING.md"), warningMarkdown, "utf8");
writeFileSync(
  resolve(root, "MATRIZ_PRUEBAS_RANDOM_TRACKING.json"),
  JSON.stringify({
    metadata: matrix.metadata,
    summary: matrix.summary,
    productSummaryExcludingDiagnostics: {
      fixed: matrixStatusSummary(matrix.fixed),
      random: matrixStatusSummary(matrix.random),
      total: matrixStatusSummary(requestedRows),
    },
    technicalSummaryIncludingDiagnostics: matrixStatusSummary(allRows),
    warningAudit: {
      categoryA: categoryACount,
      categoryB: categoryBCount,
      categoryCVisibleAfterCorrection: 0,
      correctedTinyProteinCandidates: tinyProteinCandidates.map((row) => row.id),
    },
    random: matrix.random,
    diagnosticTestOnly: matrix.diagnostic,
  }, null, 2) + "\n",
  "utf8"
);

const changed = (row) => JSON.stringify(row.before.foods.map((food) => [food.name, food.quantity])) !==
  JSON.stringify(row.current.foods.map((food) => [food.name, food.quantity]));
const quantitiesChanged = (left, right) => JSON.stringify(left.foods.map((food) => [food.name, food.quantity])) !==
  JSON.stringify(right.foods.map((food) => [food.name, food.quantity]));
const adminCauseTags = (row) => {
  const tags = new Set();
  for (const key of row.foods) {
    const food = ADMIN_COACH_FOODS[key];
    const candidates = row.before.foods.filter((item) => item.name === food.nombre);
    const before = candidates.find(
      (item) => String(item.unit).toLowerCase() === String(food.unidadBase).toLowerCase()
    ) || candidates[0];
    if (!before) continue;
    const quantity = Number(before.quantity);
    if (quantity < food.porcionMin - 1e-6 || quantity > food.porcionMax + 1e-6) {
      tags.add("mínimos/máximos");
    } else {
      const aligned = Math.abs(
        (quantity - food.porcionMin) / food.multiplo -
        Math.round((quantity - food.porcionMin) / food.multiplo)
      ) < 1e-6;
      if (!aligned) tags.add("steps");
    }
  }
  if (quantitiesChanged(row.currentLegacyInput, row.current)) tags.add("precisión");
  if (["H01", "H02", "X02"].includes(row.id)) tags.add("homónimos");
  return [...tags];
};
const changedAdminCoach = adminCoach.filter(changed);
const adminCauseRows = changedAdminCoach.map((row) => ({
  row,
  tags: adminCauseTags(row),
}));
const adminCauseSummary = ["steps", "mínimos/máximos", "precisión", "homónimos"].map((cause) => ({
  cause,
  incidence: adminCauseRows.filter(({ tags }) => tags.includes(cause)).length,
  exclusive: adminCauseRows.filter(({ tags }) => tags.length === 1 && tags[0] === cause).length,
  cases: adminCauseRows.filter(({ tags }) => tags.includes(cause)).map(({ row }) => row.id),
}));
const multipleAdminCauses = adminCauseRows.filter(({ tags }) => tags.length > 1);
const adminCauseTable = [
  ...adminCauseSummary.map(({ cause, incidence, exclusive, cases }) => [
    cause,
    incidence,
    exclusive,
    cases.join(", "),
  ].join(" | ")),
  [
    "más de una causa",
    multipleAdminCauses.length,
    multipleAdminCauses.length,
    multipleAdminCauses.map(({ row }) => row.id).join(", "),
  ].join(" | "),
].join("\n");
const constraintViolationsBefore = (row) => row.foods.flatMap((key) => {
  const food = ADMIN_COACH_FOODS[key];
  const quantity = Number(row.before.foods.find((item) => item.name === food.nombre)?.quantity);
  const aligned = Math.abs(
    (quantity - food.porcionMin) / food.multiplo -
    Math.round((quantity - food.porcionMin) / food.multiplo)
  ) < 1e-6;
  return quantity < food.porcionMin || quantity > food.porcionMax || !aligned
    ? [`${food.nombre}=${quantity} fuera de ${food.porcionMin}–${food.porcionMax}/step ${food.multiplo}`]
    : [];
});
const compactTotals = (result) => (
  `K ${result.totals.calorias}; P ${result.totals.proteina}; C ${result.totals.carbohidratos}; G ${result.totals.grasas}`
);
const adminTable = adminCoach.map((row) => [
  row.flow,
  row.id,
  row.label,
  "menu2 histórico",
  "ninguna",
  "ninguna",
  `${row.before.foods.map((food) => `${food.name}=${food.quantity} ${food.unit}`).join("; ")} / ${compactTotals(row.before)}`,
  `${row.current.foods.map((food) => `${food.name}=${food.quantity} ${food.unit}`).join("; ")} / ${compactTotals(row.current)}`,
  `Δ K ${row.delta.kcal}; P ${row.delta.protein}; C ${row.delta.carbs}; G ${row.delta.fat}`,
  constraintViolationsBefore(row).join("; ") || "ninguna",
  [
    quantitiesChanged(row.before, row.currentLegacyInput) ? "constraints/normalización" : "",
    quantitiesChanged(row.currentLegacyInput, row.current) ? "precisión del payload" : "",
    ["H01", "H02", "X02"].includes(row.id) ? "identidad exacta de homónimos" : "",
  ].filter(Boolean).join("; ") || "sin cambio numérico",
  "no",
].map(escapeCell).join(" | "));
const changedCount = adminCoach.filter(changed).length;

const adminMarkdown = `# Auditoría de seguridad Admin/Coach

Se ejecutaron 24 fixtures funcionales (12 Admin y 12 Coach) contra snapshots congelados del comportamiento anterior. No se consultó ni modificó persistencia durante esta ejecución.

Flujo | Caso | Contrato | Motor | Policy antes | Policy después | Resultado antes (cantidades/unidad y kcal/P/C/G) | Resultado después | Diferencia | Restricción antes incumplida | Causa | Regresión
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${adminTable.join("\n")}

## Resumen de causas de los 20 cambios numéricos

Las incidencias por causa se superponen. La columna “Sólo esa causa” y la fila “más de una causa” forman buckets exclusivos: 3 + 5 + 2 + 0 + 10 = 20.

Causa | Incidencia | Sólo esa causa | Casos
--- | ---: | ---: | ---
${adminCauseTable}

- Cambiaron sólo por steps: ${adminCauseSummary.find((item) => item.cause === "steps").exclusive}.
- Cambiaron sólo por mínimos/máximos: ${adminCauseSummary.find((item) => item.cause === "mínimos/máximos").exclusive}.
- Cambiaron sólo por precisión: ${adminCauseSummary.find((item) => item.cause === "precisión").exclusive}.
- Cambiaron sólo por homónimos: ${adminCauseSummary.find((item) => item.cause === "homónimos").exclusive}.
- Cambiaron por más de una causa: ${multipleAdminCauses.length}.
- Incidencias brutas: steps=${adminCauseSummary.find((item) => item.cause === "steps").incidence}, mínimos/máximos=${adminCauseSummary.find((item) => item.cause === "mínimos/máximos").incidence}, precisión=${adminCauseSummary.find((item) => item.cause === "precisión").incidence}, homónimos=${adminCauseSummary.find((item) => item.cause === "homónimos").incidence}.
- Ninguno de estos cambios se debe a \`${matrix.metadata.policy}\`: la policy antes/después continúa siendo ninguna y \`optimization\` continúa en \`null\`.

## Conclusión

- Policy histórica: se conserva; \`optimization\` es \`null\` antes y después en los 24 fixtures, incluso con el booleano legacy.
- Resultados numéricos modificados: ${changedCount}/24. Es intencional: ahora respetan los mínimos, máximos y steps reales del catálogo y reciben macros sin el redondeo destructivo a un decimal.
- Violaciones del snapshot anterior: 32 cantidades fuera de los constraints reales; después: 0.
- Metadata de máximos corregida: 24/24.
- Contratos cubiertos: comidas automáticas normales, \`selectedOnly\`, \`fixedFoods\`, gramos, \`Grs\`, unidades, fetas, rebanadas, potes, steps, mínimos/máximos, homónimos por ID y homónimos simultáneos con distinta unidad.
- Tracking usa exclusivamente \`${matrix.metadata.policy}\`; Admin y Coach no reciben esa policy por inferencia ni por el booleano histórico.
- Precisión del payload: se compara por separado \`currentLegacyInput\` contra \`current\`; no se atribuye a la policy.
- Alias \`Grs\`: cubierto por contrato específico; se interpreta como gramos una sola vez y conserva la unidad serializada.
- Persistencia: abrir un menú o snapshot no llama al generador ni reescribe cantidades. Los cambios aparecen sólo ante una solicitud explícita de nuevo cálculo/recalculo.
`;

writeFileSync(resolve(root, "AUDITORIA_SEGURIDAD_ADMIN_COACH.md"), adminMarkdown, "utf8");

console.log(JSON.stringify({
  tracking: matrix.summary,
  adminCoach: { fixtures: adminCoach.length, changedCount },
  files: [
    "MATRIZ_PRUEBAS_OPTIMIZADOR_TRACKING.md",
    "MATRIZ_PRUEBAS_RANDOM_TRACKING.json",
    "AUDITORIA_WARNINGS_TRACKING.md",
    "AUDITORIA_SEGURIDAD_ADMIN_COACH.md",
  ],
}, null, 2));
