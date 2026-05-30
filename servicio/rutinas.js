import { ObjectId } from "mongodb";

import ModelMongoDBEjercicios from "../model/DAO/ejerciciosMongoDB.js";
import ModelMongoDBRutinas from "../model/DAO/rutinasMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBCoachPlanConfigs from "../model/DAO/coachPlanConfigsMongoDB.js";
import {
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
} from "./coachPlans.js";

const ROUTINE_OBJECTIVES = new Set([
  "hipertrofia",
  "fuerza",
  "recomposicion",
  "perdida_grasa",
  "salud",
  "rendimiento",
]);

const LEVELS = new Set(["principiante", "intermedio", "avanzado"]);
const BASE_VISIBILITY = new Set(["publica", "privada", "sistema"]);
const BASE_STATUS = new Set(["activa", "inactiva"]);
const ASSIGNED_STATUS = new Set(["activa", "pausada", "finalizada"]);

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function cleanText(value, fallback = "", max = 500) {
  const text = cleanString(value, max);
  return text || fallback;
}

function normalizeToken(value, fallback = "") {
  const raw = cleanString(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return raw || fallback;
}

function enumValue(value, allowed, fallback) {
  const token = normalizeToken(value, fallback);
  return allowed.has(token) ? token : fallback;
}

function cleanStringArray(value, maxItems = 20, maxLen = 80) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => cleanString(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return [];
}

function numberOrDefault(value, fallback, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (min !== null && n < min) return min;
  if (max !== null && n > max) return max;
  return n;
}

function intOrDefault(value, fallback, range = {}) {
  return Math.round(numberOrDefault(value, fallback, range));
}

function cleanDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return fallback;
  return d;
}

function cleanId(value = "") {
  return String(value || "").trim();
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  if (ObjectId.isValid(value)) values.push(new ObjectId(value));
  return values;
}

function sameId(a, b) {
  return idToString(a) === idToString(b);
}

function normalizeRole(role) {
  const value = normalizeToken(role);
  if (value === "client" || value === "customer") return "cliente";
  if (value === "trainer" || value === "nutritionist") return "coach";
  if (value === "entrenador" || value === "nutricionista") return "coach";
  return value;
}

function featureKeyForMode(mode = "manual") {
  const token = normalizeToken(mode, "manual");
  if (token === "automatic" || token === "automatico" || token === "automatica") return "automaticGenerator";
  if (token === "semiautomatic" || token === "semiautomatico" || token === "semi_automatic") return "semiAutomaticBuilder";
  if (token === "hybrid" || token === "hibrido") return "semiAutomaticBuilder";
  return "manualBuilder";
}

function anyTruthyFeature(section = {}) {
  return Object.values(section || {}).some((value) => {
    if (typeof value === "number") return value > 0;
    return value === true;
  });
}

function normalizeExercisePayload(payload = {}, context = {}) {
  const ownerType = context.ownerType || enumValue(payload.ownerType, new Set(["admin", "coach"]), "admin");
  const ownerId = context.ownerId ?? payload.ownerId ?? null;

  return {
    nombre: cleanText(payload.nombre || payload.name, "Ejercicio sin nombre", 160),
    grupoMuscular: normalizeToken(payload.grupoMuscular || payload.mainMuscle, "general"),
    gruposSecundarios: cleanStringArray(payload.gruposSecundarios || payload.secondaryMuscles, 8, 80),
    patronMovimiento: normalizeToken(payload.patronMovimiento || payload.movementPattern, "aislamiento"),
    equipamiento: normalizeToken(payload.equipamiento || payload.equipment, "peso_corporal"),
    dificultad: enumValue(payload.dificultad || payload.difficulty, LEVELS, "principiante"),
    instrucciones: cleanString(payload.instrucciones || payload.instructions, 3000),
    videoUrl: cleanString(payload.videoUrl, 600),
    imagenUrl: cleanString(payload.imagenUrl || payload.imageUrl, 600),
    estado: enumValue(payload.estado || payload.status, BASE_STATUS, "activa"),
    visibilidad:
      ownerType === "coach"
        ? "privada"
        : enumValue(payload.visibilidad || payload.visibility, BASE_VISIBILITY, "publica"),
    ownerType,
    ownerId: ownerId ? toMongoIdOrString(ownerId) : null,
    createdBy: context.actorId ? toMongoIdOrString(context.actorId) : null,
  };
}

