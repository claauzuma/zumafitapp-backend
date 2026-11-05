import assert from "node:assert/strict";
import test from "node:test";

import ModelMongoDBRutinas from "../model/DAO/rutinasMongoDB.js";
import { normalizeRoutineBasePayload } from "../servicio/rutinas.js";

test("rutina base legacy expande reps y RIR generales a cada serie", () => {
  const routine = normalizeRoutineBasePayload({
    nombre: "Legacy",
    dias: [{ ejercicios: [{ nombreSnapshot: "Sentadilla", series: 3, reps: "8-10", rir: "2" }] }],
  }, { ownerType: "coach", ownerId: "coach-1" });

  const exercise = routine.dias[0].ejercicios[0];
  assert.equal(exercise.seriesDetalle.length, 3);
  assert.deepEqual(exercise.seriesDetalle.map(({ reps, rir }) => ({ reps, rir })), [
    { reps: "8-10", rir: "2" },
    { reps: "8-10", rir: "2" },
    { reps: "8-10", rir: "2" },
  ]);
});

test("rutina base conserva repeticiones y RIR distintos por serie", () => {
  const routine = normalizeRoutineBasePayload({
    nombre: "Progresiva",
    dias: [{
      ejercicios: [{
        nombreSnapshot: "Press banca",
        series: 3,
        reps: "10",
        rir: "",
        seriesDetalle: [
          { reps: "12", rir: "3" },
          { reps: "10", rir: "2" },
          { reps: "8", rir: "1" },
        ],
      }],
    }],
  }, { ownerType: "admin" });

  assert.deepEqual(routine.dias[0].ejercicios[0].seriesDetalle, [
    { serie: 1, reps: "12", rir: "3" },
    { serie: 2, reps: "10", rir: "2" },
    { serie: 3, reps: "8", rir: "1" },
  ]);
});

test("infiere la cantidad desde seriesDetalle y conserva RIR opcional y notas", () => {
  const routine = normalizeRoutineBasePayload({
    nombre: "Detalle sin agregado",
    dias: [{
      ejercicios: [{
        nombreSnapshot: "Remo",
        notas: "Controlar la fase excentrica",
        seriesDetalle: [
          { reps: "12", rir: "" },
          { reps: "10", rir: "2" },
          { reps: "8", rir: "1" },
          { reps: "8", rir: "" },
        ],
      }],
    }],
  }, { ownerType: "coach", ownerId: "coach-1" });

  const exercise = routine.dias[0].ejercicios[0];
  assert.equal(exercise.series, 4);
  assert.equal(exercise.seriesDetalle.length, 4);
  assert.equal(exercise.seriesDetalle[0].rir, "");
  assert.equal(exercise.notas, "Controlar la fase excentrica");
  assert.equal(routine.visibilidad, "privada");
});

test("un RIR vacío por serie no hereda el RIR de otra serie", () => {
  const routine = normalizeRoutineBasePayload({
    nombre: "RIR mixto",
    dias: [{
      ejercicios: [{
        nombreSnapshot: "Peso muerto",
        series: 3,
        rir: "2",
        seriesDetalle: [
          { reps: "8", rir: "2" },
          { reps: "8", rir: "" },
          { reps: "6", rir: "1" },
        ],
      }],
    }],
  }, { ownerType: "coach", ownerId: "coach-1" });

  assert.deepEqual(
    routine.dias[0].ejercicios[0].seriesDetalle.map((serie) => serie.rir),
    ["2", "", "1"]
  );
});

test("la biblioteca de coach incluye solo publicaciones activas y sus propias rutinas", () => {
  const query = new ModelMongoDBRutinas().ownerVisibilityForCoach("coach-1");

  assert.deepEqual(query.$or[0], {
    estado: "activa",
    visibilidad: { $in: ["publica", "sistema"] },
  });
  assert.equal(query.$or[1].ownerType, "coach");
  assert.equal(query.$or[1].ownerId.$in[0], "coach-1");
});
