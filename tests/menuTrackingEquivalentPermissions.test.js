import assert from "node:assert/strict";
import test from "node:test";

import { clientMenuTrackingPermissions } from "../servicio/usuarios.js";
import ServicioUsuarios from "../servicio/usuarios.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(date) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];
}

function replacementService(plan = "free") {
  const date = todayIso();
  const user = {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    personalPlan: plan,
    plan,
    menu: { activeSource: "own" },
    metasActuales: { kcal: 2000, proteina: 130, carbs: 240, grasas: 60 },
  };
  const primary = {
    menuId: "primary-menu",
    source: "own",
    menuSnapshot: {
      id: "primary-menu",
      baseId: "primary-menu",
      name: "Principal",
      meals: [{ id: "meal-1", nombre: "Almuerzo", totales: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 } }],
    },
  };
  const alternative = {
    menuId: "alternative-menu",
    source: "alternative",
    menuSnapshot: {
      id: "alternative-menu",
      baseId: "alternative-menu",
      name: "Alternativa",
      meals: [{ id: "meal-alt", nombre: "Almuerzo alternativo", totales: { kcal: 490, proteina: 38, carbs: 57, grasas: 12 } }],
    },
  };
  let stored = null;
  const service = new ServicioUsuarios();
  service.getById = async () => user;
  service._updateById = async () => user;
  service._resolveClientMenuPlan = async () => ({
    activeSource: "own",
    assignments: {
      [dayKey(date)]: { primaryMenu: primary, alternatives: [alternative] },
    },
  });
  service.menuTrackingModel = {
    getByUserDate: async () => stored,
    upsertDay: async (doc) => {
      stored = { _id: "tracking-1", ...doc };
      return stored;
    },
    listByUserDateRange: async () => stored ? [stored] : [],
  };
  service.foodLogsService.validateEquivalentItems = async (_actor, items) => items;
  service.foodLogsService.addSnapshotLogs = async (_actor, payload) => ({
    inserted: (payload.items || []).length,
    requestId: payload.requestId,
  });
  service.accessAuditModel.create = async (event) => event;
  return { service, user, date, primary, alternative, getStored: () => stored };
}

function replacementPayload(date, replacement) {
  return {
    date,
    dayKey: dayKey(date),
    status: "pending",
    completedMenuMealIds: [],
    mealReplacements: [replacement],
    foodReplacements: [],
    manualEntries: [],
    generatedRemainingMeals: [],
  };
}

test("Por meta persiste targetMealIds y excluye la misma comida de Hechas", async () => {
  const context = replacementService("free");
  const basePayload = {
    date: context.date,
    dayKey: dayKey(context.date),
    status: "pending",
    completedMenuMealIds: ["meal-1"],
    targetMealIds: ["meal-1"],
    mealReplacements: [],
    foodReplacements: [],
    manualEntries: [],
    generatedRemainingMeals: [],
  };

  await context.service.upsertMyMenuTrackingDay(
    { id: context.user.id },
    basePayload
  );

  assert.deepEqual(context.getStored().targetMealIds, ["meal-1"]);
  assert.deepEqual(context.getStored().completedMenuMeals, []);

  await context.service.upsertMyMenuTrackingDay(
    { id: context.user.id },
    { ...basePayload, completedMenuMealIds: [], targetMealIds: [] }
  );

  assert.deepEqual(context.getStored().targetMealIds, []);
});

test("Free autogestionado no crea equivalentes y Pro/VIP respetan 6/10 alimentos", () => {
  const free = clientMenuTrackingPermissions({ role: "cliente", personalPlan: "free" });
  const pro = clientMenuTrackingPermissions({ role: "cliente", personalPlan: "pro" });
  const vip = clientMenuTrackingPermissions({ role: "cliente", personalPlan: "vip" });

  assert.equal(free.canCreateEquivalentMeals, false);
  assert.equal(free.canAutoCreateEquivalentMeals, false);
  assert.equal(free.equivalentMealFoodsLimit, 0);
  assert.equal(pro.canCreateEquivalentMeals, true);
  assert.equal(pro.canAutoCreateEquivalentMeals, true);
  assert.equal(pro.equivalentMealFoodsLimit, 6);
  assert.equal(vip.canCreateEquivalentMeals, true);
  assert.equal(vip.canAutoCreateEquivalentMeals, true);
  assert.equal(vip.equivalentMealFoodsLimit, 10);
});

