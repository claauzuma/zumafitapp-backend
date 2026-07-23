import assert from "node:assert/strict";
import test from "node:test";

import ServicioMenus from "../servicio/menus.js";
import ServicioNutritionLibrary from "../servicio/nutritionLibrary.js";
import ServicioUsuarios from "../servicio/usuarios.js";
import {
  canUseProfessionalTemplate,
  professionalLibraryCapabilitiesForPlan,
  professionalTemplateSource,
  resolveProfessionalLibraryCapabilities,
} from "../servicio/professionalLibraryCapabilities.js";

const COACH_ID = "64b000000000000000000001";
const OTHER_COACH_ID = "64b000000000000000000002";
const CLIENT_ID = "64b000000000000000000003";
const MENU_ID = "64b000000000000000000004";

function coach(plan, features) {
  return {
    _id: COACH_ID,
    id: COACH_ID,
    role: "coach",
    plan,
    coachSubscription: { plan, status: "active" },
    coachProfile: { specialties: { nutrition: true, training: false } },
    effectiveCapabilities: {
      features: { menus: features },
    },
  };
}

const initialFeatures = professionalLibraryCapabilitiesForPlan("coach_initial");
const proFeatures = professionalLibraryCapabilitiesForPlan("coach_pro");
const aiFeatures = professionalLibraryCapabilitiesForPlan("coach_ai");

function globalMenu({ tier = "global_pro" } = {}) {
  return {
    _id: MENU_ID,
    ownerType: "admin",
    ownerId: null,
    sourceType: tier === "global_premium" ? "admin_premium" : "admin_global",
    templateTier: tier,
    planMinimo: tier === "global_premium" ? "vip" : tier === "global_pro" ? "pro" : "free",
    estado: "activo",
    visibilidad: "sistema",
    nombre: "Menu global real",
    descripcion: "Snapshot de prueba",
    kcalObjetivo: 2100,
    macrosObjetivo: { proteina: 150, carbs: 220, grasas: 65 },
    comidas: [
      {
        id: "meal-1",
        nombre: "Almuerzo real",
        tipoComida: "almuerzo",
        items: [{ nombreSnapshot: "Arroz", cantidad: 100, unidad: "g", kcal: 130 }],
      },
    ],
  };
}

test("capabilities profesionales son explicitas y fail-closed", () => {
  assert.equal(initialFeatures.canCreateCoachMenus, true);
  assert.equal(initialFeatures.canUseGlobalMenuTemplates, false);
  assert.equal(initialFeatures.canAssignGlobalTemplates, false);

  assert.equal(proFeatures.canUseGlobalMenuTemplates, true);
  assert.equal(proFeatures.canUsePremiumMenuTemplates, false);
  assert.equal(proFeatures.canDuplicateGlobalTemplates, true);

  assert.equal(aiFeatures.canUsePremiumMenuTemplates, true);
  assert.equal(aiFeatures.canUsePremiumMealTemplates, true);

  const missing = resolveProfessionalLibraryCapabilities(coach("coach_pro", {}));
  assert.equal(missing.canUseGlobalMenuTemplates, false);
  assert.equal(missing.canAssignGlobalTemplates, false);
});

test("fuentes globales y premium respetan el plan profesional", () => {
  const pro = coach("coach_pro", proFeatures);
  const ai = coach("coach_ai", aiFeatures);
  const basic = globalMenu({ tier: "global_pro" });
  const premium = globalMenu({ tier: "global_premium" });

  assert.equal(professionalTemplateSource(basic), "admin_global");
  assert.equal(professionalTemplateSource(premium), "admin_premium");
  assert.equal(canUseProfessionalTemplate(pro, basic, "menu"), true);
  assert.equal(canUseProfessionalTemplate(pro, premium, "menu"), false);
  assert.equal(canUseProfessionalTemplate(ai, premium, "menu"), true);
});

