import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EJSON } from "bson";
import { MongoClient } from "mongodb";

import config from "../config.js";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
if (APPLY && ROLLBACK) throw new Error("Usar --apply o --rollback, nunca ambos.");
const migrationId = "generic-high-protein-milk-sara2-2026-10-27-v1";
const runAt = new Date();
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(
  here,
  "..",
  "..",
  "..",
  "zumafitront",
  "artifacts",
  "food-catalog-verified-raw-2026-10-27",
);
const collectionName = "fooddatabase2";

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function macrosForSuggestedPortion(value, portion) {
  return round(value * portion / 100, 2);
}

const client = new MongoClient(config.STRCNX);

try {
  await client.connect();
  const collection = client.db(config.BASE).collection(collectionName);
  if (ROLLBACK) {
    const snapshotPath = path.join(outputDir, "followup-high-protein-milk-before.ejson");
    const checksumPath = path.join(outputDir, "followup-high-protein-milk-before.sha256");
    if (!fs.existsSync(snapshotPath) || !fs.existsSync(checksumPath)) {
      throw new Error("Falta el snapshot o su checksum para rollback.");
    }
    const snapshotText = fs.readFileSync(snapshotPath, "utf8");
    const declaredHash = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
    const actualHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
    if (declaredHash !== actualHash) throw new Error("El checksum del snapshot no coincide.");
    const snapshot = EJSON.parse(snapshotText);
    if (snapshot.migrationId !== migrationId || snapshot.document?.alimentoId !== 249) {
      throw new Error("El snapshot no pertenece a esta migración.");
    }
    const count = await collection.countDocuments({});
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await collection.replaceOne({
          alimentoId: 249,
          "auditoriaNutricionalUltima.migrationId": migrationId,
        }, snapshot.document, { upsert: false, session });
        if (result.matchedCount !== 1) {
          throw new Error("Rollback bloqueado: alimentoId 249 fue modificado después de esta migración.");
        }
        const afterCount = await collection.countDocuments({}, { session });
        if (afterCount !== count) throw new Error(`El conteo cambió ${count} -> ${afterCount}.`);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ rolledBack: true, alimentoId: 249, count }, null, 2));
  } else {
  const beforeCount = await collection.countDocuments({});
  const before = await collection.findOne({ alimentoId: 249 });
  if (!before) throw new Error("No existe alimentoId 249.");

  const expected = {
    name: "Leche descremada alta en proteínas 0%, genérica",
    unit: "Ml",
    kcal100: 37,
    protein100: 4.6,
    carbs100: 4.6,
    fat100: 0,
    previousMigrationId: "food-catalog-verified-raw-2026-10-27-v1",
  };
  const actual = {
    name: before.nombre,
    unit: before.unidad,
    kcal100: before.kcal100,
    protein100: before.proteina100,
    carbs100: before.carbohidratos100,
    fat100: before.grasas100,
    previousMigrationId: before.auditoriaNutricionalUltima?.migrationId,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Precondición fallida para alimentoId 249: ${JSON.stringify(actual)}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const snapshotPath = path.join(outputDir, "followup-high-protein-milk-before.ejson");
  const snapshot = EJSON.stringify({ migrationId, capturedAt: runAt, document: before }, { relaxed: false, indent: 2 });
  fs.writeFileSync(snapshotPath, snapshot);
  const snapshotSha256 = crypto.createHash("sha256").update(snapshot).digest("hex");
  fs.writeFileSync(
    path.join(outputDir, "followup-high-protein-milk-before.sha256"),
    `${snapshotSha256}  followup-high-protein-milk-before.ejson\n`,
  );

  const portion = Number(before.porcionSugerida) || 100;
  const set = {
    Calorias: 0.43,
    calorias: 0.43,
    kcal: 0.43,
    kcalUnidad: 0.43,
    Proteinas: 0.045,
    proteinas: 0.045,
    proteina: 0.045,
    proteinaUnidad: 0.045,
    Carbohidratos: 0.054,
    carbohidratos: 0.054,
    carbohidratosUnidad: 0.054,
    Grasas: 0.004,
    grasas: 0.004,
    grasasUnidad: 0.004,
    Fibra: 0,
    fibra: 0,
    fibraUnidad: 0,
    kcal100: 43,
    proteina100: 4.5,
    carbohidratos100: 5.4,
    grasas100: 0.4,
    fibra100: 0,
    kcalPorcionSugerida: macrosForSuggestedPortion(43, portion),
    proteinaPorcionSugerida: macrosForSuggestedPortion(4.5, portion),
    carbohidratosPorcionSugerida: macrosForSuggestedPortion(5.4, portion),
    grasasPorcionSugerida: macrosForSuggestedPortion(0.4, portion),
    fibraPorcionSugerida: 0,
    carbohidratosConvencion: "carbohidratos disponibles",
    referenciaNutricional: {
      migrationId,
      checkedAt: runAt,
      source: "SARA 2 - Ministerio de Salud de la Nación (2022)",
      sourceUrl: "https://cesni-biblioteca.org/wp-content/uploads/2022/09/tabla-composicion-quimica-alimentos-argentina_ennys2.pdf",
      sourceFood: "Leche descremada fluida, con 50% más de proteínas",
      pageOrId: "tabla 4.A, PDF pp. 61-62",
      basis: "por 100 ml listo para consumir",
      state: "listo_para_consumir",
      carbohydrateConvention: "carbohidratos disponibles",
      notes: "Perfil genérico argentino; los SKU de marca requieren su rótulo vigente.",
    },
    requiereRevision: false,
    motivoRevision: "",
    auditoriaNutricionalUltima: {
      migrationId,
      appliedAt: runAt,
      decision: "NUTRICIÓN: leche alta en proteínas genérica según SARA 2",
      previousMigrationId: expected.previousMigrationId,
    },
  };

  if (!APPLY) {
    console.log(JSON.stringify({
      applied: false,
      beforeCount,
      alimentoId: 249,
      before: actual,
      after: {
        kcal100: set.kcal100,
        protein100: set.proteina100,
        carbs100: set.carbohidratos100,
        fat100: set.grasas100,
      },
      snapshotSha256,
    }, null, 2));
  } else {
    const session = client.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await collection.updateOne({
          _id: before._id,
          alimentoId: 249,
          nombre: expected.name,
          unidad: expected.unit,
          kcal100: expected.kcal100,
          proteina100: expected.protein100,
          carbohidratos100: expected.carbs100,
          grasas100: expected.fat100,
          "auditoriaNutricionalUltima.migrationId": expected.previousMigrationId,
        }, { $set: set }, { upsert: false, session });
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new Error(`Actualización inesperada: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
        }
        const afterCount = await collection.countDocuments({}, { session });
        if (afterCount !== beforeCount) throw new Error(`El conteo cambió ${beforeCount} -> ${afterCount}.`);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally {
      await session.endSession();
    }

    const after = await collection.findOne({ alimentoId: 249 });
    if (after?.auditoriaNutricionalUltima?.migrationId !== migrationId) {
      throw new Error("Falló la verificación posterior de alimentoId 249.");
    }
    fs.writeFileSync(path.join(outputDir, "followup-high-protein-milk-after.ejson"), EJSON.stringify({
      migrationId,
      verifiedAt: new Date(),
      beforeCount,
      afterCount: await collection.countDocuments({}),
      snapshotSha256,
      before: actual,
      after: {
        name: after.nombre,
        unit: after.unidad,
        kcal100: after.kcal100,
        protein100: after.proteina100,
        carbs100: after.carbohidratos100,
        fat100: after.grasas100,
      },
    }, { relaxed: false, indent: 2 }));
    console.log(JSON.stringify({
      applied: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      beforeCount,
      afterCount: await collection.countDocuments({}),
      snapshotSha256,
    }, null, 2));
  }
  }
} finally {
  await client.close();
}