test("cliente con coach puede crear manual si el coach habilita cambios", () => {
  const permissions = clientMenuTrackingPermissions({
    role: "cliente",
    personalPlan: "free",
    coach: { entrenadorId: "coach-1" },
    coachAccess: { status: "active", coachId: "coach-1" },
    menu: { activeSource: "coach" },
    clientPermissions: { tracking: { canUseMenuAlternatives: true } },
  });

  assert.equal(permissions.canUseMenuAlternatives, true);
  assert.equal(permissions.canCreateEquivalentMeals, true);
  assert.equal(permissions.canAutoCreateEquivalentMeals, false);
  assert.equal(permissions.equivalentMealFoodsLimit, 6);
});

test("el permiso del coach bloquea alternativas manuales y automaticas", () => {
  const permissions = clientMenuTrackingPermissions({
    role: "cliente",
    personalPlan: "vip",
    coach: { entrenadorId: "coach-1" },
    coachAccess: {
      status: "active",
      coachId: "coach-1",
      servicePackage: "service_vip",
    },
    menu: { activeSource: "coach" },
    clientPermissions: { tracking: { canUseMenuAlternatives: false } },
  });

  assert.equal(permissions.canUseMenuAlternatives, false);
  assert.equal(permissions.canCreateEquivalentMeals, false);
  assert.equal(permissions.canAutoCreateEquivalentMeals, false);
  assert.equal(permissions.equivalentMealFoodsLimit, 0);
});

test("el coach puede dejar sus alternativas habilitadas y bloquear solo las equivalencias propias", () => {
  const permissions = clientMenuTrackingPermissions({
    role: "cliente",
    personalPlan: "vip",
    coach: { entrenadorId: "coach-1" },
    coachAccess: {
      status: "active",
      coachId: "coach-1",
      servicePackage: "service_vip",
    },
    menu: { activeSource: "coach" },
    clientPermissions: {
      tracking: {
        canUseMenuAlternatives: true,
        canCreateEquivalentMeals: false,
      },
    },
  });

  assert.equal(permissions.canUseMenuAlternatives, true);
  assert.equal(permissions.canCreateEquivalentMeals, false);
  assert.equal(permissions.canAutoCreateEquivalentMeals, false);
});

test("el endpoint rechaza un equivalente custom en Free aunque se fuerce el payload", async () => {
  const { service, user, date } = replacementService("free");
  await assert.rejects(
    service.upsertMyMenuTrackingDay(
      { id: user.id },
      replacementPayload(date, {
        id: `client-meal-replacement-${date}-0-meal-1`,
        name: "Mi comida inventada",
        mode: "custom_equivalent",
        target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
        totals: { kcal: 0, proteina: 0, carbs: 0, grasas: 0 },
        foods: [{ id: "food-1", name: "Arroz", quantity: 147, unit: "g", kcal: 500 }],
      })
    ),
    /EQUIVALENT_MEALS_NOT_ALLOWED/
  );
});

test("Free conserva una alternativa realmente asignada y no la confunde con custom", async () => {
  const { service, user, date } = replacementService("free");
  const result = await service.upsertMyMenuTrackingDay(
    { id: user.id },
    replacementPayload(date, {
      id: `client-meal-replacement-${date}-0-meal-1`,
      name: "Almuerzo alternativo",
      target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
      totals: { kcal: -10, proteina: -2, carbs: 2, grasas: -1 },
      foods: [],
    })
  );
  assert.equal(result.record.tracking.mealReplacements.length, 1);
});

test("el backend aplica el limite 6 de Pro y acepta 7 alimentos en VIP", async () => {
  const foods = Array.from({ length: 7 }, (_, index) => ({
    id: `food-${index + 1}`,
    name: `Alimento ${index + 1}`,
    quantity: 50,
    unit: "g",
    kcal: 70,
  }));
  const custom = (date) => ({
    id: `client-meal-replacement-${date}-0-meal-1`,
    name: "Mi equivalente",
    mode: "custom_equivalent",
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    totals: { kcal: -10, proteina: -2, carbs: 2, grasas: -1 },
    foods,
  });
  const pro = replacementService("pro");
  await assert.rejects(
    pro.service.upsertMyMenuTrackingDay(
      { id: pro.user.id },
      replacementPayload(pro.date, custom(pro.date))
    ),
    /EQUIVALENT_MEAL_FOODS_LIMIT/
  );

  const vip = replacementService("vip");
  const result = await vip.service.upsertMyMenuTrackingDay(
    { id: vip.user.id },
    replacementPayload(vip.date, custom(vip.date))
  );
  assert.equal(result.record.tracking.mealReplacements[0].foods.length, 7);
});

