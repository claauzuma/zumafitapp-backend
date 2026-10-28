import test from "node:test";
import assert from "node:assert/strict";

import ServicioClientCustomFoods, {
  CLIENT_CUSTOM_FOODS_LIMIT,
  customFoodDocument,
} from "../servicio/clientCustomFoods.js";
import ServicioAlimentos from "../servicio/alimentos.js";
import ServicioUsuarios from "../servicio/usuarios.js";

function memoryModel(seed = []) {
  let rows = seed.map((row, index) => ({ _id: row._id || `food-${index + 1}`, ...row }));
  return {
    listByOwner: async (ownerId) => rows.filter((row) => row.ownerId === String(ownerId)),
    listAll: async () => [...rows],
    countByOwner: async (ownerId) => rows.filter((row) => row.ownerId === String(ownerId)).length,
    findById: async (id) => rows.find((row) => String(row._id) === String(id)) || null,
    create: async (document) => {
      const created = { _id: `food-${rows.length + 1}`, ...document };
      rows.push(created);
      return created;
    },
    updateById: async (id, patch) => {
      const index = rows.findIndex((row) => String(row._id) === String(id));
      if (index < 0) return null;
      rows[index] = { ...rows[index], ...patch };
      return rows[index];
    },
    deleteById: async (id) => {
      const before = rows.length;
      rows = rows.filter((row) => String(row._id) !== String(id));
      return { deletedCount: before - rows.length };
    },
  };
}

const users = {
  pro1: { _id: "pro1", role: "cliente", personalPlan: "pro" },
  pro2: { _id: "pro2", role: "cliente", personalPlan: "pro" },
  free1: { _id: "free1", role: "cliente", personalPlan: "free" },
  coached1: {
    _id: "coached1",
    role: "cliente",
    personalPlan: "free",
    coachAccess: { status: "active", coachId: "coach-1", servicePackage: "service_pro" },
  },
};

function serviceWith(seed = []) {
  return new ServicioClientCustomFoods({
    model: memoryModel(seed),
    userModel: { obtenerPorId: async (id) => users[id] || null },
  });
}

test("cada cliente ve solo sus alimentos personalizados y Admin ve todos", async () => {
  const service = serviceWith([
    customFoodDocument({ nombre: "Privado uno", unidad: "g", calorias: 100, proteinas: 10, carbohidratos: 5, grasas: 4 }, "pro1"),
    customFoodDocument({ nombre: "Privado dos", unidad: "ml", calorias: 80, proteinas: 4, carbohidratos: 8, grasas: 2 }, "pro2"),
  ]);

  const first = await service.list({ id: "pro1", role: "cliente" });
  const admin = await service.list({ id: "admin1", role: "admin" });
  assert.deepEqual(first.items.map((food) => food.nombre), ["Privado uno"]);
  assert.equal(admin.items.length, 2);
});

test("Pro puede crear datos por 100 y Free queda bloqueado", async () => {
  const service = serviceWith();
  const created = await service.create({ id: "pro1", role: "cliente" }, {
    nombre: "Yogur casero",
    unidad: "g",
    calorias: "91,5",
    proteinas: 8,
    carbohidratos: 7,
    grasas: 3,
  });

  assert.equal(created.ownerId, "pro1");
  assert.equal(created.cantidadBase, 100);
  assert.equal(created.macroBasis, "per100");
  assert.equal(created.calorias, 87);
  assert.equal(created.generation.mode, "EXPLICIT_ONLY");
  await assert.rejects(
    service.create({ id: "free1", role: "cliente" }, { nombre: "No permitido", unidad: "g", calorias: 10, proteinas: 1, carbohidratos: 1, grasas: 0 }),
    (error) => error.code === "CUSTOM_FOOD_PLAN_REQUIRED" && error.status === 403
  );
});

test("un cliente Free con Coach Pro puede crear su biblioteca privada", async () => {
  const service = serviceWith();
  const created = await service.create({ id: "coached1", role: "cliente" }, {
    nombre: "Comida del cliente",
    unidad: "g",
    proteinas: 10,
    carbohidratos: 20,
    grasas: 5,
  });
  assert.equal(created.ownerId, "coached1");
  const access = await service.access({ id: "coached1", role: "cliente" });
  assert.equal(access.canCreate, true);
  assert.equal(access.limit, 30);
});

test("una unidad usa base 1 y calcula kcal exclusivamente desde P/C/G", async () => {
  const service = serviceWith();
  const created = await service.create({ id: "pro1", role: "cliente" }, {
    nombre: "Barrita casera",
    unidad: "unidad",
    calorias: 9999,
    proteinas: 10,
    carbohidratos: 20,
    grasas: 5,
  });
  assert.equal(created.unidadBase, "unidad");
  assert.equal(created.cantidadBase, 1);
  assert.equal(created.macroBasis, "perUnit");
  assert.equal(created.calorias, 165);
});

test("el cupo de cliente Pro se corta exactamente en 30", async () => {
  const seed = Array.from({ length: CLIENT_CUSTOM_FOODS_LIMIT }, (_, index) => (
    customFoodDocument({ nombre: `Alimento ${index}`, unidad: "g", calorias: 100, proteinas: 1, carbohidratos: 1, grasas: 1 }, "pro1")
  ));
  const service = serviceWith(seed);
  await assert.rejects(
    service.create({ id: "pro1", role: "cliente" }, { nombre: "Numero 31", unidad: "g", calorias: 100, proteinas: 1, carbohidratos: 1, grasas: 1 }),
    (error) => error.code === "CUSTOM_FOOD_LIMIT" && error.limit === 30
  );
});

test("un alimento privado no entra como candidato automatico aunque el cliente pueda verlo", async () => {
  const custom = { _id: "custom-1", ...customFoodDocument({ nombre: "Mi mezcla", unidad: "g", calorias: 400, proteinas: 30, carbohidratos: 40, grasas: 12 }, "pro1") };
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [] };
  service.customFoodsService = { visibleFoods: async () => [custom] };

  const result = await service.generarCantidades({
    mode: "full",
    generationType: "completeMeal",
    target: { calorias: 400, proteina: 30, carbohidratos: 40, grasas: 12 },
    candidateFoods: [custom],
  }, null, users.pro1);

  assert.equal((result.foods || []).some((food) => String(food.nombre || food.name) === "Mi mezcla"), false);
});

test("Admin elimina la biblioteca privada antes de borrar al cliente", async () => {
  const service = new ServicioUsuarios();
  const calls = [];
  service.getById = async () => ({ _id: "pro1", role: "cliente" });
  service.clientCustomFoodsModel = {
    deleteByOwner: async (ownerId) => {
      calls.push(`foods:${ownerId}`);
      return { deletedCount: 3 };
    },
  };
  service.model = {
    borrarUsuario: async (id) => {
      calls.push(`user:${id}`);
      return { deletedCount: 1 };
    },
  };

  const result = await service.adminDeleteUser("pro1", "admin1");
  assert.deepEqual(calls, ["foods:pro1", "user:pro1"]);
  assert.equal(result.customFoodsDeleted, 3);
});
