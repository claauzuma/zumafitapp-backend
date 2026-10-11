import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BSON, MongoClient } from "mongodb";

import config from "../config.js";
import { AUDITED_CLIENT_IDS, KEEP_USERS, resolveDryRun, roleOf } from "./cleanupTestClients.js";

const REMOTE_ACK = "I_UNDERSTAND_THIS_IS_NON_PRODUCTION";
const PRODUCTION_ACK = "I_AUTHORIZE_BASE2_PRODUCTION_CLIENT_CLEANUP";
const SHARED_COLLECTION = "coach_client_capacity";

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function idString(value) {
  return value?.toHexString?.() || String(value ?? "").trim();
}

function databaseHost(uri) {
  try {
    return new URL(uri).hostname.toLowerCase();
  } catch {
    return "invalid-uri";
  }
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function canonical(value) {
  return BSON.EJSON.stringify(value, { canonical: true });
}

async function loadBackup(backupRoot) {
  const absoluteRoot = path.resolve(backupRoot);
  const manifest = BSON.EJSON.parse(await readFile(path.join(absoluteRoot, "manifest.ejson"), "utf8"));
  const files = (await readdir(absoluteRoot)).filter((file) => file.endsWith(".ejson") && file !== "manifest.ejson");
  const documents = new Map();
  for (const file of files) {
    const collection = file.slice(0, -".ejson".length);
    const parsed = BSON.EJSON.parse(await readFile(path.join(absoluteRoot, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`Backup inválido: ${file} no contiene un array`);
    documents.set(collection, parsed);
  }
  return { absoluteRoot, manifest, documents };
}

function restoreBlockers({ backup, host }) {
  const blockers = [];
  const environment = normalized(process.env.CLEANUP_ENVIRONMENT);
  const productionDeclared = normalized(process.env.NODE_ENV) === "production" || environment === "production";
  if (productionDeclared) {
    if (process.env.AUTHORIZE_PRODUCTION_CLEANUP !== PRODUCTION_ACK || config.BASE !== "base2") {
      blockers.push("restauración de producción no fue autorizada explícitamente para base2");
    }
  } else if (!new Set(["local", "test", "testing", "staging"]).has(environment)) {
    blockers.push("CLEANUP_ENVIRONMENT debe declarar local, test o staging");
  }
  if (!isLocalHost(host) && !productionDeclared && process.env.ALLOW_REMOTE_TEST_DB_CLEANUP !== REMOTE_ACK) {
    blockers.push("la base es remota y falta la confirmación explícita de entorno no productivo");
  }
  if (process.env.CONFIRM_DATABASE !== config.BASE || backup.manifest.database !== config.BASE) {
    blockers.push("la base confirmada no coincide con el manifest y la configuración actual");
  }
  if (process.env.CONFIRM_BACKUP_FINGERPRINT !== backup.manifest.fingerprint) {
    blockers.push("CONFIRM_BACKUP_FINGERPRINT no coincide con el manifest");
  }
  if (backup.manifest.host !== host) blockers.push("el host actual no coincide con el host respaldado");

  const backedUpUsers = backup.documents.get("usuarios") || [];
  const keepIds = new Set(KEEP_USERS.map((entry) => entry.id));
  const auditedIds = new Set(AUDITED_CLIENT_IDS);
  for (const user of backedUpUsers) {
    const id = idString(user._id);
    if (keepIds.has(id) || !auditedIds.has(id) || roleOf(user) !== "cliente") {
      blockers.push(`el backup contiene un usuario no autorizado para restauración: ${id}`);
    }
  }
  return blockers;
}

async function inspectConflicts(db, documents) {
  const missing = new Map();
  const conflicts = [];
  let alreadyPresent = 0;
  for (const [collection, docs] of documents) {
    if (collection === SHARED_COLLECTION) continue;
    const ids = docs.map((doc) => doc._id);
    const existing = ids.length ? await db.collection(collection).find({ _id: { $in: ids } }).toArray() : [];
    const byId = new Map(existing.map((doc) => [idString(doc._id), doc]));
    const absent = [];
    for (const doc of docs) {
      const current = byId.get(idString(doc._id));
      if (!current) absent.push(doc);
      else if (canonical(current) === canonical(doc)) alreadyPresent += 1;
      else conflicts.push({ collection, id: idString(doc._id), reason: "existe con contenido diferente" });
    }
    missing.set(collection, absent);
  }
  return { missing, conflicts, alreadyPresent };
}

async function inspectCapacityRestore(db, backupDocs, targetIds) {
  let documentsToInsert = 0;
  let reservationsToMerge = 0;
  const conflicts = [];
  for (const backupDoc of backupDocs) {
    const current = await db.collection(SHARED_COLLECTION).findOne({ _id: backupDoc._id });
    if (!current) {
      documentsToInsert += 1;
      continue;
    }
    const currentReservations = Array.isArray(current.reservations) ? current.reservations : [];
    const currentKeys = new Set(currentReservations.map((item) => `${idString(item.invitationId)}:${idString(item.clientId)}`));
    const missing = (backupDoc.reservations || []).filter((item) =>
      targetIds.has(idString(item.clientId)) && !currentKeys.has(`${idString(item.invitationId)}:${idString(item.clientId)}`)
    );
    const nextUsed = Number(current.used || 0) + missing.length;
    if (Number(current.limit || 0) > 0 && nextUsed > Number(current.limit)) {
      conflicts.push({ id: idString(current._id), reason: "restaurar reservas excedería el límite" });
    }
    reservationsToMerge += missing.length;
  }
  return { documentsToInsert, reservationsToMerge, conflicts };
}

async function restoreCapacity(db, backupDocs, targetIds, session) {
  let inserted = 0;
  let mergedReservations = 0;
  for (const backupDoc of backupDocs) {
    const current = await db.collection(SHARED_COLLECTION).findOne({ _id: backupDoc._id }, { session });
    if (!current) {
      await db.collection(SHARED_COLLECTION).insertOne(backupDoc, { session });
      inserted += 1;
      continue;
    }
    const currentReservations = Array.isArray(current.reservations) ? current.reservations : [];
    const currentKeys = new Set(currentReservations.map((item) => `${idString(item.invitationId)}:${idString(item.clientId)}`));
    const toRestore = (backupDoc.reservations || []).filter((item) =>
      targetIds.has(idString(item.clientId)) && !currentKeys.has(`${idString(item.invitationId)}:${idString(item.clientId)}`)
    );
    if (!toRestore.length) continue;
    const nextUsed = Number(current.used || 0) + toRestore.length;
    if (Number(current.limit || 0) > 0 && nextUsed > Number(current.limit)) {
      throw new Error(`Restaurar cupos excedería el límite en ${idString(current._id)}`);
    }
    await db.collection(SHARED_COLLECTION).updateOne(
      { _id: current._id },
      {
        $push: { reservations: { $each: toRestore } },
        $inc: { used: toRestore.length },
        $set: { updatedAt: new Date() },
      },
      { session }
    );
    mergedReservations += toRestore.length;
  }
  return { inserted, mergedReservations };
}

export async function main() {
  const backupRoot = process.env.BACKUP_DIR || process.argv[2];
  if (!backupRoot) throw new Error("BACKUP_DIR (o primer argumento) es obligatorio");
  const dryRun = resolveDryRun(process.env.DRY_RUN);
  const backup = await loadBackup(backupRoot);
  const host = databaseHost(config.STRCNX);
  const client = new MongoClient(config.STRCNX);
  try {
    await client.connect();
    const db = client.db(config.BASE);
    const blockers = restoreBlockers({ backup, host });
    const inspection = await inspectConflicts(db, backup.documents);
    const targetIds = new Set(backup.manifest.targetIds || AUDITED_CLIENT_IDS);
    const capacityInspection = await inspectCapacityRestore(
      db,
      backup.documents.get(SHARED_COLLECTION) || [],
      targetIds
    );
    if (inspection.conflicts.length) blockers.push(`${inspection.conflicts.length} documento(s) tienen conflictos de _id/contenido`);
    if (capacityInspection.conflicts.length) blockers.push(`${capacityInspection.conflicts.length} conflicto(s) de capacidad compartida`);
    const missingCounts = Object.fromEntries([...inspection.missing].map(([name, docs]) => [name, docs.length]));
    console.log(BSON.EJSON.stringify({
      mode: dryRun ? "DRY_RUN (solo lectura)" : "RESTORE",
      backup: backup.absoluteRoot,
      database: config.BASE,
      host,
      fingerprint: backup.manifest.fingerprint,
      missingDocumentsToRestore: missingCounts,
      alreadyPresent: inspection.alreadyPresent,
      conflicts: inspection.conflicts,
      sharedCapacityRestore: capacityInspection,
      blocked: blockers.length > 0,
      blockers,
    }, null, 2));
    if (dryRun) {
      console.log("\nDRY_RUN=true: no se escribió en MongoDB.");
      return;
    }
    if (blockers.length) throw new Error(`ABORT RESTORE:\n- ${blockers.join("\n- ")}`);

    const session = client.startSession();
    const restored = {};
    try {
      await session.withTransaction(async () => {
        const orderedCollections = [
          "usuarios",
          ...[...inspection.missing.keys()].filter((name) => name !== "usuarios" && name !== SHARED_COLLECTION),
        ];
        for (const collection of orderedCollections) {
          const docs = inspection.missing.get(collection) || [];
          if (!docs.length) continue;
          const result = await db.collection(collection).insertMany(docs, { session, ordered: true });
          restored[collection] = result.insertedCount;
        }
        restored[SHARED_COLLECTION] = await restoreCapacity(
          db,
          backup.documents.get(SHARED_COLLECTION) || [],
          targetIds,
          session
        );
      });
    } finally {
      await session.endSession();
    }
    console.log(BSON.EJSON.stringify({ restored, verification: "transacción confirmada" }, null, 2));
  } finally {
    await client.close();
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