test("el limite custom no se aplica por error a una alternativa asignada del mismo dia", async () => {
  const pro = replacementService("pro");
  pro.primary.menuSnapshot.meals.push({
    id: "meal-2",
    nombre: "Cena",
    totales: { kcal: 600, proteina: 45, carbs: 70, grasas: 15 },
  });
  pro.alternative.menuSnapshot.meals.push({
    id: "meal-alt-2",
    nombre: "Cena alternativa",
    totales: { kcal: 590, proteina: 43, carbs: 72, grasas: 14 },
  });
  const customFoods = Array.from({ length: 6 }, (_, index) => ({
    id: `custom-${index + 1}`,
    name: `Custom ${index + 1}`,
    quantity: 50,
    unit: "g",
    kcal: 80,
  }));
  const assignedFoods = Array.from({ length: 7 }, (_, index) => ({
    id: `assigned-${index + 1}`,
    name: `Asignado ${index + 1}`,
    quantity: 20,
    unit: "g",
    kcal: 70,
  }));
  const payload = replacementPayload(pro.date, {
    id: `client-meal-replacement-${pro.date}-0-meal-1`,
    name: "Mi equivalente",
    mode: "custom_equivalent",
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    totals: { kcal: -20, proteina: -3, carbs: 1, grasas: 0 },
    foods: customFoods,
  });
  payload.mealReplacements.push({
    id: `client-meal-replacement-${pro.date}-1-meal-2`,
    name: "Cena alternativa",
    target: { kcal: 600, proteina: 45, carbs: 70, grasas: 15 },
    totals: { kcal: -10, proteina: -2, carbs: 2, grasas: -1 },
    foods: assignedFoods,
  });

  const result = await pro.service.upsertMyMenuTrackingDay({ id: pro.user.id }, payload);
  assert.equal(result.record.tracking.mealReplacements.length, 2);
});

test("el coach persiste el permiso de equivalencias sin modificar el resto de permisos", async () => {
  const service = new ServicioUsuarios();
  const coach = {
    _id: "coach-1",
    role: "coach",
    coachProfile: { specialties: { nutrition: true } },
    effectiveCapabilities: {
      isTrialExpired: false,
      features: {
        menus: { manualBuilder: true, semiAutomaticBuilder: true },
        routines: {},
        metrics: { basic: true },
      },
      clientAutonomy: {
        defaultPreset: "equivalences",
        availablePresets: { total: true, equivalences: true, coach_only: true, view_only: true },
      },
    },
  };
  const client = {
    _id: "client-1",
    role: "cliente",
    menu: { mode: { type: "manual" } },
    clientPermissions: {
      tracking: { canUseMenuAlternatives: true, canTrackFoods: true },
      progress: { canLogWeight: true },
    },
  };
  let savedPatch = null;
  service._getCoachClientPair = async () => ({ coach, client });
  service._assertCoachFeature = () => {};
  service.updateById = async (_id, patch) => {
    savedPatch = patch;
    return { ...client, ...patch };
  };

  await service.coachUpdateClientMenu({
    coachId: coach._id,
    clientId: client._id,
    payload: {
      menu: { mode: { type: "manual" } },
      clientPermissions: { tracking: { canCreateEquivalentMeals: false } },
    },
  });

  assert.equal(savedPatch.clientPermissions.tracking.canCreateEquivalentMeals, false);
  assert.equal(savedPatch.clientPermissions.tracking.canUseMenuAlternatives, true);
  assert.equal(savedPatch.clientPermissions.tracking.canTrackFoods, true);
  assert.equal(savedPatch.clientPermissions.progress.canLogWeight, true);
});

test("planificar un equivalente no cambia lo consumido hasta marcar la comida", async () => {
  const context = replacementService("pro");
  const replacement = {
    id: `client-meal-replacement-${context.date}-0-meal-1`,
    name: "Mi equivalente",
    mode: "custom_equivalent",
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    totals: { kcal: -10, proteina: -2, carbs: 2, grasas: -1 },
    foods: [{ id: "food-1", name: "Comida nueva", quantity: 100, unit: "g", kcal: 490 }],
  };

  const planned = await context.service.upsertMyMenuTrackingDay(
    { id: context.user.id },
    replacementPayload(context.date, replacement)
  );
  assert.equal(planned.record.tracking.consumedTotals.kcal, 0);

  const consumedPayload = replacementPayload(context.date, replacement);
  consumedPayload.completedMenuMealIds = ["meal-1"];
  const consumed = await context.service.upsertMyMenuTrackingDay(
    { id: context.user.id },
    consumedPayload
  );
  assert.equal(consumed.record.tracking.consumedTotals.kcal, 490);
});

