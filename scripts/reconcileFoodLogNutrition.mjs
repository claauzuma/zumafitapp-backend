import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BSON, MongoClient, ObjectId } from "mongodb";

import config from "../config.js";
import {
  calculateCatalogFoodNutrition,
  catalogFoodNutrition,
  normalizeFoodUnit,
} from "../servicio/foodNutrition.js";

const APPLY = process.argv.includes("--apply");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUPS_ROOT = path.resolve(ROOT, "backups");
const MACRO_FIELDS = ["kcal", "proteina", "carbs", "grasas"];

function id(value) {
  return String(value ?? "").trim();
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round(amount(value) * 10) / 10;
}

function totals(logs = []) {
  return logs.reduce((sum, log) => {
    MACRO_FIELDS.forEach((field) => {
      sum[field] = round(sum[field] + amount(log[field]));
    });
    return sum;
  }, { kcal: 0, proteina: 0, carbs: 0, grasas: 0 });
}

function changed(before = {}, after = {}) {
  return MACRO_FIELDS.some((field) => Math.abs(amount(before[field]) - amount(after[field])) > 0.049);
}

function foodMaps(foods = []) {
  const byMongoId = new Map();
  const byAlimentoId = new Map();
  const byId = new Map();
  foods.forEach((food) => {
    if (food?._id) byMongoId.set(id(food._id), food);
    if (food?.alimentoId !== null && food?.alimentoId !== undefined) {
      byAlimentoId.set(id(food.alimentoId), food);
    }
    if (food?.id !== null && food?.id !== undefined) byId.set(id(food.id), food);
  });
  return { byMongoId, byAlimentoId, byId };
}

function resolveFood(log = {}, maps = {}) {
  const value = id(log.alimentoId);
  if (!value) return null;
  const food = maps.byMongoId.get(value) || maps.byAlimentoId.get(value) || maps.byId.get(value) || null;
  if (!food) return null;
  if ((food.customFood === true || food.privateFood === true) && id(food.ownerId) !== id(log.userId)) return null;
  return food;
}

function canonicalMacros(food = {}, log = {}) {
  const catalogUnit = normalizeFoodUnit(food.Unidad || food.unidad || food.unit || food.unidadBase || log.unidad);
  const logUnit = normalizeFoodUnit(log.unidad || catalogUnit);
  const nutrition = catalogFoodNutrition(food, catalogUnit);
  return calculateCatalogFoodNutrition(nutrition, log.cantidad, logUnit);
}

function stableDigest(value) {
  return crypto.createHash("sha256").update(BSON.EJSON.stringify(value)).digest("hex");
}

function allocationPatch(allocation = {}, requestLogs = []) {
  const total = totals(requestLogs);
  const entries = Array.isArray(allocation.allocations) ? allocation.allocations : [];
  const previousKcal = Math.max(0, amount(allocation.total?.kcal));
  const accumulated = { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
  const allocations = entries.map((entry, index) => {
    const last = index === entries.length - 1;
    const ratio = previousKcal > 0 ? Math.max(0, amount(entry?.totals?.kcal)) / previousKcal : 0;
    const nextTotals = {};
    MACRO_FIELDS.forEach((field) => {
      nextTotals[field] = last
        ? round(total[field] - accumulated[field])
        : round(total[field] * ratio);
      accumulated[field] = round(accumulated[field] + nextTotals[field]);
    });
    return { ...entry, totals: nextTotals };
  });
  return { total, allocations };
}

function assertBackupTarget(target) {
  const relative = path.relative(BACKUPS_ROOT, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`BACKUP_TARGET_INVALID: ${target}`);
  }
}

async function writeBackup(payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.resolve(BACKUPS_ROOT, `food-log-nutrition-${stamp}`);
  assertBackupTarget(directory);
  await mkdir(BACKUPS_ROOT, { recursive: true });
  await mkdir(directory, { recursive: false });
  const file = path.join(directory, "snapshot.ejson");
  const serialized = BSON.EJSON.stringify(payload, null, 2);
  await writeFile(file, serialized, { flag: "wx" });
  return { directory, file, sha256: crypto.createHash("sha256").update(serialized).digest("hex") };
}

async function bulk(collection, operations = []) {
  let modifiedCount = 0;
  for (let index = 0; index < operations.length; index += 250) {
    const result = await collection.bulkWrite(operations.slice(index, index + 250), { ordered: true });
    modifiedCount += Number(result.modifiedCount || 0);
  }
  return modifiedCount;
}

const client = new MongoClient(config.STRCNX, { serverSelectionTimeoutMS: 15_000 });

