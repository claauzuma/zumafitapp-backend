const TOTAL_KEYS = {
  kcal: ["kcal", "calorias", "calories"],
  proteina: ["proteina", "proteinas", "protein"],
  carbs: ["carbs", "carbohidratos", "carbohydrates"],
  grasas: ["grasas", "grasa", "fat", "fats"],
};

export const CONTEXTUAL_MENU_MATCH_POLICY = Object.freeze({
  minimumPrimaryResults: 3,
  high: Object.freeze({ kcalRatio: 0.10, proteinRatio: 0.15, proteinGrams: 20 }),
  acceptable: Object.freeze({ kcalRatio: 0.15, proteinRatio: 0.20, proteinGrams: 25 }),
});

export const AUTOMATIC_MENU_TOP_UP_POLICY = Object.freeze({
  maxKcal: 600,
  proteinRatio: 0.20,
  proteinGrams: 25,
});

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(source = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    const value = finite(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function completeTotals(source = {}) {
  const totals = {};
  for (const [key, aliases] of Object.entries(TOTAL_KEYS)) {
    const value = readNumber(source, aliases);
    if (value === null || value < 0) return null;
    totals[key] = value;
  }
  return totals;
}

function addTotals(left, right) {
  return {
    kcal: left.kcal + right.kcal,
    proteina: left.proteina + right.proteina,
    carbs: left.carbs + right.carbs,
    grasas: left.grasas + right.grasas,
  };
}

function entityTotals(entity = {}) {
  const sources = [
    entity.macrosTotales,
    entity.totales,
    entity.totalesActuales,
    entity.macros,
  ];
  for (const source of sources) {
    const totals = completeTotals(source || {});
    if (totals) return totals;
  }
  return null;
}

function itemTotals(item = {}) {
  const snapshot = item.snapshot || {};
  const direct = completeTotals({
    kcal: item.kcal ?? snapshot.kcal,
    proteina: item.proteina ?? item.proteinas ?? snapshot.proteina ?? snapshot.proteinas,
    carbs: item.carbs ?? item.carbohidratos ?? snapshot.carbs ?? snapshot.carbohidratos,
    grasas: item.grasas ?? item.grasa ?? snapshot.grasas ?? snapshot.grasa,
  });
  return direct;
}

export function reconstructContextualMenu(menu = {}) {
  const meals = Array.isArray(menu.comidas) ? menu.comidas : Array.isArray(menu.meals) ? menu.meals : [];
  if (!meals.length) return { valid: false, reason: "EMPTY_MENU", totals: null, mealsCount: 0 };

  let menuTotals = { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
  for (const meal of meals) {
    const items = Array.isArray(meal?.items) ? meal.items : Array.isArray(meal?.alimentos) ? meal.alimentos : [];
    if (!items.length) return { valid: false, reason: "EMPTY_MEAL", totals: null, mealsCount: meals.length };
    const quantitiesValid = items.every((item) => {
      const quantity = finite(item?.cantidad ?? item?.quantity);
      return quantity !== null && quantity > 0;
    });
    if (!quantitiesValid) return { valid: false, reason: "INVALID_QUANTITY", totals: null, mealsCount: meals.length };

    let reconstructed = { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
    let itemsReconstructible = true;
    for (const item of items) {
      const totals = itemTotals(item);
      if (!totals) {
        itemsReconstructible = false;
        break;
      }
      reconstructed = addTotals(reconstructed, totals);
    }
    const mealTotals = itemsReconstructible && reconstructed.kcal > 0 ? reconstructed : entityTotals(meal);
    if (!mealTotals || mealTotals.kcal <= 0) {
      return { valid: false, reason: "UNRECONSTRUCTABLE_TOTALS", totals: null, mealsCount: meals.length };
    }
    menuTotals = addTotals(menuTotals, mealTotals);
  }

  if (!Number.isFinite(menuTotals.kcal) || menuTotals.kcal <= 0) {
    return { valid: false, reason: "INVALID_KCAL", totals: null, mealsCount: meals.length };
  }
  return { valid: true, reason: null, totals: menuTotals, mealsCount: meals.length };
}

function token(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function contextualMenuStateAllowed(menu = {}, { admin = false } = {}) {
  if (menu.activo === false || menu.activa === false || menu.deletedAt || menu.archivedAt) return false;
  if (["borrador", "draft", "inactivo", "inactive", "archivado", "archived", "eliminado", "deleted", "revocado", "revoked"].includes(token(menu.estado || menu.status))) {
    return false;
  }
  if (!admin) return true;
  if (menu.publicado === false || menu.publicada === false || menu.isPublished === false) return false;
  const visibility = token(menu.visibilidad || menu.visibility);
  const publishedVisibility = ["publica", "publico", "sistema", "global", "premium", "solo_clientes", "clientes_asignados", "clientesasignados"].includes(visibility);
  const publishedState = ["activo", "active", "publicado", "published"].includes(token(menu.estado || menu.status));
  return publishedVisibility && (publishedState || menu.publicado === true || menu.publicada === true || menu.isPublished === true || !menu.estado);
}

function targetTotals(target = {}) {
  const kcal = finite(target.kcal);
  const proteina = finite(target.proteina);
  const carbs = finite(target.carbs);
  const grasas = finite(target.grasas);
  if (kcal === null || kcal <= 0) return null;
  if ([proteina, carbs, grasas].some((value) => value === null || value < 0)) return null;
  return { kcal, proteina, carbs, grasas };
}

function difference(result, target) {
  return {
    kcal: result.kcal - target.kcal,
    proteina: result.proteina - target.proteina,
    carbs: result.carbs - target.carbs,
    grasas: result.grasas - target.grasas,
  };
}

function toleranceFor(target, level) {
  const policy = CONTEXTUAL_MENU_MATCH_POLICY[level];
  return {
    kcal: target.kcal * policy.kcalRatio,
    proteina: target.proteina > 0 ? Math.max(target.proteina * policy.proteinRatio, policy.proteinGrams) : Infinity,
  };
}

function within(diff, tolerance) {
  return Math.abs(diff.kcal) <= tolerance.kcal && Math.abs(diff.proteina) <= tolerance.proteina;
}

function normalized(value, base, fallback) {
  return Math.abs(value) / Math.max(Math.abs(base), fallback);
}

function stableId(menu = {}) {
  return String(menu.id || menu._id || menu.menuKey || menu.nombre || "");
}

function matchPercent(diff, target) {
  const distance =
    normalized(diff.kcal, target.kcal, 200) * 0.55 +
    (target.proteina > 0 ? normalized(diff.proteina, target.proteina, 20) * 0.25 : 0) +
    (target.carbs > 0 ? normalized(diff.carbs, target.carbs, 30) * 0.10 : 0) +
    (target.grasas > 0 ? normalized(diff.grasas, target.grasas, 10) * 0.10 : 0);
  return Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
}

export function contextualMenuMatch(menu = {}, targetInput = {}, options = {}) {
  const target = targetTotals(targetInput);
  const reconstructed = options.reconstructed || reconstructContextualMenu(menu);
  if (!target || !reconstructed.valid) return null;
  const result = reconstructed.totals;
  const diff = difference(result, target);
  const high = within(diff, toleranceFor(target, "high"));
  const acceptable = within(diff, toleranceFor(target, "acceptable"));
  const percent = matchPercent(diff, target);
  const macroDistance =
    normalized(diff.carbs, target.carbs, 30) +
    normalized(diff.grasas, target.grasas, 10);
  const changes = [diff.kcal, diff.proteina, diff.carbs, diff.grasas]
    .filter((value) => Math.abs(value) > 1).length;
  const targetMeals = Number(options.targetMeals);
  const mealDistance = Number.isFinite(targetMeals) && targetMeals > 0
    ? Math.abs(reconstructed.mealsCount - targetMeals)
    : 0;
  return {
    target,
    result,
    diff,
    level: high ? "high" : acceptable ? "acceptable" : "outside",
    category: high ? (percent >= 95 ? "Coincidencia alta" : "Muy cercano") : acceptable ? "Compatible con ajustes" : "Fuera de rango",
    percent,
    kcalDistance: normalized(diff.kcal, target.kcal, 200),
    proteinDistance: Math.abs(diff.proteina),
    macroDistance,
    restrictionPenalty: Number(options.restrictionPenalty || 0),
    changes,
    mealDistance,
    ownOrFavorite: options.ownOrFavorite === true,
    stableId: stableId(menu),
  };
}

export function compareContextualMenuMatches(left = {}, right = {}) {
  return (
    left.kcalDistance - right.kcalDistance ||
    left.proteinDistance - right.proteinDistance ||
    left.macroDistance - right.macroDistance ||
    left.restrictionPenalty - right.restrictionPenalty ||
    left.changes - right.changes ||
    left.mealDistance - right.mealDistance ||
    Number(right.ownOrFavorite) - Number(left.ownOrFavorite) ||
    String(left.stableId).localeCompare(String(right.stableId))
  );
}

export function contextualMenuReferenceKey(menu = {}) {
  return String(
    menu.sourceOriginalId ||
    menu.originalMenuId ||
    menu.templateId ||
    menu.menuBaseId ||
    menu.id ||
    menu._id ||
    menu.menuKey ||
    ""
  );
}

export function rankContextualMenus(candidates = [], target = {}, options = {}) {
  const invalid = [];
  const byReference = new Map();
  for (const candidate of candidates) {
    const reconstructed = reconstructContextualMenu(candidate);
    if (!reconstructed.valid) {
      invalid.push({ menu: candidate, reason: reconstructed.reason });
      continue;
    }
    const match = contextualMenuMatch(candidate, target, {
      ...options,
      reconstructed,
      ownOrFavorite: candidate.isOwned === true || candidate.favorito === true,
    });
    if (!match) {
      invalid.push({ menu: candidate, reason: "INVALID_TARGET" });
      continue;
    }
    const decorated = { ...candidate, equivalence: match, _reconstructedTotals: reconstructed.totals };
    const key = contextualMenuReferenceKey(candidate) || match.stableId;
    const current = byReference.get(key);
    if (!current || compareContextualMenuMatches(match, current.equivalence) < 0) byReference.set(key, decorated);
  }

  const ranked = [...byReference.values()].sort((a, b) => compareContextualMenuMatches(a.equivalence, b.equivalence));
  const high = ranked.filter((menu) => menu.equivalence.level === "high");
  const acceptable = ranked.filter((menu) => menu.equivalence.level !== "outside");
  const compatible = high.length >= CONTEXTUAL_MENU_MATCH_POLICY.minimumPrimaryResults ? high : acceptable;
  const outside = ranked.filter((menu) => menu.equivalence.level === "outside");
  return {
    menus: compatible,
    outside,
    invalid,
    levelUsed: high.length >= CONTEXTUAL_MENU_MATCH_POLICY.minimumPrimaryResults ? "high" : acceptable.length ? "acceptable" : "none",
    highCount: high.length,
    compatibleCount: compatible.length,
    deduplicatedCount: ranked.length,
  };
}

export function resolveAutomaticMenuMatch(ranking = {}, targetInput = {}) {
  const target = targetTotals(targetInput);
  if (!target) return { status: "invalid_target", candidate: null };

  const compatible = Array.isArray(ranking.menus) ? ranking.menus : [];
  if (compatible.length) {
    return {
      status: "matched",
      candidate: compatible[0],
      topUpTarget: null,
      maxTopUpKcal: AUTOMATIC_MENU_TOP_UP_POLICY.maxKcal,
    };
  }

  const outside = Array.isArray(ranking.outside) ? ranking.outside : [];
  const proteinTolerance = target.proteina > 0
    ? Math.max(target.proteina * AUTOMATIC_MENU_TOP_UP_POLICY.proteinRatio, AUTOMATIC_MENU_TOP_UP_POLICY.proteinGrams)
    : Infinity;
  const proteinCompatible = outside.filter((menu) => (
    Math.abs(Number(menu?.equivalence?.diff?.proteina) || 0) <= proteinTolerance
  ));
  const topUpCandidates = proteinCompatible
    .filter((menu) => {
      const kcalDiff = Number(menu?.equivalence?.diff?.kcal);
      return Number.isFinite(kcalDiff) && kcalDiff < 0 && Math.abs(kcalDiff) <= AUTOMATIC_MENU_TOP_UP_POLICY.maxKcal;
    })
    .sort((left, right) => (
      Math.abs(Number(left.equivalence.diff.kcal)) - Math.abs(Number(right.equivalence.diff.kcal)) ||
      Math.abs(Number(left.equivalence.diff.proteina)) - Math.abs(Number(right.equivalence.diff.proteina)) ||
      compareContextualMenuMatches(left.equivalence, right.equivalence)
    ));

  if (topUpCandidates.length) {
    const candidate = topUpCandidates[0];
    const result = candidate.equivalence.result;
    return {
      status: "requires_calorie_top_up",
      candidate,
      topUpTarget: {
        kcal: Math.max(0, target.kcal - result.kcal),
        proteina: Math.max(0, target.proteina - result.proteina),
        carbs: Math.max(0, target.carbs - result.carbs),
        grasas: Math.max(0, target.grasas - result.grasas),
      },
      maxTopUpKcal: AUTOMATIC_MENU_TOP_UP_POLICY.maxKcal,
    };
  }

  const calorieTolerance = target.kcal * CONTEXTUAL_MENU_MATCH_POLICY.acceptable.kcalRatio;
  const hasCalorieCandidate = outside.some((menu) => (
    Math.abs(Number(menu?.equivalence?.diff?.kcal) || 0) <= calorieTolerance
  ));
  return {
    status: hasCalorieCandidate ? "no_protein_match" : "no_calorie_match",
    candidate: null,
    topUpTarget: null,
    maxTopUpKcal: AUTOMATIC_MENU_TOP_UP_POLICY.maxKcal,
  };
}
