import ServicioAlimentos from "../../servicio/alimentos.js";

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};

function food(id, alimentoId, nombre, unidad, kcal, proteina, carbs, grasas, min, max, step, categoria) {
  return {
    _id: id,
    alimentoId,
    nombre,
    Alimentos: nombre,
    unidad,
    Unidad: unidad,
    unidadBase: unidad,
    macroBasis: "perUnit",
    cantidadUnidad: 1,
    kcalUnidad: kcal,
    proteinaUnidad: proteina,
    carbohidratosUnidad: carbs,
    grasasUnidad: grasas,
    porcionMin: min,
    porcionMax: max,
    porcionSugerida: min,
    multiplo: step,
    categoria,
    activo: true,
  };
}

export const ADMIN_COACH_FOODS = Object.freeze({
  oil: food("6619bfeb147cd50b64677677", 2, "Aceite de oliva", "Grs", 8.991, 0, 0, 0.999, 5, 30, 5, "Grasas"),
  almonds: food("6619bfeb147cd50b64677696", 34, "Almendras", "Unid", 7.15, 0.26, 0.155, 0.61, 1, 3, 1, "Grasas"),
  rice: food("6619bfeb147cd50b6467769c", 39, "Arroz", "Grs", 3.385, 0.08, 0.755, 0.005, 30, 120, 5, "Carbohidratos"),
  cookedRice: food("6619bfeb147cd50b646776a0", 43, "Arroz integral (Cocido)", "Grs", 1.105, 0.026, 0.23, 0.009, 80, 350, 10, "Carbohidratos"),
  oats: food("6619bfeb147cd50b646776a6", 49, "Avena instantanea", "Grs", 3.52, 0.13, 0.57, 0.08, 30, 120, 5, "Carbohidratos"),
  bananaGrams: food("6619bfeb147cd50b646776a8", 51, "Banana", "Grs", 0.891, 0.011, 0.205, 0.003, 80, 250, 10, "Frutas"),
  bananaSmall: food("6619bfeb147cd50b646776a9", 52, "Banana chica", "Unid", 90.17, 1.1, 20.7, 0.33, 1, 3, 1, "Frutas"),
  bananaMedium: food("6619bfeb147cd50b646776ab", 54, "Banana mediana", "Unid", 105.87, 1.29, 24.3, 0.39, 1, 3, 1, "Frutas"),
  whites: food("6619bfeb147cd50b646776e8", 115, "Claras de huevos", "Unid", 15.7, 3.5, 0.2, 0.1, 1, 8, 1, "Proteinas"),
  pasta: food("6619bfeb147cd50b64677717", 162, "Fideos", "Grs", 3.382, 0.113, 0.71, 0.01, 30, 120, 5, "Carbohidratos"),
  cookedPasta: food("6619bfeb147cd50b64677718", 163, "Fideos (Cocidos)", "Grs", 1.573, 0.058, 0.315, 0.009, 80, 350, 10, "Carbohidratos"),
  filet: food("6619bfeb147cd50b6467771a", 165, "Filet de merluza", "Unid", 1.29, 0.21, 0, 0.05, 1, 3, 1, "Proteinas"),
  oatCookies: food("6619bfeb147cd50b64677731", 188, "Galletitas de avena carrefour", "Unid", 58.509, 0.924, 8.58, 2.277, 1, 3, 1, "Snacks"),
  eggs: food("6619bfeb147cd50b64677755", 224, "Huevos", "Unid", 69, 6, 0, 5, 1, 4, 1, "Grasas"),
  hamSlices: food("6619bfeb147cd50b64677757", 226, "Jamon cagnoli", "Fetas", 23.5, 3.4, 0, 1.1, 1, 6, 1, "Fiambres"),
  ham: food("6619bfeb147cd50b64677758", 228, "Jamon cocido", "Grs", 1.037, 0.18, 0.005, 0.033, 80, 250, 10, "Proteinas"),
  almondMilk: food("6619bfeb147cd50b64677769", 244, "Leche de almendras", "Grs", 0.2375, 0.004, 0.034, 0.0095, 100, 300, 25, "Lacteos"),
  peanuts: food("6619bfeb147cd50b6467778f", 282, "Mani", "Grs", 5.968, 0.28, 0.042, 0.52, 5, 30, 5, "Grasas"),
  peanutButter: food("6619bfeb147cd50b64677793", 286, "Mantequilla de mani", "Grs", 5.9, 0.25, 0.1, 0.5, 5, 30, 5, "Grasas"),
  hakeMedallions: food("6619bfeb147cd50b6467779e", 297, "Medallones de merluza", "Grs", 0.807, 0.158, 0.01, 0.015, 80, 250, 10, "Proteinas"),
  hake: food("6619bfeb147cd50b646777a3", 304, "Merluza", "Grs", 1.245, 0.21, 0, 0.045, 80, 250, 10, "Proteinas"),
  nuggets: food("6619bfeb147cd50b646777d4", 351, "Nuggets de pollo fritas (Granja del sol)", "Unid", 62.416, 3.154, 3.486, 3.984, 1, 3, 1, "Grasas"),
  gnocchi: food("6619bfeb147cd50b646777d6", 353, "Noquis con papa", "Grs", 2.185, 0.059, 0.44, 0.021, 80, 350, 10, "Carbohidratos"),
  avocado: food("6619bfeb147cd50b646777de", 361, "Palta", "Grs", 1.598, 0.02, 0.042, 0.15, 5, 30, 5, "Grasas"),
  bread: food("6619bfeb147cd50b646777ee", 377, "Pan lactal", "Reb", 61.75, 2.65, 12, 0.35, 1, 4, 1, "Carbohidratos"),
  potatoes: food("6619bfeb147cd50b646777fc", 391, "Papas", "Grs", 0.963, 0.017, 0.19, 0.015, 80, 350, 10, "Carbohidratos"),
  chicken: food("6619bfeb147cd50b64677809", 404, "Pechuga de pollo", "Grs", 1.105, 0.22, 0, 0.025, 80, 250, 10, "Proteinas"),
  rhodesia: food("6619bfeb147cd50b64677869", 495, "Rhodesia", "Unid", 1.152888889, 0.01044444444, 0.1377777778, 0.06222222222, 1, 3, 1, "Snacks"),
  riceToastUnit: food("6619bfeb147cd50b646778c0", 578, "Tostaditas de arroz sin sal", "Unid", 3.6696, 0.0264, 0.891, 0, 1, 3, 1, "Carbohidratos"),
  riceToastGrams: food("6619bfeb147cd50b646778c1", 579, "Tostaditas de arroz sin sal", "Grs", 3.6696, 0.0264, 0.891, 0, 30, 120, 5, "Carbohidratos"),
  yogurtPot: food("6619bfeb147cd50b646778cf", 593, "Yogurisimo firme la serenisima (190 grs)", "Pote", 150.6, 7.1, 22, 3.8, 1, 2, 1, "Carbohidratos"),
  yogurt: food("6619bfeb147cd50b646778d2", 596, "Yogurt bebible vida light", "Grs", 0.304, 0.029, 0.047, 0, 10, 200, 5, "Otros"),
});

