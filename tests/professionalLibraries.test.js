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
const ASSIGNED_MENU_ID = "64b000000000000000000005";

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

test("coach VIP puede listar juntos sus menus y las plantillas admin permitidas", async () => {
  const service = new ServicioMenus();
  const actor = coach("coach_ai", aiFeatures);
  const ownMenu = {
    ...globalMenu(),
    _id: OTHER_COACH_ID,
    ownerType: "coach",
    ownerId: COACH_ID,
    sourceType: "coach_owned",
    visibilidad: "privada",
  };
  const adminMenu = globalMenu({ tier: "global_premium" });
  let receivedVisibilityQuery = null;
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: actor.effectiveCapabilities });
  service.menusModel = {
    ownerOnlyForCoach: (id) => ({ ownerType: "coach", ownerId: id }),
    adminTemplatesForCoach: ({ premium }) => ({ ownerType: "admin", premium }),
    listBase: async ({ visibilityQuery }) => {
      receivedVisibilityQuery = visibilityQuery;
      return { items: [ownMenu, adminMenu], total: 2 };
    },
  };

  const result = await service.listMenus({ id: COACH_ID }, { scope: "all" });

  assert.equal(result.scope, "all");
  assert.equal(result.total, 2);
  assert.deepEqual(receivedVisibilityQuery, {
    $or: [
      { ownerType: "coach", ownerId: COACH_ID },
      { ownerType: "admin", premium: true },
    ],
  });
  assert.deepEqual(result.menus.map((menu) => menu.ownerType), ["coach", "admin"]);
});

test("alcance combinado permanece bloqueado sin capability de biblioteca global", async () => {
  const service = new ServicioMenus();
  const actor = coach("coach_initial", initialFeatures);
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: actor.effectiveCapabilities });
  service.menusModel = {
    ownerOnlyForCoach: () => ({ ownerType: "coach" }),
    adminTemplatesForCoach: () => ({ ownerType: "admin" }),
    listBase: async () => ({ items: [], total: 0 }),
  };

  await assert.rejects(
    service.listMenus({ id: COACH_ID }, { scope: "all" }),
    /COACH_FEATURE_NOT_ALLOWED/
  );
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

test("una alternativa conserva como principal la copia activa historica del mismo coach y cliente", async () => {
  const service = new ServicioUsuarios();
  const legacyAssigned = {
    _id: ASSIGNED_MENU_ID,
    clienteId: CLIENT_ID,
    coachId: COACH_ID,
    estado: "activo",
    activa: true,
    nombre: "Volumen limpio 2200 - copia",
    kcalObjetivo: 2523,
    macrosObjetivo: { proteina: 180, carbs: 306, grasas: 49 },
    comidas: [
      {
        id: "legacy-meal-1",
        nombre: "Desayuno",
        tipoComida: "desayuno",
        items: [{ nombreSnapshot: "Avena", cantidad: 60, unidad: "g", kcal: 220 }],
      },
    ],
  };
  service.menusModel = {
    getBaseById: async (id) => id === MENU_ID ? globalMenu() : null,
    getAssignedById: async (id) => id === ASSIGNED_MENU_ID ? legacyAssigned : null,
  };

  const validated = await service._validatedCoachAssignedMenusByDay(
    coach("coach_pro", proFeatures),
    {
      monday: {
        primaryMenu: {
          menuId: ASSIGNED_MENU_ID,
          menuSnapshot: { id: ASSIGNED_MENU_ID, name: "Texto del cliente no confiable" },
        },
        alternatives: [{ menuId: MENU_ID, menuSnapshot: { id: MENU_ID, name: "Alternativa falsa" } }],
      },
    },
    { _id: CLIENT_ID, id: CLIENT_ID }
  );

  assert.equal(validated.monday.primaryMenu.menuId, ASSIGNED_MENU_ID);
  assert.equal(validated.monday.primaryMenu.menuSnapshot.name, "Volumen limpio 2200 - copia");
  assert.equal(validated.monday.primaryMenu.source, "coach_assigned_legacy");
  assert.equal(validated.monday.alternatives.length, 1);
  assert.equal(validated.monday.alternatives[0].menuSnapshot.name, "Menu global real");
});

test("una copia historica de otro cliente no puede reutilizarse como principal", async () => {
  const service = new ServicioUsuarios();
  service.menusModel = {
    getBaseById: async () => null,
    getAssignedById: async () => ({
      _id: ASSIGNED_MENU_ID,
      clienteId: OTHER_COACH_ID,
      coachId: COACH_ID,
      estado: "activo",
      activa: true,
      nombre: "Copia ajena",
      comidas: [{ nombre: "Almuerzo", items: [{ nombreSnapshot: "Arroz", cantidad: 100, unidad: "g" }] }],
    }),
  };

  await assert.rejects(
    service._validatedCoachAssignedMenusByDay(
      coach("coach_pro", proFeatures),
      { monday: { menuId: ASSIGNED_MENU_ID, menuSnapshot: { id: ASSIGNED_MENU_ID, name: "Copia ajena" } } },
      { _id: CLIENT_ID, id: CLIENT_ID }
    ),
    /FORBIDDEN/
  );
});
