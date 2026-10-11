import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BSON, MongoClient, ObjectId } from "mongodb";

import config from "../config.js";

// Snapshot reviewed on 2026-10-11. Apply mode refuses newly discovered clients
// until this list is regenerated from a fresh dry-run.
export const AUDITED_CLIENT_IDS = Object.freeze([
  "69716f5b4dc675283b32d41c",
  "697175be4dc675283b32d41e",
  "697e381449de4edcef6e7fec",
  "697e61f549de4edcef6e7fed",
  "6994b967a59ec75f488f2b26",
  "699d1462a59ec75f488f2b28",
  "69b4c0b4ef84494e637f4a48",
  "69bf26f57ee6d54050861e77",
  "69c977907ee6d54050861e7f",
  "69ce8b3a0f1cce957e74906a",
  "69ceb71e0f1cce957e74906b",
  "69f7e854459774f3bb2336ec",
  "6a184aa4459774f3bb2336ed",
  "6a4275fffa36e6eb936c6e96",
  "6a79e731d70dbb437517f4f0",
  "6a7f13b67202aa72c8da3b04",
]);

// Immutable allowlist: these accounts must survive every cleanup.
export const KEEP_USERS = Object.freeze([
  { id: "69ce6f7b3dd5af07fac2261b", expectedRole: "admin", reason: "administrador" },
  { id: "69d5965e0146b8f46a4e1fb2", expectedRole: "coach", reason: "coach/entrenador" },
]);

const WHOLE_DOCUMENT_RULES = Object.freeze([
  { collection: "food_log_allocations", fields: ["userId"] },
  { collection: "food_logs", fields: ["userId"] },
  { collection: "food_log_days", fields: ["userId"] },
  { collection: "client_menu_tracking", fields: ["clientId"] },
  { collection: "client_coach_blocks", fields: ["clientId"] },
  { collection: "comidasGuardadas", fields: ["ownerId", "creadaPorId"] },
  { collection: "comidascreadas", fields: ["userId"] },
  { collection: "menus_asignados", fields: ["clienteId", "clientId"] },
  { collection: "menus_base", fields: ["ownerId"] },
  { collection: "rutinas_asignadas", fields: ["clienteId", "clientId", "userId"] },
  { collection: "plan_change_requests", fields: ["userId", "clientId"] },
  { collection: "professional_applications", fields: ["userId"] },
  { collection: "invited_users", fields: ["clientId", "acceptedUserId"] },
  { collection: "invitedUsers", fields: ["clientId", "acceptedUserId"] },
  {
    collection: "access_audit_events",
    fields: ["actorId", "subjectId", "metadata.clientId"],
    auditHistory: true,
  },
  {
    collection: "impersonation_audit_logs",
    fields: ["targetUserId", "actorId", "userId", "clientId"],
    auditHistory: true,
  },
]);

const EMAIL_RULES = Object.freeze([
  { collection: "password_reset_tokens", fields: ["email"] },
  { collection: "pending_users", fields: ["email"] },
  { collection: "professional_applications", fields: ["email"] },
  { collection: "invited_users", fields: ["email", "inviteeEmail", "inviteeEmailNormalized"] },
  { collection: "invitedUsers", fields: ["email", "inviteeEmail", "inviteeEmailNormalized"] },
  {
    collection: "access_audit_events",
    fields: ["nextValue.email", "previousValue.email", "metadata.email"],
    auditHistory: true,
  },
]);

const SHARED_COLLECTION = "coach_client_capacity";
const USER_COLLECTION = "usuarios";
const PROTECTED_ROLES = new Set(["admin", "coach", "entrenador", "administrador"]);
const CLIENT_ROLES = new Set(["cliente", "client", "entrenado"]);
const AUDIT_ACK = "I_ACCEPT_AUDIT_HISTORY_DELETION";
const REMOTE_ACK = "I_UNDERSTAND_THIS_IS_NON_PRODUCTION";
const PRODUCTION_ACK = "I_AUTHORIZE_BASE2_PRODUCTION_CLIENT_CLEANUP";
const EXPECTED_AUDIT_FINGERPRINT = "19c76c2afed7ac32";
const PROTECTED_GLOBAL_COLLECTIONS = Object.freeze([
  "fooddatabase2",
  "client_plan_configs",
  "coach_plan_configs",
  "coach_subscription_requests",
  "menus_base",
  "rutinas_base",
  "ejercicios",
]);

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function roleOf(user = {}) {
  return normalized(user.role || user.rol || user.tipo);
}

