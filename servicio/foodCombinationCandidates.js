import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import getAutomaticGenerationFoods from "./automaticGenerationFoods.js";
import {
  GENERATION_MEAL_TYPES,
  GENERATION_ROLES,
  normalizeFoodGenerationForRead,
} from "./foodGenerationMetadata.js";

export const FOOD_COMBINATION_MODES = Object.freeze({
  ONLY_SELECTED_FOODS: "ONLY_SELECTED_FOODS",
  ALLOW_SUGGESTIONS: "ALLOW_SUGGESTIONS",
});

export const CORE_COMBINATION_ROLES = Object.freeze(["P1", "C1"]);
export const OPTIONAL_COMBINATION_ROLES = Object.freeze(["P2", "C2", "V", "F", "G"]);
const ROLE_ORDER = Object.freeze([...CORE_COMBINATION_ROLES, ...OPTIONAL_COMBINATION_ROLES]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_POOL_LIMIT_PER_ROLE = 12;

function combinationError(message, field = "combination") {
  const error = new Error(message);
  error.code = "INVALID_FOOD_COMBINATION";
  error.field = field;
  return error;
}

function cleanId(value) {
  return String(value ?? "").trim();
}

function uniqueIds(values, field) {
  if (!Array.isArray(values)) throw combinationError(`${field} debe ser un array.`, field);
  const cleaned = values.map(cleanId);
  if (cleaned.some((id) => !id)) throw combinationError(`${field} contiene un ID vacio.`, field);
  return [...new Set(cleaned)];
}

function safeLimit(value, fallback, max = MAX_LIMIT) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function foodPrimaryId(food) {
  return cleanId(food?._id ?? food?.id ?? food?.alimentoId);
}

function foodAliases(food) {
  return new Set([food?._id, food?.id, food?.alimentoId].map(cleanId).filter(Boolean));
}

function stableFoodSort(left, right) {
  const leftId = foodPrimaryId(left);
  const rightId = foodPrimaryId(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function assignmentKey(assignments) {
  return Object.entries(assignments).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([id, role]) => `${id}:${role}`).join("|");
}

function candidateKey(candidate) {
  return `${[...candidate.foodIds].sort().join("|")}::${assignmentKey(candidate.roleAssignments)}`;
}

export function generateCombinationStructures() {
  return Array.from({ length: 2 ** OPTIONAL_COMBINATION_ROLES.length }, (_, mask) => {
    const optional = OPTIONAL_COMBINATION_ROLES.filter((_, index) => (mask & (1 << index)) !== 0);
    return [...CORE_COMBINATION_ROLES, ...optional];
  }).sort((left, right) => left.length - right.length ||
    left.map((role) => ROLE_ORDER.indexOf(role)).join("").localeCompare(right.map((role) => ROLE_ORDER.indexOf(role)).join("")));
}

export const FOOD_COMBINATION_STRUCTURES = Object.freeze(
  generateCombinationStructures().map((roles) => Object.freeze(roles))
);

function normalizePreferredCombinations(value = []) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw combinationError("preferredCombinations debe ser un array.", "preferredCombinations");
  return value.map((entry) => Array.isArray(entry) ? entry : entry?.foodIds)
    .filter(Array.isArray)
    .map((ids) => [...new Set(ids.map(cleanId).filter(Boolean))].sort());
}

function preferredMatch(foodIds, preferred) {
  const signature = [...foodIds].sort().join("|");
  return preferred.some((ids) => ids.join("|") === signature);
}

async function loadRequiredFoods(requiredIds, model) {
  if (!requiredIds.length) return [];
  let foods;
  if (typeof model?.obtenerAlimentosPorIds === "function") {
    foods = await model.obtenerAlimentosPorIds(requiredIds);
  } else if (typeof model?.obtenerAlimentoPorId === "function") {
    foods = await Promise.all(requiredIds.map((id) => model.obtenerAlimentoPorId(id)));
  } else {
    throw new Error("Falta el modelo para resolver requiredFoodIds.");
  }
  const documents = (Array.isArray(foods) ? foods : []).filter(Boolean);
  return requiredIds.map((requestedId) => {
    const food = documents.find((candidate) => foodAliases(candidate).has(requestedId));
    if (!food) throw combinationError(`No existe el alimento requerido ${requestedId}.`, "requiredFoodIds");
    return food;
  });
}

function eligibleRoles(food, structure, mealType, { suggestion = false } = {}) {
  if (food?.activo === false) return [];
  const generation = normalizeFoodGenerationForRead(food?.generation);
  if (generation.mode === "DISABLED") return [];
  if (suggestion && generation.mode !== "GENERIC") return [];
  if (generation.mealTypes[mealType] !== true) return [];
  return structure.filter((role) => generation.roles[role] === true);
}

function assignRequiredFoods(requiredFoods, structure, mealType, beamWidth) {
  let states = [{ assignments: {}, usedRoles: new Set() }];
  const ordered = [...requiredFoods].sort((left, right) => {
    const difference = eligibleRoles(left, structure, mealType).length - eligibleRoles(right, structure, mealType).length;
    return difference || stableFoodSort(left, right);
  });

  for (const food of ordered) {
    const id = foodPrimaryId(food);
    const roles = eligibleRoles(food, structure, mealType);
    if (!roles.length) return [];
    const next = [];
    for (const state of states) {
      for (const role of roles) {
        if (state.usedRoles.has(role)) continue;
        next.push({
          assignments: { ...state.assignments, [id]: role },
          usedRoles: new Set([...state.usedRoles, role]),
        });
        if (next.length >= beamWidth) break;
      }
      if (next.length >= beamWidth) break;
    }
    states = next;
    if (!states.length) break;
  }
  return states;
}

function buildRolePools(suggestionFoods, structure, mealType, excluded, requiredAliases, preferredIds, poolLimit) {
  return Object.fromEntries(structure.map((role) => {
    const pool = suggestionFoods.filter((food) => {
      const aliases = foodAliases(food);
      if ([...aliases].some((id) => excluded.has(id) || requiredAliases.has(id))) return false;
      return eligibleRoles(food, [role], mealType, { suggestion: true }).includes(role);
    }).sort((left, right) => {
      const leftPreferred = [...foodAliases(left)].some((id) => preferredIds.has(id));
      const rightPreferred = [...foodAliases(right)].some((id) => preferredIds.has(id));
      return Number(rightPreferred) - Number(leftPreferred) || stableFoodSort(left, right);
    }).slice(0, poolLimit);
    return [role, pool];
  }));
}

function fillSuggestionSlots(requiredState, structure, pools, requiredFoods, beamWidth) {
  let states = [{ assignments: requiredState.assignments, usedIds: new Set(requiredFoods.map(foodPrimaryId)) }];
  const missingRoles = structure.filter((role) => !requiredState.usedRoles.has(role));
  for (const role of missingRoles) {
    const next = [];
    for (const state of states) {
      for (const food of pools[role] || []) {
        const id = foodPrimaryId(food);
        if (!id || state.usedIds.has(id)) continue;
        next.push({
          assignments: { ...state.assignments, [id]: role },
          usedIds: new Set([...state.usedIds, id]),
        });
        if (next.length >= beamWidth) break;
      }
      if (next.length >= beamWidth) break;
    }
    states = next;
    if (!states.length) break;
  }
  return states;
}

function toCandidate(assignments, structure, requiredCount, preferred) {
  const foodIds = Object.keys(assignments).sort();
  const match = preferredMatch(foodIds, preferred);
  const optionalCount = structure.length - CORE_COMBINATION_ROLES.length;
  const reasons = requiredCount > 0 ? ["required_foods_satisfied"] : ["generic_pool_structure"];
  if (optionalCount === 0) reasons.push("simple_structure");
  if (match) reasons.push("preferred_combination_match");
  return {
    foodIds,
    roleAssignments: assignments,
    structure: structure.join("+"),
    score: 1000 + requiredCount * 5 + (match ? 1 : 0) - optionalCount * 10 - foodIds.length,
    reasons,
    preferredCombinationMatch: match,
  };
}

function sortCandidates(left, right) {
  return right.score - left.score ||
    left.foodIds.length - right.foodIds.length ||
    left.structure.localeCompare(right.structure) ||
    (candidateKey(left) < candidateKey(right) ? -1 : candidateKey(left) > candidateKey(right) ? 1 : 0);
}

export async function generateFoodCombinationCandidates(input = {}, dependencies = {}) {
  const mealType = String(input.mealType || "").trim();
  if (!GENERATION_MEAL_TYPES.includes(mealType)) throw combinationError("mealType no es valido.", "mealType");
  const mode = String(input.mode || "").trim();
  if (!Object.values(FOOD_COMBINATION_MODES).includes(mode)) throw combinationError("mode no es valido.", "mode");
  const requiredIds = uniqueIds(input.requiredFoodIds || [], "requiredFoodIds");
  const excludedIds = uniqueIds(input.excludedFoodIds || [], "excludedFoodIds");
  if (mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS && !requiredIds.length) {
    throw combinationError("ONLY_SELECTED_FOODS necesita al menos un requiredFoodId.", "requiredFoodIds");
  }
  const excluded = new Set(excludedIds);
  const conflict = requiredIds.find((id) => excluded.has(id));
  if (conflict) throw combinationError(`El alimento ${conflict} no puede ser requerido y excluido a la vez.`, "excludedFoodIds");

  const limit = safeLimit(input.limit, DEFAULT_LIMIT);
  const poolLimit = safeLimit(dependencies.poolLimitPerRole, DEFAULT_POOL_LIMIT_PER_ROLE, 50);
  const beamWidth = Math.max(16, Math.min(96, limit * 2));
  const preferred = normalizePreferredCombinations(input.preferredCombinations);
  const preferredIds = new Set(preferred.flat());
  const model = dependencies.model || new ModelMongoDBAlimentos();
  const requiredFoods = await loadRequiredFoods(requiredIds, model);
  const disabledRequired = requiredFoods.find((food) => normalizeFoodGenerationForRead(food?.generation).mode === "DISABLED");
  if (disabledRequired) throw combinationError(`El alimento requerido ${foodPrimaryId(disabledRequired)} esta DISABLED.`, "requiredFoodIds");
  const inactiveRequired = requiredFoods.find((food) => food?.activo === false);
  if (inactiveRequired) throw combinationError(`El alimento requerido ${foodPrimaryId(inactiveRequired)} esta inactivo.`, "requiredFoodIds");
  const requiredAliases = new Set(requiredFoods.flatMap((food) => [...foodAliases(food)]));
  if ([...requiredAliases].some((id) => excluded.has(id))) {
    throw combinationError("Un alimento requerido tambien figura como excluido.", "excludedFoodIds");
  }

  let suggestionFoods = [];
  if (mode === FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS) {
    const provider = dependencies.getAutomaticGenerationFoods || getAutomaticGenerationFoods;
    suggestionFoods = await provider({ mealType, roles: [...GENERATION_ROLES] }, { model });
    suggestionFoods = (Array.isArray(suggestionFoods) ? suggestionFoods : []).filter((food) => {
      const aliases = foodAliases(food);
      return foodPrimaryId(food) && ![...aliases].some((id) => excluded.has(id));
    });
  }

  const structures = FOOD_COMBINATION_STRUCTURES;
  const deduplicated = new Map();
  for (const structure of structures) {
    if (mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS && structure.length !== requiredFoods.length) continue;
    const requiredStates = assignRequiredFoods(requiredFoods, structure, mealType, beamWidth);
    if (!requiredStates.length) continue;
    if (mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS) {
      for (const state of requiredStates) {
        if (state.usedRoles.size !== structure.length) continue;
        const candidate = toCandidate(state.assignments, structure, requiredFoods.length, preferred);
        deduplicated.set(candidateKey(candidate), candidate);
      }
      continue;
    }

    const pools = buildRolePools(suggestionFoods, structure, mealType, excluded, requiredAliases, preferredIds, poolLimit);
    for (const state of requiredStates) {
      const filled = fillSuggestionSlots(state, structure, pools, requiredFoods, beamWidth);
      for (const result of filled) {
        const candidate = toCandidate(result.assignments, structure, requiredFoods.length, preferred);
        const key = candidateKey(candidate);
        const existing = deduplicated.get(key);
        if (!existing || sortCandidates(candidate, existing) < 0) deduplicated.set(key, candidate);
      }
    }
  }

  const candidates = [...deduplicated.values()].sort(sortCandidates).slice(0, limit);
  return {
    candidates,
    meta: {
      mealType,
      mode,
      candidateCount: candidates.length,
      structuresEvaluated: structures.length,
    },
  };
}

export default generateFoodCombinationCandidates;
