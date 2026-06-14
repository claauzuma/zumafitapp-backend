import ModelFactory from "../model/DAO/alimentosFactory.js";
import menu from "../menu2.js";

const round = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function foodSearchText(food = {}) {
  return cleanText([
    food.Alimentos,
    food.alimentos,
    food.nombre,
    food.name,
    food.Fuente,
    food.fuente,
    food.Categoria,
    food.categoria,
    food.Categoría,
    food.grupo,
    food.Grupo,
  ].filter(Boolean).join(" "));
}

function foodNameText(food = {}) {
  return cleanText(food.Alimentos || food.alimentos || food.nombre || food.name || "");
}

function foodCategoryText(food = {}) {
  return cleanText(food.Fuente || food.fuente || food.Categoria || food.categoria || food.Categoría || food.grupo || food.Grupo || "");
}

function extendedFoodSearchText(food = {}) {
  return cleanText([
    foodSearchText(food),
    food.categoriaZumaFit,
    food.subcategoria,
    food.subcategoriaZumaFit,
    food.grupoOriginal,
    ...(Array.isArray(food.tags) ? food.tags : []),
    food.imagen?.exactaKey,
    food.imagen?.genericaKey,
    food.imagenExactaKey,
    food.imagenGenericaKey,
  ].filter(Boolean).join(" "));
}

function extendedFoodCategoryText(food = {}) {
  return cleanText(
    foodCategoryText(food) ||
    food.categoriaZumaFit ||
    food.grupoOriginal ||
    ""
  );
}

function searchScore(food = {}, search = "", index = 0) {
  const name = foodNameText(food);
  const text = foodSearchText(food);
  if (name === search) return -4000 + index;
  if (name.startsWith(search)) return -3000 + index;
  if (name.includes(search)) return -2000 + index;
  if (text.includes(search)) return -1000 + index;
  return index;
}

