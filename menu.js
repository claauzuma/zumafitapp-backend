// Utilidad para congelar (detecta mutaciones accidentales)
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

let alimentosProteicosSeleccionados = [];
let alimentosChSeleccionados = [];
let alimentosGrasasSeleccionados = [];

let combinacion = [];
let proteinaTotal = 0;
let carbohidratosTotal = 0;
let grasasTotal = 0;
let caloriasTotal = 0;

// Objetivo nutricional
const objetivo = {
  proteina: 40,
  carbohidratos: 70,
  grasas: 20,
  calorias: ""
};
function calcularCalorias(obj) {
  obj.calorias = obj.proteina * 4 + obj.carbohidratos * 4 + obj.grasas * 9;
}
calcularCalorias(objetivo);

function combinacionDameProteRandom(alimento) {
  const comida = combinacionesValidasDeComidas.find(comida => comida.nombre === alimento);
  if (!comida) return null;
  const fuentesProtes = comida.fuentesProtes || [];
  if (!fuentesProtes.length) return null;
  const proteinaRandom = fuentesProtes[Math.floor(Math.random() * fuentesProtes.length)];
  return proteinaRandom; // string
}

function combinacionDameCarbosPrincipalRandom(alimento) {
  const comida = combinacionesValidasDeComidas.find(comida => comida.nombre === alimento);
  if (!comida) return null;
  const fuentesCh = Array.isArray(comida.fuentesCh) ? comida.fuentesCh[0] : [];
  if (!Array.isArray(fuentesCh) || !fuentesCh.length) return null;
  const carbosRandom = fuentesCh[Math.floor(Math.random() * fuentesCh.length)];
  const carboADevolver = alimentos.find(alimen =>
    String(alimen.nombre || '').toLowerCase() === String(carbosRandom || '').toLowerCase()
  );
  return carboADevolver || null;
}

function combinacionDameCarbosSecundarioRandom(alimento) {
  const comida = combinacionesValidasDeComidas.find(comida => comida.nombre === alimento);
  if (!comida) return null;
  const fuentesCh = Array.isArray(comida.fuentesCh) ? comida.fuentesCh[1] : [];
  if (!Array.isArray(fuentesCh) || !fuentesCh.length) return null;
  const carbosRandom = fuentesCh[Math.floor(Math.random() * fuentesCh.length)];
  const carboADevolver = alimentos.find(alimen =>
    String(alimen.nombre || '').toLowerCase() === String(carbosRandom || '').toLowerCase()
  );
  return carboADevolver || null;
}

let intentos = 0;

