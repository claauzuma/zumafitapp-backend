import ServiciosAlimentos from '../servicio/alimentos.js';

class ControladorAlimentos {
    constructor() {
        this.servicio = new ServiciosAlimentos();
    }

    // GET /api/alimentos/
    obtenerAlimentos = async (req, res) => {
        try {
            const alimentos = await this.servicio.obtenerAlimentos();
            res.json(alimentos);
        } catch (error) {
            console.error('Error al obtener alimentos:', error);
            res.status(500).json({ message: 'Error al obtener los alimentos' });
        }
    };

    // GET /api/alimentos/filtrar/comida?calorias=...&proteinas=...&...
    obtenerComida = async (req, res) => {
        try {
            const { calorias, proteinas, carbohidratos, grasas, ...rest } = req.query;

            // Alimentos individuales del query
            const alimentos = Object.values(rest).filter(Boolean);

            let comida;

            if (calorias && proteinas && !carbohidratos && !grasas) {
                comida = await this.servicio.obtenerComidaSoloConCaloriasYProteinas(
                    Number(calorias),
                    Number(proteinas),
                    alimentos
                );
            } else {
                comida = await this.servicio.obtenerComida(
                    Number(calorias),
                    Number(proteinas),
                    Number(carbohidratos),
                    Number(grasas),
                    alimentos
                );
            }

            res.json(comida);
        } catch (error) {
            console.error('Error al obtener comida:', error);
            res.status(500).json({ message: 'Error al obtener la comida' });
        }
    };

    // GET /api/alimentos/prueba
    obtenerComidaPrueba = async (req, res) => {
        try {
            const comida = await this.servicio.obtenerComidaPrueba();
            res.json(comida?.data ?? comida); // Soporta si viene con .data o no
        } catch (error) {
            console.error('Error al obtener comida de prueba:', error);
            res.status(500).json({ message: 'Error al obtener la comida de prueba' });
        }
    };

        obtenerComidasEquivalentes = async (req, res) => {
        try {
            const comida = await this.servicio.obtenerComidasEquivalentes(3);
            res.json(comida?.data ?? comida); 
        } catch (error) {
            console.error('Error al obtener comida de prueba:', error);
            res.status(500).json({ message: 'Error al obtener la comida de prueba' });
        }
    };

    
    rellenarTargetComidas = async (caloriasTotales, proteinasTotales, carbohidratosTotales, grasasTotales, cantidad) => {
        const generarProporciones = (cantidad) => {
            const randoms = Array.from({ length: cantidad }, () => Math.random());
            const suma = randoms.reduce((a, b) => a + b, 0);
            return randoms.map(r => r / suma);
        };
    
        const proporciones = generarProporciones(cantidad);
    
        const targetComidas = [];
    
        for (let i = 0; i < cantidad; i++) {
            const proporcion = proporciones[i];
    
            const proteinas = Math.round(proteinasTotales * proporcion);
            const carbohidratos = Math.round(carbohidratosTotales * proporcion);
            const grasas = Math.round(grasasTotales * proporcion);
    
            const calorias = (proteinas * 4) + (carbohidratos * 4) + (grasas * 9);
    
            targetComidas.push({
                calorias,
                proteina: proteinas,
                carbohidratos: carbohidratos,
                grasas: grasas
            });
        }
    
        return targetComidas;
    };
    
    
    obtenerMenuDiario = async (req, res) => {
        try {
            const { calorias, proteinas, carbohidratos, grasas, comidas } = req.query;
            let targetComidas = req.body?.targetComidas; 
        
            if (!calorias) {
                return res.status(400).json({ message: 'Debes especificar las calorías' });
            }
        
            const caloriasNum = parseFloat(calorias);
            const proteinasNum = proteinas ? parseFloat(proteinas) : null;
            const carbohidratosNum = carbohidratos ? parseFloat(carbohidratos) : null;
            const grasasNum = grasas ? parseFloat(grasas) : null;
            const cantidadComidas = comidas ? parseInt(comidas) : Math.floor(Math.random() * 3) + 3;
        
            if (!targetComidas || targetComidas.length === 0) {
                targetComidas = await this.rellenarTargetComidas(
                    caloriasNum,
                    proteinasNum,
                    carbohidratosNum,
                    grasasNum,
                    cantidadComidas
                );
            }
        
            console.log("🎯 Target de comidas generado:", targetComidas);
        
            const menu = await this.servicio.obtenerMenuDiario(
                {
                    calorias: caloriasNum,
                    proteinas: proteinasNum,
                    carbohidratos: carbohidratosNum,
                    grasas: grasasNum,
                    comidas: cantidadComidas,
                },
                targetComidas
            );
            
            res.set('Cache-Control', 'no-store'); 
            res.json(menu);
            
        } catch (error) {
            console.error('❌ Error al obtener el menú diario:', error);
            res.status(500).json({ message: 'Error al obtener el menú diario' });
        }
    };
    
    




    // GET /api/alimentos/menu-semanal
    obtenerMenuSemanal = async (req, res) => {
        try {
            const menu = await this.servicio.obtenerMenuSemanal();
            res.json(menu);
        } catch (error) {
            console.error('Error al obtener el menú semanal:', error);
            res.status(500).json({ message: 'Error al obtener el menú semanal' });
        }
    };
}

export default ControladorAlimentos;