function limitFromQuery(value, fallback = 0) {
  const parsed = Math.trunc(toNumber(value, fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function filterAlimentos(alimentos = [], filters = {}) {
  const search = cleanText(filters.search || filters.q || filters.nombre || filters.name || "");
  const category = cleanText(filters.category || filters.categoria || filters.fuente || "todos");
  const limit = limitFromQuery(filters.limit, search ? 20 : 0);
  let list = Array.isArray(alimentos) ? [...alimentos] : [];

  if (search) {
    list = list
      .map((food, index) => ({ food, index, text: extendedFoodSearchText(food) }))
      .filter((item) => item.text.includes(search))
      .sort((a, b) => searchScore(a.food, search, a.index) - searchScore(b.food, search, b.index))
      .map((item) => item.food);
  }

  if (category && category !== "todos") {
    list = list.filter((food) => extendedFoodCategoryText(food) === category);
  }

  return limit ? list.slice(0, limit) : list;
}

function normalizeMode(value = "kcalProteina") {
  const mode = cleanText(value);
  if (["kcal", "calorias", "solo calorias", "solo_calorias"].includes(mode)) return "kcal";
  if (["full", "macros", "macros completos", "completo"].includes(mode)) return "full";
  return "kcalProteina";
}

function normalizeGenerationType(value = "selectedOnly") {
  const type = cleanText(value);
  if (["complete", "completar", "completar comida", "completemeal"].includes(type)) return "completeMeal";
  return "selectedOnly";
}

function normalizeTarget(target = {}, mode = "kcalProteina") {
  const kcal = toNumber(target.kcal ?? target.calorias ?? target.calories, 0);
  const protein = toNumber(target.proteina ?? target.protein ?? target.proteinas, 0);
  const hasCarbs = hasValue(target.carbs ?? target.carbohidratos ?? target.hidratos);
  const hasFat = hasValue(target.grasas ?? target.fat ?? target.grasa);
  let carbs = toNumber(target.carbs ?? target.carbohidratos ?? target.hidratos, 0);
  let fat = toNumber(target.grasas ?? target.fat ?? target.grasa, 0);
  const hasCompleteMacrosInput = mode === "full" && protein > 0 && hasCarbs && hasFat;

  if (mode === "full" && kcal > 0 && (carbs <= 0 || fat <= 0)) {
    const remainingCalories = Math.max(0, kcal - protein * 4);
    if (carbs <= 0 && fat <= 0) {
      carbs = round((remainingCalories * 0.65) / 4, 1);
      fat = round((remainingCalories * 0.35) / 9, 1);
    } else if (carbs <= 0) {
      carbs = round(Math.max(0, remainingCalories - fat * 9) / 4, 1);
    } else if (fat <= 0) {
      fat = round(Math.max(0, remainingCalories - carbs * 4) / 9, 1);
    }
  }

  return {
    calorias: kcal,
    proteina: protein,
    carbohidratos: carbs,
    grasas: fat,
    macrosCompletos: hasCompleteMacrosInput,
  };
}

function normalizeFoodLike(raw = {}, fallbackName = "") {
  const name =
    raw.name ||
    raw.nombre ||
    raw.Alimentos ||
    raw.nombreSnapshot ||
    raw.alimento ||
    fallbackName ||
    "Alimento";

  const quantity = toNumber(raw.quantity ?? raw.cantidad ?? raw.grams, 0);
  const kcalTotal = toNumber(raw.kcal ?? raw.calorias ?? raw.Calorias, 0);
  const proteinTotal = toNumber(raw.protein ?? raw.proteina ?? raw.Proteinas, 0);
  const carbsTotal = toNumber(raw.carbs ?? raw.carbohidratos ?? raw.Carbohidratos, 0);
  const fatTotal = toNumber(raw.fat ?? raw.grasas ?? raw.Grasas, 0);

  let kcalPerGram = toNumber(raw.kcalPerUnitOrGram ?? raw.kcalPerGram, 0);
  let proteinPerGram = toNumber(raw.proteinPerUnitOrGram ?? raw.proteinPerGram, 0);
  let carbsPerGram = toNumber(raw.carbsPerUnitOrGram ?? raw.carbsPerGram, 0);
  let fatPerGram = toNumber(raw.fatPerUnitOrGram ?? raw.fatPerGram, 0);

  if (quantity > 0 && (kcalTotal || proteinTotal || carbsTotal || fatTotal)) {
    kcalPerGram = kcalPerGram || kcalTotal / quantity;
    proteinPerGram = proteinPerGram || proteinTotal / quantity;
    carbsPerGram = carbsPerGram || carbsTotal / quantity;
    fatPerGram = fatPerGram || fatTotal / quantity;
  }

  return {
    id: raw.foodId || raw.alimentoId || raw.id || raw._id || null,
    nombre: String(name).trim(),
    calorias: kcalPerGram || kcalTotal,
    proteina: proteinPerGram || proteinTotal,
    carbohidratos: carbsPerGram || carbsTotal,
    grasas: fatPerGram || fatTotal,
    categoria: raw.categoria || raw.categoriaSnapshot || raw.fuente || raw.source || "",
    unidad: raw.unit || raw.unidad || "g",
    quantity,
    currentQuantity: toNumber(raw.currentQuantity ?? raw.cantidadActual ?? raw.automaticQuantity, 0),
    source: cleanText(raw.source || raw.quantitySource || raw.quantityStatus),
    minGramos: raw.minGramos,
    maxGramos: raw.maxGramos,
    stepGramos: raw.stepGramos,
  };
}

function inferMacroRole(food = {}) {
  const normalized = menu.normalizeFood(food) || food;
  const name = cleanText(normalized.nombre || food.nombre || food.name);
  const category = cleanText(normalized.categoria || food.categoria || food.fuente || food.source);

  if (/aceite|palta|almendra|nuez|mani|manteca|fruto seco/.test(name) || category.includes("grasa")) return "grasas";
  if (/arroz|papa|batata|fideo|pasta|pan|avena|banana|manzana|fruta|cereal/.test(name) || category.includes("carbo")) {
    return "carbohidratos";
  }
  if (/pollo|pavo|carne|atun|atún|pescado|whey|huevo|yogur|queso|jamon|jamón/.test(name) || category.includes("prote")) {
    return "proteicos";
  }

  const protein = toNumber(normalized.proteina ?? normalized.protein, 0);
  const carbs = toNumber(normalized.carbohidratos ?? normalized.carbs, 0);
  const fat = toNumber(normalized.grasas ?? normalized.fat, 0);
  const max = Math.max(protein, carbs, fat);
  if (max === protein) return "proteicos";
  if (max === carbs) return "carbohidratos";
  return "grasas";
}

function gramsLimitsForFood(food = {}, role = "") {
  const name = cleanText(food.nombre || food.name);
  const category = cleanText(food.categoria || food.fuente || food.source);

  if (/aceite|oil/.test(name)) return { minGramos: 2, maxGramos: 25, stepGramos: 1 };
  if (/whey|proteina en polvo|protein powder/.test(name)) return { minGramos: 10, maxGramos: 60, stepGramos: 1 };
  if (/almendra|nuez|mani|maní|fruto seco|frutos secos/.test(name)) return { minGramos: 5, maxGramos: 40, stepGramos: 1 };
  if (/palta|avocado/.test(name)) return { minGramos: 30, maxGramos: 250, stepGramos: 1 };
  if (/banana|manzana|pera|fruta|higo|sandia/.test(name) || category.includes("fruta")) {
    return { minGramos: 50, maxGramos: 250, stepGramos: 1 };
  }
  if (/arroz|fideo|pasta|papa|batata|pan|avena|cereal/.test(name) || role === "carbohidratos") {
    return { minGramos: 20, maxGramos: 300, stepGramos: 1 };
  }
  if (/bife|chorizo|pollo|pavo|carne|atun|pescado|higado|jamon|huevo/.test(name) || role === "proteicos") {
    return { minGramos: 50, maxGramos: 400, stepGramos: 1 };
  }
  if (/pollo|pavo|carne|atun|atún|pescado|higado|jamon|jamón|huevo/.test(name) || role === "proteicos") {
    return { minGramos: 50, maxGramos: 300, stepGramos: 1 };
  }
  if (/verdura|tomate|lechuga|brocoli|brócoli|zanahoria|zapallo/.test(name)) {
    return { minGramos: 50, maxGramos: 300, stepGramos: 1 };
  }
  return { minGramos: 0, maxGramos: 300, stepGramos: 1 };
}

function itemForEngine(food = {}, options = {}) {
  const role = options.role || inferMacroRole(food);
  const limits = gramsLimitsForFood(food, role);
  const sourceKind = options.sourceKind || (options.fixed ? "fixed" : "selectedPending");
  return {
    nombre: food.nombre || food.name,
    cantidad: options.fixed
      ? toNumber(options.quantity, 0)
      : toNumber(options.currentQuantity, 0) || undefined,
    fixedQuantity: !!options.fixed,
    quantityPending: !options.fixed,
    sourceKind,
    selectedPendingFood: !options.fixed && sourceKind !== "addedCandidate",
    addedCandidateFood: sourceKind === "addedCandidate",
    minGramos: options.fixed ? 0 : limits.minGramos,
    maxGramos: limits.maxGramos,
    stepGramos: limits.stepGramos,
  };
}

function addToGroups(groups, item, role) {
  const key = role || inferMacroRole(item);
  if (key === "proteicos") groups.proteicos.push(item);
  else if (key === "carbohidratos") groups.carbohidratos.push(item);
  else groups.grasas.push(item);
}

function selectedNameSet(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const item of list || []) set.add(cleanText(item.name || item.nombre || item.Alimentos || item.nombreSnapshot));
  }
  return set;
}

function scoreCandidate(food = {}, role = "") {
  const normalized = menu.normalizeFood(food) || food;
  const name = cleanText(normalized.nombre || food.nombre || food.name);
  const category = cleanText(normalized.categoria || food.categoria || food.fuente || food.source);
  let score = 0;

  if (role === "proteicos") {
    score += toNumber(normalized.proteina, 0) * 1000;
    if (/pollo|pavo|atun|atún|whey|huevo|yogur|carne|pescado/.test(name)) score += 80;
    if (category.includes("prote")) score += 50;
    score -= toNumber(normalized.grasas, 0) * 60;
  }
  if (role === "carbohidratos") {
    score += toNumber(normalized.carbohidratos, 0) * 1000;
    if (/arroz|papa|batata|pan|avena|banana|fideo|pasta/.test(name)) score += 80;
    if (category.includes("carbo")) score += 50;
    score -= toNumber(normalized.grasas, 0) * 40;
  }
  if (role === "grasas") {
    score += toNumber(normalized.grasas, 0) * 1000;
    if (/aceite|palta|almendra|nuez|mani|maní/.test(name)) score += 90;
    if (category.includes("grasa")) score += 50;
  }

  if (toNumber(normalized.calorias, 0) <= 0) score -= 9999;
  return score;
}

function pickCandidates(allFoods = [], selectedNames = new Set(), targetRoles = []) {
  const normalized = (Array.isArray(allFoods) ? allFoods : [])
    .map((food) => menu.normalizeFood(food))
    .filter((food) => food && food.nombre && food.calorias > 0)
    .filter((food) => !selectedNames.has(cleanText(food.nombre)));

  const picks = [];
  const used = new Set(selectedNames);
  for (const role of targetRoles) {
    const best = normalized
      .filter((food) => inferMacroRole(food) === role)
      .filter((food) => !used.has(cleanText(food.nombre)))
      .sort((a, b) => scoreCandidate(b, role) - scoreCandidate(a, role))[0];

    if (best) {
      picks.push(best);
      used.add(cleanText(best.nombre));
    }
  }

  return picks.slice(0, 3);
}

function qualityFromStatus(status = "") {
  if (status === "exacto" || status === "muy_cercano") return "muy_cerca";
  if (status === "cercano") return "aceptable";
  if (status === "error" || status === "sin_solucion") return "sin_solucion";
  return "revisar";
}

function messageForResult(result = {}, mode = "", generationType = "") {
  if (result.errors?.length) return result.errors[0];
  const diff = result.diferencia || {};
  const kcalAbs = Math.abs(toNumber(diff.calorias, 0));
  const proteinDiff = toNumber(diff.proteina, 0);
  const carbsDiff = toNumber(diff.carbohidratos, 0);
  const fatDiff = toNumber(diff.grasas, 0);
  const reachedMax = [
    ...(result.proteicos || []),
    ...(result.carbohidratos || []),
    ...(result.grasas || []),
  ].some((food) => toNumber(food.maxGramos, 0) > 0 && toNumber(food.cantidad, 0) >= toNumber(food.maxGramos, 0) - 0.5);
  const generationHint = generationType === "selectedOnly"
    ? " con estos alimentos"
    : " usando alimentos compatibles";

  if (mode === "kcal") {
    if (diff.calorias < -10 && reachedMax) {
      return `Queda a ${round(diff.calorias, 1)} kcal porque algun alimento alcanzo el maximo permitido. Agrega otro alimento o usa Completar comida.`;
    }
    if (kcalAbs <= 10) return "Llega a calorias. Proteina, carbohidratos y grasas se optimizan como preferencias secundarias.";
    return "No se pudo respetar el margen de 10 kcal sin salir de cantidades razonables. Revisa el resultado antes de aplicarlo.";
  }

  if (mode === "kcalProteina") {
    if (diff.calorias < -10 && reachedMax) {
      return `Queda a ${round(diff.calorias, 1)} kcal porque algun alimento alcanzo el maximo permitido. Podes agregar otro alimento o usar Completar comida.`;
    }
    if (proteinDiff < -1) {
      if (kcalAbs <= 10) {
        return "Llega a calorias, pero no alcanza la proteina minima. Agrega una fuente proteica o usa Completar comida.";
      }
      return "No llega a la proteina minima ni respeta el margen de 10 kcal. Agrega una fuente proteica o usa Completar comida.";
    }
    if (proteinDiff > 2 && kcalAbs <= 10) {
      return `Llega a calorias y cumple proteina minima. Supera proteina por ${round(proteinDiff, 1)} g.`;
    }
    if (kcalAbs <= 10) return "Llega a calorias y cumple la proteina minima.";
    return "Cumple proteina minima, pero no respeta el margen de 10 kcal. Revisa alimentos o cantidades maximas.";
  }

  if (mode === "full") {
    const missing = [];
    if (proteinDiff < -5) missing.push("proteina");
    if (carbsDiff < -10) missing.push("carbohidratos");
    if (fatDiff < -6) missing.push("grasas");
    if (missing.length) {
      return `No se puede acercar a todos los macros${generationHint}. Falta una fuente de ${missing.join("/")}.`;
    }
    if (result.status === "exacto" || result.status === "muy_cercano") return "Las cantidades quedan muy bien balanceadas en kcal y macros.";
    if (result.status === "cercano") return "Resultado aceptable: kcal cerca y macros razonables.";
    return "No hay una solucion perfecta para todos los macros. Proba calorias + proteina o agrega una fuente faltante.";
  }

  if (result.status === "exacto") return "Las cantidades quedan muy bien ajustadas al objetivo.";
  if (result.status === "muy_cercano") return "Resultado muy cercano. Podes aplicarlo y ajustar fino si queres.";
  if (result.status === "cercano") return "Resultado aceptable. El objetivo por comida puede compensarse en otras comidas.";
  return "Revisa el resultado antes de aplicarlo.";
}

class ServicioAlimentos {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);
  }

  obtenerAlimentos = async (filters = {}) => {
    try {
      const alimentosTotales = await this.model.obtenerAlimentos();
      return filterAlimentos(alimentosTotales, filters);
    } catch (error) {
      console.error("Error al obtener alimentos:", error);
      throw new Error("No se pudieron obtener los alimentos");
    }
  };

  obtenerComida = async (calorias, proteinas, carbohidratos, grasas, alimentos) => {
    try {
      const alimentosTotales = await this.model.obtenerAlimentos();
      const resultado = menu.generarMenu(
        Number(calorias),
        Number(proteinas),
        Number(carbohidratos),
        Number(grasas),
        alimentos,
        alimentosTotales
      );

      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida:", error);
      throw new Error("No se pudo obtener la comida");
    }
  };

  obtenerComidaSoloConCaloriasYProteinas = async (calorias, proteinas, alimentos) => {
    try {
      const alimentosTotales = await this.model.obtenerAlimentos();
      const resultado = menu.generarMenu({
        modo: "kcalProteina",
        objetivo: { calorias, proteina: proteinas, carbohidratos: 0, grasas: 0 },
        alimentosSeleccionados: alimentos,
        alimentosBase: alimentosTotales,
      });

      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida kcal/proteina:", error);
      throw new Error("No se pudo obtener la comida");
    }
  };

  obtenerComidaPrueba = async () => {
    try {
      const resultado = menu.generarMenu();
      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida de prueba:", error);
      throw new Error("No se pudieron obtener los alimentos de prueba");
    }
  };

  obtenerComidasEquivalentes = async () => {
    try {
      const n = 10;
      const data = typeof menu.generarMenusNoVacios === "function"
        ? menu.generarMenusNoVacios(n, 8)
        : menu.generarMenus(n);
      return { status: "success", cantidad: n, data };
    } catch (error) {
      console.error("Error al obtener las comidas equivalentes:", error);
      throw new Error("No se pudieron obtener las comidas equivalentes");
    }
  };

  generarCantidades = async (payload = {}) => {
    const mode = normalizeMode(payload.mode || payload.modo);
    const generationType = normalizeGenerationType(payload.generationType || payload.alcance);
    const target = normalizeTarget(payload.target || payload.mealTarget || {}, mode);
    const fixedFoods = Array.isArray(payload.fixedFoods) ? payload.fixedFoods : [];
    const pendingFoods = Array.isArray(payload.pendingFoods) ? payload.pendingFoods : [];
    const explicitCandidates = Array.isArray(payload.candidateFoods) ? payload.candidateFoods : [];
    const allFoods = await this.model.obtenerAlimentos();

    const normalizedFixed = fixedFoods.map((food) => normalizeFoodLike(food));
    const normalizedPending = pendingFoods.map((food) => normalizeFoodLike(food));
    const selectedNames = selectedNameSet(normalizedFixed, normalizedPending);

    const groups = { proteicos: [], carbohidratos: [], grasas: [] };
    const alimentosBase = [];

    for (const food of normalizedFixed) {
      const role = inferMacroRole(food);
      alimentosBase.push(food);
      addToGroups(groups, itemForEngine(food, { role, fixed: true, quantity: food.quantity }), role);
    }

    for (const food of normalizedPending) {
      const role = inferMacroRole(food);
      alimentosBase.push(food);
      addToGroups(groups, itemForEngine(food, {
        role,
        fixed: false,
        sourceKind: "selectedPending",
        currentQuantity: food.currentQuantity,
      }), role);
    }

    const addedCandidateNames = new Set();
    if (generationType === "completeMeal") {
      const neededRoles = [];
      if (!groups.proteicos.length && mode !== "kcal") neededRoles.push("proteicos");
      if (!groups.carbohidratos.length) neededRoles.push("carbohidratos");
      if (!groups.grasas.length) neededRoles.push("grasas");

      const candidatesSource = explicitCandidates.length ? explicitCandidates : allFoods;
      const candidates = pickCandidates(candidatesSource, selectedNames, Array.from(new Set(neededRoles)));
      for (const candidate of candidates) {
        const role = inferMacroRole(candidate);
        alimentosBase.push(candidate);
        addedCandidateNames.add(cleanText(candidate.nombre || candidate.name));
        addToGroups(groups, itemForEngine(candidate, { role, fixed: false, sourceKind: "addedCandidate" }), role);
      }
    }

    const result = menu.generarMenu({
      modo: mode,
      objetivo: target,
      alimentosProteACuadrar: groups.proteicos,
      alimentosChACuadrar: groups.carbohidratos,
      alimentosGrACuadrar: groups.grasas,
      alimentosBase: [...alimentosBase, ...allFoods],
      permitirDefaults: false,
      redondear: payload.options?.redondear !== false,
      generarVariante: payload.options?.generarVariante === true || payload.options?.generateVariant === true,
      variantSeed: payload.options?.variantSeed,
    });

    const foodByName = new Map(
      [...allFoods, ...alimentosBase]
        .map((food) => [cleanText(food.nombre || food.name || food.Alimentos), food])
        .filter(([name]) => name)
    );
    const fixedNames = selectedNameSet(normalizedFixed);
    const selectedPendingNames = selectedNameSet(normalizedPending);
    const foods = [...(result.proteicos || []), ...(result.carbohidratos || []), ...(result.grasas || [])].map((food) => {
      const key = cleanText(food.nombre);
      const sourceFood = foodByName.get(key) || {};
      const sourceImage = sourceFood.imagen && typeof sourceFood.imagen === "object" ? sourceFood.imagen : {};
      const imageUrl = sourceImage.url || sourceFood.imagenUrl || sourceFood.imagenUrlExacta || sourceFood.imagenUrlGenerica || "";
      const source = fixedNames.has(key)
        ? "fixed"
        : addedCandidateNames.has(key)
          ? "addedCandidate"
          : selectedPendingNames.has(key)
            ? "generated"
            : "generated";

      return {
        foodId: food.id || food.alimentoId || null,
        name: food.nombre,
        nombre: food.nombre,
        quantity: food.cantidad,
        cantidad: food.cantidad,
        unit: "g",
        unidad: "g",
        source,
        kcal: food.calorias,
        proteina: food.proteina,
        protein: food.proteina,
        carbs: food.carbohidratos,
        grasas: food.grasas,
        fat: food.grasas,
        categoria: sourceFood.categoria || sourceFood.categoriaZumaFit || sourceFood.Fuente || food.categoria || "",
        imagen: sourceFood.imagen || null,
        imagenUrl: imageUrl,
        maxGramos: food.maxGramos,
        fixedQuantity: source === "fixed",
        quantityPending: false,
      };
    });

    const variantRequested = result.variante?.requested === true;
    const variantApplied = result.variante?.applied === true;
    return {
      status: result.status === "error"
        ? "error"
        : (variantRequested && !variantApplied) || ["revisar", "sin_solucion"].includes(result.status)
          ? "warning"
          : "ok",
      quality: qualityFromStatus(result.status),
      engineStatus: result.status,
      message: variantRequested
        ? result.variante?.message || messageForResult(result, mode, generationType)
        : messageForResult(result, mode, generationType),
      mode,
      generationType,
      variantRequested,
      variantApplied,
      variant: result.variante || null,
      foods,
      totals: result.totales,
      target: result.objetivo,
      diff: result.diferencia,
      warnings: result.warnings || [],
      errors: result.errors || [],
    };
  };

  obtenerMenuDiario = async (objeto, targetComidas) => {
    try {
      const cantidadComidas = objeto.comidas || Math.floor(Math.random() * 3) + 3;
      const comidas = [];

      for (let i = 0; i < cantidadComidas; i++) {
        const comida = menu.generarMenu(targetComidas[i]);
        comidas.push(comida);
      }

      return comidas;
    } catch (error) {
      console.error("Error al obtener el menu diario:", error);
      throw new Error("No se pudo obtener el menu diario");
    }
  };

  obtenerMenuSemanal = async () => {
    try {
      const resultado = menu.generarMenu();
      return resultado;
    } catch (error) {
      console.error("Error al obtener el menu semanal:", error);
      throw new Error("No se pudo obtener el menu semanal");
    }
  };
}

export default ServicioAlimentos;