const legacyAlmonds = {
  _id: "6619bfeb147cd50b64677697",
  Alimentos: "Almendras",
  Unidad: "Unid",
  Calorias: 7.15,
  Proteinas: 0.26,
  Carbohidratos: 0.155,
  Grasas: 0.61,
};

const legacyHake = (id) => ({
  _id: id,
  Alimentos: "Merluza",
  Unidad: "Grs",
  Calorias: 1.245,
  Proteinas: 0.21,
  Carbohidratos: 0,
  Grasas: 0.045,
});

export const ADMIN_COACH_FIXTURES = Object.freeze([
  { id: "N01", flow: "Admin", label: "normal pollo/arroz/aceite", foods: ["chicken", "rice", "oil"], target: [500, 35, 55, 15] },
  { id: "N02", flow: "Coach", label: "normal merluza/arroz cocido/palta", foods: ["hake", "cookedRice", "avocado"], target: [450, 35, 50, 12] },
  { id: "N03", flow: "Admin", label: "normal jamon/papas/aceite", foods: ["ham", "potatoes", "oil"], target: [400, 30, 45, 12] },
  { id: "N04", flow: "Coach", label: "normal medallon/fideos/mani", foods: ["hakeMedallions", "pasta", "peanuts"], target: [520, 35, 60, 14] },
  { id: "N05", flow: "Admin", label: "normal pollo/noquis/palta", foods: ["chicken", "gnocchi", "avocado"], target: [600, 42, 72, 15] },
  { id: "U01", flow: "Coach", label: "unidades huevo/pan", foods: ["eggs", "bread"], target: [350, 20, 30, 14] },
  { id: "U02", flow: "Admin", label: "unidades claras/banana", foods: ["whites", "bananaMedium"], target: [300, 22, 45, 5] },
  { id: "U03", flow: "Coach", label: "fetas/rebanadas", foods: ["hamSlices", "bread"], target: [300, 20, 35, 8] },
  { id: "U04", flow: "Admin", label: "pote/fruta/almendras", foods: ["yogurtPot", "bananaSmall", "almonds"], target: [450, 20, 60, 12] },
  { id: "U05", flow: "Coach", label: "unidades snacks incompletos", foods: ["nuggets", "oatCookies"], target: [500, 45, 55, 12] },
  { id: "G01", flow: "Admin", label: "solo pollo por gramos", foods: ["chicken"], target: [250, 40, 0, 0] },
  { id: "G02", flow: "Coach", label: "solo arroz por gramos", foods: ["rice"], target: [350, 30, 70, 5] },
  { id: "G03", flow: "Admin", label: "solo aceite por gramos", foods: ["oil"], target: [100, 20, 5, 10] },
  { id: "S01", flow: "Coach", label: "steps 10/5/5", foods: ["bananaGrams", "oats", "peanutButter"], target: [500, 20, 75, 16] },
  { id: "S02", flow: "Admin", label: "steps 25/5", foods: ["almondMilk", "yogurt"], target: [180, 12, 25, 5] },
  { id: "S03", flow: "Coach", label: "steps 10/10", foods: ["cookedRice", "gnocchi"], target: [550, 20, 100, 8] },
  { id: "H01", flow: "Admin", label: "homonimo almendras canonical/legacy", foods: ["rice", "almonds"], target: [356, 0, 19.3, 41], extraCatalog: [legacyAlmonds] },
  { id: "H02", flow: "Coach", label: "homonimo merluza canonical/legacy", foods: ["hake", "cookedPasta"], target: [450, 35, 50, 10], extraCatalog: [legacyHake("6619bfeb147cd50b646777a4"), legacyHake("6619bfeb147cd50b646777a5")] },
  { id: "R01", flow: "Admin", label: "maximo restrictivo arroz/almendras", foods: ["rice", "almonds"], target: [356, 0, 19.3, 41] },
  { id: "R02", flow: "Coach", label: "maximo restrictivo filet por unidad", foods: ["filet"], target: [300, 35, 10, 8] },
  { id: "X01", flow: "Admin", label: "combinacion absurda Rhodesia/aceite", foods: ["rhodesia", "oil"], target: [350, 30, 40, 12] },
  { id: "X02", flow: "Coach", label: "homonimo mismo nombre distinta unidad", foods: ["riceToastUnit"], target: [120, 5, 25, 2], extraCatalog: [ADMIN_COACH_FOODS.riceToastGrams] },
  { id: "F01", flow: "Admin", label: "pollo fijo, arroz/aceite auto", foods: ["rice", "oil"], fixed: { chicken: 120 }, target: [500, 35, 55, 15] },
  { id: "F02", flow: "Coach", label: "huevos fijos, pan/banana auto", foods: ["bread", "bananaSmall"], fixed: { eggs: 2 }, target: [500, 25, 65, 18] },
]);

