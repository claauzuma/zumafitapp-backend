import assert from "node:assert/strict";
import test from "node:test";

import {
  hasValidMenuContent,
  nextUniqueName,
  normalizeMealType,
  validateRawMenuPayload,
} from "../servicio/clientOwnMenus.js";

test("genera nombres unicos con sufijo incremental", () => {
  assert.equal(nextUniqueName("Arroz con pollo", []), "Arroz con pollo");
  assert.equal(nextUniqueName("Arroz con pollo", ["Arroz con pollo"]), "Arroz con pollo 1");
  assert.equal(
    nextUniqueName("Arroz con pollo", ["Arroz con pollo", "Arroz con pollo 1"]),
    "Arroz con pollo 2"
  );
  assert.equal(
    nextUniqueName("Desayuno proteico 3", ["Desayuno proteico 3"]),
    "Desayuno proteico 4"
  );
});

test("normaliza tipos de comida aceptados", () => {
  assert.equal(normalizeMealType("  ALMUERZO  "), "almuerzo");
  assert.equal(normalizeMealType("Pre entreno"), "pre_entreno");
  assert.equal(normalizeMealType("Post entreno"), "post_entreno");
  assert.equal(normalizeMealType("Colacion"), "colacion");
  assert.equal(normalizeMealType("Otra"), "otra");
});

test("detecta menu activable con alimentos en comidas o dias", () => {
  assert.equal(hasValidMenuContent({ comidas: [] }), false);
  assert.equal(hasValidMenuContent({ comidas: [{ items: [] }] }), false);
  assert.equal(hasValidMenuContent({ comidas: [{ items: [{ alimentoId: "1" }] }] }), true);
  assert.equal(
    hasValidMenuContent({
      dias: {
        monday: {
          comidas: [{ items: [{ alimentoId: "1" }] }],
        },
      },
    }),
    true
  );
});

test("valida payload crudo antes de normalizar silenciosamente", () => {
  assert.doesNotThrow(() => validateRawMenuPayload({ nombre: "Menu", selectedDays: ["monday", "martes"] }));

  assert.throws(
    () => validateRawMenuPayload({ nombre: "x".repeat(181) }),
    (error) => error.code === "VALIDATION_ERROR" && error.details.some((item) => item.includes("180"))
  );

  assert.throws(
    () => validateRawMenuPayload({ selectedDays: ["noday"] }),
    (error) => error.code === "VALIDATION_ERROR" && error.details.some((item) => item.includes("Dia invalido"))
  );
});