function normalizeBaseExercise(raw = {}, index = 0) {
  return {
    ejercicioId: raw.ejercicioId ? toMongoIdOrString(raw.ejercicioId) : null,
    nombreSnapshot: cleanText(raw.nombreSnapshot || raw.nombre || raw.name, `Ejercicio ${index + 1}`, 160),
    grupoMuscularSnapshot: normalizeToken(raw.grupoMuscularSnapshot || raw.grupoMuscular, "general"),
    series: intOrDefault(raw.series, 3, { min: 1, max: 20 }),
    reps: cleanText(raw.reps, "8-10", 80),
    rir: cleanString(raw.rir, 40),
    descansoSeg: intOrDefault(raw.descansoSeg, 90, { min: 0, max: 1200 }),
    tempo: cleanString(raw.tempo, 80),
    notas: cleanString(raw.notas, 1000),
  };
}

function normalizeBaseDays(days = []) {
  const source = Array.isArray(days) ? days : [];
  return source.slice(0, 14).map((day, dayIndex) => ({
    nombre: cleanText(day?.nombre || day?.name, `Dia ${dayIndex + 1}`, 140),
    orden: intOrDefault(day?.orden, dayIndex + 1, { min: 1, max: 14 }),
    foco: cleanString(day?.foco || day?.focus, 160),
    ejercicios: (Array.isArray(day?.ejercicios) ? day.ejercicios : day?.exercises || [])
      .slice(0, 40)
      .map((exercise, exerciseIndex) => normalizeBaseExercise(exercise, exerciseIndex)),
  }));
}

function normalizeRoutineBasePayload(payload = {}, context = {}) {
  const ownerType = context.ownerType || enumValue(payload.ownerType, new Set(["admin", "coach"]), "admin");
  const ownerId = context.ownerId ?? payload.ownerId ?? null;
  const dias = normalizeBaseDays(payload.dias || payload.days);
  const diasPorSemana = intOrDefault(payload.diasPorSemana, dias.length || 3, { min: 1, max: 7 });

  return {
    nombre: cleanText(payload.nombre || payload.name, "Rutina sin nombre", 180),
    descripcion: cleanString(payload.descripcion || payload.description, 2500),
    objetivo: enumValue(payload.objetivo || payload.goal, ROUTINE_OBJECTIVES, "hipertrofia"),
    nivel: enumValue(payload.nivel || payload.level, LEVELS, "principiante"),
    diasPorSemana,
    duracionSemanasDefault: intOrDefault(payload.duracionSemanasDefault || payload.duracionSemanas, 4, { min: 1, max: 52 }),
    visibilidad:
      ownerType === "coach"
        ? "privada"
        : enumValue(payload.visibilidad || payload.visibility, BASE_VISIBILITY, "publica"),
    ownerType,
    ownerId: ownerId ? toMongoIdOrString(ownerId) : null,
    tags: cleanStringArray(payload.tags, 16, 60),
    estado: enumValue(payload.estado || payload.status, BASE_STATUS, "activa"),
    dias,
    progresion: normalizeProgression(payload.progresion || payload.progression),
    createdBy: context.actorId ? toMongoIdOrString(context.actorId) : null,
  };
}

function normalizeProgression(raw = {}) {
  const defaultRule = "Cuando el cliente alcance el maximo del rango de reps en todas las series, subir peso.";

  return {
    tipo: normalizeToken(raw?.tipo || raw?.type, "simple"),
    regla: cleanText(raw?.regla || raw?.rule, defaultRule, 1000),
    deloadSemana:
      raw?.deloadSemana === null || raw?.deloadSemana === ""
        ? null
        : numberOrDefault(raw?.deloadSemana, null, { min: 1, max: 52 }),
  };
}