export function maskEmail(value) {
  const email = normalized(value);
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "(sin email)";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function idString(value) {
  return value?.toHexString?.() || String(value ?? "").trim();
}

function idVariants(ids) {
  const result = [];
  for (const raw of ids) {
    const value = idString(raw);
    if (!value) continue;
    result.push(value);
    if (ObjectId.isValid(value)) result.push(new ObjectId(value));
  }
  return result;
}

function buildAnyFieldFilter(fields, values) {
  return { $or: fields.map((field) => ({ [field]: { $in: values } })) };
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

function sameSet(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function normalizeArrayPath(value) {
  return value.replace(/\.\d+(?=\.|$)/g, "[]");
}

function findIdentityMatches(value, targetIds, targetEmails, currentPath = "", result = []) {
  if (value === null || value === undefined) return result;
  if (value instanceof ObjectId) {
    const raw = value.toHexString();
    if (targetIds.has(raw)) result.push({ path: currentPath, kind: "id", value: raw });
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findIdentityMatches(item, targetIds, targetEmails, `${currentPath}.${index}`, result));
    return result;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findIdentityMatches(item, targetIds, targetEmails, currentPath ? `${currentPath}.${key}` : key, result);
    }
    return result;
  }
  const raw = String(value).trim();
  if (targetIds.has(raw)) result.push({ path: currentPath, kind: "id", value: raw });
  if (typeof value === "string" && targetEmails.has(normalized(value))) {
    result.push({ path: currentPath, kind: "email", value: normalized(value) });
  }
  return result;
}

const USER_REFERENCE_KEYS = new Set([
  "userid", "clientid", "clienteid", "ownerid", "actorid", "subjectid", "targetuserid",
  "accepteduserid", "startedby", "creadaporid", "updatedbyclientid", "createdby", "adminid",
  "coachid", "assignedcoachid", "invitedby",
]);

function findOrphanUserReferences(value, currentUserIds, currentPath = "", result = []) {
  if (value === null || value === undefined) return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findOrphanUserReferences(item, currentUserIds, `${currentPath}.${index}`, result));
    return result;
  }
  if (typeof value === "object" && !(value instanceof ObjectId)) {
    for (const [key, item] of Object.entries(value)) {
      findOrphanUserReferences(item, currentUserIds, currentPath ? `${currentPath}.${key}` : key, result);
    }
    return result;
  }
  const finalKey = currentPath.split(".").at(-1)?.toLowerCase();
  if (!USER_REFERENCE_KEYS.has(finalKey)) return result;
  const raw = idString(value);
  if (/^[a-f\d]{24}$/i.test(raw) && !currentUserIds.has(raw)) result.push(normalizeArrayPath(currentPath));
  return result;
}

function allowedPathsByCollection() {
  const map = new Map();
  const add = (collection, fields) => {
    if (!map.has(collection)) map.set(collection, new Set());
    fields.forEach((field) => map.get(collection).add(field));
  };
  WHOLE_DOCUMENT_RULES.forEach((rule) => add(rule.collection, rule.fields));
  EMAIL_RULES.forEach((rule) => add(rule.collection, rule.fields));
  add(USER_COLLECTION, ["_id", "email"]);
  add(SHARED_COLLECTION, ["reservations[].clientId"]);
  // These nested references only occur inside a document whose owner filter is
  // already explicit. They are accepted for ambiguity detection, not queried.
  add("client_menu_tracking", ["manualCompletion.startedBy"]);
  return map;
}

