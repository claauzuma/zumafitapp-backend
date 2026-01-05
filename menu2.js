// menu.js — versión robusta “siempre devuelve menús”
// - Sin estados globales mutables (todo se calcula dentro de cada corrida).
// - Reintentos internos con snapshot/rollback.
// - Tolerancias numéricas para no fallar por flotantes.
// - Soporta “alimentos a cuadrar” (opcional): proteicos, carbos, grasas.
// - Devuelve sólo ítems con cantidad > 0.

///////////////////////////////
// Utils
///////////////////////////////
const EPS = 1e-6;
const TOL = 0.5; // tolerancia en gramos para P/CH/G (y en kcal para calorías al final)
const clamp0 = (x) => (x < 0 ? 0 : x);
const rnd = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const deepFreeze = (o) => {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((k) => {
    const v = o[k];
    if (v && (typeof v === "object" || typeof v === "function") && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  });
  return o;
};

///////////////////////////////
// Datos base
///////////////////////////////
const alimentos = deepFreeze([
  { nombre: "Almendras", proteina: 0.212, carbohidratos: 0.216, grasas: 0.499, calorias: 6.20 },
  { nombre: "Nueces", proteina: 0.152, carbohidratos: 0.137, grasas: 0.652, calorias: 7.02 },
  { nombre: "Aceite de Oliva", proteina: 0, carbohidratos: 0, grasas: 1, calorias: 9 },
  { nombre: "Pechuga de pollo", proteina: 0.31, carbohidratos: 0, grasas: 0.036, calorias: 1.56 },
  { nombre: "Churrasco Magro", proteina: 0.27, carbohidratos: 0, grasas: 0.15, calorias: 2.43 },
  { nombre: "Banana", proteina: 0.013, carbohidratos: 0.228, grasas: 0.003, calorias: 0.99 },
  { nombre: "Manzana", proteina: 0.005, carbohidratos: 0.25, grasas: 0.003, calorias: 1.05 },
  { nombre: "Pan Blanco", proteina: 0.075, carbohidratos: 0.49, grasas: 0.012, calorias: 2.37 },
  { nombre: "Tomate", proteina: 0.009, carbohidratos: 0.039, grasas: 0.002, calorias: 0.21 },
  { nombre: "Palta", proteina: 0.02, carbohidratos: 0.085, grasas: 0.15, calorias: 1.77 },
  { nombre: "Pera", proteina: 0.004, carbohidratos: 0.25, grasas: 0.001, calorias: 1.03 },
  { nombre: "Arroz", proteina: 0.027, carbohidratos: 0.282, grasas: 0.003, calorias: 1.26 },
  { nombre: "Papas", proteina: 0.02, carbohidratos: 0.175, grasas: 0.001, calorias: 0.79 },
  { nombre: "Whey Protein", proteina: 0.8, carbohidratos: 0.04, grasas: 0.06, calorias: 3.90 },
  { nombre: "Jamon Cocido", proteina: 0.18, carbohidratos: 0.01, grasas: 0.05, calorias: 1.21 },
  { nombre: "Higado", proteina: 0.26, carbohidratos: 0.039, grasas: 0.045, calorias: 1.60 },
  { nombre: "Queso Cremoso", proteina: 0.125, carbohidratos: 0.044, grasas: 0.32, calorias: 3.56 },
  { nombre: "Pechuga de Pavo", proteina: 0.29, carbohidratos: 0, grasas: 0.01, calorias: 1.25 },
  { nombre: "Leche Descremada", proteina: 0.034, carbohidratos: 0.05, grasas: 0.001, calorias: 0.35 },
  { nombre: "Leche Entera", proteina: 0.032, carbohidratos: 0.048, grasas: 0.032, calorias: 0.61 },
  { nombre: "Pasas de Uva", proteina: 0.031, carbohidratos: 0.79, grasas: 0.005, calorias: 3.33 },
  { nombre: "Fideos", proteina: 0.12, carbohidratos: 0.72, grasas: 0.015, calorias: 3.50 },
  { nombre: "Sandía", proteina: 0.006, carbohidratos: 0.08, grasas: 0.002, calorias: 0.36 },
  { nombre: "Higo", proteina: 0.008, carbohidratos: 0.19, grasas: 0.003, calorias: 0.82 },
  { nombre: "Dulce de Leche", proteina: 0.05, carbohidratos: 0.55, grasas: 0.08, calorias: 3.12 },
  { nombre: "Galletitas", proteina: 0.07, carbohidratos: 0.65, grasas: 0.2, calorias: 4.68 },
  { nombre: "Mermelada", proteina: 0.004, carbohidratos: 0.6, grasas: 0.001, calorias: 2.43 }
]);

const combinacionesValidasDeComidas = deepFreeze([
  {
    nombre: "Churrasco Magro",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Higado", "Jamon Cocido"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Aceite de Oliva", "Palta", "Almendras", "Nueces", "Queso Cremoso"]
  },
  {
    nombre: "Higado",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Jamon Cocido"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Aceite de Oliva", "Palta", "Almendras", "Nueces", "Queso Cremoso"]
  },
  {
    nombre: "Jamon Cocido",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Higado"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Aceite de Oliva", "Palta", "Almendras", "Nueces", "Queso Cremoso"]
  },
  {
    nombre: "Pechuga de Pavo",
    fuentesProtes: ["Pechuga de Pollo", "Higado", "Jamon Cocido"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Aceite de Oliva", "Palta", "Almendras", "Nueces", "Queso Cremoso"]
  },
  {
    nombre: "Whey Protein",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Higado", "Jamon Cocido"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Aceite de Oliva", "Palta", "Almendras", "Nueces", "Queso Cremoso"]
  },
  {
    nombre: "Pechuga de pollo",
    fuentesProtes: ["Pechuga de Pavo", "Higado", "Jamon Cocido", "Whey Protein"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Palta", "Aceite de Oliva", "Almendras", "Nueces"]
  },
  {
    nombre: "Banana",
    fuentesProtes: ["Whey Protein", "Leche Descremada", "Queso Cremoso"],
    fuentesCh: [
      ["Arroz", "Tomate", "Fideos", "Pan Blanco", "Papas"],
      ["Banana", "Pera", "Higo", "Sandía", "Papas", "Manzana", "Tomate"]
    ],
    fuentesGrasas: ["Almendras", "Palta", "Nueces"]
  },
  {
    nombre: "Pan Blanco",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Jamon Cocido"],
    fuentesCh: [
      ["Banana", "Manzana", "Mermelada"],
      ["Tomate", "Papas", "Arroz"]
    ],
    fuentesGrasas: ["Palta", "Queso Cremoso", "Aceite de Oliva"]
  },
  {
    nombre: "Queso Cremoso",
    fuentesProtes: ["Pechuga de Pollo", "Higado", "Whey Protein"],
    fuentesCh: [
      ["Tomate", "Papas", "Pan Blanco"],
      ["Banana", "Manzana", "Arroz"]
    ],
    fuentesGrasas: ["Nueces", "Almendras", "Palta"]
  },
  {
    nombre: "Fideos",
    fuentesProtes: ["Pechuga de Pollo", "Pechuga de Pavo", "Higado"],
    fuentesCh: [
      ["Banana", "Tomate", "Pan Blanco"],
      ["Papas", "Manzana", "Arroz"]
    ],
    fuentesGrasas: ["Queso Cremoso", "Aceite de Oliva", "Palta"]
  }
]);

