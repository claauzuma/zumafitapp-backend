const ACTIVITY_FACTORS = Object.freeze({
  sedentario: 1.2,
  none: 1.2,
  ligero: 1.35,
  moderado: 1.45,
  activo: 1.55,
  muy_activo: 1.65,
});

const EXERCISE_EXTRAS = Object.freeze({
  "1_3": 0.1,
  "4_6": 0.2,
  "7_plus": 0.3,
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function token(value = "") {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
}

export function ageFromBirthDate(value, now = new Date()) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const birth = match ? null : new Date(value);
  if (!match && !Number.isFinite(birth?.getTime())) return null;
  const birthYear = match ? Number(match[1]) : birth.getFullYear();
  const birthMonth = match ? Number(match[2]) : birth.getMonth() + 1;
  const birthDay = match ? Number(match[3]) : birth.getDate();
  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) return null;
  let age = now.getFullYear() - birthYear;
  const month = (now.getMonth() + 1) - birthMonth;
  if (month < 0 || (month === 0 && now.getDate() < birthDay)) age -= 1;
  return age >= 13 && age <= 120 ? age : null;
}

export function calculateActivityFactor({ factor, activity, actividadDiaria, exerciseFrequency, frecuenciaEjercicio } = {}) {
  const explicit = finite(factor);
  if (explicit !== null && explicit >= 1.2 && explicit <= 2.2) return Math.round(explicit * 100) / 100;
  const base = ACTIVITY_FACTORS[token(activity || actividadDiaria)] ?? null;
  if (base === null) return null;
  const extra = EXERCISE_EXTRAS[token(exerciseFrequency || frecuenciaEjercicio)] || 0;
  return Math.round(Math.min(2.2, Math.max(1.2, base + extra)) * 100) / 100;
}

function normalizedSex(value) {
  const normalized = token(value);
  if (["masculino", "hombre", "male"].includes(normalized)) return "masculino";
  if (["femenino", "mujer", "female"].includes(normalized)) return "femenino";
  return null;
}

function goalAdjustment(goalType) {
  const goal = token(goalType);
  if (goal.includes("perder") || goal.includes("bajar") || goal.includes("defin") || goal.includes("lose")) return -0.15;
  if (goal.includes("ganar") || goal.includes("subir") || goal.includes("volumen") || goal.includes("gain")) return 0.1;
  return 0;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatIsoDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function calculateGoalProjection({
  maintenanceKcal,
  weightKg,
  targetWeightKg,
  ratePctBWPerWeek,
  goalType,
} = {}, { now = new Date() } = {}) {
  const maintenance = finite(maintenanceKcal);
  const weight = finite(weightKg);
  const targetWeight = finite(targetWeightKg);
  const rate = finite(ratePctBWPerWeek);
  const normalizedGoal = token(goalType);
  const isLoss = normalizedGoal.includes("perder") || normalizedGoal.includes("bajar") || normalizedGoal.includes("defin") || normalizedGoal.includes("lose");
  const isGain = normalizedGoal.includes("ganar") || normalizedGoal.includes("subir") || normalizedGoal.includes("volumen") || normalizedGoal.includes("gain");
  if (!(maintenance > 0) || !(weight > 0) || (!isLoss && !isGain)) return null;

  const hasExplicitRate = rate !== null && rate >= 0.1 && rate <= 1.5;
  const defaultAdjustment = goalAdjustment(normalizedGoal);
  let targetKcal = Math.round(maintenance * (1 + defaultAdjustment));
  let kgPerWeek = null;
  let dailyEnergyChange = Math.abs(targetKcal - maintenance);
  let endDate = null;

  if (hasExplicitRate) {
    kgPerWeek = weight * (rate / 100);
    dailyEnergyChange = (kgPerWeek * 7700) / 7;
    targetKcal = isLoss
      ? Math.round(Math.min(maintenance - 100, Math.max(1400, maintenance - dailyEnergyChange)))
      : Math.round(Math.min(maintenance + 1200, Math.max(maintenance + 100, maintenance + dailyEnergyChange)));

    const deltaKg = targetWeight !== null
      ? (isLoss ? Math.max(0, weight - targetWeight) : Math.max(0, targetWeight - weight))
      : 0;
    if (deltaKg > 0 && kgPerWeek > 0) {
      endDate = formatIsoDate(addDays(now, Math.ceil((deltaKg / kgPerWeek) * 7)));
    }
  }

  targetKcal = Math.round(Math.min(7000, Math.max(800, targetKcal)));
  return {
    mode: isLoss ? "lose" : "gain",
    targetKcal,
    ratePctBWPerWeek: hasExplicitRate ? rate : null,
    kgPerWeek: kgPerWeek === null ? null : Math.round(kgPerWeek * 1000) / 1000,
    dailyEnergyChange: Math.round(dailyEnergyChange),
    endDate,
    adjustmentRatio: (targetKcal - maintenance) / maintenance,
  };
}

export function calculateMaintenancePreview(input = {}, { now = new Date() } = {}) {
  const age = finite(input.age) ?? ageFromBirthDate(input.birthDate || input.fechaNacimiento, now);
  const sex = normalizedSex(input.sex || input.sexo || input.gender || input.genero);
  const weightKg = finite(input.weightKg ?? input.pesoKg);
  const heightCm = finite(input.heightCm ?? input.alturaCm);
  const activityFactor = calculateActivityFactor({
    factor: input.activityFactor ?? input.factorActividad,
    activity: input.activity ?? input.actividadDiaria,
    exerciseFrequency: input.exerciseFrequency ?? input.frecuenciaEjercicio,
  });
  const goalType = token(input.goalType || input.objetivo || input.goal);
  const missingFields = [];
  if (!(age >= 13 && age <= 120)) missingFields.push("fecha de nacimiento o edad");
  if (!sex) missingFields.push("sexo");
  if (!(weightKg >= 30 && weightKg <= 250)) missingFields.push("peso");
  if (!(heightCm >= 120 && heightCm <= 230)) missingFields.push("altura");
  if (!(activityFactor >= 1.2 && activityFactor <= 2.2)) missingFields.push("factor de actividad");
  if (missingFields.length) {
    return { ready: false, missingFields, usedData: { age, sex, weightKg, heightCm, activityFactor } };
  }

  const mifflin = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "masculino" ? 5 : -161);
  const harris = sex === "masculino"
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  const bmr = (mifflin + harris) / 2;
  const estimatedMaintenanceKcal = Math.round(bmr * activityFactor);
  const maintenanceOverride = finite(input.maintenanceKcalOverride ?? input.tdeeCustom);
  const hasMaintenanceOverride = maintenanceOverride !== null && maintenanceOverride >= 800 && maintenanceOverride <= 6000;
  const maintenanceKcal = hasMaintenanceOverride ? Math.round(maintenanceOverride) : estimatedMaintenanceKcal;

  return {
    ready: true,
    missingFields: [],
    formula: "Promedio Mifflin-St Jeor + Harris-Benedict revisada",
    usedData: { age, sex, weightKg, heightCm, activityFactor },
    bmr: {
      mifflin: Math.round(mifflin),
      harrisBenedict: Math.round(harris),
      average: Math.round(bmr),
    },
    estimatedMaintenanceKcal,
    maintenanceKcal,
    maintenanceSource: hasMaintenanceOverride ? "explicit_override" : "calculated",
  };
}