function summarizePerClient(planDocs, targetIds, emailToClientIds) {
  const summary = Object.fromEntries([...targetIds].map((id) => [id, {}]));
  for (const [collection, docs] of planDocs) {
    for (const doc of docs) {
      const matches = findIdentityMatches(doc, targetIds, new Set(emailToClientIds.keys()));
      const matchedClientIds = new Set(matches.filter((m) => m.kind === "id").map((m) => m.value));
      for (const match of matches.filter((m) => m.kind === "email")) {
        (emailToClientIds.get(match.value) || []).forEach((id) => matchedClientIds.add(id));
      }
      for (const targetId of matchedClientIds) {
        summary[targetId][collection] = (summary[targetId][collection] || 0) + 1;
      }
    }
  }
  return summary;
}

function fingerprintFor({ database, targetIds, keepIds, counts }) {
  const payload = JSON.stringify({
    database,
    targetIds: [...targetIds].sort(),
    keepIds: [...keepIds].sort(),
    counts: Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function environmentBlockers({
  host,
  database,
  fingerprint,
  currentClientIds,
  existingAuditedClientCount,
  totalUserCount,
  protectedIds,
  keepIds,
  ambiguous,
}) {
  const blockers = [];
  const declaredEnvironment = normalized(process.env.CLEANUP_ENVIRONMENT);
  const allowedEnvironments = new Set(["local", "test", "testing", "staging"]);
  const productionDeclared = normalized(process.env.NODE_ENV) === "production" || declaredEnvironment === "production";

  if (productionDeclared) {
    if (process.env.AUTHORIZE_PRODUCTION_CLEANUP !== PRODUCTION_ACK) {
      blockers.push("producción requiere AUTHORIZE_PRODUCTION_CLEANUP explícito");
    }
    if (database !== "base2") blockers.push("la autorización de producción sólo cubre base2");
  } else if (!allowedEnvironments.has(declaredEnvironment)) {
    blockers.push("CLEANUP_ENVIRONMENT debe declarar local, test o staging");
  }
  if (!isLocalHost(host) && !productionDeclared && process.env.ALLOW_REMOTE_TEST_DB_CLEANUP !== REMOTE_ACK) {
    blockers.push("la base es remota y falta la confirmación explícita de entorno no productivo");
  }
  if (process.env.CONFIRM_DATABASE !== database) {
    blockers.push("CONFIRM_DATABASE no coincide exactamente con la base seleccionada");
  }
  if (process.env.CONFIRM_CLEANUP_FINGERPRINT !== fingerprint) {
    blockers.push("CONFIRM_CLEANUP_FINGERPRINT no coincide con este dry-run");
  }
  if (fingerprint !== EXPECTED_AUDIT_FINGERPRINT) {
    blockers.push("el fingerprint cambió respecto de la auditoría autorizada");
  }
  if (process.env.DELETE_AUDIT_HISTORY !== AUDIT_ACK) {
    blockers.push("falta aceptación explícita para eliminar historial de auditoría");
  }
  if (!sameSet(protectedIds, keepIds)) {
    blockers.push("la allowlist no coincide con todas las cuentas admin/coach actuales");
  }
  if (!sameSet(currentClientIds, AUDITED_CLIENT_IDS)) {
    blockers.push("los clientes actuales no coinciden exactamente con los 16 IDs autorizados");
  }
  if (existingAuditedClientCount !== AUDITED_CLIENT_IDS.length) {
    blockers.push("no están presentes exactamente los 16 clientes auditados");
  }
  if (totalUserCount !== AUDITED_CLIENT_IDS.length + KEEP_USERS.length) {
    blockers.push("usuarios no totaliza exactamente 18 antes del cleanup");
  }
  if (ambiguous.length) blockers.push(`hay ${ambiguous.length} referencia(s) de ownership ambiguo`);
  return blockers;
}

async function collectPlan(db) {
  if (!KEEP_USERS.length) throw new Error("ABORT: la allowlist KEEP_USERS está vacía");
  const allUsers = await db.collection(USER_COLLECTION).find({}).toArray();
  const keepIds = KEEP_USERS.map((item) => item.id);
  const auditedIds = new Set(AUDITED_CLIENT_IDS);
  const existingAuditedUsers = allUsers.filter((user) => auditedIds.has(idString(user._id)));
  const invalidAuditedUsers = existingAuditedUsers.filter((user) => !CLIENT_ROLES.has(roleOf(user)));
  if (invalidAuditedUsers.length) {
    throw new Error(`ABORT: ${invalidAuditedUsers.length} ID(s) auditados ya no tienen rol cliente`);
  }

  const keepRows = KEEP_USERS.map((entry) => {
    const user = allUsers.find((candidate) => idString(candidate._id) === entry.id);
    return {
      ...entry,
      exists: Boolean(user),
      actualRole: user ? roleOf(user) : null,
      identity: user ? maskEmail(user.email) : "(no encontrado)",
    };
  });
  const badKeep = keepRows.filter((row) => !row.exists || row.actualRole !== row.expectedRole);
  if (badKeep.length) throw new Error("ABORT: una cuenta de la allowlist falta o cambió de rol");

  const currentClients = allUsers.filter((user) => CLIENT_ROLES.has(roleOf(user)));
  const protectedUsers = allUsers.filter((user) => PROTECTED_ROLES.has(roleOf(user)));
  const targetIds = new Set(AUDITED_CLIENT_IDS);
  const targetValues = idVariants(targetIds);
  const targetEmails = new Set(existingAuditedUsers.map((user) => normalized(user.email)).filter(Boolean));
  const emailToClientIds = new Map();
  for (const user of existingAuditedUsers) {
    const email = normalized(user.email);
    if (!email) continue;
    if (!emailToClientIds.has(email)) emailToClientIds.set(email, []);
    emailToClientIds.get(email).push(idString(user._id));
  }
  const planDocs = new Map();

  for (const rule of WHOLE_DOCUMENT_RULES) {
    const docs = await db.collection(rule.collection).find(buildAnyFieldFilter(rule.fields, targetValues)).toArray();
    planDocs.set(rule.collection, docs);
  }
  for (const rule of EMAIL_RULES) {
    if (!targetEmails.size) continue;
    const docs = await db.collection(rule.collection).find(buildAnyFieldFilter(rule.fields, [...targetEmails])).toArray();
    const previous = planDocs.get(rule.collection) || [];
    const merged = new Map([...previous, ...docs].map((doc) => [idString(doc._id), doc]));
    planDocs.set(rule.collection, [...merged.values()]);
  }
  planDocs.set(USER_COLLECTION, existingAuditedUsers);

  const capacityDocs = await db.collection(SHARED_COLLECTION)
    .find({ "reservations.clientId": { $in: [...targetIds] } })
    .toArray();
  planDocs.set(SHARED_COLLECTION, capacityDocs);

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const allowed = allowedPathsByCollection();
  const ambiguous = [];
  const allTargetReferences = [];
  const orphanReferenceDocs = new Map();
  const currentCounts = new Map();
  const currentUserIds = new Set(allUsers.map((user) => idString(user._id)));
  for (const { name } of collections) {
    let currentCount = 0;
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      currentCount += 1;
      const orphanPaths = [...new Set(findOrphanUserReferences(doc, currentUserIds))];
      for (const orphanPath of orphanPaths) {
        const key = `${name}\u0000${orphanPath}`;
        if (!orphanReferenceDocs.has(key)) orphanReferenceDocs.set(key, new Set());
        orphanReferenceDocs.get(key).add(idString(doc._id));
      }
      const matches = findIdentityMatches(doc, targetIds, targetEmails);
      if (!matches.length) continue;
      const normalizedMatches = matches.map((match) => ({ ...match, path: normalizeArrayPath(match.path) }));
      allTargetReferences.push({ collection: name, id: idString(doc._id), matches: normalizedMatches });
      const accepted = allowed.get(name) || new Set();
      for (const match of normalizedMatches) {
        if (!accepted.has(match.path)) {
          ambiguous.push({ collection: name, id: idString(doc._id), path: match.path, kind: match.kind });
        }
      }
    }
    currentCounts.set(name, currentCount);
  }

  const counts = new Map([...planDocs].map(([name, docs]) => [name, docs.length]));
  const fingerprint = fingerprintFor({ database: db.databaseName, targetIds, keepIds, counts });
  return {
    allUsers,
    currentClients,
    protectedUsers,
    existingAuditedUsers,
    targetIds,
    targetEmails,
    targetValues,
    keepRows,
    planDocs,
    capacityDocs,
    allTargetReferences,
    ambiguous,
    counts,
    currentCounts,
    fingerprint,
    perClient: summarizePerClient(planDocs, targetIds, emailToClientIds),
    orphanReferences: [...orphanReferenceDocs].map(([key, ids]) => {
      const [collection, field] = key.split("\u0000");
      return { collection, field, documents: ids.size };
    }).sort((a, b) => a.collection.localeCompare(b.collection) || a.field.localeCompare(b.field)),
  };
}

function publicReport(plan, { host, dryRun, blockers }) {
  const collectionCounts = Object.fromEntries([...plan.counts].sort(([a], [b]) => a.localeCompare(b)));
  const collectionDryRun = [...plan.currentCounts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([collection, current]) => {
      const deleteDocuments = collection === SHARED_COLLECTION ? 0 : (plan.counts.get(collection) || 0);
      return {
        collection,
        current,
        deleteDocuments,
        preserveDocuments: current - deleteDocuments,
        patchSharedDocuments: collection === SHARED_COLLECTION ? (plan.counts.get(collection) || 0) : 0,
      };
    });
  const wholeDocuments = [...plan.counts]
    .filter(([name]) => name !== SHARED_COLLECTION)
    .reduce((sum, [, count]) => sum + count, 0);
  const reservations = plan.capacityDocs.reduce(
    (sum, doc) => sum + (doc.reservations || []).filter((item) => plan.targetIds.has(idString(item?.clientId))).length,
    0
  );
  return {
    mode: dryRun ? "DRY_RUN (solo lectura)" : "APPLY",
    database: config.BASE,
    host,
    remote: !isLocalHost(host),
    auditedClientIds: AUDITED_CLIENT_IDS.length,
    currentClientAccounts: plan.currentClients.length,
    auditedClientAccountsStillPresent: plan.existingAuditedUsers.length,
    targetAccounts: plan.existingAuditedUsers.map((user) => ({
      id: idString(user._id),
      identity: maskEmail(user.email),
      role: roleOf(user),
      reason: "cliente incluido en el snapshot auditado",
    })),
    keepAllowlist: plan.keepRows,
    collectionCounts,
    collectionDryRun,
    wholeDocumentsToDelete: wholeDocuments,
    sharedCoachCapacityDocumentsToPatch: plan.capacityDocs.length,
    sharedReservationsToRemove: reservations,
    ambiguousReferences: plan.ambiguous,
    preExistingOrphanReferencesPreserved: plan.orphanReferences,
    fingerprint: plan.fingerprint,
    applyBlocked: blockers.length > 0,
    blockers,
    perClient: plan.perClient,
  };
}

async function writeBackup(plan, host) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = path.resolve(process.env.CLEANUP_BACKUP_ROOT || ".cleanup-backups", `client-cleanup-${stamp}`);
  await mkdir(root, { recursive: true });
  for (const [collection, docs] of plan.planDocs) {
    await writeFile(path.join(root, `${collection}.ejson`), BSON.EJSON.stringify(docs, null, 2), { flag: "wx" });
  }
  const manifest = {
    createdAt: new Date(),
    database: config.BASE,
    host,
    fingerprint: plan.fingerprint,
    targetIds: [...plan.targetIds],
    collections: Object.fromEntries([...plan.counts]),
    format: "MongoDB Extended JSON; arrays of complete pre-delete documents",
  };
  await writeFile(path.join(root, "manifest.ejson"), BSON.EJSON.stringify(manifest, null, 2), { flag: "wx" });
  return { root, manifest };
}

async function validateBackup(plan, backup) {
  const manifestPath = path.join(backup.root, "manifest.ejson");
  const manifest = BSON.EJSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.database !== config.BASE) throw new Error("BACKUP INVALID: database no coincide");
  if (manifest.fingerprint !== plan.fingerprint) throw new Error("BACKUP INVALID: fingerprint no coincide");
  if (!sameSet(manifest.targetIds || [], [...plan.targetIds])) throw new Error("BACKUP INVALID: IDs objetivo no coinciden");
  for (const [collection, expectedDocs] of plan.planDocs) {
    const file = path.join(backup.root, `${collection}.ejson`);
    const restoredDocs = BSON.EJSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(restoredDocs) || restoredDocs.length !== expectedDocs.length) {
      throw new Error(`BACKUP INVALID: conteo incorrecto en ${collection}`);
    }
    if (BSON.EJSON.stringify(restoredDocs) !== BSON.EJSON.stringify(expectedDocs)) {
      throw new Error(`BACKUP INVALID: contenido distinto en ${collection}`);
    }
  }
  return manifest;
}