function seleccionarComidaProteCarboGrasas(objetivo, soloAlimentosPasados, alimentosProteACuadrar, alimentosChACuadrar, alimentosGrACuadrar) {
  // Reset estado por request
  intentos = 0;
  combinacion = [];
  proteinaTotal = 0;
  carbohidratosTotal = 0;
  grasasTotal = 0;
  caloriasTotal = 0;
  alimentosProteicosSeleccionados = [];
  alimentosChSeleccionados = [];
  alimentosGrasasSeleccionados = [];

  const MAX_INTENTOS = 10;
  const buscarPorNombre = (arr, nombre) =>
    arr.find(x => String(x.nombre || '').toLowerCase() === String(nombre || '').toLowerCase()) || null;

  if (intentos < MAX_INTENTOS) {
    // ===========================
    // 1) SELECCIÓN DE PROTEÍNAS
    // ===========================
    let alimentosProteicos = alimentos.filter(a => a.proteina > a.grasas && a.proteina > a.carbohidratos);

    let cantidadAlimentosProteicos;
    let procesarAlimentosProteicos = true;

    while (procesarAlimentosProteicos) {
      if (alimentosProteACuadrar.length > 0) {
        cantidadAlimentosProteicos = alimentosProteACuadrar.length;
      } else if (objetivo.proteina < 30) {
        cantidadAlimentosProteicos = 1;
      } else {
        cantidadAlimentosProteicos = Math.floor(Math.random() * 2) + 1;
      }

      // ====== 2 PROTEICOS ======
      if (cantidadAlimentosProteicos == 2) {
        let alimento1, alimento2;
        let porcentajeAlimento1 = Math.random();
        let porcentajeAlimento2 = 1 - porcentajeAlimento1;

        do {
          if (alimentosProteACuadrar.length == 1) {
            alimento1 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[0].nombre);
            const nombre2 = combinacionDameProteRandom(alimento1?.nombre);
            alimento2 = buscarPorNombre(alimentos, nombre2);
          }
          else if (alimentosProteACuadrar.length == 2) {
            alimento1 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[0].nombre);
            alimento2 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[1].nombre);

            let primerAlimento = alimentosProteACuadrar[0];
            let segundoAlimento = alimentosProteACuadrar[1];
            let proteinasRestantes = (objetivo.proteina - proteinaTotal);

            if (primerAlimento.cantidad > 0) {
              let alimento1proteinas = primerAlimento.cantidad * alimento1.proteina;
              if (alimento1proteinas > proteinasRestantes) {
                throw new Error(`Ingresa otra cantidad menor del alimento ${primerAlimento.nombre} , hubo un error de cálculo`);
              }
              let propor1 = (alimento1proteinas / proteinasRestantes);
              let propor2 = 1 - propor1;
              if (Math.abs(propor1 + propor2 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = propor1;
              porcentajeAlimento2 = propor2;
            }
            else if (segundoAlimento.cantidad > 0) {
              let alimento2proteinas = segundoAlimento.cantidad * alimento2.proteina;
              if (alimento2proteinas > proteinasRestantes) {
                throw new Error(`Ingresa otra cantidad menor del alimento ${segundoAlimento.nombre} , hubo un error de cálculo`);
              }
              let propor2 = (alimento2proteinas / proteinasRestantes);
              let propor1 = 1 - propor2;
              if (Math.abs(propor1 + propor2 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = propor1;
              porcentajeAlimento2 = propor2;
            }
          }
          else if (alimentosProteACuadrar.length == 0) {
            alimento1 = alimentosProteicos[Math.floor(Math.random() * alimentosProteicos.length)];
            let nombre2, candidato2;
            do {
              nombre2 = combinacionDameProteRandom(alimento1.nombre);
              candidato2 = buscarPorNombre(alimentos, nombre2);
            } while (!candidato2 || candidato2.nombre === alimento1.nombre);
            alimento2 = candidato2;

            porcentajeAlimento1 = 0.5 + Math.random() * 0.5;
            porcentajeAlimento2 = 1 - porcentajeAlimento1;
          }
        } while (!alimento1 || !alimento2 || alimento1.nombre === alimento2.nombre);

        const proteinaAlimento1 = objetivo.proteina * porcentajeAlimento1;
        const proteinaAlimento2 = objetivo.proteina * porcentajeAlimento2;

        const cantidadNecesaria1 = (proteinaAlimento1 / alimento1.proteina);
        const cantidadNecesaria2 = (proteinaAlimento2 / alimento2.proteina);

        proteinaTotal      += proteinaAlimento1 + proteinaAlimento2;
        carbohidratosTotal += (alimento1.carbohidratos * cantidadNecesaria1 + alimento2.carbohidratos * cantidadNecesaria2);
        grasasTotal        += (alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2);
        caloriasTotal      += (alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2);

        if (carbohidratosTotal <= objetivo.carbohidratos && grasasTotal <= objetivo.grasas) {
          procesarAlimentosProteicos = false;

          combinacion.push({ nombre: alimento1.nombre, cantidad: cantidadNecesaria1, proteina: alimento1.proteina * cantidadNecesaria1, carbohidratos: alimento1.carbohidratos * cantidadNecesaria1, grasas: alimento1.grasas * cantidadNecesaria1, calorias: alimento1.calorias * cantidadNecesaria1 });
          combinacion.push({ nombre: alimento2.nombre, cantidad: cantidadNecesaria2, proteina: alimento2.proteina * cantidadNecesaria2, carbohidratos: alimento2.carbohidratos * cantidadNecesaria2, grasas: alimento2.grasas * cantidadNecesaria2, calorias: alimento2.calorias * cantidadNecesaria2 });

          alimentosProteicosSeleccionados.push({
            nombre: alimento1.nombre, cantidad: cantidadNecesaria1,
            proteina: alimento1.proteina * cantidadNecesaria1, carbohidratos: alimento1.carbohidratos * cantidadNecesaria1,
            grasas: alimento1.grasas * cantidadNecesaria1, calorias: alimento1.calorias * cantidadNecesaria1,
            unidadCalorica: alimento1.calorias, unidadProteica: alimento1.proteina, unidadCarbo: alimento1.carbohidratos, unidadGrasas: alimento1.grasas
          });
          alimentosProteicosSeleccionados.push({
            nombre: alimento2.nombre, cantidad: cantidadNecesaria2,
            proteina: alimento2.proteina * cantidadNecesaria2, carbohidratos: alimento2.carbohidratos * cantidadNecesaria2,
            grasas: alimento2.grasas * cantidadNecesaria2, calorias: alimento2.calorias * cantidadNecesaria2,
            unidadCalorica: alimento2.calorias, unidadProteica: alimento2.proteina, unidadCarbo: alimento2.carbohidratos, unidadGrasas: alimento2.grasas
          });

        } else {
          intentos++;
          procesarAlimentosProteicos = true;
          proteinaTotal = carbohidratosTotal = grasasTotal = caloriasTotal = 0;
          combinacion = [];
          if (intentos > 5) {
            throw new Error("No se pudo encontrar una combinación con los alimentos proteicos seleccionados ");
          }
        }

      // ====== 3 PROTEICOS ======
      } else if (cantidadAlimentosProteicos == 3) {
        let alimento1, alimento2, alimento3;
        let porcentajeAlimento1 = Math.random();
        let porcentajeAlimento2 = Math.random() * (1 - porcentajeAlimento1);
        let porcentajeAlimento3 = 1 - (porcentajeAlimento1 + porcentajeAlimento2);

        do {
          if (alimentosProteACuadrar.length == 1) {
            alimento1 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[0].nombre);

            let nombre2, cand2;
            do {
              nombre2 = combinacionDameProteRandom(alimento1.nombre);
              cand2 = buscarPorNombre(alimentos, nombre2);
            } while (!cand2 || cand2.nombre === alimento1.nombre);
            alimento2 = cand2;

            let nombre3, cand3;
            do {
              nombre3 = combinacionDameProteRandom(alimento1.nombre);
              cand3 = buscarPorNombre(alimentos, nombre3);
            } while (!cand3 || cand3.nombre === alimento1.nombre || cand3.nombre === alimento2.nombre);
            alimento3 = cand3;
          }
          else if (alimentosProteACuadrar.length == 2) {
            // (sin cambios)
          }
          else if (alimentosProteACuadrar.length == 3) {
            alimento1 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[0].nombre);
            alimento2 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[1].nombre);
            alimento3 = alimentosProteicos.find(alim => alim.nombre === alimentosProteACuadrar[2].nombre);

            let primerAlimento = alimentosProteACuadrar[0];
            let segundoAlimento = alimentosProteACuadrar[1];
            let tercerAlimento = alimentosProteACuadrar[2];
            let proteinasRestantes = (objetivo.proteina - proteinaTotal);

            if (primerAlimento.cantidad > 0 && segundoAlimento.cantidad == 0 && tercerAlimento.cantidad == 0) {
              let alimento1proteinas = primerAlimento.cantidad * alimento1.proteina;
              if (alimento1proteinas > proteinasRestantes) {
                throw new Error(`Vuelve a ingresar una cantidad menor de alimento proteíco para ${primerAlimento.nombre}, hubo un error`);
              }
              let prop1 = (alimento1proteinas / proteinasRestantes);
              let prop2 = Math.random() * (1 - prop1);
              let prop3 = 1 - (prop1 + prop2);
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
            else if (primerAlimento.cantidad == 0 && segundoAlimento.cantidad > 0 && tercerAlimento.cantidad == 0) {
              let alimento2proteinas = segundoAlimento.cantidad * alimento2.proteina;
              if (alimento2proteinas > proteinasRestantes) {
                throw new Error(`Vuelve a ingresar una cantidad menor de proteinas para el alimento ${segundoAlimento.nombre}, hubo un error.`);
              }
              let prop2 = alimento2proteinas / proteinasRestantes;
              let prop1 = Math.random() * (1 - prop2);
              let prop3 = 1 - (prop1 + prop2);
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
            else if (primerAlimento.cantidad == 0 && segundoAlimento.cantidad == 0 && tercerAlimento.cantidad > 0) {
              let alimento3proteinas = tercerAlimento.cantidad * alimento3.proteina;
              if (alimento3proteinas > proteinasRestantes) {
                throw new Error(`Vuelve a ingresar una cantidad menor de proteinas para el alimento ${tercerAlimento.nombre}, hubo un error`);
              }
              let prop3 = (alimento3proteinas / proteinasRestantes);
              let prop1 = Math.random();
              let prop2 = 1 - prop3 - prop1;
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
            else if (primerAlimento.cantidad > 0 && segundoAlimento.cantidad > 0 && tercerAlimento.cantidad == 0) {
              let a1p = primerAlimento.cantidad * alimento1.proteina;
              let a2p = segundoAlimento.cantidad * alimento2.proteina;
              if (a1p + a2p > proteinasRestantes) {
                throw new Error("La cantidad de proteínas no puede exceder las proteínas restantes. Vuelve a ingresar los valores.");
              }
              let prop1 = (a1p / proteinasRestantes);
              let prop2 = (a2p / proteinasRestantes);
              let prop3 = 1 - (prop1 + prop2);
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
            else if (primerAlimento.cantidad > 0 && segundoAlimento.cantidad == 0 && tercerAlimento.cantidad > 0) {
              let a1p = primerAlimento.cantidad * alimento1.proteina;
              let a3p = tercerAlimento.cantidad * alimento3.proteina;
              if (a1p + a3p > proteinasRestantes) {
                throw new Error("La cantidad de proteínas no puede exceder las proteínas restantes. Vuelve a ingresar los valores.");
              }
              let prop1 = (a1p / proteinasRestantes);
              let prop3 = (a3p / proteinasRestantes);
              let prop2 = 1 - (prop1 + prop3);
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
            else if (primerAlimento.cantidad == 0 && segundoAlimento.cantidad > 0 && tercerAlimento.cantidad > 0) {
              let a2p = segundoAlimento.cantidad * alimento2.proteina;
              let a3p = tercerAlimento.cantidad * alimento3.proteina;
              if (a2p + a3p > proteinasRestantes) {
                throw new Error("La cantidad de proteínas no puede exceder las proteínas restantes. Vuelve a ingresar los valores.");
              }
              let prop2 = (a2p / proteinasRestantes);
              let prop3 = (a3p / proteinasRestantes);
              let prop1 = 1 - (prop2 + prop3);
              if (Math.abs(prop1 + prop2 + prop3 - 1) > 0.0001) {
                throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
              }
              porcentajeAlimento1 = prop1;
              porcentajeAlimento2 = prop2;
              porcentajeAlimento3 = prop3;
            }
          }
          else if (alimentosProteACuadrar.length == 0) {
            alimento1 = alimentosProteicos[Math.floor(Math.random() * alimentosProteicos.length)];
            let nombre2, cand2;
            do {
              nombre2 = combinacionDameProteRandom(alimento1.nombre);
              cand2 = buscarPorNombre(alimentos, nombre2);
            } while (!cand2 || cand2.nombre === alimento1.nombre);
            alimento2 = cand2;

            let nombre3, cand3;
            do {
              nombre3 = combinacionDameProteRandom(alimento1.nombre);
              cand3 = buscarPorNombre(alimentos, nombre3);
            } while (!cand3 || cand3.nombre === alimento1.nombre || cand3.nombre === alimento2.nombre);
            alimento3 = cand3;
          }
        } while (!alimento1 || !alimento2 || !alimento3 ||
                 alimento1.nombre === alimento2.nombre ||
                 alimento1.nombre === alimento3.nombre ||
                 alimento2.nombre === alimento3.nombre);

        const proteinaAlimento1 = objetivo.proteina * porcentajeAlimento1;
        const proteinaAlimento2 = objetivo.proteina * porcentajeAlimento2;
        const proteinaAlimento3 = objetivo.proteina * porcentajeAlimento3;

        const cantidadNecesaria1 = (proteinaAlimento1 / alimento1.proteina);
        const cantidadNecesaria2 = (proteinaAlimento2 / alimento2.proteina);
        const cantidadNecesaria3 = (proteinaAlimento3 / alimento3.proteina);

        proteinaTotal      += proteinaAlimento1 + proteinaAlimento2 + proteinaAlimento3;
        carbohidratosTotal += (alimento1.carbohidratos * cantidadNecesaria1) + (alimento2.carbohidratos * cantidadNecesaria2) + (alimento3.carbohidratos * cantidadNecesaria3);
        grasasTotal        += (alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2) + (alimento3.grasas * cantidadNecesaria3);
        caloriasTotal      += (alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2) + (alimento3.calorias * cantidadNecesaria3);

        if (carbohidratosTotal <= objetivo.carbohidratos && grasasTotal <= objetivo.grasas) {
          procesarAlimentosProteicos = false;

          combinacion.push({ nombre: alimento1.nombre, cantidad: cantidadNecesaria1, proteina: alimento1.proteina * cantidadNecesaria1, carbohidratos: alimento1.carbohidratos * cantidadNecesaria1, grasas: alimento1.grasas * cantidadNecesaria1, calorias: alimento1.calorias * cantidadNecesaria1 });
          combinacion.push({ nombre: alimento2.nombre, cantidad: cantidadNecesaria2, proteina: alimento2.proteina * cantidadNecesaria2, carbohidratos: alimento2.carbohidratos * cantidadNecesaria2, grasas: alimento2.grasas * cantidadNecesaria2, calorias: alimento2.calorias * cantidadNecesaria2 });
          combinacion.push({ nombre: alimento3.nombre, cantidad: cantidadNecesaria3, proteina: alimento3.proteina * cantidadNecesaria3, carbohidratos: alimento3.carbohidratos * cantidadNecesaria3, grasas: alimento3.grasas * cantidadNecesaria3, calorias: alimento3.calorias * cantidadNecesaria3 });

          alimentosProteicosSeleccionados.push({ nombre: alimento1.nombre, cantidad: cantidadNecesaria1, proteina: alimento1.proteina * cantidadNecesaria1, carbohidratos: alimento1.carbohidratos * cantidadNecesaria1, grasas: alimento1.grasas * cantidadNecesaria1, calorias: alimento1.calorias * cantidadNecesaria1, unidadCalorica: alimento1.calorias, unidadProteica: alimento1.proteina, unidadCarbo: alimento1.carbohidratos, unidadGrasas: alimento1.grasas });
          alimentosProteicosSeleccionados.push({ nombre: alimento2.nombre, cantidad: cantidadNecesaria2, proteina: alimento2.proteina * cantidadNecesaria2, carbohidratos: alimento2.carbohidratos * cantidadNecesaria2, grasas: alimento2.grasas * cantidadNecesaria2, calorias: alimento2.calorias * cantidadNecesaria2, unidadCalorica: alimento2.calorias, unidadProteica: alimento2.proteina, unidadCarbo: alimento2.carbohidratos, unidadGrasas: alimento2.grasas });
          alimentosProteicosSeleccionados.push({ nombre: alimento3.nombre, cantidad: cantidadNecesaria3, proteina: alimento3.proteina * cantidadNecesaria3, carbohidratos: alimento3.carbohidratos * cantidadNecesaria3, grasas: alimento3.grasas * cantidadNecesaria3, calorias: alimento3.calorias * cantidadNecesaria3, unidadCalorica: alimento3.calorias, unidadProteica: alimento3.proteina, unidadCarbo: alimento3.carbohidratos, unidadGrasas: alimento3.grasas });

        } else {
          intentos++;
          procesarAlimentosProteicos = true;
          proteinaTotal = carbohidratosTotal = grasasTotal = caloriasTotal = 0;
          combinacion = [];
          if (intentos > 10) {
            throw new Error("No se pudo encontrar una combinación con los alimentos proteicos seleccionados, elegi otros alimentos ");
          }
        }

      // ====== 1 PROTEICO ======
      } else {
        let alimento;

        if (alimentosProteACuadrar.length == 1) {
          alimento = alimentosProteicos.find(alim => alim.nombre == alimentosProteACuadrar[0].nombre);
        } else if (alimentosProteACuadrar.length == 0) {
          alimento = alimentosProteicos[Math.floor(Math.random() * alimentosProteicos.length)];
        }

        const cantidadNecesaria = (objetivo.proteina - proteinaTotal) / alimento.proteina;

        proteinaTotal      += alimento.proteina * cantidadNecesaria;
        carbohidratosTotal += alimento.carbohidratos * cantidadNecesaria;
        grasasTotal        += alimento.grasas * cantidadNecesaria;
        caloriasTotal      += alimento.calorias * cantidadNecesaria;

        if (carbohidratosTotal <= objetivo.carbohidratos && grasasTotal <= objetivo.grasas) {
          procesarAlimentosProteicos = false;
          combinacion.push({
            nombre: alimento.nombre,
            cantidad: cantidadNecesaria,
            proteina: alimento.proteina * cantidadNecesaria,
            carbohidratos: alimento.carbohidratos * cantidadNecesaria,
            grasas: alimento.grasas * cantidadNecesaria,
            calorias: alimento.calorias * cantidadNecesaria
          });

          alimentosProteicosSeleccionados.push({
            nombre: alimento.nombre,
            cantidad: cantidadNecesaria,
            proteina: alimento.proteina * cantidadNecesaria,
            carbohidratos: alimento.carbohidratos * cantidadNecesaria,
            grasas: alimento.grasas * cantidadNecesaria,
            calorias: alimento.calorias * cantidadNecesaria,
            unidadCalorica: alimento.calorias,
            unidadProteica: alimento.proteina,
            unidadCarbo: alimento.carbohidratos,
            unidadGrasas: alimento.grasas
          });

        } else {
          intentos += 1;
          if (intentos > 10) {
            throw new Error("Se superó el número máximo de intentos permitidos.");
          }
          procesarAlimentosProteicos = true;
          proteinaTotal = carbohidratosTotal = grasasTotal = caloriasTotal = 0;
          combinacion = [];
        }
      }
    }

    // ===============================
    // 2) AJUSTE PARA CARBOHIDRATOS
    // ===============================
    let carbohidratosRestantes = objetivo.carbohidratos - carbohidratosTotal;
    let procesarAlimentosCarbohidratos = true;
    let alimentoProteicoPrincipal = alimentosProteicosSeleccionados[0];
    let cantidadAlimentosCarbohidratos;

    // Guardia: si no hay proteico principal, no podemos derivar combos de CH
    if (!alimentoProteicoPrincipal) {
      throw new Error("No se seleccionó alimento proteico principal. Reintentá.");
    }

    function seleccionarCantidadAlimentos(carbohidratosRestantes) {
      const r = Math.random();
      if (carbohidratosRestantes > 70) {
        return r < 0.7 ? 2 : 1;
      } else if (carbohidratosRestantes > 40) {
        return r < 0.9 ? 2 : 1;
      } else if (carbohidratosRestantes > 20) {
        return r < 0.7 ? 1 : 2;
      } else {
        return 1;
      }
    }

    while (procesarAlimentosCarbohidratos) {
      // recalcular cada vuelta según acumulados actuales
      carbohidratosRestantes = objetivo.carbohidratos - carbohidratosTotal;

      cantidadAlimentosCarbohidratos = seleccionarCantidadAlimentos(carbohidratosRestantes);
      if (alimentosChACuadrar.length > 0) {
        cantidadAlimentosCarbohidratos = alimentosChACuadrar.length;
      }

      // ====== 2 CARBOS ======
      if (cantidadAlimentosCarbohidratos === 2) {
        let porcentajeAlimento1 = 0.5 + Math.random() * 0.5;
        let porcentajeAlimento2 = 1 - porcentajeAlimento1;

        let alimento1, alimento2;

        const assertAlimento = (a, label) => {
          if (!a || !a.nombre) {
            throw new Error(`No se encontró ${label} de carbohidratos válido.`);
          }
        };
        const nombresDistintos = (a, b) =>
          a && b && a.nombre && b.nombre &&
          a.nombre.toLowerCase() !== b.nombre.toLowerCase();

        if (alimentosChACuadrar.length === 1) {
          alimento1 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[0].nombre);
          assertAlimento(alimento1, "primer alimento (a cuadrar)");
          alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          assertAlimento(alimento2, "segundo alimento secundario");
          if (alimentosChACuadrar[0].cantidad > 0) {
            porcentajeAlimento1 = alimentosChACuadrar[0].cantidad;
            porcentajeAlimento2 = 1 - porcentajeAlimento1;
          }
          let guard = 0;
          while (!nombresDistintos(alimento1, alimento2) && guard++ < 10) {
            alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
            assertAlimento(alimento2, "segundo alimento secundario");
          }
        } else if (alimentosChACuadrar.length === 2) {
          let alimentosFuentesCarbos = alimentos.filter(a => a.carbohidratos > a.proteina && a.carbohidratos > a.grasas);
          alimento1 = alimentosFuentesCarbos.find(alim => alim.nombre === alimentosChACuadrar[0].nombre);
          alimento2 = alimentosFuentesCarbos.find(alim => alim.nombre === alimentosChACuadrar[1].nombre);
          assertAlimento(alimento1, "primer alimento (a cuadrar)");
          assertAlimento(alimento2, "segundo alimento (a cuadrar)");

          const primerAlimento = alimentosChACuadrar[0];
          const segundoAlimento = alimentosChACuadrar[1];

          if (primerAlimento.cantidad > 0) {
            let carbRest = (objetivo.carbohidratos - carbohidratosTotal);
            let alimento1carb = primerAlimento.cantidad * alimento1.carbohidratos;
            if (alimento1carb > carbRest) throw new Error("Volve a ingresar otra cantidad, hubo un error");
            let prop1 = alimento1carb / carbRest;
            let prop2 = 1 - prop1;
            if (Math.abs(prop1 + prop2 - 1) > 1e-4) {
              throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
            }
            porcentajeAlimento1 = prop1;
            porcentajeAlimento2 = prop2;
          } else if (segundoAlimento.cantidad > 0) {
            let carbRest = objetivo.carbohidratos - carbohidratosTotal;
            if (carbRest <= 0) throw new Error("No hay carbohidratos restantes para asignar.");
            let alimento2carb = segundoAlimento.cantidad * alimento2.carbohidratos;
            if (alimento2carb > carbRest) throw new Error("Vuelve a ingresar otra cantidad, hubo un error.");
            let prop2 = alimento2carb / carbRest;
            let prop1 = 1 - prop2;
            if (Math.abs(prop1 + prop2 - 1) > 1e-4) {
              throw new Error("Error de cálculo en las proporciones. Revisa los valores ingresados.");
            }
            porcentajeAlimento1 = prop1;
            porcentajeAlimento2 = prop2;
          }

          if (!nombresDistintos(alimento1, alimento2)) {
            let guard = 0;
            do {
              alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
              assertAlimento(alimento2, "segundo alimento secundario");
            } while (!nombresDistintos(alimento1, alimento2) && guard++ < 10);
          }
        } else {
          alimento1 = combinacionDameCarbosPrincipalRandom(alimentoProteicoPrincipal.nombre);
          assertAlimento(alimento1, "primer alimento principal");
          alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          assertAlimento(alimento2, "segundo alimento secundario");

          let guard = 0;
          while (!nombresDistintos(alimento1, alimento2) && guard++ < 10) {
            alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
            assertAlimento(alimento2, "segundo alimento secundario");
          }
        }

        const diferenciaCarbohidratos = objetivo.carbohidratos - carbohidratosTotal;
        const carboAlimento1 = diferenciaCarbohidratos * porcentajeAlimento1;
        const carboAlimento2 = diferenciaCarbohidratos * porcentajeAlimento2;

        const cantidadNecesaria1 = carboAlimento1 / alimento1.carbohidratos;
        const cantidadNecesaria2 = carboAlimento2 / alimento2.carbohidratos;

        proteinaTotal      += (alimento1.proteina * cantidadNecesaria1) + (alimento2.proteina * cantidadNecesaria2);
        carbohidratosTotal += carboAlimento1 + carboAlimento2;
        grasasTotal        += (alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2);
        caloriasTotal      += (alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2);

        if (grasasTotal <= objetivo.grasas) {
          procesarAlimentosCarbohidratos = false;

          const reg = (al, cant) => ({
            nombre: al.nombre,
            cantidad: cant,
            proteina: al.proteina * cant,
            carbohidratos: al.carbohidratos * cant,
            grasas: al.grasas * cant,
            calorias: al.calorias * cant,
            unidadCalorica: al.calorias,
            unidadProteica: al.proteina,
            unidadCarbo: al.carbohidratos,
            unidadGrasas: al.grasas
          });

          const r1 = reg(alimento1, cantidadNecesaria1);
          const r2 = reg(alimento2, cantidadNecesaria2);

          combinacion.push(r1, r2);
          alimentosChSeleccionados.push(r1, r2);
        } else {
          procesarAlimentosCarbohidratos = true;
          intentos += 1;
          proteinaTotal      -= ((alimento1.proteina * cantidadNecesaria1) + (alimento2.proteina * cantidadNecesaria2));
          carbohidratosTotal -= ((alimento1.carbohidratos * cantidadNecesaria1) + (alimento2.carbohidratos * cantidadNecesaria2));
          grasasTotal        -= ((alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2));
          caloriasTotal      -= ((alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2));
          if (intentos > 5) {
            throw new Error("No se pudo encontrar una combinación con los alimentos de carbohidratos seleccionados");
          }
        }
      }

      // ====== 3 CARBOS ======
      else if (cantidadAlimentosCarbohidratos == 3) {
        let alimento1, alimento2, alimento3;

        const assertAlimento = (a, label) => {
          if (!a || !a.nombre) throw new Error(`No se encontró ${label} de carbohidratos válido.`);
        };
        const nombresDistintos3 = (a, b, c) => {
          const n1 = a?.nombre?.toLowerCase();
          const n2 = b?.nombre?.toLowerCase();
          const n3 = c?.nombre?.toLowerCase();
          return n1 && n2 && n3 && n1 !== n2 && n1 !== n3 && n2 !== n3;
        };

        let porcentajeAlimento1 = Math.random();
        let porcentajeAlimento2 = Math.random() * (1 - porcentajeAlimento1);
        let porcentajeAlimento3 = 1 - (porcentajeAlimento1 + porcentajeAlimento2);

        if (alimentosChACuadrar.length === 1) {
          alimento1 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[0].nombre);
          assertAlimento(alimento1, "primer alimento (a cuadrar)");
          alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          assertAlimento(alimento2, "segundo alimento secundario");
          let guard = 0;
          do {
            alimento3 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
            assertAlimento(alimento3, "tercer alimento secundario");
          } while (!nombresDistintos3(alimento1, alimento2, alimento3) && guard++ < 10);
        } else if (alimentosChACuadrar.length === 3) {
          alimento1 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[0].nombre);
          alimento2 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[1].nombre);
          alimento3 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[2].nombre);
          assertAlimento(alimento1, "primer alimento (a cuadrar)");
          assertAlimento(alimento2, "segundo alimento (a cuadrar)");
          assertAlimento(alimento3, "tercer alimento (a cuadrar)");
          // Proporciones según cantidades precargadas (si aplica).
        } else {
          alimento1 = combinacionDameCarbosPrincipalRandom(alimentoProteicoPrincipal.nombre);
          alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          let guard = 0;
          do {
            alimento3 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          } while (!nombresDistintos3(alimento1, alimento2, alimento3) && guard++ < 10);
          assertAlimento(alimento1, "primer alimento");
          assertAlimento(alimento2, "segundo alimento");
          assertAlimento(alimento3, "tercer alimento");
        }

        // --- SNAPSHOT antes del intento (3 CH)
        const snap = {
          proteinaTotal,
          carbohidratosTotal,
          grasasTotal,
          caloriasTotal
        };

        // Usar los carbohidratos RESTANTES (no el objetivo total)
        const diferenciaCarbohidratos = objetivo.carbohidratos - carbohidratosTotal;
        const carbosAlimento1 = diferenciaCarbohidratos * porcentajeAlimento1;
        const carbosAlimento2 = diferenciaCarbohidratos * porcentajeAlimento2;
        const carbosAlimento3 = diferenciaCarbohidratos * porcentajeAlimento3;

        const cantidadNecesaria1 = carbosAlimento1 / alimento1.carbohidratos;
        const cantidadNecesaria2 = carbosAlimento2 / alimento2.carbohidratos;
        const cantidadNecesaria3 = carbosAlimento3 / alimento3.carbohidratos;

        proteinaTotal      += (alimento1.proteina * cantidadNecesaria1) + (alimento2.proteina * cantidadNecesaria2) + (alimento3.proteina * cantidadNecesaria3);
        carbohidratosTotal += carbosAlimento1 + carbosAlimento2 + carbosAlimento3;
        grasasTotal        += (alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2) + (alimento3.grasas * cantidadNecesaria3);
        caloriasTotal      += (alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2) + (alimento3.calorias * cantidadNecesaria3);

        if (grasasTotal <= objetivo.grasas) {
          procesarAlimentosCarbohidratos = false;

          const reg = (al, cant) => ({
            nombre: al.nombre, cantidad: cant,
            proteina: al.proteina * cant, carbohidratos: al.carbohidratos * cant,
            grasas: al.grasas * cant, calorias: al.calorias * cant,
            unidadCalorica: al.calorias, unidadProteica: al.proteina,
            unidadCarbo: al.carbohidratos, unidadGrasas: al.grasas
          });

          const r1 = reg(alimento1, cantidadNecesaria1);
          const r2 = reg(alimento2, cantidadNecesaria2);
          const r3 = reg(alimento3, cantidadNecesaria3);

          combinacion.push(r1, r2, r3);
          alimentosChSeleccionados.push(r1, r2, r3);

        } else {
          // revertir sólo lo sumado en este intento (no borrar todo)
          intentos++;
          procesarAlimentosCarbohidratos = true;

          proteinaTotal      = snap.proteinaTotal;
          carbohidratosTotal = snap.carbohidratosTotal;
          grasasTotal        = snap.grasasTotal;
          caloriasTotal      = snap.caloriasTotal;

          if (intentos > 6) {
            throw new Error("No se pudo encontrar una combinación con los alimentos carbohidratos seleccionados, elegí otros alimentos");
          }
        }
      }

      // ====== 4 CARBOS ======
      else if (cantidadAlimentosCarbohidratos == 4) {
        let alimento1, alimento2, alimento3, alimento4;

        const assertAlimento = (a, label) => {
          if (!a || !a.nombre) throw new Error(`No se encontró ${label} de carbohidratos válido.`);
        };
        const nombresDistintos4 = (a, b, c, d) => {
          const n = [a, b, c, d].map(x => x?.nombre?.toLowerCase());
          return n.every(Boolean) && new Set(n).size === 4;
        };

        let porcentajeAlimento1 = Math.random();
        let porcentajeAlimento2 = Math.random() * (1 - porcentajeAlimento1);
        let porcentajeAlimento3 = Math.random() * (1 - (porcentajeAlimento1 + porcentajeAlimento2));
        let porcentajeAlimento4 = 1 - (porcentajeAlimento1 + porcentajeAlimento2 + porcentajeAlimento3);

        if (alimentosChACuadrar.length === 4) {
          alimento1 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[0].nombre);
          alimento2 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[1].nombre);
          alimento3 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[2].nombre);
          alimento4 = alimentos.find(alim => alim.nombre === alimentosChACuadrar[3].nombre);
          assertAlimento(alimento1, "alimento 1 (a cuadrar)");
          assertAlimento(alimento2, "alimento 2 (a cuadrar)");
          assertAlimento(alimento3, "alimento 3 (a cuadrar)");
          assertAlimento(alimento4, "alimento 4 (a cuadrar)");
        } else {
          alimento1 = combinacionDameCarbosPrincipalRandom(alimentoProteicoPrincipal.nombre);
          alimento2 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          let guard = 0;
          do {
            alimento3 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
            alimento4 = combinacionDameCarbosSecundarioRandom(alimentoProteicoPrincipal.nombre);
          } while (!nombresDistintos4(alimento1, alimento2, alimento3, alimento4) && guard++ < 10);

          assertAlimento(alimento1, "alimento 1");
          assertAlimento(alimento2, "alimento 2");
          assertAlimento(alimento3, "alimento 3");
          assertAlimento(alimento4, "alimento 4");
        }

        // --- SNAPSHOT antes del intento (4 CH)
        const snap = {
          proteinaTotal,
          carbohidratosTotal,
          grasasTotal,
          caloriasTotal
        };

        // Usar carbohidratos RESTANTES
        const diferenciaCarbohidratos = objetivo.carbohidratos - carbohidratosTotal;
        const carbosAlimento1 = diferenciaCarbohidratos * porcentajeAlimento1;
        const carbosAlimento2 = diferenciaCarbohidratos * porcentajeAlimento2;
        const carbosAlimento3 = diferenciaCarbohidratos * porcentajeAlimento3;
        const carbosAlimento4 = diferenciaCarbohidratos * porcentajeAlimento4;

        const cantidadNecesaria1 = carbosAlimento1 / alimento1.carbohidratos;
        const cantidadNecesaria2 = carbosAlimento2 / alimento2.carbohidratos;
        const cantidadNecesaria3 = carbosAlimento3 / alimento3.carbohidratos;
        const cantidadNecesaria4 = carbosAlimento4 / alimento4.carbohidratos;

        proteinaTotal      += (alimento1.proteina * cantidadNecesaria1) + (alimento2.proteina * cantidadNecesaria2) + (alimento3.proteina * cantidadNecesaria3) + (alimento4.proteina * cantidadNecesaria4);
        carbohidratosTotal += carbosAlimento1 + carbosAlimento2 + carbosAlimento3 + carbosAlimento4;
        grasasTotal        += (alimento1.grasas * cantidadNecesaria1) + (alimento2.grasas * cantidadNecesaria2) + (alimento3.grasas * cantidadNecesaria3) + (alimento4.grasas * cantidadNecesaria4);
        caloriasTotal      += (alimento1.calorias * cantidadNecesaria1) + (alimento2.calorias * cantidadNecesaria2) + (alimento3.calorias * cantidadNecesaria3) + (alimento4.calorias * cantidadNecesaria4);

        if (grasasTotal <= objetivo.grasas) {
          procesarAlimentosCarbohidratos = false;

          const reg = (al, cant) => ({
            nombre: al.nombre,
            cantidad: cant,
            proteina: al.proteina * cant,
            carbohidratos: al.carbohidratos * cant,
            grasas: al.grasas * cant,
            calorias: al.calorias * cant,
            unidadCalorica: al.calorias,
            unidadProteica: al.proteina,
            unidadCarbo: al.carbohidratos,
            unidadGrasas: al.grasas
          });

          const r1 = reg(alimento1, cantidadNecesaria1);
          const r2 = reg(alimento2, cantidadNecesaria2);
          const r3 = reg(alimento3, cantidadNecesaria3);
          const r4 = reg(alimento4, cantidadNecesaria4);

          combinacion.push(r1, r2, r3, r4);
          alimentosChSeleccionados.push(r1, r2, r3, r4);

        } else {
          // revertir sólo lo sumado en este intento
          intentos += 1;
          procesarAlimentosCarbohidratos = true;

          proteinaTotal      = snap.proteinaTotal;
          carbohidratosTotal = snap.carbohidratosTotal;
          grasasTotal        = snap.grasasTotal;
          caloriasTotal      = snap.caloriasTotal;

          if (intentos > 6) {
            throw new Error("No se pudo encontrar una combinación con los alimentos carbohidratos seleccionados, elegí otros alimentos");
          }
        }
      }

      // ====== 1 CARBO ======
      else if (cantidadAlimentosCarbohidratos == 1) {
        let alimento;

        if (alimentosChACuadrar.length >= 1) {
          alimento = alimentos.find(alim => alim.nombre == alimentosChACuadrar[0].nombre);
        } else {
          alimento = combinacionDameCarbosPrincipalRandom(alimentoProteicoPrincipal.nombre);
        }
        if (!alimento) throw new Error("No se encontró alimento de carbohidratos válido.");

        const cantidadNecesaria = (carbohidratosRestantes / alimento.carbohidratos);
        proteinaTotal      += (alimento.proteina * cantidadNecesaria);
        carbohidratosTotal += (alimento.carbohidratos * cantidadNecesaria);
        grasasTotal        += (alimento.grasas * cantidadNecesaria);
        caloriasTotal      += (alimento.calorias * cantidadNecesaria);

        if (grasasTotal <= objetivo.grasas) {
          procesarAlimentosCarbohidratos = false;

          const reg = (al, cant) => ({
            nombre: al.nombre,
            cantidad: cant,
            proteina: al.proteina * cant,
            carbohidratos: al.carbohidratos * cant,
            grasas: al.grasas * cant,
            calorias: al.calorias * cant,
            unidadCalorica: al.calorias,
            unidadProteica: al.proteina,
            unidadCarbo: al.carbohidratos,
            unidadGrasas: al.grasas
          });

          const r = reg(alimento, cantidadNecesaria);
          combinacion.push(r);
          alimentosChSeleccionados.push(r);
        } else {
          procesarAlimentosCarbohidratos = true;
          proteinaTotal      -= (alimento.proteina * cantidadNecesaria);
          carbohidratosTotal -= (alimento.carbohidratos * cantidadNecesaria);
          grasasTotal        -= (alimento.grasas * cantidadNecesaria);
          caloriasTotal      -= (alimento.calorias * cantidadNecesaria);
        }
      }
    }

    // ======================
    // 3) AJUSTE PARA GRASAS
    // ======================
    let grasasRestantes = objetivo.grasas - grasasTotal;

    if (grasasRestantes > 0) {

      let cantidadAlimentosGrasas;
      if (alimentosGrACuadrar.length > 0) {
        cantidadAlimentosGrasas = alimentosGrACuadrar.length;
      } else if (grasasRestantes < 30) {
        cantidadAlimentosGrasas = 1;
      } else {
        cantidadAlimentosGrasas = Math.floor(Math.random() * 2) + 1; // 1..2
      }

      const alimentosConGrasas = alimentos.filter(a => a.grasas > a.proteina && a.grasas > a.carbohidratos);

      const findGrasoByName = (name) => {
        const n = String(name || '').toLowerCase();
        return alimentosConGrasas.find(x => String(x.nombre || '').toLowerCase() === n) || null;
      };
      const pickRandomGraso = (exclude = []) => {
        const excl = new Set(exclude.map(e => String(e).toLowerCase()));
        const pool = alimentosConGrasas.filter(x => !excl.has(String(x.nombre).toLowerCase()));
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)];
      };

      if (cantidadAlimentosGrasas === 2) {
        let p1 = Math.random();
        let p2 = 1 - p1;

        let alimento1 = null, alimento2 = null;

        if (alimentosGrACuadrar.length === 2) {
          alimento1 = findGrasoByName(alimentosGrACuadrar[0].nombre);
          alimento2 = findGrasoByName(alimentosGrACuadrar[1].nombre);
        } else {
          alimento1 = pickRandomGraso();
          alimento2 = pickRandomGraso([alimento1 ? alimento1.nombre : '']);
        }

        if (!alimento1 || !alimento2) {
          throw new Error("No hay suficientes alimentos grasos disponibles para seleccionar 2 distintos.");
        }
        if (alimento1.grasas <= 0 || alimento2.grasas <= 0) {
          throw new Error("Un alimento graso tiene valor de grasas no válido (<= 0).");
        }

        const g1 = grasasRestantes * p1;
        const g2 = grasasRestantes * p2;

        const cant1 = g1 / alimento1.grasas;
        const cant2 = g2 / alimento2.grasas;

        proteinaTotal      += (alimento1.proteina * cant1) + (alimento2.proteina * cant2);
        carbohidratosTotal += (alimento1.carbohidratos * cant1) + (alimento2.carbohidratos * cant2);
        grasasTotal        += g1 + g2;
        caloriasTotal      += (alimento1.calorias * cant1) + (alimento2.calorias * cant2);

        combinacion.push({ nombre: alimento1.nombre, cantidad: cant1, proteina: alimento1.proteina * cant1, carbohidratos: alimento1.carbohidratos * cant1, grasas: alimento1.grasas * cant1, calorias: alimento1.calorias * cant1 });
        combinacion.push({ nombre: alimento2.nombre, cantidad: cant2, proteina: alimento2.proteina * cant2, carbohidratos: alimento2.carbohidratos * cant2, grasas: alimento2.grasas * cant2, calorias: alimento2.calorias * cant2 });

        alimentosGrasasSeleccionados.push({ 
          nombre: alimento1.nombre, cantidad: cant1, proteina: alimento1.proteina * cant1, carbohidratos: alimento1.carbohidratos * cant1, grasas: alimento1.grasas * cant1, calorias: alimento1.calorias * cant1,
          unidadCalorica: alimento1.calorias, unidadProteica: alimento1.proteina, unidadCarbo: alimento1.carbohidratos, unidadGrasas: alimento1.grasas
        });
        alimentosGrasasSeleccionados.push({ 
          nombre: alimento2.nombre, cantidad: cant2, proteina: alimento2.proteina * cant2, carbohidratos: alimento2.carbohidratos * cant2, grasas: alimento2.grasas * cant2, calorias: alimento2.calorias * cant2,
          unidadCalorica: alimento2.calorias, unidadProteica: alimento2.proteina, unidadCarbo: alimento2.carbohidratos, unidadGrasas: alimento2.grasas
        });

      } else if (cantidadAlimentosGrasas === 3) {
        let p1 = Math.random();
        let p2 = Math.random() * (1 - p1);
        let p3 = 1 - (p1 + p2);

        let alimento1 = null, alimento2 = null, alimento3 = null;

        if (alimentosGrACuadrar.length === 3) {
          alimento1 = findGrasoByName(alimentosGrACuadrar[0].nombre);
          alimento2 = findGrasoByName(alimentosGrACuadrar[1].nombre);
          alimento3 = findGrasoByName(alimentosGrACuadrar[2].nombre);
        } else {
          alimento1 = pickRandomGraso();
          alimento2 = pickRandomGraso([alimento1 ? alimento1.nombre : '']);
          alimento3 = pickRandomGraso([alimento1 ? alimento1.nombre : '', alimento2 ? alimento2.nombre : '']);
        }

        if (!alimento1 || !alimento2 || !alimento3) {
          throw new Error("No hay suficientes alimentos grasos disponibles para seleccionar 3 distintos.");
        }
        if (alimento1.grasas <= 0 || alimento2.grasas <= 0 || alimento3.grasas <= 0) {
          throw new Error("Un alimento graso tiene valor de grasas no válido (<= 0).");
        }

        const g1 = grasasRestantes * p1;
        const g2 = grasasRestantes * p2;
        const g3 = grasasRestantes * p3;

        const cant1 = g1 / alimento1.grasas;
        const cant2 = g2 / alimento2.grasas;
        const cant3 = g3 / alimento3.grasas;

        proteinaTotal      += (alimento1.proteina * cant1) + (alimento2.proteina * cant2) + (alimento3.proteina * cant3);
        carbohidratosTotal += (alimento1.carbohidratos * cant1) + (alimento2.carbohidratos * cant2) + (alimento3.carbohidratos * cant3);
        grasasTotal        += g1 + g2 + g3;
        caloriasTotal      += (alimento1.calorias * cant1) + (alimento2.calorias * cant2) + (alimento3.calorias * cant3);

        const pushSel = (al, c) => {
          combinacion.push({ nombre: al.nombre, cantidad: c, proteina: al.proteina * c, carbohidratos: al.carbohidratos * c, grasas: al.grasas * c, calorias: al.calorias * c });
          alimentosGrasasSeleccionados.push({
            nombre: al.nombre, cantidad: c, proteina: al.proteina * c, carbohidratos: al.carbohidratos * c, grasas: al.grasas * c, calorias: al.calorias * c,
            unidadCalorica: al.calorias, unidadProteica: al.proteina, unidadCarbo: al.carbohidratos, unidadGrasas: al.grasas
          });
        };
        pushSel(alimento1, cant1);
        pushSel(alimento2, cant2);
        pushSel(alimento3, cant3);

      } else if (cantidadAlimentosGrasas === 1) {
        let alimento = null;
        if (alimentosGrACuadrar.length >= 1) {
          alimento = findGrasoByName(alimentosGrACuadrar[0].nombre);
        } else {
          alimento = pickRandomGraso();
        }

        if (!alimento) {
          throw new Error("No hay alimentos grasos disponibles para seleccionar.");
        }
        if (alimento.grasas <= 0) {
          throw new Error(`El alimento ${alimento.nombre} tiene grasas <= 0 y no puede usarse para ajustar.`);
        }

        const cant = (grasasRestantes / alimento.grasas);

        proteinaTotal      += (alimento.proteina * cant);
        carbohidratosTotal += (alimento.carbohidratos * cant);
        grasasTotal        += (alimento.grasas * cant);
        caloriasTotal      += (alimento.calorias * cant);

        combinacion.push({ nombre: alimento.nombre, cantidad: cant, proteina: alimento.proteina * cant, carbohidratos: alimento.carbohidratos * cant, grasas: alimento.grasas * cant, calorias: alimento.calorias * cant });

        alimentosGrasasSeleccionados.push({ 
          nombre: alimento.nombre, cantidad: cant, 
          proteina: alimento.proteina * cant, carbohidratos: alimento.carbohidratos * cant, grasas: alimento.grasas * cant, calorias: alimento.calorias * cant,
          unidadCalorica: alimento.calorias, unidadProteica: alimento.proteina, unidadCarbo: alimento.carbohidratos, unidadGrasas: alimento.grasas
        });
      }

      intentos += 1;

    } else {
      // no hay grasas a ajustar: nada más que hacer
    }
  }
}