test("una alternativa inactiva persiste pero no reemplaza macros ni bloquea el consumo original", async () => {
  const context = replacementService("pro");
  const replacement = {
    id: `client-meal-replacement-${context.date}-0-meal-1`,
    name: "Mi alternativa guardada",
    mode: "custom_equivalent",
    replacementSlot: "client_generated",
    isActiveReplacement: false,
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    foods: [{ id: "food-1", name: "Comida nueva", quantity: 100, unit: "g", kcal: 490 }],
  };
  const payload = replacementPayload(context.date, replacement);
  payload.completedMenuMealIds = ["meal-1"];
  const result = await context.service.upsertMyMenuTrackingDay({ id: context.user.id }, payload);
  assert.equal(result.record.tracking.mealReplacements[0].isActiveReplacement, false);
  assert.equal(result.record.tracking.consumedTotals.kcal, 500);
});

test("el coach recibe el slot de alternativa del cliente con alimentos y estado activo", async () => {
  const context = replacementService("pro");
  context.user.coach = { entrenadorId: "coach-1" };
  context.service._getCoachClientPair = async () => ({ coach: { _id: "coach-1" }, client: context.user });
  const replacement = {
    id: `client-meal-replacement-${context.date}-0-meal-1`,
    name: "Mi alternativa visible",
    mode: "custom_equivalent",
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    foods: [{ id: "food-1", name: "Arroz", quantity: 140, unit: "g", kcal: 490 }],
  };
  await context.service.upsertMyMenuTrackingDay({ id: context.user.id }, replacementPayload(context.date, replacement));
  context.service.accessAuditModel.list = async () => ({ items: [] });
  const result = await context.service.getCoachClientEquivalentActivity({
    coachId: "coach-1",
    clientId: context.user.id,
    query: { from: context.date, to: context.date },
  });
  assert.equal(result.clientMealAlternatives.length, 1);
  assert.equal(result.clientMealAlternatives[0].name, "Mi alternativa visible");
  assert.equal(result.clientMealAlternatives[0].foods[0].name, "Arroz");
  assert.equal(result.clientMealAlternatives[0].active, true);
});

test("aprobacion opcional bloquea consumo hasta que el coach relacionado aprueba", async () => {
  const context = replacementService("pro");
  context.user.coach = { entrenadorId: "coach-1" };
  context.user.coachAccess = { status: "active", coachId: "coach-1", servicePackage: "service_pro" };
  context.user.menu.activeSource = "coach";
  context.user.clientPermissions = {
    tracking: {
      canUseMenuAlternatives: true,
      canCreateEquivalentMeals: true,
      equivalentApprovalMode: "required",
    },
  };
  const replacement = {
    id: `client-meal-replacement-${context.date}-0-meal-1`,
    name: "Mi equivalente pendiente",
    mode: "custom_equivalent",
    replacesMealIds: ["meal-1"],
    target: { kcal: 500, proteina: 40, carbs: 55, grasas: 13 },
    foods: [{ id: "food-1", name: "Comida nueva", quantity: 100, unit: "g", kcal: 490 }],
  };

  const planned = await context.service.upsertMyMenuTrackingDay(
    { id: context.user.id },
    replacementPayload(context.date, replacement)
  );
  assert.equal(planned.record.tracking.mealReplacements[0].approvalStatus, "pending_review");

  const completion = replacementPayload(context.date, replacement);
  completion.completedMenuMealIds = ["meal-1"];
  await assert.rejects(
    context.service.upsertMyMenuTrackingDay({ id: context.user.id }, completion),
    /EQUIVALENT_PENDING_APPROVAL/
  );

  context.service._getCoachClientPair = async ({ coachId }) => {
    if (coachId !== "coach-1") throw new Error("COACH_CLIENT_RELATION_REQUIRED");
    return { coach: { _id: "coach-1" }, client: context.user };
  };
  const reviewed = await context.service.coachReviewClientEquivalent({
    coachId: "coach-1",
    clientId: context.user.id,
    date: context.date,
    entryId: replacement.id,
    action: "approve",
  });
  assert.equal(reviewed.entry.approvalStatus, "approved");

  const consumed = await context.service.upsertMyMenuTrackingDay({ id: context.user.id }, completion);
  assert.equal(consumed.record.tracking.completedMenuMealIds.includes("meal-1"), true);
});

test("un coach no relacionado no puede consultar ni revisar equivalencias", async () => {
  const service = new ServicioUsuarios();
  service._getCoachClientPair = async () => {
    throw new Error("COACH_CLIENT_RELATION_REQUIRED");
  };
  await assert.rejects(
    service.getCoachClientEquivalentActivity({ coachId: "coach-x", clientId: "client-1" }),
    /COACH_CLIENT_RELATION_REQUIRED/
  );
  await assert.rejects(
    service.coachReviewClientEquivalent({
      coachId: "coach-x",
      clientId: "client-1",
      date: todayIso(),
      entryId: "entry-1",
      action: "approve",
    }),
    /COACH_CLIENT_RELATION_REQUIRED/
  );
});
