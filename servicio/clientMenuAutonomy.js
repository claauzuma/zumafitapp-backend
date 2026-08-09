const PRESET_ALIASES = Object.freeze({
  total: "total",
  full: "total",
  autonomia_total: "total",
  own_and_coach: "equivalences",
  equivalences: "equivalences",
  coach_only: "coach_only",
  locked: "view_only",
  view_only: "view_only",
});

export const CLIENT_MENU_AUTONOMY_PRESETS = Object.freeze({
  total: Object.freeze({
    label: "Autonomia total",
    menu: Object.freeze({
      canViewMenu: true,
      canEditPreferences: true,
      canUseLibrary: true,
      canCreateOwnMenu: true,
      canUseAutomaticMenu: true,
      canUseSemiAutomaticMenu: true,
      canRequestMenuChanges: true,
      canActivateOwnMenuOverCoachPlan: false,
    }),
    tracking: Object.freeze({
      canTrackFoods: true,
      canUseMenuAlternatives: true,
      canCreateEquivalentMeals: true,
    }),
  }),
  equivalences: Object.freeze({
    label: "Alternativas + equivalencias propias",
    menu: Object.freeze({
      canViewMenu: true,
      canEditPreferences: true,
      canUseLibrary: false,
      canCreateOwnMenu: false,
      canUseAutomaticMenu: false,
      canUseSemiAutomaticMenu: false,
      canRequestMenuChanges: true,
      canActivateOwnMenuOverCoachPlan: false,
    }),
    tracking: Object.freeze({
      canTrackFoods: true,
      canUseMenuAlternatives: true,
      canCreateEquivalentMeals: true,
    }),
  }),
  coach_only: Object.freeze({
    label: "Solo alternativas del coach",
    menu: Object.freeze({
      canViewMenu: true,
      canEditPreferences: false,
      canUseLibrary: false,
      canCreateOwnMenu: false,
      canUseAutomaticMenu: false,
      canUseSemiAutomaticMenu: false,
      canRequestMenuChanges: true,
      canActivateOwnMenuOverCoachPlan: false,
    }),
    tracking: Object.freeze({
      canTrackFoods: true,
      canUseMenuAlternatives: true,
      canCreateEquivalentMeals: false,
    }),
  }),
  view_only: Object.freeze({
    label: "Sin cambios: solo ver el menu",
    menu: Object.freeze({
      canViewMenu: true,
      canEditPreferences: false,
      canUseLibrary: false,
      canCreateOwnMenu: false,
      canUseAutomaticMenu: false,
      canUseSemiAutomaticMenu: false,
      canRequestMenuChanges: false,
      canActivateOwnMenuOverCoachPlan: false,
    }),
    tracking: Object.freeze({
      canTrackFoods: true,
      canUseMenuAlternatives: false,
      canCreateEquivalentMeals: false,
    }),
  }),
});

export function normalizeClientMenuAutonomyPreset(value, fallback = "view_only") {
  const key = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return PRESET_ALIASES[key] || fallback;
}

export function inferClientMenuAutonomyPreset(permissions = {}, fallback = "equivalences") {
  const menu = permissions?.menu || {};
  const tracking = permissions?.tracking || {};
  if (menu.autonomyPreset) return normalizeClientMenuAutonomyPreset(menu.autonomyPreset, fallback);
  if (menu.canCreateOwnMenu === true || menu.canUseLibrary === true || menu.canUseAutomaticMenu === true) return "total";
  if (tracking.canUseMenuAlternatives === false) return "view_only";
  if (tracking.canCreateEquivalentMeals === false) return "coach_only";
  return fallback;
}

export function normalizeClientAutonomyPlanConfig(raw = {}, fallback = {}) {
  const availableInput = raw?.availablePresets || fallback?.availablePresets || {};
  const availablePresets = {};
  for (const key of Object.keys(CLIENT_MENU_AUTONOMY_PRESETS)) {
    availablePresets[key] = availableInput[key] !== false;
  }
  if (!Object.values(availablePresets).some(Boolean)) availablePresets.view_only = true;

  let defaultPreset = normalizeClientMenuAutonomyPreset(
    raw?.defaultPreset || fallback?.defaultPreset || "equivalences",
    "equivalences"
  );
  if (!availablePresets[defaultPreset]) {
    defaultPreset = Object.keys(availablePresets).find((key) => availablePresets[key]) || "view_only";
  }
  return { defaultPreset, availablePresets };
}

export function resolveClientMenuAutonomyPermissions(permissions = {}, {
  defaultPreset = "equivalences",
  availablePresets = null,
} = {}) {
  const menuInput = permissions?.menu && typeof permissions.menu === "object" ? permissions.menu : {};
  const trackingInput = permissions?.tracking && typeof permissions.tracking === "object" ? permissions.tracking : {};
  let preset = inferClientMenuAutonomyPreset(permissions, normalizeClientMenuAutonomyPreset(defaultPreset, "equivalences"));
  if (availablePresets && availablePresets[preset] === false) {
    preset = availablePresets[defaultPreset] !== false ? defaultPreset : "view_only";
  }
  const base = CLIENT_MENU_AUTONOMY_PRESETS[preset] || CLIENT_MENU_AUTONOMY_PRESETS.view_only;
  const bool = (value, fallback) => value === undefined || value === null ? fallback : value === true;

  return {
    preset,
    label: base.label,
    menu: {
      autonomyPreset: preset,
      canViewMenu: bool(menuInput.canViewMenu, base.menu.canViewMenu),
      canEditPreferences: bool(menuInput.canEditPreferences, base.menu.canEditPreferences),
      canUseLibrary: bool(menuInput.canUseLibrary, base.menu.canUseLibrary),
      canCreateOwnMenu: bool(menuInput.canCreateOwnMenu, base.menu.canCreateOwnMenu),
      canUseAutomaticMenu: bool(menuInput.canUseAutomaticMenu, base.menu.canUseAutomaticMenu),
      canUseSemiAutomaticMenu: bool(menuInput.canUseSemiAutomaticMenu, base.menu.canUseSemiAutomaticMenu),
      canRequestMenuChanges: bool(menuInput.canRequestMenuChanges, base.menu.canRequestMenuChanges),
      canActivateOwnMenuOverCoachPlan: menuInput.canActivateOwnMenuOverCoachPlan === true,
    },
    tracking: {
      canTrackFoods: bool(trackingInput.canTrackFoods, base.tracking.canTrackFoods),
      canUseMenuAlternatives: bool(trackingInput.canUseMenuAlternatives, base.tracking.canUseMenuAlternatives),
      canCreateEquivalentMeals: bool(trackingInput.canCreateEquivalentMeals, base.tracking.canCreateEquivalentMeals),
    },
  };
}