export function calculateNutritionGoalPreview(input = {}, { now = new Date() } = {}) {
  const maintenance = calculateMaintenancePreview(input, { now });
  const goalType = token(input.goalType || input.objetivo || input.goal);
  const missingFields = [...maintenance.missingFields];
  if (!goalType) missingFields.push("objetivo");
  if (missingFields.length) {
    return {
      ready: false,
      missingFields,
      usedData: { ...(maintenance.usedData || {}), goalType: goalType || null },
      ...(maintenance.ready ? {
        formula: maintenance.formula,
        bmr: maintenance.bmr,
        estimatedMaintenanceKcal: maintenance.estimatedMaintenanceKcal,
        maintenanceKcal: maintenance.maintenanceKcal,
        maintenanceSource: maintenance.maintenanceSource,
      } : {}),
    };
  }

  const projection = calculateGoalProjection({
    maintenanceKcal: maintenance.maintenanceKcal,
    weightKg: maintenance.usedData.weightKg,
    targetWeightKg: input.targetWeightKg ?? input.pesoObjetivoKg,
    ratePctBWPerWeek: input.ratePctBWPerWeek ?? input.ritmoPctPesoSemanal,
    goalType,
  }, { now });
  const adjustment = projection?.adjustmentRatio ?? goalAdjustment(goalType);
  const targetKcal = projection?.targetKcal
    ?? Math.round(Math.min(7000, Math.max(800, maintenance.maintenanceKcal * (1 + adjustment))));
  const proteinPerKg = adjustment < 0 ? 2 : adjustment > 0 ? 1.8 : 1.6;
  const protein = Math.round(maintenance.usedData.weightKg * proteinPerKg);
  const fat = Math.round(maintenance.usedData.weightKg * 0.8);
  const carbs = Math.max(0, Math.round((targetKcal - protein * 4 - fat * 9) / 4));

  return {
    ready: true,
    missingFields: [],
    formula: maintenance.formula,
    usedData: { ...maintenance.usedData, goalType },
    bmr: maintenance.bmr,
    estimatedMaintenanceKcal: maintenance.estimatedMaintenanceKcal,
    maintenanceKcal: maintenance.maintenanceKcal,
    maintenanceSource: maintenance.maintenanceSource,
    adjustment: { ratio: adjustment, percent: Math.round(adjustment * 100) },
    projection,
    target: { kcal: targetKcal, macros: { p: protein, c: carbs, g: fat } },
  };
}
