import ServiciosAlimentos from '../servicio/alimentos.js';
import { createHash } from 'node:crypto';

function header(req, name) {
    if (typeof req?.get === "function") return req.get(name) || "";
    return req?.headers?.[String(name).toLowerCase()] || "";
}

function setHeader(res, name, value) {
    if (typeof res?.set === "function") res.set(name, value);
    else if (typeof res?.setHeader === "function") res.setHeader(name, value);
}

function etagMatches(requestValue = "", etag = "") {
    return String(requestValue || "")
        .split(",")
        .map((value) => value.trim())
        .some((value) => value === "*" || value === etag);
}

export function sendCatalogJson(req, res, payload, { publicCache = false, cacheInfo = null } = {}) {
    const body = JSON.stringify(payload);
    const digest = createHash("sha256").update(body).digest("base64url").slice(0, 27);
    const etag = `W/\"foods-${digest}\"`;

    setHeader(res, "Cache-Control", publicCache
        ? "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400"
        : "private, max-age=0, must-revalidate");
    if (publicCache && typeof res?.removeHeader === "function") res.removeHeader("Pragma");
    setHeader(res, "Vary", publicCache ? "Accept-Encoding" : "Authorization, Cookie, Accept-Encoding");
    setHeader(res, "ETag", etag);
    if (cacheInfo) {
        setHeader(res, "X-Catalog-Cache", cacheInfo.cached ? "MEMORY" : "EMPTY");
        setHeader(res, "X-Catalog-Items", String(cacheInfo.count || 0));
    }

    if (etagMatches(header(req, "if-none-match"), etag)) {
        return res.status(304).end();
    }

    if (typeof res.type === "function" && typeof res.send === "function") {
        return res.type("application/json").send(body);
    }
    return res.json(payload);
}

class ControladorAlimentos {
    constructor() {
        this.servicio = new ServiciosAlimentos();
    }

    // GET /api/alimentos/
    obtenerAlimentos = async (req, res) => {
        try {
            const alimentos = await this.servicio.obtenerAlimentos(req.query || {}, req.user || null);
            return sendCatalogJson(req, res, alimentos, {
                publicCache: false,
                cacheInfo: this.servicio.obtenerEstadoCache(),
            });
        } catch (error) {
            console.error('Error al obtener alimentos:', error);
            res.status(500).json({ message: 'Error al obtener los alimentos' });
        }
    };

    obtenerCatalogoGlobal = async (req, res) => {
        try {
            const alimentos = await this.servicio.obtenerCatalogoGlobal(req.query || {});
            return sendCatalogJson(req, res, alimentos, {
                publicCache: true,
                cacheInfo: this.servicio.obtenerEstadoCache(),
            });
        } catch (error) {
            console.error('Error al obtener el catalogo global:', error);
            return res.status(500).json({ message: 'Error al obtener el catalogo global' });
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

    generarCantidades = async (req, res) => {
        try {
            const resultado = await this.servicio.generarCantidades(req.body || {}, null, req.user || null);
            const statusCode = resultado.status === "error" ? 400 : 200;
            res.status(statusCode).json(resultado);
        } catch (error) {
            console.error("Error al generar cantidades:", error);
            res.status(500).json({ status: "error", message: "No se pudieron generar cantidades" });
        }
    };

    listarPersonalizados = async (req, res) => {
        try {
            res.json(await this.servicio.customFoodsService.list(req.user));
        } catch (error) {
            this.responderErrorPersonalizado(res, error);
        }
    };

    crearPersonalizado = async (req, res) => {
        try {
            const alimento = await this.servicio.customFoodsService.create(req.user, req.body || {});
            res.status(201).json({ alimento });
        } catch (error) {
            this.responderErrorPersonalizado(res, error);
        }
    };

    actualizarPersonalizado = async (req, res) => {
        try {
            const alimento = await this.servicio.customFoodsService.update(req.user, req.params.id, req.body || {});
            res.json({ alimento });
        } catch (error) {
            this.responderErrorPersonalizado(res, error);
        }
    };

    eliminarPersonalizado = async (req, res) => {
        try {
            res.json(await this.servicio.customFoodsService.remove(req.user, req.params.id));
        } catch (error) {
            this.responderErrorPersonalizado(res, error);
        }
    };

    responderErrorPersonalizado = (res, error) => {
        const status = Number(error?.status) || 500;
        if (status >= 500) console.error("Error en alimentos personalizados:", error);
        res.status(status).json({
            error: error?.code || "CUSTOM_FOOD_ERROR",
            message: status >= 500 ? "No se pudo completar la operacion." : error.message,
            ...(error?.usage !== undefined ? { usage: error.usage } : {}),
            ...(error?.limit !== undefined ? { limit: error.limit } : {}),
        });
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
