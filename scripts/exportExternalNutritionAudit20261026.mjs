import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import config from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const frontendRoot = path.resolve(backendRoot, "..", "..", "zumafitront");
const artifactsRoot = path.join(frontendRoot, "artifacts");
const outputDir = path.join(artifactsRoot, "AUDITORIA_ZUMAFIT_ARGENTINA_20261026");

const SARA_URL = "https://cesni-biblioteca.org/archivos/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf";
const USDA_DOWNLOAD_URL = "https://fdc.nal.usda.gov/download-datasets/";
const ARGENFOODS_URL = "https://www.fao.org/infoods/infoods/tablas-y-bases-de-datos/america-latina/es/";
const ANMAT_LABEL_URL = "https://www.anmat.gob.ar/portafolio_educativo/Capitulo10.asp";

const paths = {
  firstDir: path.join(artifactsRoot, "food-catalog-fixes-2026-10-26"),
  secondDir: path.join(artifactsRoot, "argentine-staples-2026-10-26"),
  auditBefore: path.join(artifactsRoot, "food-nutrition-audit-2026-10-26"),
  auditPostFirst: path.join(artifactsRoot, "food-nutrition-audit-post-fix-2026-10-26"),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function value(...candidates) {
  return candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
}

function number(candidate) {
  if (candidate === undefined || candidate === null || candidate === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(candidate, digits = 4) {
  const parsed = number(candidate);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function fold(candidate = "") {
  return String(candidate)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function foodName(doc = {}) {
  return value(doc.Alimentos, doc.nombre, doc.name, doc.alimentos, "") || "";
}

function foodUnit(doc = {}) {
  return value(doc.Unidad, doc.unidad, doc.unidadBase, "") || "";
}

function isMassOrVolumeUnit(unit = "") {
  return ["g", "gr", "grs", "gramo", "gramos", "ml"].includes(fold(unit));
}

function isVolumeUnit(unit = "") {
  return fold(unit) === "ml";
}

function primaryMacros(doc = {}) {
  return {
    kcal: number(value(doc.Calorias, doc.calorias, doc.kcal, doc.kcalUnidad)),
    protein: number(value(doc.Proteinas, doc.proteinas, doc.proteina, doc.proteinaUnidad)),
    carbs: number(value(doc.Carbohidratos, doc.carbohidratos, doc.carbs, doc.carbohidratosUnidad)),
    fat: number(value(doc.Grasas, doc.grasas, doc.fat, doc.grasasUnidad)),
    alcohol: number(value(doc.alcoholUnidad, 0)) || 0,
  };
}

function normalizedPer100(doc = {}) {
  const direct = {
    kcal: number(doc.kcal100),
    protein: number(doc.proteina100),
    carbs: number(doc.carbohidratos100),
    fat: number(doc.grasas100),
    alcohol: number(doc.alcohol100) || 0,
  };
  if ([direct.kcal, direct.protein, direct.carbs, direct.fat].every((item) => item !== null)) {
    return { ...direct, basis: "campos *100 persistidos" };
  }

  const unit = foodUnit(doc);
  const macros = primaryMacros(doc);
  if (isMassOrVolumeUnit(unit) && [macros.kcal, macros.protein, macros.carbs, macros.fat].every((item) => item !== null)) {
    return {
      kcal: macros.kcal * 100,
      protein: macros.protein * 100,
      carbs: macros.carbs * 100,
      fat: macros.fat * 100,
      alcohol: (number(doc.alcohol100) || 0),
      basis: "campos legacy por 1 g/ml multiplicados por 100",
    };
  }

  const weight = number(doc.pesoUnidadGramos);
  if (weight && weight > 0 && [macros.kcal, macros.protein, macros.carbs, macros.fat].every((item) => item !== null)) {
    const factor = 100 / weight;
    return {
      kcal: macros.kcal * factor,
      protein: macros.protein * factor,
      carbs: macros.carbs * factor,
      fat: macros.fat * factor,
      alcohol: (number(doc.alcohol100) || 0),
      basis: `unidad convertida mediante pesoUnidadGramos=${weight}`,
    };
  }
  return { kcal: null, protein: null, carbs: null, fat: null, alcohol: null, basis: "sin base comparable" };
}

function delta(actual, reference) {
  if (number(actual) === null || number(reference) === null) return { absolute: null, percent: null };
  const absolute = actual - reference;
  const percent = Math.abs(reference) < 1e-9 ? (Math.abs(actual) < 1e-9 ? 0 : null) : (absolute / reference) * 100;
  return { absolute: round(absolute), percent: round(percent, 2) };
}

function csvCell(candidate) {
  if (candidate === undefined || candidate === null) return "";
  const text = typeof candidate === "object" ? JSON.stringify(candidate) : String(candidate);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(([key, label]) => csvCell(label || key)).join(",");
  const lines = rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(","));
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

function writeCsv(file, rows, columns) {
  fs.writeFileSync(file, toCsv(rows, columns), "utf8");
}

function generationType(doc = {}) {
  const mode = doc.generation?.mode || "";
  if (mode === "GENERIC") return "GENÉRICO";
  if (mode === "EXPLICIT_ONLY") return "COMERCIAL_O_ESPECÍFICO";
  return "SIN_CLASIFICAR";
}

function automaticGeneration(doc = {}) {
  if (doc.activo === false || doc.generation?.mode !== "GENERIC") return false;
  return Object.values(doc.generation?.mealTypes || {}).some(Boolean);
}

function unitIssue(doc, per100) {
  const unit = foodUnit(doc);
  const weight = number(doc.pesoUnidadGramos);
  const issues = [];
  if (!unit) issues.push("unidad ausente");
  if (!isMassOrVolumeUnit(unit) && !(weight > 0)) issues.push("unidad discreta sin peso comestible/neto");
  if (isVolumeUnit(unit) && /USDA/i.test(doc.referenciaNutricional?.source || "")) {
    issues.push("fuente USDA por 100 g aplicada a ml sin densidad documentada");
  }
  if ([per100.kcal, per100.protein, per100.carbs, per100.fat].some((item) => item === null)) {
    issues.push("no convertible de forma verificable a 100 g/ml");
  }
  return [...new Set(issues)].join("; ");
}

function internalConsistency(doc, per100) {
  const unit = foodUnit(doc);
  const primary = primaryMacros(doc);
  const weight = number(doc.pesoUnidadGramos);
  const issues = [];
  const ratios = [];
  if (isMassOrVolumeUnit(unit)) {
    for (const key of ["kcal", "protein", "carbs", "fat"]) {
      if (primary[key] !== null && per100[key] !== null) {
        const expected = primary[key] * 100;
        if (Math.abs(expected - per100[key]) > Math.max(0.02, Math.abs(per100[key]) * 0.005)) {
          issues.push(`${key}: campo *100=${round(per100[key])} vs legacy×100=${round(expected)}`);
        }
        if (Math.abs(primary[key]) > 1e-9) ratios.push(Math.abs(per100[key] / primary[key]));
      }
    }
  } else if (weight > 0) {
    for (const key of ["kcal", "protein", "carbs", "fat"]) {
      if (primary[key] !== null && per100[key] !== null) {
        const expected = per100[key] * weight / 100;
        if (Math.abs(expected - primary[key]) > Math.max(0.05, Math.abs(primary[key]) * 0.015)) {
          issues.push(`${key}: unidad=${round(primary[key])} vs *100×peso=${round(expected)}`);
        }
      }
    }
  }
  const scale = ratios.find((ratio) => [0.01, 0.1, 10, 100].some((target) => Math.abs(ratio - target) / target < 0.03));
  return {
    issue: issues.join("; "),
    likelyScaleError: Boolean(scale && Math.abs(scale - 100) > 1),
  };
}

function indexMigrationReferences(firstPlan, secondPlan) {
  const map = new Map();
  const plans = [firstPlan, secondPlan];
  for (const plan of plans) {
    for (const entry of [...(plan.nutritionUpdates || []), ...(plan.unitNutritionUpdates || [])]) {
      map.set(Number(entry.id), {
        kcal: number(entry.kcal), protein: number(entry.protein), carbs: number(entry.carbs), fat: number(entry.fat),
        source: entry.source?.name || "", url: entry.source?.url || "", sourceFood: entry.sourceFood || entry.expected || "",
        origin: "valor explícito del plan de migración con fuente documentada",
      });
    }
    for (const entry of plan.additions || []) {
      map.set(Number(entry.alimentoId), {
        kcal: number(value(entry.kcal100, entry.kcal)),
        protein: number(value(entry.protein100, entry.protein)),
        carbs: number(value(entry.carbs100, entry.carbs)),
        fat: number(value(entry.fat100, entry.fat)),
        source: entry.source?.name || entry.reference?.source || "",
        url: entry.source?.url || entry.reference?.url || "",
        sourceFood: entry.sourceFood || entry.reference?.food || entry.name || "",
        origin: "valor explícito del alta planificada con fuente documentada",
      });
    }
  }
  return map;
}

function oldAuditReference(row) {
  if (!row) return null;
  if ([row.sara_kcal, row.sara_proteina, row.sara_carbohidratos, row.sara_grasas].every((item) => number(item) !== null)) {
    return {
      kcal: number(row.sara_kcal), protein: number(row.sara_proteina), carbs: number(row.sara_carbohidratos), fat: number(row.sara_grasas),
      source: "SARA 2 - Tabla de composición química de alimentos para Argentina", url: SARA_URL,
      sourceFood: row.sara_alimento, code: `SARA 2, página ${row.sara_pagina}`, carbConvention: "carbohidratos disponibles",
      origin: "extracción externa de SARA 2 realizada en la auditoría previa",
    };
  }
  if ([row.usda_kcal, row.usda_proteina, row.usda_carbohidratos, row.usda_grasas].every((item) => number(item) !== null)) {
    return {
      kcal: number(row.usda_kcal), protein: number(row.usda_proteina), carbs: number(row.usda_carbohidratos), fat: number(row.usda_grasas),
      source: row.usda_fuente || "USDA FoodData Central", url: row.usda_fdc_id ? `https://fdc.nal.usda.gov/food-details/${row.usda_fdc_id}/nutrients` : USDA_DOWNLOAD_URL,
      sourceFood: row.usda_alimento, code: row.usda_fdc_id ? `FDC ID ${row.usda_fdc_id}` : "", carbConvention: "carbohidratos totales",
      origin: "extracción externa de USDA realizada en la auditoría previa",
    };
  }
  return null;
}

function referenceFor(doc, planReferences, oldAuditById) {
  const id = Number(doc.alimentoId);
  const planned = planReferences.get(id);
  if (planned && [planned.kcal, planned.protein, planned.carbs, planned.fat].every((item) => item !== null)) {
    const persisted = doc.referenciaNutricional || {};
    return {
      ...planned,
      source: planned.source || persisted.source || "Fuente documentada por migración",
      url: planned.url || persisted.sourceUrl || "",
      sourceFood: planned.sourceFood || persisted.sourceFood || "",
      code: "",
      carbConvention: /SARA/i.test(planned.source || persisted.source || "") ? "carbohidratos disponibles" : (/USDA/i.test(planned.source || persisted.source || "") ? "carbohidratos totales" : "según rótulo/fuente"),
    };
  }
  const old = oldAuditReference(oldAuditById.get(id));
  if (old) return old;
  const persisted = doc.referenciaNutricional;
  const current = normalizedPer100(doc);
  if (persisted && [current.kcal, current.protein, current.carbs, current.fat].every((item) => item !== null)) {
    return {
      kcal: current.kcal, protein: current.protein, carbs: current.carbs, fat: current.fat,
      source: persisted.source || "", url: persisted.sourceUrl || "", sourceFood: persisted.sourceFood || "", code: "",
      carbConvention: /SARA/i.test(persisted.source || "") ? "carbohidratos disponibles" : (/USDA/i.test(persisted.source || "") ? "carbohidratos totales" : "según rótulo/fuente"),
      origin: "fuente persistida por migración; valor no reextraído independientemente en esta ejecución",
    };
  }
  return null;
}

function equivalence(doc, reference) {
  if (!reference) return "NO_COMPARABLE";
  const name = fold(`${foodName(doc)} ${doc.estado || ""}`);
  const plainName = fold(foodName(doc));
  const sourceName = fold(reference.sourceFood);
  const exactBrand = /rotulo|marca|la saltena|coca cola|quilmes|fernet|branca/i.test(`${reference.source} ${reference.sourceFood}`);
  const stateWords = ["crudo", "cocido", "hervido", "asado", "frito", "escurrido"];
  const stateMismatch = stateWords.some((word) => name.includes(word) !== sourceName.includes(word) && (name.includes(word) || sourceName.includes(word)));
  if (stateMismatch) return "APROXIMADA_ESTADO_DISTINTO";
  if (exactBrand || plainName === sourceName) return "EXACTA_O_MISMO_RÓTULO";
  return "APROXIMADA";
}

function severity(per100, ref, unitProblem, consistency) {
  if (consistency.likelyScaleError) return "CRÍTICO_ESCALA";
  if (unitProblem && !ref) return "UNIDAD_AMBIGUA";
  if (!ref) return "SIN_REFERENCIA_FIABLE";
  const differences = Object.fromEntries(["kcal", "protein", "carbs", "fat"].map((key) => [key, {
    absolute: per100[key] === null || ref[key] === null ? 0 : Math.abs(per100[key] - ref[key]),
    percent: Math.abs(delta(per100[key], ref[key]).percent ?? 0),
  }]));
  if (
    differences.kcal.absolute >= 150 || differences.protein.absolute >= 30 ||
    differences.carbs.absolute >= 40 || differences.fat.absolute >= 30
  ) return "CRÍTICO";
  if (
    (differences.kcal.absolute >= 50 && differences.kcal.percent >= 30) ||
    (differences.protein.absolute >= 10 && differences.protein.percent >= 30) ||
    (differences.carbs.absolute >= 20 && differences.carbs.percent >= 30) ||
    (differences.fat.absolute >= 8 && differences.fat.percent >= 30)
  ) return "ALTO";
  if (
    (differences.kcal.absolute >= 25 && differences.kcal.percent >= 15) ||
    (differences.protein.absolute >= 2 && differences.protein.percent >= 15) ||
    (differences.carbs.absolute >= 5 && differences.carbs.percent >= 15) ||
    (differences.fat.absolute >= 2 && differences.fat.percent >= 15)
  ) return "MEDIO";
  return unitProblem ? "UNIDAD_AMBIGUA" : "OK";
}

function auditRow(doc, planReferences, oldAuditById) {
  const per100 = normalizedPer100(doc);
  const reference = referenceFor(doc, planReferences, oldAuditById);
  const unitProblem = unitIssue(doc, per100);
  const consistency = internalConsistency(doc, per100);
  const dKcal = delta(per100.kcal, reference?.kcal);
  const dProtein = delta(per100.protein, reference?.protein);
  const dCarbs = delta(per100.carbs, reference?.carbs);
  const dFat = delta(per100.fat, reference?.fat);
  const closureExpected = [per100.protein, per100.carbs, per100.fat].every((item) => item !== null)
    ? 4 * per100.protein + 4 * per100.carbs + 9 * per100.fat + 7 * (per100.alcohol || 0)
    : null;
  const closure = delta(per100.kcal, closureExpected);
  return {
    alimentoId: doc.alimentoId ?? "",
    _id: String(doc._id ?? ""),
    alimento: foodName(doc),
    categoria: value(doc.categoria, doc.Categoria, doc.categoriaZumaFit, "") || "",
    subcategoria: value(doc.subcategoria, doc.subcategoriaZumaFit, doc.Composicion2, "") || "",
    unidad: foodUnit(doc),
    peso_unidad_g: number(doc.pesoUnidadGramos),
    estado: value(doc.estado, "") || "",
    activo: doc.activo !== false,
    tipo_catalogo: generationType(doc),
    generacion_automatica: automaticGeneration(doc),
    base_db: per100.basis,
    db_kcal_100: round(per100.kcal), db_proteina_100: round(per100.protein), db_carbohidratos_100: round(per100.carbs), db_grasas_100: round(per100.fat),
    ref_kcal_100: round(reference?.kcal), ref_proteina_100: round(reference?.protein), ref_carbohidratos_100: round(reference?.carbs), ref_grasas_100: round(reference?.fat),
    dif_kcal_abs: dKcal.absolute, dif_kcal_pct: dKcal.percent,
    dif_proteina_abs: dProtein.absolute, dif_proteina_pct: dProtein.percent,
    dif_carbohidratos_abs: dCarbs.absolute, dif_carbohidratos_pct: dCarbs.percent,
    dif_grasas_abs: dFat.absolute, dif_grasas_pct: dFat.percent,
    fuente_referencia: reference?.source || "",
    alimento_referencia: reference?.sourceFood || "",
    codigo_pagina: reference?.code || "",
    enlace_verificable: reference?.url || "",
    convencion_carbohidratos: reference?.carbConvention || "",
    origen_validacion: reference?.origin || "sin referencia externa concreta",
    equivalencia: equivalence(doc, reference),
    problema_unidad: unitProblem,
    incoherencia_campos: consistency.issue,
    kcal_atwater_incluye_alcohol: round(closureExpected),
    diferencia_cierre_kcal_pct: closure.percent,
    severidad: severity(per100, reference, unitProblem, consistency),
    notas: value(doc.referenciaNutricional?.notes, doc.observaciones, doc.motivoRevision, "") || "",
  };
}

function catalogRow(doc) {
  const per100 = normalizedPer100(doc);
  const primary = primaryMacros(doc);
  const ref = doc.referenciaNutricional || {};
  return {
    alimentoId: doc.alimentoId ?? "", _id: String(doc._id ?? ""), alimento: foodName(doc),
    categoria: value(doc.categoria, doc.Categoria, doc.categoriaZumaFit, "") || "",
    subcategoria: value(doc.subcategoria, doc.subcategoriaZumaFit, doc.Composicion2, "") || "",
    unidad: foodUnit(doc), peso_unidad_g: number(doc.pesoUnidadGramos), cantidad_base: number(doc.Cantidad), macroBasis: doc.macroBasis || "",
    kcal_100: round(per100.kcal), proteina_100: round(per100.protein), carbohidratos_100: round(per100.carbs), grasas_100: round(per100.fat),
    kcal_unidad: round(primary.kcal), proteina_unidad: round(primary.protein), carbohidratos_unidad: round(primary.carbs), grasas_unidad: round(primary.fat),
    estado: doc.estado || "", tipo_catalogo: generationType(doc), activo: doc.activo !== false,
    participa_generacion_automatica: automaticGeneration(doc), generation_mode: doc.generation?.mode || "",
    fuente_nutricional: ref.source || "", alimento_referencia: ref.sourceFood || "", enlace_fuente: ref.sourceUrl || "",
    notas_nutricionales: value(ref.notes, doc.observaciones, doc.motivoRevision, "") || "", fecha_verificacion: ref.checkedAt || "",
  };
}

function nutritionSnapshot(doc) {
  if (!doc) return null;
  const per100 = normalizedPer100(doc);
  return {
    nombre: foodName(doc), unidad: foodUnit(doc), pesoUnidadGramos: number(doc.pesoUnidadGramos),
    kcal100: round(per100.kcal), proteina100: round(per100.protein), carbohidratos100: round(per100.carbs), grasas100: round(per100.fat),
    Calorias: number(doc.Calorias), Proteinas: number(doc.Proteinas), Carbohidratos: number(doc.Carbohidratos), Grasas: number(doc.Grasas),
    activo: doc.activo !== false, generationMode: doc.generation?.mode || "",
  };
}

function planReferenceForHistory(id, plan, current) {
  const entries = [...(plan.nutritionUpdates || []), ...(plan.unitNutritionUpdates || [])];
  const hit = entries.find((entry) => Number(entry.id) === Number(id));
  if (hit) return { source: hit.source?.name || "", sourceFood: hit.sourceFood || "", url: hit.source?.url || "" };
  const persisted = current?.referenciaNutricional || {};
  return { source: persisted.source || "", sourceFood: persisted.sourceFood || "", url: persisted.sourceUrl || "" };
}

function historicalRows(docs, firstSnapshot, firstPlan, secondSnapshot, secondAddendum, secondPlan) {
  const currentById = new Map(docs.filter((doc) => doc.alimentoId !== undefined).map((doc) => [Number(doc.alimentoId), doc]));
  const firstUpdates = firstSnapshot.updateTargets || [];
  const secondUpdates = [...(secondSnapshot.targets || []), ...(secondAddendum?.target ? [secondAddendum.target] : [])];
  const firstAdded = docs.filter((doc) => String(doc.migrationKey || "").startsWith("food-catalog-fixes-2026-10-26:"));
  const secondAdded = docs.filter((doc) => String(doc.migrationKey || "").startsWith("argentine-staples-2026-10-26:"));
  const firstAffected = new Set([...firstUpdates, ...firstAdded].map((doc) => Number(doc.alimentoId)));
  const secondAffected = new Set([...secondUpdates, ...secondAdded].map((doc) => Number(doc.alimentoId)));

  const make = (migration, action, before, planned, plan) => {
    const id = Number(value(before?.alimentoId, planned?.alimentoId));
    const current = currentById.get(id) || planned || null;
    const reference = planReferenceForHistory(id, plan, current);
    const touchedBoth = firstAffected.has(id) && secondAffected.has(id);
    let reason = action === "ALTA" ? "Incorporación faltante al catálogo" : "Ajuste nutricional, de unidad, estructura o política de generación según el plan";
    if (id === 542) reason = "Tira de asado: sustitución del valor extremadamente graso por el promedio SARA de cortes vacunos grasos; el cambio no demuestra que toda tira de asado tenga exactamente esa composición";
    return {
      migracion: migration, accion: action, alimentoId: id, alimento: foodName(current || before || planned),
      modificado_en_ambas_migraciones: touchedBoth,
      valor_anterior: before ? JSON.stringify(nutritionSnapshot(before)) : "NO DISPONIBLE: alta nueva",
      valor_actual_final: current ? JSON.stringify(nutritionSnapshot(current)) : "NO ENCONTRADO EN ESTADO ACTUAL",
      fuente_utilizada: reference.source, alimento_referencia: reference.sourceFood, enlace_fuente: reference.url,
      motivo: reason,
      nota_trazabilidad: action === "ALTA" ? "No existe valor anterior porque el documento fue incorporado por esta migración" : (touchedBoth ? "El valor actual puede incluir cambios posteriores de la segunda migración" : "Comparación contra snapshot anterior conservado"),
    };
  };

  return [
    ...firstUpdates.map((before) => make("1 - food-catalog-fixes-2026-10-26", "MODIFICACIÓN", before, null, firstPlan)),
    ...(firstPlan.additions || []).map((planned) => make("1 - food-catalog-fixes-2026-10-26", "ALTA", null, planned, firstPlan)),
    ...secondUpdates.map((before) => make("2 - argentine-staples-2026-10-26", "MODIFICACIÓN", before, null, secondPlan)),
    ...(secondPlan.additions || []).map((planned) => make("2 - argentine-staples-2026-10-26", "ALTA", null, planned, secondPlan)),
  ];
}

function reportMarkdown(docs, auditRows, historyRows, generatedAt) {
  const count = (predicate) => docs.filter(predicate).length;
  const countAudit = (predicate) => auditRows.filter(predicate).length;
  const severeOrder = { "CRÍTICO_ESCALA": 0, "CRÍTICO": 1, "ALTO": 2, "MEDIO": 3, "UNIDAD_AMBIGUA": 4, "SIN_REFERENCIA_FIABLE": 5, "OK": 6 };
  const discrepancies = auditRows
    .filter((row) => ["CRÍTICO_ESCALA", "CRÍTICO", "ALTO", "MEDIO", "UNIDAD_AMBIGUA"].includes(row.severidad))
    .sort((a, b) => (severeOrder[a.severidad] ?? 99) - (severeOrder[b.severidad] ?? 99) || String(a.alimento).localeCompare(String(b.alimento)));
  const top = discrepancies.slice(0, 80).map((row) => `| ${row.severidad} | ${row.alimentoId} | ${row.alimento.replace(/\|/g, "\\|")} | ${row.unidad} | ${row.equivalencia} | ${(row.problema_unidad || row.incoherencia_campos || `Δ kcal ${row.dif_kcal_pct ?? ""}%; P ${row.dif_proteina_pct ?? ""}%; C ${row.dif_carbohidratos_pct ?? ""}%; G ${row.dif_grasas_pct ?? ""}%`).replace(/\|/g, "\\|")} |`);
  const both = historyRows.filter((row) => row.modificado_en_ambas_migraciones);
  const verified = countAudit((row) => row.ref_kcal_100 !== null && row.ref_kcal_100 !== "" && row.ref_proteina_100 !== null && row.ref_carbohidratos_100 !== null && row.ref_grasas_100 !== null);
  const lackingReference = auditRows.length - verified;
  const storedFour = countAudit((row) => [row.db_kcal_100, row.db_proteina_100, row.db_carbohidratos_100, row.db_grasas_100].every((item) => item !== null && item !== ""));
  return `# Auditoría nutricional externa del catálogo ZumaFit

Fecha de corte: ${generatedAt}  
Base consultada en modo lectura: \`${config.BASE}.fooddatabase2\`

## Alcance y advertencia metodológica

Se exportaron los ${docs.length} documentos reales de MongoDB. Esta ejecución no realizó \`insertOne\`, \`updateOne\`, \`bulkWrite\`, \`delete\`, migraciones ni ninguna otra escritura en la base.

La auditoría contiene una fila para cada documento, pero una fila no equivale automáticamente a una validación. Se consideró referencia fiable únicamente cuando pudo asociarse un alimento concreto de SARA 2, USDA FoodData Central o un rótulo/ficha oficial documentada. Los productos comerciales sin rótulo verificable, recetas genéricas, registros de encabezado y unidades sin peso se marcaron como no comparables.

Los carbohidratos de SARA son carbohidratos disponibles; USDA normalmente informa carbohidratos totales. Por eso una diferencia de carbohidratos entre ambas tablas puede ser metodológica y no un error del catálogo. La comprobación 4P + 4C + 9G (+7 kcal/g de alcohol cuando existe) se usa solo como control interno, no como prueba de exactitud.

## Resumen cuantitativo

| Indicador | Cantidad |
|---|---:|
| Documentos totales | ${docs.length} |
| Activos | ${count((doc) => doc.activo !== false)} |
| Inactivos | ${count((doc) => doc.activo === false)} |
| Marcados GENERIC | ${count((doc) => doc.generation?.mode === "GENERIC")} |
| Marcados EXPLICIT_ONLY | ${count((doc) => doc.generation?.mode === "EXPLICIT_ONLY")} |
| Sin clasificación de generación | ${count((doc) => !doc.generation?.mode)} |
| Participan efectivamente en generación automática | ${count(automaticGeneration)} |
| Con los cuatro nutrientes convertibles a 100 g/ml | ${storedFour} |
| Con referencia externa concreta para los cuatro valores | ${verified} |
| Con diferencias relevantes (medio/alto/crítico) | ${countAudit((row) => ["MEDIO", "ALTO", "CRÍTICO", "CRÍTICO_ESCALA"].includes(row.severidad))} |
| Con unidad ambigua | ${countAudit((row) => Boolean(row.problema_unidad))} |
| Sin referencia externa fiable | ${lackingReference} |

"Comercial" no se deduce con certeza del nombre: \`EXPLICIT_ONLY\` incluye productos de marca y alimentos específicos que deliberadamente no deben entrar en menús automáticos. Por eso el CSV conserva tres estados: genérico, comercial/específico y sin clasificar.

## Riesgos funcionales principales

- El backend histórico guarda \`Calorias/Proteinas/Carbohidratos/Grasas\` por una unidad base de 1 g, 1 ml o 1 pieza. En varias rutas \`macroBasis: perUnit\` es intencional incluso para \`Grs\`, porque la aplicación multiplica el vector legacy por la cantidad pedida.
- Otras rutas de importación interpretan \`per100\` y dividen por 100 para gramos/ml. Mezclar documentos o payloads entre ambos contratos puede producir errores de ×100.
- Una unidad discreta sin \`pesoUnidadGramos\` puede ser válida para registrar una pieza si el rótulo es por pieza, pero no permite cotejar rigurosamente contra una tabla por 100 g.
- Enlatados deben especificar si la referencia es escurrida. Cuando el nombre o la fuente no lo aclaran, la equivalencia queda aproximada.
- Crudo, hervido, asado y frito no son intercambiables: el agua y la absorción/pérdida de grasa cambian la densidad nutricional.
- Los productos comerciales pueden reformularse. Para ellos prevalece el rótulo argentino vigente del envase exacto, no el promedio de una tabla genérica.

## Cambios históricos

El archivo \`CAMBIOS_HISTORICOS.csv\` contiene exactamente 41 modificaciones y 43 altas de la primera migración, y 100 modificaciones (99 del snapshot principal más el addendum del durazno) y 56 altas de la segunda: ${historyRows.length} filas en total. ${both.length} filas corresponden a alimentos alcanzados por ambas migraciones; el CSV lo identifica expresamente.

### Caso tira de asado

La tira de asado pasó de 475 kcal, 22 g de proteína y 43 g de grasa por 100 g a 210 kcal, 20 g de proteína y 14,4 g de grasa. El valor anterior no era aritméticamente imposible para una porción excepcionalmente grasa. La migración sustituyó esa representación por el promedio SARA de “vacuno, cortes grasos promedio, crudo”. Por lo tanto, se trata de una normalización a un promedio genérico, no de una demostración de que cualquier tira de asado argentina contenga exactamente 210 kcal.

## Discrepancias y unidades, ordenadas por gravedad

La tabla siguiente muestra las primeras 80. La tabla completa, sin recortes, está en \`AUDITORIA_NUTRICIONAL_COMPLETA.csv\`.

| Gravedad | ID | Alimento | Unidad | Equivalencia | Hallazgo |
|---|---:|---|---|---|---|
${top.join("\n") || "| — | — | Sin hallazgos | — | — | — |"}

## Por qué no se cambiaron alimentos

No se cambió ninguno porque la consigna fue exclusivamente de lectura. Además, no sería responsable corregir automáticamente:

- productos comerciales sin foto o rótulo argentino vigente;
- unidades como feta, pote, barra, porción o pieza sin peso neto/comestible;
- recetas variables como empanadas, milanesas, ensaladas y preparaciones caseras;
- cortes de carne cuyo nivel de grasa visible o estado de cocción no coincide exactamente con la referencia;
- diferencias explicables por carbohidratos disponibles versus totales, fibra, alcohol, redondeo reglamentario o rendimiento de cocción.

## Fuentes utilizadas

- [SARA 2 – Tabla de composición química de alimentos para Argentina](${SARA_URL}).
- [ARGENFOODS en el directorio FAO/INFOODS](${ARGENFOODS_URL}).
- [USDA FoodData Central – descargas y documentación](${USDA_DOWNLOAD_URL}). Los FDC ID concretos están en el CSV cuando estaban disponibles.
- [ANMAT – rotulado nutricional de alimentos envasados](${ANMAT_LABEL_URL}).
- Fichas oficiales de fabricante documentadas en \`referenciaNutricional.sourceUrl\` para productos comerciales.

## Archivos para revisión independiente

- \`CATALOGO_COMPLETO_673.csv\`: vista normalizada de los ${docs.length} documentos.
- \`CATALOGO_COMPLETO_RAW.json\`: documentos completos, sin credenciales.
- \`AUDITORIA_NUTRICIONAL_COMPLETA.csv\`: comparación por alimento y estado de comparabilidad.
- \`CAMBIOS_HISTORICOS.csv\`: trazabilidad de ambas migraciones.
- \`documentacion/INTERPRETACION_BACKEND.md\`: explicación de cómo las rutas del backend escalan macros.
- \`informes_anteriores/\`: evidencia previa, snapshots y reportes originales.
- \`migraciones/\`: scripts exactos usados anteriormente; se incluyen solo para inspección, no fueron ejecutados por esta exportación.
`;
}

function interpretationMarkdown() {
  return `# Interpretación de cantidades y macros en el backend

## Contrato persistido

En \`fooddatabase2\`, los campos legacy \`Calorias\`, \`Proteinas\`, \`Carbohidratos\` y \`Grasas\` suelen representar el aporte por una unidad base: 1 g, 1 ml o 1 unidad discreta. Los campos \`kcal100\`, \`proteina100\`, \`carbohidratos100\` y \`grasas100\` son la vista normalizada por 100 g/ml cuando existen.

## Rutas relevantes

- \`servicio/alimentos.js\`: el optimizador normaliza unidades de masa como \`perGram\` y multiplica el vector por la cantidad.
- \`servicio/foodLogs.js\`: respeta \`macroBasis\`; con \`per100\` divide la cantidad de g/ml por 100, y con \`perUnit\` multiplica directamente.
- \`servicio/comidasGuardadas.js\`: tiene heurísticas legacy para distinguir vectores por gramo de valores por 100 g.
- \`servicio/comidasGuardadasExcelImport.js\`: escala por 100 cuando el alimento importado declara \`per100\` y usa g/ml.

La coexistencia de estos contratos explica por qué no debe asumirse que \`macroBasis: perUnit\` significa siempre “una fruta” o “una feta”: en documentos históricos también significa una unidad base de 1 gramo o 1 mililitro. Los CSV exportan ambos juegos de campos y explicitan la base calculada.

## Reproducción segura

El script \`exportExternalNutritionAudit20261026.mjs\` solo usa \`find({}).sort(...).toArray()\` sobre MongoDB. No contiene llamadas de escritura. La creación de CSV, JSON, Markdown y ZIP ocurre en el sistema de archivos local.
`;
}

function copyEvidence() {
  const previousDir = path.join(outputDir, "informes_anteriores");
  const migrationsDir = path.join(outputDir, "migraciones");
  const documentationDir = path.join(outputDir, "documentacion");
  fs.mkdirSync(previousDir, { recursive: true });
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.mkdirSync(documentationDir, { recursive: true });
  for (const source of [paths.firstDir, paths.secondDir, paths.auditBefore, paths.auditPostFirst]) {
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(previousDir, path.basename(source)), { recursive: true });
  }
  for (const name of ["fixAndExpandFoodCatalog20261026.mjs", "expandArgentineStaples20261026.mjs", "auditGenericFoodNutrition.mjs", "querySaraNutrition.mjs", "exportExternalNutritionAudit20261026.mjs"]) {
    const source = path.join(here, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(migrationsDir, name));
  }
  for (const relative of ["servicio/alimentos.js", "servicio/foodLogs.js", "servicio/comidasGuardadas.js", "servicio/comidasGuardadasExcelImport.js"]) {
    const source = path.join(backendRoot, relative);
    fs.copyFileSync(source, path.join(documentationDir, path.basename(source)));
  }
  fs.writeFileSync(path.join(documentationDir, "INTERPRETACION_BACKEND.md"), interpretationMarkdown(), "utf8");
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const firstSnapshot = readJson(path.join(paths.firstDir, "snapshot-before.json"));
  const firstPlan = readJson(path.join(paths.firstDir, "migration-plan.json"));
  const secondSnapshot = readJson(path.join(paths.secondDir, "snapshot-before.json"));
  const secondAddendum = readJson(path.join(paths.secondDir, "snapshot-before-addendum-durazno.json"));
  const secondPlan = readJson(path.join(paths.secondDir, "migration-plan.json"));
  const oldAudit = readJson(path.join(paths.auditPostFirst, "comparacion-completa.json"));
  const oldAuditById = new Map(oldAudit.rows.map((row) => [Number(row.alimentoId), row]));
  const planReferences = indexMigrationReferences(firstPlan, secondPlan);

  const client = new MongoClient(config.STRCNX, { readPreference: "secondaryPreferred" });
  let docs;
  try {
    await client.connect();
    docs = await client.db(config.BASE).collection("fooddatabase2").find({}).sort({ alimentoId: 1, _id: 1 }).toArray();
  } finally {
    await client.close();
  }
  if (docs.length !== 673) throw new Error(`Se esperaban 673 documentos y MongoDB devolvió ${docs.length}; no se generó una entrega con conteo engañoso.`);

  const generatedAt = new Date().toISOString();
  const catalogRows = docs.map(catalogRow);
  const auditRows = docs.map((doc) => auditRow(doc, planReferences, oldAuditById));
  const rank = { "CRÍTICO_ESCALA": 0, "CRÍTICO": 1, "ALTO": 2, "MEDIO": 3, "UNIDAD_AMBIGUA": 4, "SIN_REFERENCIA_FIABLE": 5, "OK": 6 };
  auditRows.sort((a, b) => (rank[a.severidad] ?? 99) - (rank[b.severidad] ?? 99) || String(a.alimento).localeCompare(String(b.alimento)));
  const historyRows = historicalRows(docs, firstSnapshot, firstPlan, secondSnapshot, secondAddendum, secondPlan);

  const catalogColumns = [
    ["alimentoId", "alimentoId"], ["_id", "_id"], ["alimento", "Nombre exacto"], ["categoria", "Categoría"], ["subcategoria", "Subcategoría"],
    ["unidad", "Unidad"], ["peso_unidad_g", "Peso por unidad (g)"], ["cantidad_base", "Cantidad base"], ["macroBasis", "macroBasis persistido"],
    ["kcal_100", "Calorías por 100 g/ml"], ["proteina_100", "Proteínas por 100 g/ml"], ["carbohidratos_100", "Carbohidratos por 100 g/ml"], ["grasas_100", "Grasas por 100 g/ml"],
    ["kcal_unidad", "Calorías por unidad base"], ["proteina_unidad", "Proteínas por unidad base"], ["carbohidratos_unidad", "Carbohidratos por unidad base"], ["grasas_unidad", "Grasas por unidad base"],
    ["estado", "Estado/preparación"], ["tipo_catalogo", "Genérico o marca/específico"], ["activo", "Activo"], ["participa_generacion_automatica", "Participa en generación automática"], ["generation_mode", "Modo de generación"],
    ["fuente_nutricional", "Fuente nutricional"], ["alimento_referencia", "Alimento exacto de referencia"], ["enlace_fuente", "Enlace"], ["notas_nutricionales", "Notas nutricionales"], ["fecha_verificacion", "Fecha de verificación"],
  ];
  const auditColumns = Object.keys(auditRows[0]).map((key) => [key, key]);
  const historyColumns = Object.keys(historyRows[0]).map((key) => [key, key]);

  writeCsv(path.join(outputDir, "CATALOGO_COMPLETO_673.csv"), catalogRows, catalogColumns);
  fs.writeFileSync(path.join(outputDir, "CATALOGO_COMPLETO_RAW.json"), JSON.stringify(docs, null, 2), "utf8");
  writeCsv(path.join(outputDir, "AUDITORIA_NUTRICIONAL_COMPLETA.csv"), auditRows, auditColumns);
  writeCsv(path.join(outputDir, "CAMBIOS_HISTORICOS.csv"), historyRows, historyColumns);
  fs.writeFileSync(path.join(outputDir, "INFORME_FINAL_PARA_CHATGPT.md"), reportMarkdown(docs, auditRows, historyRows, generatedAt), "utf8");
  copyEvidence();

  const summary = {
    generatedAt, database: config.BASE, collection: "fooddatabase2", total: docs.length,
    active: docs.filter((doc) => doc.activo !== false).length,
    inactive: docs.filter((doc) => doc.activo === false).length,
    generic: docs.filter((doc) => doc.generation?.mode === "GENERIC").length,
    explicitOnly: docs.filter((doc) => doc.generation?.mode === "EXPLICIT_ONLY").length,
    unclassified: docs.filter((doc) => !doc.generation?.mode).length,
    automatic: docs.filter(automaticGeneration).length,
    withExternalReferenceFourMacros: auditRows.filter((row) => row.ref_kcal_100 !== null && row.ref_kcal_100 !== "" && row.ref_proteina_100 !== null && row.ref_carbohidratos_100 !== null && row.ref_grasas_100 !== null).length,
    withoutExternalReferenceFourMacros: auditRows.filter((row) => !(row.ref_kcal_100 !== null && row.ref_kcal_100 !== "" && row.ref_proteina_100 !== null && row.ref_carbohidratos_100 !== null && row.ref_grasas_100 !== null)).length,
    auditSeverity: Object.fromEntries([...new Set(auditRows.map((row) => row.severidad))].map((level) => [level, auditRows.filter((row) => row.severidad === level).length])),
    historyRows: historyRows.length,
    historyByMigration: Object.fromEntries([...new Set(historyRows.map((row) => row.migracion))].map((migration) => [migration, historyRows.filter((row) => row.migracion === migration).length])),
    touchedByBothRows: historyRows.filter((row) => row.modificado_en_ambas_migraciones).length,
    mongoOperations: ["find"],
  };
  fs.writeFileSync(path.join(outputDir, "RESUMEN_TECNICO.json"), JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