// Capturados ejecutando exactamente menu2.js y servicio/alimentos.js de HEAD
// antes de esta correccion. Se guardan como snapshots para que la regresion no
// dependa de .git ni de evaluacion dinamica en CI.
const BASELINE_RESULTS = Object.freeze({
  N01: { status: "ok", foods: [["chicken", 143, 400], ["rice", 64, 300], ["oil", 14, 25]], totals: [500.9, 35, 51.2, 14] },
  N02: { status: "ok", foods: [["hake", 175, 400], ["cookedRice", 144, 300], ["avocado", 51, 250]], totals: [450, 35, 28.8, 10.2] },
  N03: { status: "ok", foods: [["ham", 150, 400], ["potatoes", 160, 300], ["oil", 10, 25]], totals: [400, 30, 32, 10] },
  N04: { status: "ok", foods: [["hakeMedallions", 92, 400], ["pasta", 82, 300], ["peanuts", 28, 40]], totals: [520.4, 35, 57.4, 14] },
  N05: { status: "ok", foods: [["chicken", 132, 400], ["gnocchi", 156, 300], ["avocado", 70, 250]], totals: [600.4, 42, 62.4, 14] },
  U01: { status: "warning", foods: [["bread", 3, 12], ["eggs", 2, 12]], totals: [323.4, 20.1, 36, 11.2] },
  U02: { status: "ok", foods: [["whites", 6, 12], ["bananaMedium", 2, 12]], totals: [306, 23.6, 49.8, 1.4] },
  U03: { status: "warning", foods: [["hamSlices", 3, 12], ["bread", 4, 12]], totals: [317.7, 21, 48, 4.9] },
  U04: { status: "warning", foods: [["yogurtPot", 2, 12], ["bananaSmall", 2, 12], ["almonds", 1, 12]], totals: [488.8, 16.7, 85.6, 8.8] },
  U05: { status: "warning", foods: [["oatCookies", 1, 12], ["nuggets", 7, 12]], totals: [495.3, 23.3, 33.1, 30.3] },
  G01: { status: "ok", foods: [["chicken", 227, 400]], totals: [249.7, 45.4, 0, 0] },
  G02: { status: "warning", foods: [["rice", 103, 300]], totals: [350.2, 10.3, 82.4, 0] },
  G03: { status: "warning", foods: [["oil", 11, 25]], totals: [99, 0, 0, 11] },
  S01: { status: "ok", foods: [["bananaGrams", 50, 250], ["oats", 65, 300], ["peanutButter", 39, 40]], totals: [502.6, 18.2, 52.9, 26] },
  S02: { status: "warning", foods: [["yogurt", 400, 400], ["almondMilk", 40, 40]], totals: [128, 0, 0, 0] },
  S03: { status: "ok", foods: [["cookedRice", 100, 300], ["gnocchi", 200, 300]], totals: [550, 20, 100, 0] },
  H01: { status: "ok", foods: [["rice", 96, 300], ["almonds", 4, 12]], totals: [355.2, 10.8, 77.6, 2.4] },
  H02: { status: "ok", foods: [["hake", 63, 400], ["cookedPasta", 234, 300]], totals: [450, 36, 70.2, 0] },
  R01: { status: "ok", foods: [["rice", 96, 300], ["almonds", 4, 12]], totals: [355.2, 10.8, 77.6, 2.4] },
  R02: { status: "warning", foods: [["filet", 12, 12]], totals: [15.6, 2.4, 0, 1.2] },
  X01: { status: "warning", foods: [["rhodesia", 12, 12], ["oil", 25, 25]], totals: [239.4, 0, 1.2, 26.2] },
  X02: { status: "warning", foods: [["riceToastUnit", 12, 12]], totals: [44.4, 0, 10.8, 0] },
  F01: { status: "warning", foods: [["chicken", 120, 400], ["rice", 77, 300], ["oil", 12, 25]], totals: [501.8, 31.7, 61.6, 12] },
  F02: { status: "warning", foods: [["eggs", 2, 12], ["bread", 5, 12], ["bananaSmall", 1, 12]], totals: [537.2, 26.6, 80.7, 12.3] },
});

