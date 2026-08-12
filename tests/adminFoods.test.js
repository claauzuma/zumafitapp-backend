import assert from "node:assert/strict";
import test from "node:test";

import ServicioAdminFoods, { buildAdminFoodQuery, createFoodDocument, foodForAdmin, normalizeAdminFoodParams } from "../servicio/adminFoods.js";
import {
  defaultFoodGeneration,
  getAutomaticGenerationFoods,
  normalizeFoodGenerationForRead,
  validateFoodGenerationPatch,
} from "../servicio/foodGenerationMetadata.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

test("normaliza la paginacion y limita los filtros del catalogo admin", () => {
  assert.deepEqual(normalizeAdminFoodParams({ page: -4, limit: 500, status: "desconocido" }), {
    page: 1,
    limit: 100,
    search: "",
    category: "todos",
    unit: "todos",
    status: "todos",
    sort: "nombre_asc",
    mode: "todos",
    role: "todos",
    mealType: "todos",
  });
});

test("combina busqueda, categoria, unidad y estado sin interpretar regex del usuario", () => {
  const query = buildAdminFoodQuery({
    search: "arroz.*",
    category: "Carbohidratos",
    unit: "Grs",
    status: "revision",
  });

  assert.ok(Array.isArray(query.$and));
  assert.equal(query.$and.length, 4);
  const searchRegex = query.$and[0].$or[0].Alimentos;
  assert.equal(searchRegex.test("Arroz.* integral"), true);
  assert.equal(searchRegex.test("Arroz integral"), false);
  assert.deepEqual(query.$and[3], { requiereRevision: true });
});

test("el estado duplicados consulta la marca estructural nombre + unidad", () => {
  assert.deepEqual(buildAdminFoodQuery({ status: "duplicados" }), {
    duplicadoNombreUnidad: true,
  });
});

test("combina filtros server-side de modo, rol y momento", () => {
  const query = buildAdminFoodQuery({ mode: "GENERIC", role: "P1", mealType: "breakfast" });
  assert.deepEqual(query, { $and: [
    { "generation.mode": "GENERIC" },
    { "generation.roles.P1": true },
    { "generation.mealTypes.breakfast": true },
  ] });
});

test("EXPLICIT_ONLY incluye documentos legacy y excluye GENERIC o DISABLED", () => {
  assert.deepEqual(buildAdminFoodQuery({ mode: "EXPLICIT_ONLY" }), {
    "generation.mode": { $nin: ["GENERIC", "DISABLED"] },
  });
});

test("descarta valores desconocidos en los filtros de generacion", () => {
  const filters = normalizeAdminFoodParams({ mode: "AUTO", role: "X", mealType: "brunch" });
  assert.equal(filters.mode, "todos");
  assert.equal(filters.role, "todos");
  assert.equal(filters.mealType, "todos");
});

function genericGeneration(overrides = {}) {
  const value = defaultFoodGeneration();
  value.mode = "GENERIC";
  value.roles.P1 = true;
  value.mealTypes.breakfast = true;
  return { ...value, ...overrides };
}

function responseSpy() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("un documento legacy sin generation se interpreta como EXPLICIT_ONLY", () => {
  assert.deepEqual(normalizeFoodGenerationForRead(undefined), defaultFoodGeneration());
  const food = foodForAdmin({ _id: "legacy", Alimentos: "Arroz", Calorias: 339 });
  assert.equal(food.generation.mode, "EXPLICIT_ONLY");
  assert.equal(food.generationPersisted, false);
});

test("Admin actualiza generation sin enviar ni modificar nombre o macros", async () => {
  const original = { _id: "507f1f77bcf86cd799439011", Alimentos: "Pollo", Calorias: 110, Proteinas: 20 };
  let updateArguments = null;
  const model = {
    obtenerAlimentoPorId: async () => original,
    actualizarGenerationPorId: async (id, generation) => {
      updateArguments = { id, generation };
      return { ...original, generation };
    },
  };
  const service = new ServicioAdminFoods({ model });
  const generation = genericGeneration();
  const updated = await service.actualizarGeneration(original._id, generation);
  assert.deepEqual(Object.keys(updateArguments).sort(), ["generation", "id"]);
  assert.equal(updated.Alimentos, "Pollo");
  assert.equal(updated.Calorias, 110);
  assert.equal(updated.generation.mode, "GENERIC");
});

