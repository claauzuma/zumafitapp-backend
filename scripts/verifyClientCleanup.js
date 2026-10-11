import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BSON, MongoClient, ObjectId } from "mongodb";

import config from "../config.js";
import { AUDITED_CLIENT_IDS, KEEP_USERS, roleOf } from "./cleanupTestClients.js";

function idString(value) {
  return value?.toHexString?.() || String(value ?? "").trim();
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function findMatches(value, ids, emails, currentPath = "", result = []) {
  if (value === null || value === undefined) return result;
  if (value instanceof ObjectId) {
    if (ids.has(value.toHexString())) result.push(currentPath);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findMatches(item, ids, emails, `${currentPath}.${index}`, result));
    return result;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findMatches(item, ids, emails, currentPath ? `${currentPath}.${key}` : key, result);
    }
    return result;
  }
  const raw = String(value).trim();
  if (ids.has(raw) || (typeof value === "string" && emails.has(normalized(value)))) result.push(currentPath);
  return result;
}

function sameSet(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

export async function main() {
  const backupRoot = process.env.BACKUP_DIR || process.argv[2];
  if (!backupRoot) throw new Error("BACKUP_DIR (o primer argumento) es obligatorio");
  const backedUsers = BSON.EJSON.parse(
    await readFile(path.resolve(backupRoot, "usuarios.ejson"), "utf8")
  );
  const targetIds = new Set(AUDITED_CLIENT_IDS);
  const targetEmails = new Set(backedUsers.map((user) => normalized(user.email)).filter(Boolean));
  if (backedUsers.length !== 16 || !sameSet(backedUsers.map((user) => idString(user._id)), AUDITED_CLIENT_IDS)) {
    throw new Error("El backup no contiene exactamente los 16 usuarios objetivo");
  }

  const client = new MongoClient(config.STRCNX);
  try {
    await client.connect();
    const db = client.db(config.BASE);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const counts = {};
    const remainingReferences = [];
    for (const { name } of collections) {
      let count = 0;
      const cursor = db.collection(name).find({});
      for await (const doc of cursor) {
        count += 1;
        const paths = findMatches(doc, targetIds, targetEmails);
        if (paths.length) remainingReferences.push({ collection: name, id: idString(doc._id), paths });
      }
      counts[name] = count;
    }

    const users = await db.collection("usuarios").find({}).toArray();
    const keepIds = KEEP_USERS.map((entry) => entry.id);
    const keepStatus = KEEP_USERS.map((entry) => {
      const user = users.find((candidate) => idString(candidate._id) === entry.id);
      return { id: entry.id, expectedRole: entry.expectedRole, exists: Boolean(user), actualRole: user ? roleOf(user) : null };
    });
    const failures = [];
    if (users.length !== 2 || !sameSet(users.map((user) => idString(user._id)), keepIds)) {
      failures.push("usuarios no contiene exactamente los dos KEEP");
    }
    if (keepStatus.some((item) => !item.exists || item.actualRole !== item.expectedRole)) {
      failures.push("Admin o Coach falta/cambió de rol");
    }
    if (remainingReferences.length) failures.push(`quedan ${remainingReferences.length} documentos con IDs/emails objetivo`);
    if (counts.fooddatabase2 !== 574) failures.push("fooddatabase2 no contiene 574 documentos");

    console.log(BSON.EJSON.stringify({
      database: config.BASE,
      usersTotal: users.length,
      keepStatus,
      deletedClientAccountsPresent: users.filter((user) => targetIds.has(idString(user._id))).length,
      remainingTargetReferences: remainingReferences,
      selectedCounts: {
        fooddatabase2: counts.fooddatabase2,
        food_logs: counts.food_logs,
        food_log_days: counts.food_log_days,
        client_menu_tracking: counts.client_menu_tracking,
        invited_users: counts.invited_users,
        comidasGuardadas: counts.comidasGuardadas,
        coach_client_capacity: counts.coach_client_capacity,
        access_audit_events: counts.access_audit_events,
        impersonation_audit_logs: counts.impersonation_audit_logs,
      },
      success: failures.length === 0,
      failures,
    }, null, 2));
    if (failures.length) process.exitCode = 1;
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