function imprimirComidaGenerada() {
  console.log("Comida generada:");
  console.log("Alimentos proteicos seleccionados:" , alimentosProteicosSeleccionados);
  console.log("Alimentos Carbohidratos seleccionados :" , alimentosChSeleccionados);
  console.log("Alimentos grasas seleccionados " , alimentosGrasasSeleccionados);

  console.log(`Proteína Total: ${proteinaTotal.toFixed(2)}g`);
  console.log("Proteinas objetivo" , objetivo.proteina);
  console.log(`Carbohidratos Total: ${carbohidratosTotal.toFixed(2)}g`);
  console.log("Carbos objetivo" , objetivo.carbohidratos);
  console.log(`Grasas Total: ${grasasTotal.toFixed(2)}g`);
  console.log("Grasas objetivo" , objetivo.grasas);
  console.log(`Calorías Total: ${caloriasTotal.toFixed(2)}kcal`);
  console.log(`Calorías objetivo: ${objetivo.calorias.toFixed(2)}kcal`);
}

function ajustarProteinas() {
  console.log("Como no llegamos a la meta de proteinas, hacemos unos calculitos");
  const diferenciaProteica = objetivo.proteina - proteinaTotal;
  if (diferenciaProteica <= 0) return;

  const alimentoSel = alimentosProteicosSeleccionados[0];
  if (!alimentoSel) return;

  const objetoAlimentoProteico = alimentos.find(
    alim => String(alim.nombre || '').toLowerCase() === String(alimentoSel.nombre || '').toLowerCase()
  );
  if (!objetoAlimentoProteico || objetoAlimentoProteico.calorias <= 0) return;

  const calorias = (diferenciaProteica * 1.10) * 4;
  const cantidadProteicaASumar = calorias / objetoAlimentoProteico.calorias;

  alimentosProteicosSeleccionados[0].cantidad      += cantidadProteicaASumar;
  alimentosProteicosSeleccionados[0].calorias      += objetoAlimentoProteico.calorias * cantidadProteicaASumar;
  alimentosProteicosSeleccionados[0].proteina      += objetoAlimentoProteico.proteina * cantidadProteicaASumar;
  alimentosProteicosSeleccionados[0].carbohidratos += objetoAlimentoProteico.carbohidratos * cantidadProteicaASumar;
  alimentosProteicosSeleccionados[0].grasas        += objetoAlimentoProteico.grasas * cantidadProteicaASumar;

  if (alimentosChSeleccionados.length >= 1) {
    const alimentoCh = alimentosChSeleccionados[0];
    const objetoAlimentoCh = alimentos.find(
      alim => String(alim.nombre || '').toLowerCase() === String(alimentoCh.nombre || '').toLowerCase()
    );
    if (objetoAlimentoCh && objetoAlimentoCh.calorias > 0) {
      const cantidadChARestar = calorias / objetoAlimentoCh.calorias;
      alimentoCh.cantidad      -= cantidadChARestar;
      alimentoCh.calorias      -= objetoAlimentoCh.calorias * cantidadChARestar;
      alimentoCh.proteina      -= objetoAlimentoCh.proteina * cantidadChARestar;
      alimentoCh.carbohidratos -= objetoAlimentoCh.carbohidratos * cantidadChARestar;
      alimentoCh.grasas        -= objetoAlimentoCh.grasas * cantidadChARestar;
    }
  }
}