test("el middleware bloquea sin sesion, clientes y coaches", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "admin-foods-test-secret";
  const unauthenticated = responseSpy();
  authMiddleware({ headers: {}, cookies: {}, method: "PATCH" }, unauthenticated, () => assert.fail("No debe continuar"));
  assert.equal(unauthenticated.statusCode, 401);

  for (const role of ["cliente", "coach"]) {
    const response = responseSpy();
    requireRole("admin")({ user: { role } }, response, () => assert.fail("No debe continuar"));
    assert.equal(response.statusCode, 403);
  }
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

test("rechaza enums y portionRule invalidos con INVALID_GENERATION", () => {
  assert.throws(() => validateFoodGenerationPatch({ mode: "AUTO" }), { code: "INVALID_GENERATION" });
  assert.throws(() => validateFoodGenerationPatch({ portionRule: { unit: "kg" } }), { code: "INVALID_GENERATION" });
  assert.throws(() => validateFoodGenerationPatch({ portionRule: { min: -1 } }), { code: "INVALID_GENERATION" });
  assert.throws(() => validateFoodGenerationPatch({ portionRule: { min: 5, max: 2 } }), { code: "INVALID_GENERATION" });
  assert.throws(() => validateFoodGenerationPatch({ portionRule: { step: 0 } }), { code: "INVALID_GENERATION" });
  assert.throws(() => validateFoodGenerationPatch({ portionRule: { allowedValues: [1, -2] } }), { code: "INVALID_GENERATION" });
});

test("GENERIC exige rol y momento y normaliza allowedValues duplicados", () => {
  assert.throws(() => validateFoodGenerationPatch({ mode: "GENERIC" }), { code: "INVALID_GENERATION" });
  const generation = validateFoodGenerationPatch({
    mode: "GENERIC",
    roles: { P2: true },
    mealTypes: { lunch: true },
    portionRule: { unit: "g", min: 0, max: 200, step: 5, allowedValues: [50, 100, 50] },
  });
  assert.equal(generation.roles.P2, true);
  assert.equal(generation.mealTypes.lunch, true);
  assert.deepEqual(generation.portionRule.allowedValues, [50, 100]);
});

test("los alimentos nuevos quedan EXPLICIT_ONLY por default y no duplican nombre + unidad", () => {
  const document = createFoodDocument({ name: "Nuevo alimento", unit: "g", quantity: 100, kcal: 10, protein: 1, carbs: 1, fat: 0 });
  assert.equal(document.generation.mode, "EXPLICIT_ONLY");
  assert.equal(Object.values(document.generation.roles).some(Boolean), false);
  assert.throws(() => createFoodDocument(
    { name: "  ARROZ ", unit: "G", quantity: 100, kcal: 10, protein: 1, carbs: 1, fat: 0 },
    [{ Alimentos: "Arroz", Unidad: "g" }]
  ), { code: "FOOD_ALREADY_EXISTS" });
});

test("getAutomaticGenerationFoods incluye solo GENERIC activo compatible", async () => {
  const candidates = [
    { id: "ok", activo: true, generation: genericGeneration() },
    { id: "explicit", activo: true, generation: defaultFoodGeneration() },
    { id: "disabled", activo: true, generation: { ...genericGeneration(), mode: "DISABLED" } },
    { id: "wrong-meal", activo: true, generation: { ...genericGeneration(), mealTypes: { ...defaultFoodGeneration().mealTypes, lunch: true } } },
    { id: "legacy", activo: true },
    { id: "inactive", activo: false, generation: genericGeneration() },
  ];
  const model = {
    obtenerAlimentosGeneracionAutomatica: async ({ mealType, roles }) => {
      assert.equal(mealType, "breakfast");
      assert.deepEqual(roles, ["P1"]);
      return candidates;
    },
  };
  const result = await getAutomaticGenerationFoods({ mealType: "breakfast", roles: ["P1"] }, { model });
  assert.deepEqual(result.map((food) => food.id), ["ok"]);
});

test("getAutomaticGenerationFoods excluye mealType incorrecto y no consulta sin roles", async () => {
  let calls = 0;
  const model = { obtenerAlimentosGeneracionAutomatica: async () => { calls += 1; return []; } };
  assert.deepEqual(await getAutomaticGenerationFoods({ mealType: "dinner", roles: [] }, { model }), []);
  assert.equal(calls, 0);
  await assert.rejects(() => getAutomaticGenerationFoods({ mealType: "brunch", roles: ["P1"] }, { model }), { code: "INVALID_GENERATION" });
});