function normalizeSerieDetalle(raw = {}, index = 0, parent = {}) {
  return {
    serie: intOrDefault(raw.serie, index + 1, { min: 1, max: 99 }),
    reps: cleanText(raw.reps, parent.reps || "8-10", 80),
    rir: cleanText(raw.rir, parent.rir || "", 40),
    pesoKg:
      raw.pesoKg === null || raw.pesoKg === undefined || raw.pesoKg === ""
        ? null
        : numberOrDefault(raw.pesoKg, null, { min: 0, max: 1000 }),
    completada: !!raw.completada,
  };
}

function seriesDetalleForExercise(raw = {}, normalized = {}) {
  const count = intOrDefault(normalized.series || raw.series, 3, { min: 1, max: 30 });
  const source = Array.isArray(raw.seriesDetalle) ? raw.seriesDetalle : [];
  const details = [];

  for (let index = 0; index < count; index += 1) {
    details.push(normalizeSerieDetalle(source[index] || {}, index, normalized));
  }

  return details;
}

function normalizeAssignedExercise(raw = {}, index = 0) {
  const base = normalizeBaseExercise(raw, index);
  const normalized = {
    ...base,
    pesoKg:
      raw.pesoKg === null || raw.pesoKg === undefined || raw.pesoKg === ""
        ? null
        : numberOrDefault(raw.pesoKg, null, { min: 0, max: 1000 }),
  };

  return {
    ...normalized,
    seriesDetalle: seriesDetalleForExercise(raw, normalized),
  };
}

function normalizeAssignedDays(days = []) {
  const source = Array.isArray(days) ? days : [];
  return source.slice(0, 14).map((day, dayIndex) => ({
    nombre: cleanText(day?.nombre || day?.name, `Dia ${dayIndex + 1}`, 140),
    orden: intOrDefault(day?.orden, dayIndex + 1, { min: 1, max: 14 }),
    foco: cleanString(day?.foco || day?.focus, 160),
    ejercicios: (Array.isArray(day?.ejercicios) ? day.ejercicios : day?.exercises || [])
      .slice(0, 40)
      .map((exercise, exerciseIndex) => normalizeAssignedExercise(exercise, exerciseIndex)),
  }));
}

function normalizeAssignedPatch(payload = {}) {
  const patch = {};
  if (payload.nombre !== undefined || payload.name !== undefined) {
    patch.nombre = cleanText(payload.nombre || payload.name, "Rutina asignada", 180);
  }
  if (payload.descripcion !== undefined || payload.description !== undefined) {
    patch.descripcion = cleanString(payload.descripcion || payload.description, 2500);
  }
  if (payload.fechaInicio !== undefined) patch.fechaInicio = cleanDate(payload.fechaInicio, null);
  if (payload.duracionSemanas !== undefined) {
    patch.duracionSemanas = intOrDefault(payload.duracionSemanas, 4, { min: 1, max: 52 });
  }
  if (payload.semanaActual !== undefined) {
    patch.semanaActual = intOrDefault(payload.semanaActual, 1, { min: 1, max: 52 });
  }
  if (payload.estado !== undefined) {
    patch.estado = enumValue(payload.estado, ASSIGNED_STATUS, "activa");
  }
  if (payload.notasCoach !== undefined) patch.notasCoach = cleanString(payload.notasCoach, 3000);
  if (payload.dias !== undefined || payload.days !== undefined) {
    patch.dias = normalizeAssignedDays(payload.dias || payload.days);
  }
  if (payload.progresion !== undefined || payload.progression !== undefined) {
    patch.progresion = normalizeProgression(payload.progresion || payload.progression);
  }
  return patch;
}

function normalizeDoc(doc) {
  if (!doc) return null;

  const normalized = {
    ...doc,
    id: idToString(doc._id || doc.id),
    _id: idToString(doc._id || doc.id),
  };

  for (const key of ["ownerId", "createdBy", "clienteId", "coachId", "rutinaBaseId", "assignedBy", "updatedBy"]) {
    if (normalized[key]) normalized[key] = idToString(normalized[key]);
  }

  if (Array.isArray(normalized.dias)) {
    normalized.dias = normalized.dias.map((day) => ({
      ...day,
      ejercicios: (day.ejercicios || []).map((exercise) => ({
        ...exercise,
        ejercicioId: exercise.ejercicioId ? idToString(exercise.ejercicioId) : null,
      })),
    }));
  }

  return normalized;
}