function mejorarCalorias (alimentosProteACuadrar, alimentosCarbosACuadrar) { 
  let diferenciaCalorica = caloriasTotal - objetivo.calorias;
  let diferenciaProteica = proteinaTotal - objetivo.proteina;

  console.log("La diferencia proteica es de " , diferenciaProteica);

  // === Caso: 1 proteico seleccionado ===
  if (alimentosProteicosSeleccionados.length === 1) {
    console.log(alimentosProteicosSeleccionados);
    let alimentoProteicoARestar = alimentosProteicosSeleccionados[0];
    console.log("Vamos a restarle cantidad a este alimento " , alimentoProteicoARestar?.nombre);

    const objetoAlimentoProteico = alimentos.find(
      alim => String(alim.nombre || '').toLowerCase() === String(alimentoProteicoARestar?.nombre || '').toLowerCase()
    );

    if (!objetoAlimentoProteico) {
      console.warn("No se encontró el objeto alimento proteico para restar.");
      return;
    }
    if (!Number.isFinite(diferenciaCalorica) || objetoAlimentoProteico.calorias <= 0) {
      console.warn("Datos inválidos para el ajuste calórico (calorías por unidad <= 0 o diferencia no válida).");
      return;
    }

    console.log("La diferencia calorica es de " , diferenciaCalorica);
    console.log("Por lo tango dividimos las calorias", diferenciaCalorica, " con las calorias del objeto proteico ", objetoAlimentoProteico.calorias);

    const cantidadAlimentoProteicoARestar = diferenciaCalorica / objetoAlimentoProteico.calorias;

    alimentoProteicoARestar.cantidad      = Math.max(0, alimentoProteicoARestar.cantidad      - cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.calorias      = Math.max(0, alimentoProteicoARestar.calorias      - objetoAlimentoProteico.calorias * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.proteina      = Math.max(0, alimentoProteicoARestar.proteina      - objetoAlimentoProteico.proteina * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.carbohidratos = Math.max(0, alimentoProteicoARestar.carbohidratos - objetoAlimentoProteico.carbohidratos * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.grasas        = Math.max(0, alimentoProteicoARestar.grasas        - objetoAlimentoProteico.grasas * cantidadAlimentoProteicoARestar);

    caloriasTotal      -= objetoAlimentoProteico.calorias * cantidadAlimentoProteicoARestar;
    proteinaTotal      -= objetoAlimentoProteico.proteina * cantidadAlimentoProteicoARestar;
    carbohidratosTotal -= objetoAlimentoProteico.carbohidratos * cantidadAlimentoProteicoARestar;
    grasasTotal        -= objetoAlimentoProteico.grasas * cantidadAlimentoProteicoARestar;

    if (proteinaTotal < objetivo.proteina) {
      // ajustarProteinas();
    }
  }

  // === Caso: 2 proteicos seleccionados ===
  if (alimentosProteicosSeleccionados.length === 2) {
    console.log("LOS ALIMENTOS PROTEICOS SELECCIONADOS SON UNO (1)");
    let alimentoProteicoARestar;

    if (Array.isArray(alimentosProteACuadrar) && alimentosProteACuadrar.length > 0) {
      console.log("HAY AL MENOS UN ALIMENTO PROTEICO A CUADRARRRRRR");
      const aCuadrar =
        alimentosProteACuadrar.find(alim => alim.modificable === true) ||
        alimentosProteACuadrar[0];

      alimentoProteicoARestar =
        alimentosProteicosSeleccionados.find(alim =>
          String(alim.nombre || '').toLowerCase() === String(aCuadrar?.nombre || '').toLowerCase()
        ) || alimentosProteicosSeleccionados[0];
    } else {
      alimentoProteicoARestar = alimentosProteicosSeleccionados[0];
    }

    if (!alimentoProteicoARestar) {
      console.warn("No se encontró un alimento proteico para restar.");
      return;
    }

    const objetoAlimentoProteico = alimentos.find(
      alim => String(alim.nombre || '').toLowerCase() === String(alimentoProteicoARestar.nombre || '').toLowerCase()
    );

    if (!objetoAlimentoProteico || objetoAlimentoProteico.calorias <= 0) {
      console.warn("Objeto alimento proteico inválido para restar (calorías por unidad <= 0).");
      return;
    }

    if (diferenciaCalorica > alimentoProteicoARestar.calorias) {

      run();
      return;
    }

    const cantidadAlimentoProteicoARestar = diferenciaCalorica / objetoAlimentoProteico.calorias;

    alimentoProteicoARestar.cantidad      = Math.max(0, alimentoProteicoARestar.cantidad      - cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.calorias      = Math.max(0, alimentoProteicoARestar.calorias      - objetoAlimentoProteico.calorias * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.proteina      = Math.max(0, alimentoProteicoARestar.proteina      - objetoAlimentoProteico.proteina * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.carbohidratos = Math.max(0, alimentoProteicoARestar.carbohidratos - objetoAlimentoProteico.carbohidratos * cantidadAlimentoProteicoARestar);
    alimentoProteicoARestar.grasas        = Math.max(0, alimentoProteicoARestar.grasas        - objetoAlimentoProteico.grasas * cantidadAlimentoProteicoARestar);

    caloriasTotal      -= objetoAlimentoProteico.calorias * cantidadAlimentoProteicoARestar;
    proteinaTotal      -= objetoAlimentoProteico.proteina * cantidadAlimentoProteicoARestar;
    carbohidratosTotal -= objetoAlimentoProteico.carbohidratos * cantidadAlimentoProteicoARestar;
    grasasTotal        -= objetoAlimentoProteico.grasas * cantidadAlimentoProteicoARestar;
  }

  if ((objetivo.calorias - 5) > caloriasTotal) {
    run();
  }
}

// Evita recursión cuando run() se llama desde adentro del algoritmo
let __RUNNING = false;

function run(targetComida){
  if (__RUNNING) return;       // <-- guard anti-recursión
  __RUNNING = true;
  try {
    console.log("ACA ARRAANCA LA FUNCION RUN");

    let soloAlimentosPasados = true;
    let alimentosProteicos = [];
    let alimentosCarbos = [
      { nombre: "Arroz", cantidad: 0,  modificable: true  },
      { nombre: "Papas", cantidad: 20, modificable: false }
    ];
    let alimentosGrasas = [];

    try {
      seleccionarComidaProteCarboGrasas(
        objetivo,
        soloAlimentosPasados,
        alimentosProteicos,
        alimentosCarbos,
        alimentosGrasas
      );
    } catch (error) {
      console.error(error.message);
    }
  } finally {
    __RUNNING = false;
  }
}


function resetSelecciones() {
  alimentosProteicosSeleccionados.length = 0;
  alimentosChSeleccionados.length = 0;
  alimentosGrasasSeleccionados.length = 0;
}

function menuCompleto() {
  return (
    alimentosProteicosSeleccionados.length > 0 &&
    alimentosChSeleccionados.length > 0 &&
    alimentosGrasasSeleccionados.length > 0
  );
}

// Genera 1 menú con reintentos automáticos
function generarMenu() {
  console.log("Generando un nuevo menú...");
  const MAX_RUN_ATTEMPTS = 6;

  let intento = 0;
  let completo = false;

  // silencio logs internos de run() para que no “ensucien” la consola
  const _log = console.log;
  console.log = () => {};

  try {
    while (intento < MAX_RUN_ATTEMPTS && !completo) {
      resetSelecciones();     // limpiamos estado antes de cada intento
      try {
        run();                // usa tu misma lógica interna
      } catch (e) {
        // si run lanza, seguimos intentando; NO cambiamos su lógica
      }
      completo = menuCompleto();
      intento++;
    }
  } finally {
    console.log = _log; // restauramos logs
  }

  if (!completo) {
    // si después de varios intentos no quedó completo, avisamos
    throw new Error("No se pudo generar un menú completo tras varios intentos.");
  }

  const resultado = {
    proteicos:     alimentosProteicosSeleccionados.map(a => ({ nombre: a.nombre, cantidad: a.cantidad })),
    carbohidratos: alimentosChSeleccionados.map(a => ({ nombre: a.nombre, cantidad: a.cantidad })),
    grasas:        alimentosGrasasSeleccionados.map(a => ({ nombre: a.nombre, cantidad: a.cantidad })),
  };

  console.log("Menú generado:", resultado);
  return resultado;
}

// Genera N menús (1 intento “alto nivel” por menú; los reintentos pasan dentro de generarMenu)
function generarMenus(cantidadMenus) {
  console.log(`Generando ${cantidadMenus} menús...`);
  const menus = [];
  for (let i = 0; i < cantidadMenus; i++) {
    console.log("Generando menú...");
    menus.push(generarMenu()); // si no logra completar, lanza y lo verás en consola/HTTP
  }
  return menus;
}



// --- Garantiza no devolver arrays vacíos (failsafe de API) ---
function menuEsCompleto(m) {
  return m
    && Array.isArray(m.proteicos) && m.proteicos.length > 0
    && Array.isArray(m.carbohidratos) && m.carbohidratos.length > 0
    && Array.isArray(m.grasas) && m.grasas.length > 0;
}

export function generarMenuNoVacio(maxIntentos = 8) {
  for (let i = 0; i < maxIntentos; i++) {
    try {
      const m = generarMenu(); // usa tu rutina con reintentos internos
      if (menuEsCompleto(m)) return m;
    } catch (_) { /* intento fallido, reintento */ }
  }
  throw new Error("No pude generar un menú completo tras varios intentos.");
}

export function generarMenusNoVacios(n, maxIntentosPorMenu = 8) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(generarMenuNoVacio(maxIntentosPorMenu));
  return out;
}




export default { generarMenu, generarMenus, generarMenuNoVacio, generarMenusNoVacios };