test("coach_initial solo lista menus propios y el endpoint global queda bloqueado", async () => {
  const service = new ServicioMenus();
  const actor = coach("coach_initial", initialFeatures);
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: actor.effectiveCapabilities });
  let receivedVisibilityQuery = null;
  service.menusModel = {
    ownerOnlyForCoach: (id) => ({ ownerType: "coach", ownerId: id }),
    adminTemplatesForCoach: () => ({ ownerType: "admin" }),
    listBase: async (filters) => {
      receivedVisibilityQuery = filters.visibilityQuery;
      return { items: [], total: 0 };
    },
  };

  await service.listMenus({ id: COACH_ID }, { scope: "mine" });
  assert.deepEqual(receivedVisibilityQuery, { ownerType: "coach", ownerId: COACH_ID });

  await assert.rejects(
    service.listMenus({ id: COACH_ID }, { scope: "global" }),
    /COACH_FEATURE_NOT_ALLOWED/
  );
});

test("coach_pro lista la biblioteca global sin obtener permisos de edicion", async () => {
  const service = new ServicioMenus();
  const actor = coach("coach_pro", proFeatures);
  const menu = globalMenu();
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: actor.effectiveCapabilities });
  service.menusModel = {
    ownerOnlyForCoach: () => ({ ownerType: "coach" }),
    adminTemplatesForCoach: ({ premium }) => ({ ownerType: "admin", premium }),
    listBase: async ({ visibilityQuery }) => ({ items: visibilityQuery.ownerType === "admin" ? [menu] : [], total: 1 }),
  };

  const result = await service.listMenus({ id: COACH_ID }, { scope: "global" });
  assert.equal(result.menus.length, 1);
  assert.equal(result.menus[0].sourceType, "admin_global");
  assert.equal(service._canEditOwnedBase(actor, menu), false);
});

test("duplicar una plantilla admin por endpoint exige capability global", async () => {
  const menu = globalMenu();
  const service = new ServicioMenus();
  let created = null;
  service.menusModel = {
    getBaseById: async () => menu,
    createBase: async (doc) => {
      created = structuredClone({ ...doc, _id: "copy-1" });
      return created;
    },
  };

  const initial = coach("coach_initial", initialFeatures);
  service._actor = async () => initial;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: initial.effectiveCapabilities });
  await assert.rejects(
    service.duplicateMenu(initial, MENU_ID, { nombre: "Copia inicial" }),
    /FORBIDDEN|COACH_FEATURE_NOT_ALLOWED/
  );

  const pro = coach("coach_pro", proFeatures);
  service._actor = async () => pro;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: pro.effectiveCapabilities });
  const copied = await service.duplicateMenu(pro, MENU_ID, { nombre: "Copia Pro" });
  assert.equal(copied.ownerType, "coach");
  assert.equal(copied.sourceType, "coach_owned");
  assert.equal(copied.templateTier, null);
  assert.equal(created.nombre, "Copia Pro");
  assert.equal(menu.nombre, "Menu global real");
});

test("asignar menu global crea un snapshot independiente y no muta el original", async () => {
  const service = new ServicioNutritionLibrary();
  const actor = coach("coach_pro", proFeatures);
  const original = globalMenu();
  const createdSnapshots = [];
  const updatedClients = [];
  service._actor = async () => actor;
  service.menusModel = {
    getBaseById: async (id) => id === MENU_ID ? original : null,
    getAssignedById: async () => null,
    pauseActiveForClient: async () => ({ modifiedCount: 0 }),
    createAssigned: async (doc) => {
      const stored = structuredClone({ ...doc, _id: `snapshot-${createdSnapshots.length + 1}` });
      createdSnapshots.push(stored);
      return stored;
    },
  };
  service.usuariosModel = {
    obtenerPorId: async () => ({
      _id: CLIENT_ID,
      role: "cliente",
      coach: { entrenadorId: COACH_ID },
      menu: { activeSource: "own", activeOwnMenuId: "own-menu" },
    }),
    updateById: async (id, patch) => {
      updatedClients.push({ id, patch });
      return patch;
    },
  };

  const result = await service.assignMenuToClients(actor, MENU_ID, [CLIENT_ID]);
  assert.equal(result.assignmentSnapshots.length, 1);
  assert.equal(createdSnapshots[0].sourceType, "assigned_snapshot");
  assert.equal(createdSnapshots[0].immutableSnapshot, true);
  assert.equal(createdSnapshots[0].comidas[0].items[0].nombreSnapshot, "Arroz");
  assert.equal(original.sourceType, "admin_global");
  assert.equal(original.immutableSnapshot, undefined);
  assert.equal(updatedClients[0].patch.menu.activeSource, "coach");

  original.comidas[0].items[0].nombreSnapshot = "Arroz modificado";
  assert.equal(createdSnapshots[0].comidas[0].items[0].nombreSnapshot, "Arroz");
});

