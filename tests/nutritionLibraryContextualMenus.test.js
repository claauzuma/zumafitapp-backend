import assert from "node:assert/strict";
import test from "node:test";

import ServicioNutritionLibrary from "../servicio/nutritionLibrary.js";
import ServicioClientOwnMenus from "../servicio/clientOwnMenus.js";
import {
  CONTEXTUAL_MENU_MATCH_POLICY,
  contextualMenuMatch,
  contextualMenuStateAllowed,
  rankContextualMenus,
  reconstructContextualMenu,
  resolveAutomaticMenuMatch,
} from "../servicio/nutritionLibraryRanking.js";

const TARGET = { kcal: 2636, proteina: 165, carbs: 296, grasas: 88 };

function menu(id, totals, overrides = {}) {
  return {
    _id: id,
    id,
    nombre: `Menu ${id}`,
    ownerType: "admin",
    estado: "activo",
    activa: true,
    activo: true,
    publicado: true,
    visibilidad: "global",
    planMinimo: "free",
    comidas: [{
      id: `${id}-meal`,
      nombre: "Comida completa",
      items: [{
        alimentoId: `${id}-food`,
        nombre: "Alimento",
        cantidad: 100,
        unidad: "g",
        kcal: totals.kcal,
        proteina: totals.proteina,
        carbs: totals.carbs,
        grasas: totals.grasas,
      }],
    }],
    macrosTotales: totals,
    ...overrides,
  };
}

const A = menu("admin-a", { kcal: 2610, proteina: 162, carbs: 301, grasas: 87 });
const B = menu("own-b", { kcal: 2700, proteina: 170, carbs: 290, grasas: 90 }, { ownerType: "cliente", ownerId: "client-1" });
const C = menu("own-c-zero", { kcal: 0, proteina: 0, carbs: 0, grasas: 0 }, { ownerType: "cliente", ownerId: "client-1" });
const D = menu("admin-d-far", { kcal: 8224, proteina: 401, carbs: 1549, grasas: 100 });
const E = menu("admin-e", { kcal: 2500, proteina: 150, carbs: 280, grasas: 82 });

test("la matriz principal excluye 0 kcal y 8224 kcal, e incluye A, B y E en orden nutricional", () => {
  const ranked = rankContextualMenus([D, C, E, B, A], TARGET);
  assert.deepEqual(ranked.menus.map((item) => item.id), ["admin-a", "own-b", "admin-e"]);
  assert.equal(ranked.levelUsed, "high");
  assert.equal(ranked.invalid.length, 1);
  assert.equal(ranked.outside.length, 1);
  assert.equal(ranked.menus[0].equivalence.category, "Coincidencia alta");
  assert.ok(ranked.menus[0].equivalence.percent >= 95);
});

test("las tolerancias progresivas son centrales y amplian solo cuando faltan tres coincidencias altas", () => {
  assert.equal(CONTEXTUAL_MENU_MATCH_POLICY.high.kcalRatio, 0.10);
  assert.equal(CONTEXTUAL_MENU_MATCH_POLICY.acceptable.kcalRatio, 0.15);
  const high = menu("high", { kcal: 2630, proteina: 165, carbs: 296, grasas: 88 });
  const acceptable = menu("acceptable", { kcal: 3000, proteina: 190, carbs: 330, grasas: 95 });
  const ranked = rankContextualMenus([high, acceptable], TARGET);
  assert.equal(ranked.levelUsed, "acceptable");
  assert.deepEqual(ranked.menus.map((item) => item.id), ["high", "acceptable"]);
  assert.equal(ranked.menus[1].equivalence.category, "Compatible con ajustes");
});

test("si no hay candidatos aceptables devuelve vacio y separa los lejanos", () => {
  const ranked = rankContextualMenus([D], TARGET);
  assert.equal(ranked.menus.length, 0);
  assert.equal(ranked.outside.length, 1);
  assert.equal(ranked.levelUsed, "none");
});

test("automatico ofrece completar hasta 600 kcal solo con proteina compatible", () => {
  const target = { kcal: 2400, proteina: 160, carbs: 280, grasas: 75 };
  const base = menu("base-1900", { kcal: 1900, proteina: 158, carbs: 205, grasas: 55 });
  const resolution = resolveAutomaticMenuMatch(rankContextualMenus([base], target), target);
  assert.equal(resolution.status, "requires_calorie_top_up");
  assert.equal(resolution.candidate.id, "base-1900");
  assert.deepEqual(resolution.topUpTarget, { kcal: 500, proteina: 2, carbs: 75, grasas: 20 });

  const tooFar = menu("base-1700", { kcal: 1700, proteina: 160, carbs: 180, grasas: 45 });
  assert.equal(resolveAutomaticMenuMatch(rankContextualMenus([tooFar], target), target).status, "no_calorie_match");
});

