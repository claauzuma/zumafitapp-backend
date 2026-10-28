import express from 'express';
import ControladorAlimentos from '../controlador/alimentos.js';
import multer from 'multer';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware.js';

const upload = multer({ dest: 'uploads/' });

class RouterAlimentos {
  constructor(persistencia) {
    this.router = express.Router();
    this.controladorAlimentos = new ControladorAlimentos(persistencia);
  }

start() {
console.log("RouterAlimentos iniciado");


///Endpoint de prueba //
this.router.get('/comidas-equivalentes', (req, res) => this.controladorAlimentos.obtenerComidasEquivalentes(req, res));
this.router.get('/prueba', (req, res) => this.controladorAlimentos.obtenerComidaPrueba(req, res));
this.router.post('/generar-cantidades', optionalAuthMiddleware, (req, res) => this.controladorAlimentos.generarCantidades(req, res));

this.router.get('/personalizados', authMiddleware, (req, res) => this.controladorAlimentos.listarPersonalizados(req, res));
this.router.post('/personalizados', authMiddleware, (req, res) => this.controladorAlimentos.crearPersonalizado(req, res));
this.router.patch('/personalizados/:id', authMiddleware, (req, res) => this.controladorAlimentos.actualizarPersonalizado(req, res));
this.router.delete('/personalizados/:id', authMiddleware, (req, res) => this.controladorAlimentos.eliminarPersonalizado(req, res));

this.router.get('/catalogo', (req, res) => this.controladorAlimentos.obtenerCatalogoGlobal(req, res));
this.router.get('/', optionalAuthMiddleware, (req, res) => this.controladorAlimentos.obtenerAlimentos(req, res));
this.router.get('/filtrar/comida', (req, res) => this.controladorAlimentos.obtenerComida(req, res));
this.router.get('/menu-diario', (req, res) => this.controladorAlimentos.obtenerMenuDiario(req, res));
this.router.get('/menu-semanal', (req, res) => this.controladorAlimentos.obtenerMenuSemanal(req, res));

    return this.router;
  }
}

export default RouterAlimentos;