try {
  await client.connect();
  const db = client.db(config.BASE);
  const foods = await db.collection("fooddatabase2").find({}).toArray();
  const customFoods = await db.collection("client_custom_foods").find({}).toArray();
  const logs = await db.collection("food_logs").find({}).toArray();
  const maps = foodMaps([...foods, ...customFoods]);
  const proposals = [];
  const unresolved = [];

  for (const log of logs) {
    const food = resolveFood(log, maps);
    if (!food) {
      unresolved.push({
        logId: id(log._id),
        alimentoId: id(log.alimentoId),
        nombre: log.nombreSnapshot || "",
      });
      continue;
    }
    if (!(amount(log.cantidad) > 0)) continue;
    const after = canonicalMacros(food, log);
    if (!changed(log, after)) continue;
    proposals.push({ log, food, after });
  }

  const affectedDayIds = [...new Set(proposals.map(({ log }) => id(log.foodLogDayId)).filter(Boolean))];
  const affectedGroupKeys = [...new Set(proposals
    .filter(({ log }) => log.writeRequestId)
    .map(({ log }) => `${id(log.userId)}\u0000${log.date}\u0000${log.writeRequestId}`))];
  const dayObjectIds = affectedDayIds.filter(ObjectId.isValid).map((value) => new ObjectId(value));
  const days = dayObjectIds.length
    ? await db.collection("food_log_days").find({ _id: { $in: dayObjectIds } }).toArray()
    : [];
  const allocations = affectedGroupKeys.length
    ? (await db.collection("food_log_allocations").find({}).toArray()).filter((entry) => (
        affectedGroupKeys.includes(`${id(entry.userId)}\u0000${entry.date}\u0000${entry.writeRequestId}`)
      ))
    : [];

  const proposalById = new Map(proposals.map((proposal) => [id(proposal.log._id), proposal]));
  const reconciledLogs = logs.map((log) => {
    const proposal = proposalById.get(id(log._id));
    return proposal ? { ...log, ...proposal.after } : log;
  });

  const dayPatches = days.map((day) => ({
    day,
    totals: totals(reconciledLogs.filter((log) => id(log.foodLogDayId) === id(day._id))),
  })).filter(({ day, totals: next }) => changed(day.totals || {}, next));

  const allocationPatches = allocations.map((allocation) => {
    const requestLogs = reconciledLogs.filter((log) => (
      id(log.userId) === id(allocation.userId) &&
      log.date === allocation.date &&
      log.writeRequestId === allocation.writeRequestId
    ));
    return { allocation, patch: allocationPatch(allocation, requestLogs) };
  }).filter(({ allocation, patch }) => changed(allocation.total || {}, patch.total));

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    database: config.BASE,
    catalogFoods: foods.length,
    customFoods: customFoods.length,
    foodLogs: logs.length,
    resolvableLogs: logs.length - unresolved.length,
    unresolvedLogs: unresolved.length,
    correctionCount: proposals.length,
    affectedDays: dayPatches.length,
    affectedAllocations: allocationPatches.length,
    examples: proposals.slice(0, 30).map(({ log, food, after }) => ({
      logId: id(log._id),
      date: log.date,
      alimentoId: id(log.alimentoId),
      alimento: food.Alimentos || food.nombre || log.nombreSnapshot,
      cantidad: log.cantidad,
      unidad: log.unidad,
      before: Object.fromEntries(MACRO_FIELDS.map((field) => [field, amount(log[field])])),
      after: Object.fromEntries(MACRO_FIELDS.map((field) => [field, amount(after[field])])),
    })),
    unresolvedSample: unresolved.slice(0, 30),
  };

  if (!APPLY || !proposals.length) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const backupPayload = {
      createdAt: new Date(),
      database: config.BASE,
      catalogDigest: stableDigest([...foods, ...customFoods].map((food) => ({
        _id: food._id,
        alimentoId: food.alimentoId,
        updatedAt: food.updatedAt,
      }))),
      report,
      foodLogs: proposals.map(({ log }) => log),
      foodLogDays: days,
      foodLogAllocations: allocations,
    };
    const backup = await writeBackup(backupPayload);
    const now = new Date();

    const modifiedLogs = await bulk(db.collection("food_logs"), proposals.map(({ log, after }) => ({
      updateOne: {
        filter: {
          _id: log._id,
          cantidad: log.cantidad,
          kcal: log.kcal,
          proteina: log.proteina,
          carbs: log.carbs,
          grasas: log.grasas,
        },
        update: { $set: { ...after, nutritionReconciledAt: now, updatedAt: now } },
      },
    })));
    if (modifiedLogs !== proposals.length) {
      throw new Error(`CONCURRENT_WRITE_DETECTED: expected ${proposals.length}, modified ${modifiedLogs}. Backup: ${backup.file}`);
    }

    const modifiedDays = await bulk(db.collection("food_log_days"), dayPatches.map(({ day, totals: next }) => ({
      updateOne: {
        filter: { _id: day._id },
        update: { $set: { totals: next, updatedAt: now } },
      },
    })));
    const modifiedAllocations = await bulk(db.collection("food_log_allocations"), allocationPatches.map(({ allocation, patch: next }) => ({
      updateOne: {
        filter: { _id: allocation._id },
        update: { $set: { ...next, updatedAt: now } },
      },
    })));

    const verificationLogs = await db.collection("food_logs").find({
      _id: { $in: proposals.map(({ log }) => log._id) },
    }).toArray();
    const verificationFailures = verificationLogs.filter((log) => {
      const food = resolveFood(log, maps);
      return !food || changed(log, canonicalMacros(food, log));
    });
    if (verificationFailures.length) {
      throw new Error(`POST_WRITE_VERIFICATION_FAILED: ${verificationFailures.length}. Backup: ${backup.file}`);
    }

    console.log(JSON.stringify({
      ...report,
      modifiedLogs,
      modifiedDays,
      modifiedAllocations,
      verificationFailures: 0,
      backup,
    }, null, 2));
  }
} finally {
  await client.close();
}

