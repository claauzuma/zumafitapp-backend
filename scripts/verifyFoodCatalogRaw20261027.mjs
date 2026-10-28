import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

import config from "../config.js";

const collectionName = "fooddatabase2";
const WRITE = process.argv.includes("--write");
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "..", "..", "..", "zumafitront", "artifacts", "food-catalog-verified-raw-2026-10-27");
const cookedExplicitIds = [40, 43, 163, 668, 669, 670];
const brandedExplicitIds = [
  83, 248, 250, 252, 254, 255, 262, 354, 363, 366, 367, 368, 370,
  371, 372, 373, 378, 379, 380, 387, 420, 421, 422, 423, 491, 533, 591,
];
const keyIds = [
  35, 39, 42, 49, 65, 72, 113, 115, 120, 129, 162, 224, 241, 247,
  249, 252, 253, 258, 358, 360, 362, 364, 365, 369, 374, 376, 391, 402,
  403, 404, 405, 412, 494, 541, 548, 551, 607, 609, 653, 655, 657, 658,
  664, 667,
];

function round(value) {
  return Number(Number(value).toFixed(2));
}

function calculatedMacros(document, quantity) {
  return {
    quantity,
    unit: document.unidad,
    kcal: round(document.kcalUnidad * quantity),
    protein: round(document.proteinaUnidad * quantity),
    carbs: round(document.carbohidratosUnidad * quantity),
    fat: round(document.grasasUnidad * quantity),
  };
}

const client = new MongoClient(config.STRCNX);

try {
  await client.connect();
  const collection = client.db(config.BASE).collection(collectionName);

  const duplicateNumericIds = await collection.aggregate([
    { $match: { alimentoId: { $ne: null } } },
    { $group: { _id: "$alimentoId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  const cookedAutomaticLeaks = await collection.find({
    activo: true,
    "generation.mode": "GENERIC",
    $or: [
      { alimentoId: { $in: cookedExplicitIds } },
      { basePesaje: { $in: ["cocido", "cooked"] } },
    ],
  }, {
    projection: {
      _id: 0,
      alimentoId: 1,
      nombre: 1,
      "basePesaje.estadoFisico": 1,
      "generation.mode": 1,
    },
  }).toArray();

  const brandedAutomaticLeaks = await collection.find({
    alimentoId: { $in: brandedExplicitIds },
    activo: true,
    "generation.mode": "GENERIC",
  }, {
    projection: { _id: 0, alimentoId: 1, nombre: 1, "generation.mode": 1 },
  }).sort({ alimentoId: 1 }).toArray();

  const keyDocuments = await collection.find({ alimentoId: { $in: keyIds } }, {
    projection: {
      _id: 0,
      alimentoId: 1,
      nombre: 1,
      unidad: 1,
      macroBasis: 1,
      cantidadUnidad: 1,
      kcalUnidad: 1,
      proteinaUnidad: 1,
      carbohidratosUnidad: 1,
      grasasUnidad: 1,
      kcal100: 1,
      proteina100: 1,
      carbohidratos100: 1,
      grasas100: 1,
      basePesaje: 1,
      "generation.mode": 1,
      activo: 1,
      requiereRevision: 1,
    },
  }).sort({ alimentoId: 1 }).toArray();

  const automaticPrimaryProteins = await collection.find({
    activo: true,
    "generation.mode": "GENERIC",
    "generation.roles.P1": true,
  }, {
    projection: {
      _id: 0,
      alimentoId: 1,
      nombre: 1,
      kcal100: 1,
      proteina100: 1,
      carbohidratos100: 1,
      grasas100: 1,
      basePesaje: 1,
      requiereRevision: 1,
      "referenciaNutricional.sourceFood": 1,
    },
  }).sort({ alimentoId: 1 }).toArray();

  const automaticFoodsMissingBasis = await collection.find({
    activo: true,
    "generation.mode": "GENERIC",
    $or: [{ basePesaje: null }, { basePesaje: { $exists: false } }],
  }, {
    projection: {
      _id: 0,
      alimentoId: 1,
      nombre: 1,
      estado: 1,
      requiereCoccion: 1,
      "generation.roles": 1,
    },
  }).sort({ alimentoId: 1 }).toArray();

  const sampleDocuments = await collection.find({ alimentoId: { $in: [39, 224, 404] } }).toArray();
  const byId = new Map(sampleDocuments.map((document) => [document.alimentoId, document]));
  const quantitySamples = {
    rawRice100g: calculatedMacros(byId.get(39), 100),
    eggOneUnit: calculatedMacros(byId.get(224), 1),
    rawChickenBreast150g: calculatedMacros(byId.get(404), 150),
  };

  const result = {
    database: config.BASE,
    collection: collectionName,
    counts: {
      total: await collection.countDocuments({}),
      foodDocuments: await collection.countDocuments({ alimentoId: { $ne: null } }),
      activeFoodDocuments: await collection.countDocuments({ alimentoId: { $ne: null }, activo: true }),
      inactiveFoodDocuments: await collection.countDocuments({ alimentoId: { $ne: null }, activo: { $ne: true } }),
      automaticGeneric: await collection.countDocuments({ activo: true, "generation.mode": "GENERIC" }),
      reviewFoodDocuments: await collection.countDocuments({ alimentoId: { $ne: null }, requiereRevision: true }),
      reviewActiveGeneric: await collection.countDocuments({ activo: true, "generation.mode": "GENERIC", requiereRevision: true }),
      reviewActiveExplicitOnly: await collection.countDocuments({ activo: true, "generation.mode": "EXPLICIT_ONLY", requiereRevision: true }),
      reviewInactive: await collection.countDocuments({ alimentoId: { $ne: null }, activo: { $ne: true }, requiereRevision: true }),
      missingOrNullFoodId: await collection.countDocuments({
        $or: [{ alimentoId: null }, { alimentoId: { $exists: false } }],
      }),
    },
    duplicateNumericIds,
    cookedAutomaticLeaks,
    brandedAutomaticLeaks,
    quantitySamples,
    automaticPrimaryProteins,
    automaticFoodsMissingBasis,
    keyDocuments,
  };

  const serialized = JSON.stringify(result, null, 2);
  if (WRITE) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "verification-final.json"), `${serialized}\n`);
  }
  console.log(serialized);

  if (
    duplicateNumericIds.length ||
    cookedAutomaticLeaks.length ||
    brandedAutomaticLeaks.length ||
    automaticFoodsMissingBasis.length
  ) {
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