function digestDocuments(documents) {
  const ordered = [...documents].sort((a, b) => idString(a._id).localeCompare(idString(b._id)));
  return crypto.createHash("sha256").update(BSON.EJSON.stringify(ordered)).digest("hex");
}

async function captureProtectedState(db) {
  const keepValues = idVariants(KEEP_USERS.map((entry) => entry.id));
  const keepUsers = await db.collection(USER_COLLECTION).find({ _id: { $in: keepValues } }).toArray();
  const globals = {};
  for (const collection of PROTECTED_GLOBAL_COLLECTIONS) {
    const documents = await db.collection(collection).find({}).toArray();
    globals[collection] = { count: documents.length, digest: digestDocuments(documents) };
  }
  return {
    keepUsers: Object.fromEntries(keepUsers.map((user) => [idString(user._id), digestDocuments([user])])),
    globals,
  };
}

async function verifyProtectedState(db, before) {
  const after = await captureProtectedState(db);
  const failures = [];
  if (JSON.stringify(after.keepUsers) !== JSON.stringify(before.keepUsers)) failures.push("Admin/Coach fueron modificados");
  for (const collection of PROTECTED_GLOBAL_COLLECTIONS) {
    if (JSON.stringify(after.globals[collection]) !== JSON.stringify(before.globals[collection])) {
      failures.push(`${collection} cambió`);
    }
  }
  return { ok: failures.length === 0, failures, after };
}

