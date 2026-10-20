const UNRESTRICTED_WEEKLY_MODE = "unrestricted";

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addIsoDays(value, amount) {
  const date = parseIsoDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return isoDate(date);
}

function mondayOfIsoWeek(value) {
  const date = parseIsoDate(value);
  if (!date) return "";
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return isoDate(date);
}

function objectiveShape(target = {}) {
  return {
    kcal: round(Math.max(0, Number(target.kcal) || 0)),
    proteina: round(Math.max(0, Number(target.proteina ?? target.p) || 0)),
    carbs: round(Math.max(0, Number(target.carbs ?? target.c) || 0)),
    grasas: round(Math.max(0, Number(target.grasas ?? target.g) || 0)),
  };
}

function targetShape(objective = {}) {
  return {
    kcal: objective.kcal,
    p: objective.proteina,
    c: objective.carbs,
    g: objective.grasas,
  };
}

function macroEnergyAdjustedTarget(base, kcal, protein) {
  const safeKcal = Math.max(0, kcal);
  const safeProtein = Math.max(0, protein);
  const availableAfterProtein = safeKcal - safeProtein * 4;
  const fat = availableAfterProtein <= 0
    ? 0
    : Math.min(base.grasas, availableAfterProtein / 9);
  const carbs = Math.max(0, (availableAfterProtein - fat * 9) / 4);
  return {
    kcal: round(safeKcal),
    proteina: round(safeProtein),
    carbs: round(carbs),
    grasas: round(fat),
  };
}

/**
 * Calculates the target for one date from completed, explicitly tracked days.
 * Calories carry through the current Monday-Sunday week. Protein remains a
 * daily target and never creates debt or credit for later dates.
 */
function resolveUnrestrictedTarget({
  date,
  baseTarget,
  baseTargetByDate = {},
  consumptionByDate = {},
  closedBeforeDate = date,
} = {}) {
  const weekStart = mondayOfIsoWeek(date);
  const weekEnd = addIsoDays(weekStart, 6);
  const base = objectiveShape(baseTarget);
  if (!weekStart || !date) {
    return { objective: base, target: targetShape(base), balance: null };
  }

  let calorieCarry = 0;
  let trackedDays = 0;
  const sources = [];

  for (let cursor = weekStart, index = 0; cursor && cursor < date && index < 7; cursor = addIsoDays(cursor, 1), index += 1) {
    if (closedBeforeDate && cursor >= closedBeforeDate) continue;
    const raw = consumptionByDate instanceof Map
      ? consumptionByDate.get(cursor)
      : consumptionByDate?.[cursor];
    if (!raw?.tracked) continue;
    const consumed = objectiveShape(raw);
    const sourceBaseRaw = baseTargetByDate instanceof Map
      ? baseTargetByDate.get(cursor)
      : baseTargetByDate?.[cursor];
    const sourceBase = objectiveShape(sourceBaseRaw || base);
    const kcalDifference = round(sourceBase.kcal - consumed.kcal);
    calorieCarry = round(calorieCarry + kcalDifference);
    trackedDays += 1;
    sources.push({
      date: cursor,
      kcal: consumed.kcal,
      proteina: consumed.proteina,
      baseKcal: sourceBase.kcal,
      baseProteina: sourceBase.proteina,
      calorieDifference: kcalDifference,
    });
  }

  const rawKcal = round(base.kcal + calorieCarry);
  const rawProtein = base.proteina;
  const objective = macroEnergyAdjustedTarget(base, rawKcal, rawProtein);
  const energyWarning = objective.proteina * 4 > objective.kcal + 1;

  return {
    objective,
    target: targetShape(objective),
    balance: {
      active: true,
      mode: UNRESTRICTED_WEEKLY_MODE,
      weekStart,
      weekEnd,
      closesOn: weekEnd,
      isClosingDay: date === weekEnd,
      baseTarget: targetShape(base),
      calorieCarry: round(calorieCarry),
      proteinCarry: 0,
      trackedDays,
      proteinWindowDays: 0,
      sources,
      energyWarning,
    },
  };
}

export {
  UNRESTRICTED_WEEKLY_MODE,
  addIsoDays,
  mondayOfIsoWeek,
  resolveUnrestrictedTarget,
};

