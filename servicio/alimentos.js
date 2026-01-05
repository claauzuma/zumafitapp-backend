import ModelFactory from "../model/DAO/alimentosFactory.js";
import menu from '../menu.js';


class ServicioAlimentos {
    constructor(persistencia) {
        this.model = ModelFactory.get(persistencia);
    }

obtenerAlimentos = async () => {
  try {
    const alimentosTotales = await this.model.obtenerAlimentos();
    return alimentosTotales; // ✅ devuelve el array directo
  } catch (error) {
    console.error('Error al obtener alimentos:', error);
    throw new Error('No se pudieron obtener los alimentos');
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
                status: 'success',
                data: resultado,
            };
        } catch (error) {
            console.error('Error al obtener comida:', error);
            throw new Error('No se pudo obtener la comida');
        }
    };

    obtenerComidaPrueba = async () => {
        try {


            const resultado = menu.generarMenu();
            return {
                status: 'success',
                data: resultado,
            };
        } catch (error) {
            console.error('Error al obtener comida de prueba:', error);
            throw new Error('No se pudieron obtener los alimentos de prueba');
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



    obtenerMenuDiario = async (objeto, targetComidas) => {
        try {
            const cantidadComidas = objeto.comidas || Math.floor(Math.random() * 3) + 3; // si no viene, genera entre 3 y 5
            const comidas = [];
    
            for (let i = 0; i < cantidadComidas; i++) {
                console.log("A la primer comida le pasamos el target")
                console.log(targetComidas[i])
                const comida = menu.generarMenu(targetComidas[i]); // le podés pasar el objeto si se usa dentro
                comidas.push(comida);
            }
    
            return comidas;
    
        } catch (error) {
            console.error('Error al obtener el menú diario:', error);
            throw new Error('No se pudo obtener el menú diario');
        }
    };
    

  
    obtenerMenuSemanal = async () => {
        try {
            const resultado = menu.generarMenu();
            return resultado;
        } catch (error) {
            console.error('Error al obtener el menú semanal:', error);
            throw new Error('No se pudo obtener el menú semanal');
        }
    };
}

export default ServicioAlimentos;