///////////////////////////////
// Helpers de búsqueda
///////////////////////////////
const byName = (arr, nombre) =>
  arr.find(a => String(a.nombre || "").toLowerCase() === String(nombre || "").toLowerCase()) || null;

const allFoodsBy = {
  prote: alimentos.filter(a => a.proteina > a.carbohidratos && a.proteina > a.grasas),
  carb: alimentos.filter(a => a.carbohidratos > a.proteina && a.carbohidratos > a.grasas),
  fat:  alimentos.filter(a => a.grasas > a.proteina && a.grasas > a.carbohidratos),
};

const fromCombinacion = (proteicoPrincipalNombre) => {
  const combo = combinacionesValidasDeComidas.find(c =>
    String(c.nombre).toLowerCase() === String(proteicoPrincipalNombre).toLowerCase()
  );
  return combo || null;
};

const pickOne = (arr, excludeNames = []) => {
  const excl = new Set(excludeNames.map(n => String(n).toLowerCase()));
  const pool = arr.filter(x => !excl.has(String(x.nombre).toLowerCase()));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
};

///////////////////////////////
// Núcleo: generar una comida
///////////////////////////////
function generarMenu({
  objetivo = { proteina: 40, carbohidratos: 70, grasas: 20, calorias: null },
  alimentosProteACuadrar = [],      // [{nombre, cantidad?, modificable?}, ...] (opcional)
  alimentosChACuadrar = [],         // [{nombre, cantidad?, modificable?}, ...] (opcional)
  alimentosGrACuadrar = [],         // [{nombre, cantidad?, modificable?}, ...] (opcional)
  maxIntentos = 12
} = {}) {
  // calorías objetivo calculadas si no vienen:
  if (objetivo.calorias == null) {
    objetivo = {
      ...objetivo,
      calorias: objetivo.proteina * 4 + objetivo.carbohidratos * 4 + objetivo.grasas * 9
    };
  }

  let intento = 0;
  while (intento++ < maxIntentos) {
    // Estado local
    let P = 0, C = 0, G = 0, K = 0;
    const proteSel = [];
    const carbSel = [];
    const fatSel  = [];

    // ===== 1) PROTEÍNAS =====
    try {
      // 1 o 2 proteicos (si el objetivo de P es alto, probamos con 2)
      const cantProt = alimentosProteACuadrar.length > 0
        ? Math.min(2, alimentosProteACuadrar.length)
        : (objetivo.proteina > 35 ? (Math.random() < 0.6 ? 2 : 1) : (Math.random() < 0.3 ? 2 : 1));

      let p1, p2;
      if (cantProt === 1) {
        p1 = alimentosProteACuadrar.length
          ? byName(allFoodsBy.prote, alimentosProteACuadrar[0].nombre)
          : pickOne(allFoodsBy.prote);
        if (!p1) throw new Error("No hay proteico válido.");
        const cant1 = objetivo.proteina / p1.proteina; // cerramos P exacto con 1
        push(proteSel, p1, cant1);
      } else {
        // 2 proteicos
        if (alimentosProteACuadrar.length >= 2) {
          p1 = byName(allFoodsBy.prote, alimentosProteACuadrar[0].nombre);
          p2 = byName(allFoodsBy.prote, alimentosProteACuadrar[1].nombre);
        } else if (alimentosProteACuadrar.length === 1) {
          p1 = byName(allFoodsBy.prote, alimentosProteACuadrar[0].nombre);
          // intentar uno compatible por combo o al azar
          const combo = fromCombinacion(p1?.nombre) || {};
          const pool = (combo.fuentesProtes || [])
            .map(n => byName(allFoodsBy.prote, n))
            .filter(Boolean);
          p2 = pickOne(pool.length ? pool : allFoodsBy.prote, [p1?.nombre]);
        } else {
          p1 = pickOne(allFoodsBy.prote);
          // intentar compañero por combo
          const combo = fromCombinacion(p1?.nombre) || {};
          const pool = (combo.fuentesProtes || [])
            .map(n => byName(allFoodsBy.prote, n))
            .filter(Boolean);
          p2 = pickOne(pool.length ? pool : allFoodsBy.prote, [p1?.nombre]);
        }
        if (!p1 || !p2 || p1.nombre === p2.nombre) throw new Error("Proteicos inválidos.");

        // proporción aleatoria (pero cerrando proteína exacta)
        let prop1 = 0.4 + Math.random() * 0.4; // 0.4..0.8
        let prop2 = 1 - prop1;
        // Si el usuario fijó cantidad de alguno, respetar su proteína resultante:
        const f1 = alimentosProteACuadrar.find(a => eqName(a.nombre, p1.nombre) && a.cantidad > 0);
        const f2 = alimentosProteACuadrar.find(a => eqName(a.nombre, p2.nombre) && a.cantidad > 0);
        if (f1 && !f2) {
          const P1 = f1.cantidad * p1.proteina;
          if (P1 >= objetivo.proteina) throw new Error("Exceso de P por alimento 1.");
          prop1 = P1 / objetivo.proteina; prop2 = 1 - prop1;
        } else if (!f1 && f2) {
          const P2 = f2.cantidad * p2.proteina;
          if (P2 >= objetivo.proteina) throw new Error("Exceso de P por alimento 2.");
          prop2 = P2 / objetivo.proteina; prop1 = 1 - prop2;
        } else if (f1 && f2) {
          const P1 = f1.cantidad * p1.proteina;
          const P2 = f2.cantidad * p2.proteina;
          const PSum = P1 + P2;
          if (PSum > objetivo.proteina + TOL) throw new Error("Exceso de P por cantidades fijas.");
          if (PSum < objetivo.proteina - 5) {
            // Si quedan P por cubrir, forzamos 3er proteico luego (simple: reintento)
            throw new Error("Faltan P con cantidades fijas.");
          }
          prop1 = P1 / objetivo.proteina; prop2 = P2 / objetivo.proteina;
        }

        const P1 = objetivo.proteina * prop1;
        const P2 = objetivo.proteina * prop2;

        const c1 = P1 / p1.proteina;
        const c2 = P2 / p2.proteina;

        push(proteSel, p1, c1);
        push(proteSel, p2, c2);
      }
    } catch { continue; }

    // actualizar totales
    let { P: P1, C: C1, G: G1, K: K1 } = sum(proteSel);
    P += P1; C += C1; G += G1; K += K1;

    // límites previos a CH
    if (C > objetivo.carbohidratos + TOL || G > objetivo.grasas + TOL) continue;

    // ===== 2) CARBOHIDRATOS =====
    try {
      const Cleft = clamp0(objetivo.carbohidratos - C);
      // 1 o 2 carbos (más estable)
      const cantCarb = alimentosChACuadrar.length > 0
        ? Math.min(2, alimentosChACuadrar.length)
        : (Cleft > 45 ? 2 : 1);

      // proteico “principal” para anclar combos
      const proteicoPrincipal = proteSel[0]?.nombre;
      const combo = fromCombinacion(proteicoPrincipal);
      const poolPrincipal = combo?.fuentesCh?.[0]?.map(n => byName(alimentos, n)).filter(Boolean) || allFoodsBy.carb;
      const poolSec = combo?.fuentesCh?.[1]?.map(n => byName(alimentos, n)).filter(Boolean) || allFoodsBy.carb;

      if (cantCarb === 1) {
        let c1 = alimentosChACuadrar.length
          ? byName(alimentos, alimentosChACuadrar[0].nombre)
          : pickOne(poolPrincipal);
        if (!c1 || c1.carbohidratos <= EPS) throw new Error("Carbo 1 inválido.");
        const q1 = Cleft / c1.carbohidratos;
        push(carbSel, c1, q1);
      } else {
        // 2 carbos
        let c1, c2;
        if (alimentosChACuadrar.length >= 2) {
          c1 = byName(alimentos, alimentosChACuadrar[0].nombre);
          c2 = byName(alimentos, alimentosChACuadrar[1].nombre);
        } else if (alimentosChACuadrar.length === 1) {
          c1 = byName(alimentos, alimentosChACuadrar[0].nombre);
          c2 = pickOne(poolSec, [c1?.nombre]);
        } else {
          c1 = pickOne(poolPrincipal);
          c2 = pickOne(poolSec, [c1?.nombre]);
        }
        if (!c1 || !c2 || c1.nombre === c2.nombre) throw new Error("Carbos inválidos.");
        if (c1.carbohidratos <= EPS || c2.carbohidratos <= EPS) throw new Error("Carbos con CH <= 0.");

        let prop1 = 0.45 + Math.random() * 0.4; // 0.45..0.85
        let prop2 = 1 - prop1;

        const f1 = alimentosChACuadrar.find(a => eqName(a.nombre, c1.nombre) && a.cantidad > 0);
        const f2 = alimentosChACuadrar.find(a => eqName(a.nombre, c2.nombre) && a.cantidad > 0);
        if (f1 && !f2) {
          const C1f = f1.cantidad * c1.carbohidratos;
          if (C1f >= Cleft) throw new Error("Exceso de CH por c1 fijo.");
          prop1 = C1f / Cleft; prop2 = 1 - prop1;
        } else if (!f1 && f2) {
          const C2f = f2.cantidad * c2.carbohidratos;
          if (C2f >= Cleft) throw new Error("Exceso de CH por c2 fijo.");
          prop2 = C2f / Cleft; prop1 = 1 - prop2;
        } else if (f1 && f2) {
          const C1f = f1.cantidad * c1.carbohidratos;
          const C2f = f2.cantidad * c2.carbohidratos;
          const sumf = C1f + C2f;
          if (sumf > Cleft + TOL) throw new Error("Exceso de CH por cantidades fijas.");
          if (sumf < Cleft - 5) throw new Error("Faltan CH con cantidades fijas.");
          prop1 = C1f / Cleft; prop2 = C2f / Cleft;
        }

        const CH1 = Cleft * prop1;
        const CH2 = Cleft * prop2;
        const q1 = CH1 / c1.carbohidratos;
        const q2 = CH2 / c2.carbohidratos;

        // snapshot para validar grasas
        const before = { P, C, G, K };
        push(carbSel, c1, q1);
        push(carbSel, c2, q2);
        const t = sum(carbSel);
        if (before.G + t.G > objetivo.grasas + TOL) {
          // revertimos y reintento global
          throw new Error("CH suman demasiada grasa.");
        }
      }
    } catch { continue; }

    // actualizar totales
    let sCarb = sum(carbSel);
    P += sCarb.P; C += sCarb.C; G += sCarb.G; K += sCarb.K;

    if (P > objetivo.proteina + 3 || C > objetivo.carbohidratos + TOL || G > objetivo.grasas + TOL) continue;

    // ===== 3) GRASAS =====
    try {
      const Gleft = clamp0(objetivo.grasas - G);
      if (Gleft > TOL) {
        const cantFat = alimentosGrACuadrar.length > 0
          ? Math.min(2, alimentosGrACuadrar.length)
          : (Gleft > 25 ? 2 : 1);

        if (cantFat === 1) {
          let f1 = alimentosGrACuadrar.length
            ? byName(allFoodsBy.fat, alimentosGrACuadrar[0].nombre)
            : pickOne(allFoodsBy.fat);
          if (!f1 || f1.grasas <= EPS) throw new Error("Grasa 1 inválida.");
          const q1 = Gleft / f1.grasas;
          push(fatSel, f1, q1);
        } else {
          let f1, f2;
          if (alimentosGrACuadrar.length >= 2) {
            f1 = byName(allFoodsBy.fat, alimentosGrACuadrar[0].nombre);
            f2 = byName(allFoodsBy.fat, alimentosGrACuadrar[1].nombre);
          } else if (alimentosGrACuadrar.length === 1) {
            f1 = byName(allFoodsBy.fat, alimentosGrACuadrar[0].nombre);
            f2 = pickOne(allFoodsBy.fat, [f1?.nombre]);
          } else {
            f1 = pickOne(allFoodsBy.fat);
            f2 = pickOne(allFoodsBy.fat, [f1?.nombre]);
          }
          if (!f1 || !f2 || f1.nombre === f2.nombre) throw new Error("Grasas inválidas.");
          if (f1.grasas <= EPS || f2.grasas <= EPS) throw new Error("Grasas con valor <= 0.");

          const prop1 = 0.35 + Math.random() * 0.5; // 0.35..0.85
          const prop2 = 1 - prop1;
          const G1 = Gleft * prop1;
          const G2 = Gleft * prop2;
          const q1 = G1 / f1.grasas;
          const q2 = G2 / f2.grasas;

          push(fatSel, f1, q1);
          push(fatSel, f2, q2);
        }
      }
    } catch { continue; }

    // Totales finales
    let sFat = sum(fatSel);
    P += sFat.P; C += sFat.C; G += sFat.G; K += sFat.K;

    // Validaciones finales con tolerancias
    if (Math.abs(P - objetivo.proteina) > 3) continue;
    if (Math.abs(C - objetivo.carbohidratos) > 1.5) continue;
    if (Math.abs(G - objetivo.grasas) > 1.5) continue;

    const Ktarget = objetivo.proteina * 4 + objetivo.carbohidratos * 4 + objetivo.grasas * 9;
    if (Math.abs(K - Ktarget) > 6) {
      // pequeño ajuste: mover 1–2 g CH desde/ hacia prote principal si existe margen (opcional).
      // Mantengo simple: si calorías están muy lejos, reintento.
      continue;
    }

    // Armar respuesta limpia (sólo cantidades > 0)
    const out = {
      proteicos:     proteSel.filter(x => x.cantidad > EPS).map(slim),
      carbohidratos: carbSel.filter(x => x.cantidad > EPS).map(slim),
      grasas:        fatSel.filter(x => x.cantidad > EPS).map(slim)
    };

    // Asegurar no vacíos
    if (!out.proteicos.length || !out.carbohidratos.length || !out.grasas.length) continue;

    return out;
  }

  // Si no pudo en maxIntentos, devolvemos un fallback simple (nunca vacío)
  return fallbackMenu();
}