test("asignar comida crea snapshot separado sin consumir ni modificar la plantilla", async () => {
  const service = new ServicioNutritionLibrary();
  const actor = coach("coach_pro", proFeatures);
  const original = {
    _id: MENU_ID,
    ownerType: "admin",
    sourceType: "admin_global",
    templateTier: "global_pro",
    planMinimo: "pro",
    visibilidad: "global",
    estado: "activo",
    activo: true,
    nombre: "Desayuno global",
    items: [{ nombre: "Avena", cantidad: 60, unidad: "g", kcal: 220 }],
  };
  const snapshots = [];
  service._actor = async () => actor;
  service.comidasModel = {
    getById: async () => original,
    create: async (doc) => {
      const stored = structuredClone({ ...doc, _id: `meal-snapshot-${snapshots.length + 1}` });
      snapshots.push(stored);
      return stored;
    },
  };
  service.usuariosModel = {
    obtenerPorId: async () => ({ _id: CLIENT_ID, role: "cliente", coach: { entrenadorId: COACH_ID } }),
  };

  await service.assignMealToClients(actor, MENU_ID, [CLIENT_ID]);
  assert.equal(snapshots[0].sourceType, "assigned_snapshot");
  assert.equal(snapshots[0].immutableSnapshot, true);
  original.items[0].nombre = "Avena editada";
  assert.equal(snapshots[0].items[0].nombre, "Avena");
});

test("asignacion semanal reconstruye el snapshot desde backend y bloquea globales sin capability", async () => {
  const service = new ServicioUsuarios();
  const original = globalMenu();
  service.menusModel = { getBaseById: async () => original };
  const forgedPayload = {
    monday: {
      menuId: MENU_ID,
      menuSnapshot: { id: MENU_ID, name: "Menu falsificado", meals: [] },
    },
  };

  await assert.rejects(
    service._validatedCoachAssignedMenusByDay(coach("coach_initial", initialFeatures), forgedPayload),
    /FORBIDDEN/
  );

  const validated = await service._validatedCoachAssignedMenusByDay(coach("coach_pro", proFeatures), forgedPayload);
  assert.equal(validated.monday.menuSnapshot.name, "Menu global real");
  assert.equal(validated.monday.menuSnapshot.meals[0].nombre, "Almuerzo real");
  assert.equal(validated.monday.source, "admin_global");
});

test("un coach no puede asignar la plantilla privada de otro coach", async () => {
  const service = new ServicioUsuarios();
  service.menusModel = {
    getBaseById: async () => ({
      ...globalMenu(),
      ownerType: "coach",
      ownerId: OTHER_COACH_ID,
      sourceType: "coach_owned",
      visibilidad: "privada",
    }),
  };

  await assert.rejects(
    service._validatedCoachAssignedMenusByDay(coach("coach_pro", proFeatures), {
      tuesday: { menuId: MENU_ID, menuSnapshot: { id: MENU_ID, name: "Ajeno" } },
    }),
    /FORBIDDEN/
  );
});