test("automatico diferencia falta de calorias de falta de proteina", () => {
  const target = { kcal: 2400, proteina: 160, carbs: 280, grasas: 75 };
  const caloriesOnly = menu("kcal-ok-protein-low", { kcal: 2390, proteina: 70, carbs: 400, grasas: 55 });
  const resolution = resolveAutomaticMenuMatch(rankContextualMenus([caloriesOnly], target), target);
  assert.equal(resolution.status, "no_protein_match");
  assert.equal(resolution.candidate, null);
});

test("reconstruye desde comidas y rechaza vacios, cantidades invalidas y macros imposibles", () => {
  assert.equal(reconstructContextualMenu(A).valid, true);
  assert.equal(reconstructContextualMenu({ ...A, comidas: [] }).reason, "EMPTY_MENU");
  assert.equal(reconstructContextualMenu({ ...A, comidas: [{ items: [] }] }).reason, "EMPTY_MEAL");
  assert.equal(reconstructContextualMenu({ ...A, comidas: [{ items: [{ cantidad: 0, kcal: 100, proteina: 1, carbs: 1, grasas: 1 }] }] }).reason, "INVALID_QUANTITY");
  assert.equal(reconstructContextualMenu({ ...A, comidas: [{ items: [{ cantidad: 100, kcal: 100 }] }] }).reason, "UNRECONSTRUCTABLE_TOTALS");
});

test("un borrador Admin, archivado o despublicado no es candidato contextual", () => {
  assert.equal(contextualMenuStateAllowed(A, { admin: true }), true);
  assert.equal(contextualMenuStateAllowed({ ...A, estado: "borrador" }, { admin: true }), false);
  assert.equal(contextualMenuStateAllowed({ ...A, archivedAt: new Date() }, { admin: true }), false);
  assert.equal(contextualMenuStateAllowed({ ...A, publicado: false }, { admin: true }), false);
});

test("deduplica una copia importada contra su referencia original", () => {
  const copy = menu("own-copy", { kcal: 2610, proteina: 162, carbs: 301, grasas: 87 }, {
    ownerType: "cliente",
    ownerId: "client-1",
    sourceOriginalId: "admin-a",
    isOwned: true,
  });
  const ranked = rankContextualMenus([A, copy, E, B], TARGET);
  assert.equal(ranked.menus.filter((item) => ["admin-a", "own-copy"].includes(item.id)).length, 1);
  assert.equal(ranked.deduplicatedCount, 3);
});

test("una fecha con otra meta cambia el conjunto compatible", () => {
  assert.deepEqual(rankContextualMenus([A, D], TARGET).menus.map((item) => item.id), ["admin-a"]);
  const otherTarget = { kcal: 8200, proteina: 400, carbs: 1500, grasas: 100 };
  assert.deepEqual(rankContextualMenus([A, D], otherTarget).menus.map((item) => item.id), ["admin-d-far"]);
});

test("el porcentaje nunca queda alto para una diferencia calorica extrema", () => {
  const match = contextualMenuMatch(D, TARGET);
  assert.equal(match.level, "outside");
  assert.ok(match.percent < 50);
});

test("el endpoint contextual mezcla solo Admin publicado y propios autorizados", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const privateOther = menu("private-other", { kcal: 2630, proteina: 165, carbs: 296, grasas: 88 }, {
    ownerType: "cliente",
    ownerId: "other-client",
    visibilidad: "privada",
  });
  const draftAdmin = { ...A, _id: "admin-draft", id: "admin-draft", estado: "borrador" };
  const copy = menu("own-copy-a", { kcal: 2610, proteina: 162, carbs: 301, grasas: 87 }, {
    ownerType: "cliente",
    ownerId: "client-1",
    sourceOriginalId: "admin-a",
  });
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  let calls = 0;
  service.menusModel = {
    listBase: async () => {
      calls += 1;
      const items = calls === 1 ? [A, D, E, draftAdmin, privateOther] : [B, C, copy];
      return { items, total: items.length };
    },
  };
  const result = await service.listMenus(actor, {
    scope: "all",
    context: "day-menu",
    selectedDate: "2026-08-01",
    targetKcal: TARGET.kcal,
    targetProtein: TARGET.proteina,
    targetCarbs: TARGET.carbs,
    targetFat: TARGET.grasas,
    includeComidas: true,
    limit: 80,
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.menus.map((item) => item.id), ["own-copy-a", "own-b", "admin-e"]);
  assert.deepEqual(new Set(result.menus.map((item) => item.libraryOrigin)), new Set(["admin_library", "user_owned"]));
  assert.equal(result.selectedDate, "2026-08-01");
  assert.equal(result.outOfRangeCount, 1);
  assert.ok(result.excludedInvalid >= 2);
  assert.equal(result.menus.some((item) => item.id === "private-other"), false);
  assert.equal(result.menus.some((item) => item.id === "admin-draft"), false);
});

