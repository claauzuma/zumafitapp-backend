const GENERATION_MODES = Object.freeze(["EXPLICIT_ONLY", "GENERIC", "DISABLED"]);
const GENERATION_ROLES = Object.freeze(["P1", "P2", "C1", "C2", "V", "F", "G"]);
const GENERATION_MEAL_TYPES = Object.freeze(["breakfast", "lunch", "snack", "dinner", "extraSnack"]);
const GENERATION_PORTION_UNITS = Object.freeze(["g", "unidad", "ml", "porcion"]);

export {
  GENERATION_MEAL_TYPES,
  GENERATION_MODES,
  GENERATION_PORTION_UNITS,
  GENERATION_ROLES,
};

function validationError(message, field = "generation") {
  const error = new Error(message);
  error.code = "INVALID_GENERATION";
  error.field = field;
  return error;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${field} debe ser un objeto.`, field);
  }
}

function assertKnownKeys(value, allowed, field) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw validationError(`${field} contiene campos no permitidos: ${unknown.join(", ")}.`, field);
  }
}

function emptyFlags(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

export function defaultFoodGeneration() {
  return {
    mode: "EXPLICIT_ONLY",
    roles: emptyFlags(GENERATION_ROLES),
    mealTypes: emptyFlags(GENERATION_MEAL_TYPES),
    portionRule: {
      unit: null,
      min: null,
      max: null,
      step: null,
      allowedValues: [],
    },
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeFoodGenerationForRead(value) {
  const defaults = defaultFoodGeneration();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;

  const mode = GENERATION_MODES.includes(value.mode) ? value.mode : defaults.mode;
  const roles = { ...defaults.roles };
  const mealTypes = { ...defaults.mealTypes };
  GENERATION_ROLES.forEach((key) => { roles[key] = value.roles?.[key] === true; });
  GENERATION_MEAL_TYPES.forEach((key) => { mealTypes[key] = value.mealTypes?.[key] === true; });

  const unit = GENERATION_PORTION_UNITS.includes(value.portionRule?.unit)
    ? value.portionRule.unit
    : null;
  const min = finiteOrNull(value.portionRule?.min);
  const max = finiteOrNull(value.portionRule?.max);
  const step = finiteOrNull(value.portionRule?.step);
  const allowedValues = Array.isArray(value.portionRule?.allowedValues)
    ? [...new Set(value.portionRule.allowedValues.map(Number).filter((item) => Number.isFinite(item) && item > 0))]
        .sort((left, right) => left - right)
    : [];

  return {
    mode,
    roles,
    mealTypes,
    portionRule: {
      unit,
      min: min !== null && min >= 0 ? min : null,
      max: max !== null && max >= 0 ? max : null,
      step: step !== null && step > 0 ? step : null,
      allowedValues,
    },
  };
}

function validateFlagsPatch(value, allowedKeys, field) {
  assertPlainObject(value, field);
  assertKnownKeys(value, allowedKeys, field);
  Object.entries(value).forEach(([key, enabled]) => {
    if (typeof enabled !== "boolean") {
      throw validationError(`${field}.${key} debe ser booleano.`, `${field}.${key}`);
    }
  });
}

function validateNullableNumber(value, field, { positive = false } = {}) {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw validationError(`${field} debe ser un número o null.`, field);
  }
  if (positive ? value <= 0 : value < 0) {
    throw validationError(`${field} ${positive ? "debe ser mayor a 0" : "no puede ser negativo"}.`, field);
  }
  return value;
}

function validatePortionRulePatch(value) {
  const field = "generation.portionRule";
  assertPlainObject(value, field);
  assertKnownKeys(value, ["unit", "min", "max", "step", "allowedValues"], field);

  const result = {};
  if (own(value, "unit")) {
    if (value.unit !== null && !GENERATION_PORTION_UNITS.includes(value.unit)) {
      throw validationError(`${field}.unit no es una unidad permitida.`, `${field}.unit`);
    }
    result.unit = value.unit;
  }
  if (own(value, "min")) result.min = validateNullableNumber(value.min, `${field}.min`);
  if (own(value, "max")) result.max = validateNullableNumber(value.max, `${field}.max`);
  if (own(value, "step")) result.step = validateNullableNumber(value.step, `${field}.step`, { positive: true });
  if (own(value, "allowedValues")) {
    if (!Array.isArray(value.allowedValues)) {
      throw validationError(`${field}.allowedValues debe ser un array.`, `${field}.allowedValues`);
    }
    const parsed = value.allowedValues.map((item) => {
      if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) {
        throw validationError(`${field}.allowedValues sólo admite números positivos.`, `${field}.allowedValues`);
      }
      return item;
    });
    result.allowedValues = [...new Set(parsed)].sort((left, right) => left - right);
  }
  return result;
}

export function validateFoodGenerationPatch(patch, currentValue = null) {
  assertPlainObject(patch, "generation");
  assertKnownKeys(patch, ["mode", "roles", "mealTypes", "portionRule"], "generation");
  const current = normalizeFoodGenerationForRead(currentValue);
  const next = {
    ...current,
    roles: { ...current.roles },
    mealTypes: { ...current.mealTypes },
    portionRule: { ...current.portionRule, allowedValues: [...current.portionRule.allowedValues] },
  };

  if (own(patch, "mode")) {
    if (!GENERATION_MODES.includes(patch.mode)) {
      throw validationError("generation.mode no es válido.", "generation.mode");
    }
    next.mode = patch.mode;
  }
  if (own(patch, "roles")) {
    validateFlagsPatch(patch.roles, GENERATION_ROLES, "generation.roles");
    Object.assign(next.roles, patch.roles);
  }
  if (own(patch, "mealTypes")) {
    validateFlagsPatch(patch.mealTypes, GENERATION_MEAL_TYPES, "generation.mealTypes");
    Object.assign(next.mealTypes, patch.mealTypes);
  }
  if (own(patch, "portionRule")) {
    Object.assign(next.portionRule, validatePortionRulePatch(patch.portionRule));
  }

  if (next.portionRule.min !== null && next.portionRule.max !== null && next.portionRule.min > next.portionRule.max) {
    throw validationError("generation.portionRule.min no puede superar max.", "generation.portionRule");
  }
  if (next.mode === "GENERIC") {
    if (!Object.values(next.roles).some(Boolean)) {
      throw validationError("Un alimento GENERIC necesita al menos un rol.", "generation.roles");
    }
    if (!Object.values(next.mealTypes).some(Boolean)) {
      throw validationError("Un alimento GENERIC necesita al menos un momento.", "generation.mealTypes");
    }
  }
  return next;
}

function normalizedRequestedRoles(roles = []) {
  if (!Array.isArray(roles)) throw validationError("roles debe ser un array.", "roles");
  const unique = [...new Set(roles)];
  const invalid = unique.filter((role) => !GENERATION_ROLES.includes(role));
  if (invalid.length) throw validationError(`Roles no permitidos: ${invalid.join(", ")}.`, "roles");
  return unique;
}

export async function getAutomaticGenerationFoods({ mealType, roles = [] } = {}, { model } = {}) {
  if (!GENERATION_MEAL_TYPES.includes(mealType)) {
    throw validationError("mealType no es válido.", "mealType");
  }
  const requestedRoles = normalizedRequestedRoles(roles);
  if (!requestedRoles.length) return [];
  if (!model || typeof model.obtenerAlimentosGeneracionAutomatica !== "function") {
    throw new Error("Falta el modelo de alimentos para consultar el pool automático.");
  }

  const candidates = await model.obtenerAlimentosGeneracionAutomatica({ mealType, roles: requestedRoles });
  return (Array.isArray(candidates) ? candidates : []).filter((food) => {
    if (food?.activo === false) return false;
    const generation = normalizeFoodGenerationForRead(food?.generation);
    return generation.mode === "GENERIC" &&
      generation.mealTypes[mealType] === true &&
      requestedRoles.some((role) => generation.roles[role] === true);
  });
}