class ServicioRutinas {
  constructor() {
    this.ejerciciosModel = new ModelMongoDBEjercicios();
    this.rutinasModel = new ModelMongoDBRutinas();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.coachPlanModel = new ModelMongoDBCoachPlanConfigs();
  }

  async ensureIndexes() {
    await Promise.all([
      this.ejerciciosModel.ensureIndexes(),
      this.rutinasModel.ensureIndexes(),
    ]);
  }

  async _actor(user) {
    const actorId = user?.id || user?._id;
    if (!actorId) throw new Error("NO_AUTENTICADO");
    const full = await this.usuariosModel.obtenerPorId(actorId);
    if (!full) throw new Error("NO_AUTENTICADO");
    return full;
  }

  _actorId(actor) {
    return idToString(actor?._id || actor?.id);
  }

  _role(actor) {
    return normalizeRole(actor?.role || actor?.rol);
  }

  _isAdmin(actor) {
    return this._role(actor) === "admin";
  }

  _isCoach(actor) {
    return this._role(actor) === "coach";
  }

  _isClient(user) {
    return normalizeRole(user?.role || user?.rol) === "cliente";
  }

  async _effectiveCapabilities(coach) {
    const currentClients = await this.usuariosModel.countClientsByCoachId(coach._id || coach.id);
    const planCode = normalizeCoachPlanCode(coach?.plan) || "trial_pro";
    const planConfig =
      typeof this.coachPlanModel?.getByCode === "function"
        ? await this.coachPlanModel.getByCode(planCode)
        : normalizePlanConfig(planCode);

    return resolveEffectiveCoachCapabilities({
      coach,
      planConfig,
      currentClients,
    });
  }

  async _assertTrainingAccess(actor, { feature = null } = {}) {
    if (this._isAdmin(actor)) return { admin: true, effectiveCapabilities: null };
    if (!this._isCoach(actor)) throw new Error("COACH_TRAINING_NOT_ALLOWED");

    const specialties = actor?.coachProfile?.specialties || {};
    if (!specialties.training) throw new Error("COACH_TRAINING_NOT_ALLOWED");

    const effectiveCapabilities = await this._effectiveCapabilities(actor);
    const routineFeatures = effectiveCapabilities?.features?.routines || {};
    if (effectiveCapabilities?.isTrialExpired) throw new Error("COACH_FEATURE_NOT_ALLOWED");

    if (feature && !routineFeatures?.[feature]) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }

    if (!feature && !anyTruthyFeature(routineFeatures)) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }

    return { admin: false, effectiveCapabilities };
  }

  async _assertBuilderAccess(actor, mode = "manual") {
    return await this._assertTrainingAccess(actor, { feature: featureKeyForMode(mode) });
  }

  async _getClientForActor(actor, clienteId) {
    const client = await this.usuariosModel.obtenerPorId(clienteId);
    if (!client) throw new Error("CLIENT_NOT_FOUND");
    if (!this._isClient(client)) throw new Error("USER_NOT_CLIENT");

    if (this._isAdmin(actor)) return client;

    const actorId = this._actorId(actor);
    const assignedCoachId = client?.coach?.entrenadorId;
    if (!sameId(assignedCoachId, actorId)) {
      throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
    }

    return client;
  }

  _canEditOwnedBase(actor, routine) {
    if (this._isAdmin(actor)) return true;
    return (
      this._isCoach(actor) &&
      routine?.ownerType === "coach" &&
      sameId(routine?.ownerId, this._actorId(actor))
    );
  }

  _canAccessBase(actor, routine) {
    if (!routine) return false;
    if (this._isAdmin(actor)) return true;
    if (!this._isCoach(actor)) return false;
    if (routine.estado !== "activa" && !this._canEditOwnedBase(actor, routine)) return false;
    if (["publica", "sistema"].includes(routine.visibilidad)) return true;
    return this._canEditOwnedBase(actor, routine);
  }

  async listEjercicios(user, filters = {}) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);

    const visibilityQuery = this._isAdmin(actor)
      ? null
      : {
          $or: [
            { estado: "activa", visibilidad: { $in: ["publica", "sistema"] } },
            { ownerType: "coach", ownerId: { $in: idValues(this._actorId(actor)) } },
          ],
        };

    const data = await this.ejerciciosModel.list({
      ...filters,
      visibilityQuery,
    });

    return {
      ejercicios: (data.items || []).map(normalizeDoc),
      total: data.total || 0,
    };
  }

  async getEjercicio(user, id) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);
    const doc = await this.ejerciciosModel.getById(id);
    if (!doc) throw new Error("NOT_FOUND");

    if (!this._isAdmin(actor)) {
      const isVisible = doc.estado === "activa" && ["publica", "sistema"].includes(doc.visibilidad);
      const isOwn = doc.ownerType === "coach" && sameId(doc.ownerId, this._actorId(actor));
      if (!isVisible && !isOwn) throw new Error("FORBIDDEN");
    }

    return normalizeDoc(doc);
  }

  async createEjercicio(user, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");

    const doc = normalizeExercisePayload(payload, {
      actorId: this._actorId(actor),
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._isAdmin(actor) ? null : this._actorId(actor),
    });

    return normalizeDoc(await this.ejerciciosModel.create(doc));
  }

  async updateEjercicio(user, id, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    const current = await this.ejerciciosModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._isAdmin(actor) && !(current.ownerType === "coach" && sameId(current.ownerId, this._actorId(actor)))) {
      throw new Error("FORBIDDEN");
    }

    const patch = normalizeExercisePayload(
      {
        ...current,
        ...payload,
      },
      {
        actorId: current.createdBy || this._actorId(actor),
        ownerType: this._isAdmin(actor) ? current.ownerType || "admin" : "coach",
        ownerId: this._isAdmin(actor) ? current.ownerId || null : this._actorId(actor),
      }
    );
    delete patch.createdBy;

    return normalizeDoc(await this.ejerciciosModel.updateById(id, patch));
  }

  async deleteEjercicio(user, id) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    const current = await this.ejerciciosModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._isAdmin(actor) && !(current.ownerType === "coach" && sameId(current.ownerId, this._actorId(actor)))) {
      throw new Error("FORBIDDEN");
    }

    const result = await this.ejerciciosModel.deleteById(id);
    return { deleted: result.deletedCount > 0 };
  }

  async listRutinas(user, filters = {}) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);

    const visibilityQuery = this._isAdmin(actor)
      ? null
      : this.rutinasModel.ownerVisibilityForCoach(this._actorId(actor));

    const data = await this.rutinasModel.listBase({
      ...filters,
      visibilityQuery,
    });

    return {
      rutinas: (data.items || []).map(normalizeDoc),
      total: data.total || 0,
    };
  }

  async getRutina(user, id) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);
    const routine = await this.rutinasModel.getBaseById(id);
    if (!routine) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, routine)) throw new Error("FORBIDDEN");
    return normalizeDoc(routine);
  }

  async createRutina(user, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, payload?.modeType || "manual");

    const doc = normalizeRoutineBasePayload(payload, {
      actorId: this._actorId(actor),
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._isAdmin(actor) ? null : this._actorId(actor),
    });

    return normalizeDoc(await this.rutinasModel.createBase(doc));
  }

  async updateRutina(user, id, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, payload?.modeType || "manual");
    const current = await this.rutinasModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canEditOwnedBase(actor, current)) throw new Error("FORBIDDEN");

    const patch = normalizeRoutineBasePayload(
      {
        ...current,
        ...payload,
        dias: payload.dias !== undefined || payload.days !== undefined ? payload.dias || payload.days : current.dias,
      },
      {
        actorId: current.createdBy || this._actorId(actor),
        ownerType: current.ownerType || (this._isAdmin(actor) ? "admin" : "coach"),
        ownerId: current.ownerId || (this._isAdmin(actor) ? null : this._actorId(actor)),
      }
    );
    delete patch.createdBy;

    return normalizeDoc(await this.rutinasModel.updateBaseById(id, patch));
  }

  async deleteRutina(user, id) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    const current = await this.rutinasModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canEditOwnedBase(actor, current)) throw new Error("FORBIDDEN");

    const result = await this.rutinasModel.deleteBaseById(id);
    return { deleted: result.deletedCount > 0 };
  }

  async duplicateRutina(user, id, payload = {}) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor, { feature: "duplicatePlans" });
    const current = await this.rutinasModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, current)) throw new Error("FORBIDDEN");

    const clone = {
      ...current,
      nombre: cleanText(payload.nombre || `${current.nombre || "Rutina"} - copia`, "Rutina copia", 180),
      descripcion: payload.descripcion !== undefined ? cleanString(payload.descripcion, 2500) : current.descripcion,
      visibilidad: this._isAdmin(actor)
        ? enumValue(payload.visibilidad || "privada", BASE_VISIBILITY, "privada")
        : "privada",
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._isAdmin(actor) ? null : toMongoIdOrString(this._actorId(actor)),
      createdBy: toMongoIdOrString(this._actorId(actor)),
      estado: "activa",
    };
    delete clone._id;
    delete clone.id;
    delete clone.createdAt;
    delete clone.updatedAt;

    return normalizeDoc(await this.rutinasModel.createBase(clone));
  }

  async assignRutina(user, clienteId, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    const client = await this._getClientForActor(actor, clienteId);

    const baseId = payload.rutinaBaseId || payload.rutinaId;
    if (!baseId) throw new Error("RUTINA_BASE_REQUIRED");
    const base = await this.rutinasModel.getBaseById(baseId);
    if (!base) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, base)) throw new Error("FORBIDDEN");

    const assignedCoachId = this._isCoach(actor)
      ? this._actorId(actor)
      : cleanId(payload.coachId || client?.coach?.entrenadorId || "");

    await this.rutinasModel.pauseActiveForClient(clienteId);

    const assigned = {
      clienteId: toMongoIdOrString(clienteId),
      coachId: assignedCoachId ? toMongoIdOrString(assignedCoachId) : null,
      rutinaBaseId: toMongoIdOrString(baseId),
      nombre: cleanText(payload.nombre || base.nombre, "Rutina asignada", 180),
      descripcion: cleanString(payload.descripcion ?? base.descripcion, 2500),
      fechaInicio: cleanDate(payload.fechaInicio, new Date()),
      duracionSemanas: intOrDefault(payload.duracionSemanas || base.duracionSemanasDefault, 4, { min: 1, max: 52 }),
      semanaActual: 1,
      estado: "activa",
      dias: normalizeAssignedDays(base.dias || []),
      progresion: normalizeProgression(base.progresion || {}),
      notasCoach: cleanString(payload.notasCoach, 3000),
      assignedBy: toMongoIdOrString(this._actorId(actor)),
      assignedByRole: this._role(actor),
    };

    return normalizeDoc(await this.rutinasModel.createAssigned(assigned));
  }

  async listClienteRutinas(user, clienteId, filters = {}) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);
    await this._getClientForActor(actor, clienteId);

    const data = await this.rutinasModel.listAssigned({
      ...filters,
      clienteId,
    });

    return {
      rutinas: (data.items || []).map(normalizeDoc),
      total: data.total || 0,
    };
  }

  async getClienteRutinaActiva(user, clienteId) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);
    await this._getClientForActor(actor, clienteId);
    return normalizeDoc(await this.rutinasModel.getActiveForClient(clienteId));
  }

  async getClienteRutina(user, clienteId, planId) {
    const actor = await this._actor(user);
    await this._assertTrainingAccess(actor);
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.rutinasModel.getAssignedById(planId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    return normalizeDoc(assigned);
  }

  async updateClienteRutina(user, clienteId, planId, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.rutinasModel.getAssignedById(planId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const patch = {
      ...normalizeAssignedPatch(payload),
      updatedBy: toMongoIdOrString(this._actorId(actor)),
      updatedByRole: this._role(actor),
    };

    return normalizeDoc(await this.rutinasModel.updateAssignedById(planId, patch));
  }

  async deleteClienteRutina(user, clienteId, planId) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.rutinasModel.getAssignedById(planId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const result = await this.rutinasModel.deleteAssignedById(planId);
    return { deleted: result.deletedCount > 0 };
  }
}

export default ServicioRutinas;