test("el endpoint automatico devuelve el menu propio o Admin que requiere complemento", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const target = { kcal: 2400, proteina: 160, carbs: 280, grasas: 75 };
  const ownBase = menu("own-1900", { kcal: 1900, proteina: 158, carbs: 205, grasas: 55 }, { ownerType: "cliente", ownerId: "client-1" });
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  let calls = 0;
  service.menusModel = {
    listBase: async () => {
      calls += 1;
      return calls === 1 ? { items: [], total: 0 } : { items: [ownBase], total: 1 };
    },
  };
  const result = await service.listMenus(actor, {
    scope: "all",
    context: "day-menu",
    automaticMatch: true,
    selectedDate: "2026-08-02",
    targetKcal: target.kcal,
    targetProtein: target.proteina,
    targetCarbs: target.carbs,
    targetFat: target.grasas,
    includeComidas: true,
  });
  assert.equal(result.menus.length, 0);
  assert.equal(result.automaticResolution.status, "requires_calorie_top_up");
  assert.equal(result.automaticResolution.candidate.id, "own-1900");
  assert.equal(result.automaticResolution.candidate.libraryOrigin, "user_owned");
  assert.equal(result.automaticResolution.topUpTarget.kcal, 500);
});

test("el scope discover combina contenido propio y Admin permitido sin incluir asignaciones del coach", () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const service = new ServicioNutritionLibrary();
  const menuQuery = JSON.stringify(service._menuQuery(actor, { scope: "discover" }));
  const mealQuery = JSON.stringify(service._mealQuery(actor, { scope: "discover" }));
  for (const query of [menuQuery, mealQuery]) {
    assert.match(query, /ownerId/);
    assert.match(query, /ownerType/);
    assert.doesNotMatch(query, /asignadoA|asignadaA/);
  }
});

test("los endpoints discover devuelven facets y filtran por los buckets elegidos", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  service.menusModel = {
    listBase: async () => ({
      items: [
        menu("m-2560", { kcal: 2560, proteina: 154, carbs: 280, grasas: 80 }),
        menu("m-1920", { kcal: 1920, proteina: 118, carbs: 210, grasas: 58 }),
      ],
      total: 2,
    }),
  };
  const menus = await service.listMenus(actor, {
    scope: "discover",
    includeFacets: true,
    calorieBucket: 2600,
    includeComidas: true,
  });
  assert.deepEqual(menus.menus.map((item) => item.id), ["m-2560"]);
  assert.deepEqual(menus.facets.calories, [{ value: 1900, count: 1 }, { value: 2600, count: 1 }]);
  assert.deepEqual(menus.facets.proteins, [{ value: 150, count: 1 }]);

  const savedMeal = (id, tipoComida, kcal, proteina) => ({
    _id: id,
    id,
    nombre: id,
    ownerType: "admin",
    estado: "activo",
    activo: true,
    visibilidad: "global",
    planMinimo: "free",
    tipoComida,
    items: [{ alimentoId: `${id}-food`, nombre: "Alimento", cantidad: 100, unidad: "g", kcal, proteina, carbs: 20, grasas: 5 }],
    totales: { kcal, proteina, carbs: 20, grasas: 5 },
  });
  service.comidasModel = {
    list: async () => ({ items: [savedMeal("meal-500", "almuerzo", 500, 31), savedMeal("meal-360", "snack", 360, 17)], total: 2 }),
  };
  const meals = await service.listMeals(actor, {
    scope: "discover",
    includeFacets: true,
    tipoComida: "snack",
    calorieBucket: 350,
  });
  assert.deepEqual(meals.comidas.map((item) => item.id), ["meal-360"]);
  assert.deepEqual(meals.facets.types, [{ value: "almuerzo", count: 1 }, { value: "snack", count: 1 }]);
  assert.deepEqual(meals.facets.calories, [{ value: 350, count: 1 }]);
});

test("Mis guardados conserva un menu propio incompleto fuera del ranking principal", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  service.menusModel = { listBase: async () => ({ items: [B, C], total: 2 }) };
  const result = await service.listMenus(actor, {
    scope: "mine",
    context: "day-menu",
    selectedDate: "2026-08-01",
    targetKcal: TARGET.kcal,
    targetProtein: TARGET.proteina,
    targetCarbs: TARGET.carbs,
    targetFat: TARGET.grasas,
  });
  assert.equal(result.menus.length, 2);
  assert.equal(result.menus.find((item) => item.id === "own-c-zero").contextualEligibility.eligible, false);
});