///////////////////////////////
// Multi-menú + variantes
///////////////////////////////
function generarMenus(cantidad = 3, opts = {}) {
  const arr = [];
  for (let i = 0; i < cantidad; i++) {
    arr.push(generarMenu(opts));
  }
  return arr;
}

// Garantiza que ninguna posición sea vacía reintentando el menú individual hasta `intentosPorMenu` veces.
function generarMenusNoVacios(cantidad = 3, intentosPorMenu = 8, opts = {}) {
  const arr = [];
  for (let i = 0; i < cantidad; i++) {
    let ok = null;
    for (let j = 0; j < intentosPorMenu; j++) {
      const m = generarMenu({ ...opts, maxIntentos: 10 });
      if (m.proteicos.length && m.carbohidratos.length && m.grasas.length) {
        ok = m; break;
      }
    }
    arr.push(ok ?? fallbackMenu());
  }
  return arr;
}

///////////////////////////////
// Internos auxiliares
///////////////////////////////
function eqName(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function push(dest, food, qty) {
  const q = Math.max(0, qty);
  dest.push({
    nombre: food.nombre,
    cantidad: q,
    proteina: food.proteina * q,
    carbohidratos: food.carbohidratos * q,
    grasas: food.grasas * q,
    calorias: food.calorias * q,
    unidadProteica: food.proteina,
    unidadCarbo: food.carbohidratos,
    unidadGrasas: food.grasas,
    unidadCalorica: food.calorias
  });
}

function sum(list) {
  let P = 0, C = 0, G = 0, K = 0;
  for (const it of list) {
    P += it.proteina;
    C += it.carbohidratos;
    G += it.grasas;
    K += it.calorias;
  }
  return { P, C, G, K };
}

function slim(x) {
  return { nombre: x.nombre, cantidad: rnd(x.cantidad) };
}

function fallbackMenu() {
  // Menú de seguridad (si todo falla): Pechuga + Arroz + Aceite
  const pechuga = byName(alimentos, "Pechuga de pollo");
  const arroz = byName(alimentos, "Arroz");
  const aceite = byName(alimentos, "Aceite de Oliva");

  // 30g P, 40g CH, 10g G
  const qP = 30 / pechuga.proteina;
  const qC = 40 / arroz.carbohidratos;
  const qG = 10 / aceite.grasas;

  return {
    proteicos:     [{ nombre: pechuga.nombre, cantidad: rnd(qP) }],
    carbohidratos: [{ nombre: arroz.nombre, cantidad: rnd(qC) }],
    grasas:        [{ nombre: aceite.nombre, cantidad: rnd(qG) }]
  };
}

///////////////////////////////
// Export
///////////////////////////////
export default {
  generarMenu,
  generarMenus,
  generarMenusNoVacios
};