function requestUnit(catalogFood, preserveGrs = false) {
  if (catalogFood.unidad === "Grs") return preserveGrs ? "Grs" : "g";
  return catalogFood.unidad;
}

function macroValue(catalogFood, key, precision) {
  const value = catalogFood[key];
  return precision === "legacy-one-decimal" ? Math.round(value * 10) / 10 : value;
}

function pendingFood(catalogFood, precision, preserveGrs = false) {
  return {
    foodId: catalogFood._id,
    name: catalogFood.nombre,
    unit: requestUnit(catalogFood, preserveGrs),
    source: "pending",
    currentQuantity: null,
    kcalPerUnitOrGram: macroValue(catalogFood, "kcalUnidad", precision),
    proteinPerUnitOrGram: macroValue(catalogFood, "proteinaUnidad", precision),
    carbsPerUnitOrGram: macroValue(catalogFood, "carbohidratosUnidad", precision),
    fatPerUnitOrGram: macroValue(catalogFood, "grasasUnidad", precision),
    categoria: catalogFood.categoria,
  };
}

function fixedFood(catalogFood, quantity, precision) {
  return {
    foodId: catalogFood._id,
    name: catalogFood.nombre,
    unit: requestUnit(catalogFood),
    quantity,
    kcal: round(macroValue(catalogFood, "kcalUnidad", precision) * quantity, 4),
    protein: round(macroValue(catalogFood, "proteinaUnidad", precision) * quantity, 4),
    carbs: round(macroValue(catalogFood, "carbohidratosUnidad", precision) * quantity, 4),
    fat: round(macroValue(catalogFood, "grasasUnidad", precision) * quantity, 4),
    source: "manual",
  };
}