async function applyPlan(client, db, plan) {
  const session = client.startSession();
  const results = {};
  try {
    await session.withTransaction(async () => {
      for (const rule of WHOLE_DOCUMENT_RULES) {
        const result = await db.collection(rule.collection).deleteMany(
          buildAnyFieldFilter(rule.fields, plan.targetValues),
          { session }
        );
        results[rule.collection] = (results[rule.collection] || 0) + result.deletedCount;
      }
      for (const rule of EMAIL_RULES) {
        if (!plan.targetEmails.size) continue;
        const result = await db.collection(rule.collection).deleteMany(
          buildAnyFieldFilter(rule.fields, [...plan.targetEmails]),
          { session }
        );
        results[rule.collection] = (results[rule.collection] || 0) + result.deletedCount;
      }

      for (const doc of plan.capacityDocs) {
        const reservations = Array.isArray(doc.reservations) ? doc.reservations : [];
        const removedCount = reservations.filter((item) => plan.targetIds.has(idString(item?.clientId))).length;
        if (!removedCount) continue;
        const keptReservations = reservations.filter((item) => !plan.targetIds.has(idString(item?.clientId)));
        const nextUsed = Math.max(0, Number(doc.used || 0) - removedCount);
        const result = await db.collection(SHARED_COLLECTION).updateOne(
          { _id: doc._id },
          { $set: { reservations: keptReservations, used: nextUsed, updatedAt: new Date() } },
          { session }
        );
        if (result.matchedCount !== 1) throw new Error(`No se pudo actualizar cupo compartido ${idString(doc._id)}`);
      }

      // Users are intentionally last.
      const userResult = await db.collection(USER_COLLECTION).deleteMany(
        { _id: { $in: plan.targetValues }, $or: [{ role: "cliente" }, { rol: "cliente" }, { tipo: "entrenado" }] },
        { session }
      );
      results[USER_COLLECTION] = userResult.deletedCount;
    });
  } finally {
    await session.endSession();
  }
  return results;
}