test("el endpoint contextual rechaza fecha o cualquiera de las cuatro metas ausentes", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  service.menusModel = { listBase: async () => { throw new Error("NO_DEBE_CONSULTAR"); } };
  await assert.rejects(
    service.listMenus(actor, { scope: "all", context: "day-menu", selectedDate: "2026-08-01", targetKcal: 2636, targetProtein: 165, targetCarbs: 296 }),
    /INVALID_CONTEXT_TARGET/
  );
  await assert.rejects(
    service.listMenus(actor, { scope: "all", context: "day-menu", selectedDate: "mal", targetKcal: 2636, targetProtein: 165, targetCarbs: 296, targetFat: 88 }),
    /INVALID_CONTEXT_TARGET/
  );
});

test("guardar o aplicar crea una copia fechada y nunca modifica el menu Admin", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const master = structuredClone(A);
  const before = structuredClone(master);
  let createdDoc = null;
  let listCalls = 0;
  const service = new ServicioNutritionLibrary();
  service._actor = async () => actor;
  service._menuLibraryItemById = async () => master;
  service._ownMenuCount = async () => 0;
  service.menusModel = {
    listBase: async () => ({ items: [], total: ++listCalls > 1 ? 1 : 0 }),
    createBase: async (doc) => {
      createdDoc = structuredClone(doc);
      return { ...doc, _id: "created-copy" };
    },
    updateBaseById: async () => null,
  };
  const copy = await service.copyMenuToMine(actor, "admin-a", { fechaInicio: "2026-08-04" });
  assert.equal(createdDoc.fechaInicio, "2026-08-04");
  assert.equal(copy.id, "created-copy");
  assert.equal(createdDoc.ownerId, "client-1");
  assert.deepEqual(master, before);
});

test("aplicar un menu propio duplica con la fecha elegida y deja intacto el original", async () => {
  const actor = { id: "client-1", _id: "client-1", role: "cliente", plan: "pro" };
  const original = structuredClone(B);
  const before = structuredClone(original);
  let createdDoc = null;
  const service = new ServicioClientOwnMenus();
  service._actor = async () => actor;
  service._capabilitiesFromAccessContext = () => ({ canDuplicateOwnMenu: true });
  service._assertLimit = async () => {};
  service._getVisibleMenu = async () => original;
  service._uniqueNameForUser = async () => "Menu B · alternativa";
  service._assertLimitAfterWrite = async () => {};
  service.menusModel = {
    createBase: async (doc) => {
      createdDoc = structuredClone(doc);
      return { ...doc, _id: "own-copy" };
    },
  };
  const result = await service.duplicate(actor, "own-b", { fechaInicio: "2026-08-04" });
  assert.equal(createdDoc.fechaInicio, "2026-08-04");
  assert.equal(result.menu.id, "own-copy");
  assert.equal(createdDoc.ownerId, "client-1");
  assert.deepEqual(original, before);
});

test("los planes se validan server-side y un cliente con coach no mezcla asignados profesionales", async () => {
  const premium = menu("admin-pro", { kcal: 2630, proteina: 165, carbs: 296, grasas: 88 }, { planMinimo: "pro" });
  const assignedCoach = menu("coach-assigned", { kcal: 2632, proteina: 165, carbs: 296, grasas: 88 }, {
    ownerType: "coach",
    ownerId: "coach-1",
    visibilidad: "asignada",
    asignadoA: [{ clienteId: "client-1", coachId: "coach-1" }],
  });
  async function idsFor(actor) {
    const service = new ServicioNutritionLibrary();
    service._actor = async () => actor;
    let calls = 0;
    service.menusModel = {
      listBase: async () => ({ items: ++calls === 1 ? [premium, assignedCoach] : [], total: calls === 1 ? 2 : 0 }),
    };
    const result = await service.listMenus(actor, {
      scope: "all",
      context: "day-menu",
      selectedDate: "2026-08-01",
      targetKcal: 2636,
      targetProtein: 165,
      targetCarbs: 296,
      targetFat: 88,
    });
    return result.menus.map((item) => item.id);
  }
  assert.deepEqual(await idsFor({ id: "client-1", role: "cliente", plan: "free" }), []);
  assert.deepEqual(await idsFor({ id: "client-1", role: "cliente", plan: "pro" }), ["admin-pro"]);
  assert.deepEqual(await idsFor({ id: "client-1", role: "cliente", plan: "vip" }), ["admin-pro"]);
  assert.deepEqual(await idsFor({ id: "client-1", role: "cliente", plan: "pro", coach: { entrenadorId: "coach-1" } }), ["admin-pro"]);
});