export function fixturePayload(fixture, precision = "exact", options = {}) {
  const target = fixture.target;
  const fixedEntries = Object.entries(fixture.fixed || {});
  return {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: target[0], proteina: target[1], carbs: target[2], grasas: target[3] },
    fixedFoods: fixedEntries.map(([key, quantity]) => fixedFood(ADMIN_COACH_FOODS[key], quantity, precision)),
    pendingFoods: fixture.foods.map((key) => pendingFood(ADMIN_COACH_FOODS[key], precision, options.preserveGrs === true)),
    options: { redondear: true, usarMinMax: true },
  };
}

function catalogForFixture(fixture) {
  return [
    ...Object.values(ADMIN_COACH_FOODS),
    ...(fixture.extraCatalog || []),
  ];
}

function compact(result) {
  return {
    status: result.status,
    quality: result.quality,
    message: result.message,
    foods: result.foods.map((item) => ({
      id: item.foodId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      max: item.maxGramos,
    })),
    totals: result.totals,
    diff: result.diff,
    optimization: result.optimization,
  };
}

function capturedBaseline(fixture) {
  const snapshot = BASELINE_RESULTS[fixture.id];
  if (!snapshot) throw new Error(`Falta baseline para ${fixture.id}`);
  const [calorias, proteina, carbohidratos, grasas] = snapshot.totals;
  return {
    status: snapshot.status,
    quality: null,
    message: "",
    foods: snapshot.foods.map(([key, quantity, max]) => {
      const catalogFood = ADMIN_COACH_FOODS[key];
      return {
        id: null,
        name: catalogFood.nombre,
        quantity,
        unit: requestUnit(catalogFood),
        max,
      };
    }),
    totals: { calorias, proteina, carbohidratos, grasas },
    diff: {
      calorias: round(calorias - fixture.target[0]),
      proteina: round(proteina - fixture.target[1]),
      carbohidratos: round(carbohidratos - fixture.target[2]),
      grasas: round(grasas - fixture.target[3]),
    },
    optimization: null,
  };
}

export async function runAdminCoachImpactMatrix() {
  const currentService = new ServicioAlimentos("TEST");
  const rows = [];
  for (const fixture of ADMIN_COACH_FIXTURES) {
    const catalog = catalogForFixture(fixture);
    currentService.model = { obtenerAlimentos: async () => catalog };
    const before = capturedBaseline(fixture);
    const currentLegacyInput = await currentService.generarCantidades(
      fixturePayload(fixture, "legacy-one-decimal")
    );
    const current = await currentService.generarCantidades(fixturePayload(fixture, "exact"));
    rows.push({
      ...fixture,
      before,
      currentLegacyInput: compact(currentLegacyInput),
      current: compact(current),
      delta: {
        kcal: round(current.totals.calorias - before.totals.calorias),
        protein: round(current.totals.proteina - before.totals.proteina),
        carbs: round(current.totals.carbohidratos - before.totals.carbohidratos),
        fat: round(current.totals.grasas - before.totals.grasas),
      },
    });
  }
  return rows;
}