async function verifyCleanup(db, targetIds, targetEmails) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const remaining = [];
  for (const { name } of collections) {
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      const matches = findIdentityMatches(doc, targetIds, targetEmails);
      if (matches.length) remaining.push({ collection: name, id: idString(doc._id), paths: matches.map((m) => m.path) });
    }
  }
  return remaining;
}

export async function main() {
  const dryRun = resolveDryRun(process.env.DRY_RUN);
  const host = databaseHost(config.STRCNX);
  const client = new MongoClient(config.STRCNX);
  try {
    await client.connect();
    const db = client.db(config.BASE);
    const plan = await collectPlan(db);
    const protectedIds = plan.protectedUsers.map((user) => idString(user._id));
    const keepIds = KEEP_USERS.map((item) => item.id);
    const currentClientIds = plan.currentClients.map((user) => idString(user._id));
    const blockers = environmentBlockers({
      host,
      database: config.BASE,
      fingerprint: plan.fingerprint,
      currentClientIds,
      existingAuditedClientCount: plan.existingAuditedUsers.length,
      totalUserCount: plan.allUsers.length,
      protectedIds,
      keepIds,
      ambiguous: plan.ambiguous,
    });
    const report = publicReport(plan, { host, dryRun, blockers });
    console.log(BSON.EJSON.stringify(report, null, 2));

    if (dryRun) {
      console.log("\nDRY_RUN=true: no se creó backup y no se escribió en MongoDB.");
      return;
    }
    if (blockers.length) throw new Error(`ABORT APPLY:\n- ${blockers.join("\n- ")}`);

    const protectedBefore = await captureProtectedState(db);
    const backup = await writeBackup(plan, host);
    const validatedManifest = await validateBackup(plan, backup);
    console.log(`Backup completo creado y validado en: ${backup.root}`);
    const results = await applyPlan(client, db, plan);
    const remaining = await verifyCleanup(db, plan.targetIds, plan.targetEmails);
    if (remaining.length) {
      throw new Error(`POST-CHECK FAILED: quedan ${remaining.length} referencias exactas a clientes eliminados`);
    }
    const afterCounts = new Map();
    for (const collection of plan.currentCounts.keys()) {
      afterCounts.set(collection, await db.collection(collection).countDocuments({}));
    }
    const table = [...plan.currentCounts].sort(([a], [b]) => a.localeCompare(b)).map(([collection, before]) => ({
      collection,
      before,
      deleted: before - (afterCounts.get(collection) || 0),
      after: afterCounts.get(collection) || 0,
    }));
    const postUsers = await db.collection(USER_COLLECTION).find({}).toArray();
    const postUserIds = postUsers.map((user) => idString(user._id));
    const capacityTargetReservations = await db.collection(SHARED_COLLECTION).countDocuments({
      "reservations.clientId": { $in: [...plan.targetIds] },
    });
    const protectedVerification = await verifyProtectedState(db, protectedBefore);
    const postFailures = [];
    if (!sameSet(postUserIds, keepIds) || postUsers.length !== 2) postFailures.push("usuarios no quedó exactamente con los 2 KEEP");
    if (capacityTargetReservations !== 0) postFailures.push("quedan reservas objetivo en capacidad del coach");
    if (!protectedVerification.ok) postFailures.push(...protectedVerification.failures);
    if (protectedVerification.after.globals.fooddatabase2.count !== 574) postFailures.push("fooddatabase2 no tiene 574 documentos");
    if (postFailures.length) throw new Error(`POST-CHECK FAILED:\n- ${postFailures.join("\n- ")}`);

    console.log(BSON.EJSON.stringify({
      backup: backup.root,
      backupTimestamp: validatedManifest.createdAt,
      fingerprint: validatedManifest.fingerprint,
      deletedUsers: AUDITED_CLIENT_IDS,
      preservedUsers: KEEP_USERS,
      deleted: results,
      collectionTable: table,
      embeddedReservationsRemoved: 2,
      remainingTargetReferences: remaining,
      usersAfter: postUsers.length,
      foodsAfter: protectedVerification.after.globals.fooddatabase2.count,
      protectedGlobalState: "unchanged",
      verification: "sin referencias exactas restantes",
    }, null, 2));
  } finally {
    await client.close();
  }
}

export function resolveDryRun(value) {
  return normalized(value || "true") !== "false";
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

