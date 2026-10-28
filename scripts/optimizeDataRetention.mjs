import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BSON, MongoClient } from "mongodb";

import config from "../config.js";
import { TrackingRetentionService } from "../servicio/trackingRetention.js";
import {
  TRACKING_DETAIL_RETENTION_DAYS,
  trackingRetentionWindow,
  trackingSummaryExpiresAt,
} from "../utils/trackingRetention.js";
import {
  SOFT_DELETED_FAVORITE_RETENTION_DAYS,
  accessAuditExpiresAt,
  impersonationAuditExpiresAt,
} from "../utils/dataRetention.js";
import { packFavoriteStorageFields } from "../model/DAO/clientDayFavoritesMongoDB.js";

const APPLY = process.argv.includes("--apply");
const RAW_COLLECTIONS = [
  "food_logs",
  "food_log_allocations",
  "client_menu_tracking",
  "food_log_days",
];
const REDUNDANT_INDEXES = Object.freeze({
  food_log_days: ["userId_1_date_-1", "coachId_1_date_-1"],
  food_logs: ["foodLogDayId_1", "userId_1_mealType_1_date_-1"],
  food_log_allocations: ["userId_1_date_-1"],
  client_menu_tracking: ["clientId_1_date_-1", "coachId_1_date_-1"],
  access_audit_events: [
    "subjectType_1_subjectId_1_notificationVisible_1_createdAt_-1",
    "subjectType_1_subjectId_1_includeInWeeklyDigest_1_createdAt_-1",
  ],
  impersonation_audit_logs: [
    "sessionId_1",
    "adminId_1_createdAt_-1",
    "actorType_1_actorId_1_createdAt_-1",
    "targetUserId_1_createdAt_-1",
    "action_1_createdAt_-1",
  ],
});

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function totalBsonBytes(documents = []) {
  return documents.reduce((sum, document) => sum + BSON.calculateObjectSize(document), 0);
}

async function documents(db, collection, query = {}) {
  return await db.collection(collection).find(query).toArray();
}

async function bulkWrite(collection, operations = []) {
  if (!operations.length) return { modifiedCount: 0 };
  let modifiedCount = 0;
  for (let index = 0; index < operations.length; index += 500) {
    const result = await collection.bulkWrite(operations.slice(index, index + 500), { ordered: false });
    modifiedCount += Number(result.modifiedCount || 0);
  }
  return { modifiedCount };
}

async function existingRedundantIndexes(db) {
  const result = [];
  for (const [collectionName, names] of Object.entries(REDUNDANT_INDEXES)) {
    const collectionExists = await db.listCollections(
      { name: collectionName },
      { nameOnly: true }
    ).hasNext();
    if (!collectionExists) continue;
    const indexes = await db.collection(collectionName).indexes();
    indexes
      .filter((index) => names.includes(index.name))
      .forEach((index) => result.push({ collection: collectionName, ...index }));
  }
  return result;
}

async function dropRedundantIndexes(db, indexes = []) {
  const dropped = [];
  for (const index of indexes) {
    try {
      await db.collection(index.collection).dropIndex(index.name);
      dropped.push({ collection: index.collection, name: index.name });
    } catch (error) {
      if (Number(error?.code) !== 27 && error?.codeName !== "IndexNotFound") throw error;
    }
  }
  return dropped;
}

async function main() {
  const now = new Date();
  const { detailFrom, summaryFrom } = trackingRetentionWindow(now);
  const softDeleteCutoff = new Date(
    now.getTime() - SOFT_DELETED_FAVORITE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const client = new MongoClient(config.STRCNX, { maxPoolSize: 3, minPoolSize: 0 });
  await client.connect();

  try {
    const db = client.db(config.BASE);
    const rawExpired = {};
    for (const collection of RAW_COLLECTIONS) {
      rawExpired[collection] = await documents(db, collection, { date: { $lt: detailFrom } });
    }

    const summariesToExpire = await documents(db, "nutrition_daily_summaries", {
      date: { $lt: summaryFrom },
    });
    const activeSummaries = await documents(db, "nutrition_daily_summaries", {
      date: { $gte: summaryFrom },
    });
    const summariesToRetimestamp = activeSummaries.filter((document) => {
      const expected = trackingSummaryExpiresAt(document.date);
      const current = document.expiresAt instanceof Date ? document.expiresAt : new Date(document.expiresAt || 0);
      return expected && (!Number.isFinite(current.getTime()) || current.getTime() !== expected.getTime());
    });
    const accessAuditDocuments = await documents(db, "access_audit_events");
    const accessAuditsToMigrate = accessAuditDocuments.filter((document) => {
      const expected = accessAuditExpiresAt(document.event, document.createdAt || now);
      const current = document.expiresAt instanceof Date ? document.expiresAt : new Date(document.expiresAt || 0);
      return !Number.isFinite(current.getTime()) || current.getTime() !== expected.getTime();
    });
    const impersonationAuditDocuments = await documents(db, "impersonation_audit_logs");
    const impersonationAuditsToMigrate = impersonationAuditDocuments.filter((document) => {
      const expected = impersonationAuditExpiresAt(document.createdAt || now);
      const current = document.expiresAt instanceof Date ? document.expiresAt : new Date(document.expiresAt || 0);
      return !Number.isFinite(current.getTime()) || current.getTime() !== expected.getTime();
    });
    const favoritesToCompact = await documents(db, "client_day_favorites", {
      favoriteStorageVersion: { $ne: 2 },
    });
    const favoritesToPurge = await documents(db, "client_day_favorites", {
      deletedAt: { $type: "date", $lte: softDeleteCutoff },
    });
    const planConfigsToUpdate = await documents(db, "client_plan_configs", {
      "limits.trackingHistoryDays": { $ne: TRACKING_DETAIL_RETENTION_DAYS },
    });
    const redundantIndexes = await existingRedundantIndexes(db);

    const backup = {
      metadata: {
        createdAt: now,
        database: config.BASE,
        applyRequested: APPLY,
        detailFrom,
        summaryFrom,
        softDeleteCutoff,
      },
      rawExpired,
      summariesToExpire,
      summariesToRetimestamp,
      accessAuditsToMigrate,
      impersonationAuditsToMigrate,
      favoritesToCompact,
      favoritesToPurge,
      planConfigsToUpdate,
      redundantIndexes,
    };
    const backupDir = path.resolve(".cleanup-backups", "data-retention");
    await mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${stamp(now)}-${APPLY ? "apply" : "plan"}.ejson`);
    await writeFile(backupPath, BSON.EJSON.stringify(backup, null, 2), "utf8");

    const candidateGroups = [
      ...Object.entries(rawExpired),
      ["nutrition_daily_summaries_expired", summariesToExpire],
      ["nutrition_daily_summaries_retimestamp", summariesToRetimestamp],
      ["access_audit_events_migrate", accessAuditsToMigrate],
      ["impersonation_audit_logs_migrate", impersonationAuditsToMigrate],
      ["client_day_favorites_compact", favoritesToCompact],
      ["client_day_favorites_purge", favoritesToPurge],
      ["client_plan_configs_update", planConfigsToUpdate],
    ];
    const plan = Object.fromEntries(candidateGroups.map(([name, docs]) => [name, {
      documents: docs.length,
      bsonBytes: totalBsonBytes(docs),
    }]));
    plan.redundant_indexes = {
      documents: redundantIndexes.length,
      bsonBytes: totalBsonBytes(redundantIndexes),
    };

    if (!APPLY) {
      console.log(JSON.stringify({ mode: "plan", detailFrom, summaryFrom, backupPath, plan }, null, 2));
      return;
    }

    const tracking = await new TrackingRetentionService({ db }).run({ now });

    const summaryOps = summariesToRetimestamp
      .map((document) => ({
        updateOne: {
          filter: { _id: document._id },
          update: { $set: { expiresAt: trackingSummaryExpiresAt(document.date), updatedAt: now } },
        },
      }))
      .filter((operation) => operation.updateOne.update.$set.expiresAt);
    const summariesUpdated = await bulkWrite(db.collection("nutrition_daily_summaries"), summaryOps);
    const summariesDeleted = await db.collection("nutrition_daily_summaries").deleteMany({
      date: { $lt: summaryFrom },
    });

    const accessAuditOps = accessAuditsToMigrate.map((document) => ({
      updateOne: {
        filter: { _id: document._id },
        update: {
          $set: {
            expiresAt: accessAuditExpiresAt(document.event, document.createdAt || now),
          },
        },
      },
    }));
    const accessAuditsUpdated = await bulkWrite(db.collection("access_audit_events"), accessAuditOps);

    const impersonationOps = impersonationAuditsToMigrate.map((document) => ({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: { expiresAt: impersonationAuditExpiresAt(document.createdAt || now) } },
      },
    }));
    const impersonationAuditsUpdated = await bulkWrite(
      db.collection("impersonation_audit_logs"),
      impersonationOps
    );

    const favoriteOps = favoritesToCompact.map((document) => ({
      updateOne: {
        filter: { _id: document._id, favoriteStorageVersion: { $ne: 2 } },
        update: {
          $set: packFavoriteStorageFields(document),
          $unset: {
            dailyTarget: "",
            plannedTotals: "",
            physicalMeals: "",
            targetMeals: "",
          },
        },
      },
    }));
    const favoritesCompacted = await bulkWrite(db.collection("client_day_favorites"), favoriteOps);
    const planConfigOps = planConfigsToUpdate.map((document) => ({
      updateOne: {
        filter: { _id: document._id },
        update: {
          $set: {
            "limits.trackingHistoryDays": TRACKING_DETAIL_RETENTION_DAYS,
            updatedAt: now,
          },
        },
      },
    }));
    const planConfigsUpdated = await bulkWrite(db.collection("client_plan_configs"), planConfigOps);

    await Promise.all([
      db.collection("access_audit_events").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "access_audit_events_ttl" }
      ),
      db.collection("impersonation_audit_logs").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "impersonation_audit_logs_ttl" }
      ),
      db.collection("client_day_favorites").createIndex(
        { deletedAt: 1 },
        {
          expireAfterSeconds: SOFT_DELETED_FAVORITE_RETENTION_DAYS * 24 * 60 * 60,
          name: "client_day_favorites_soft_delete_ttl",
        }
      ),
      db.collection("client_day_favorites").createIndex(
        { ownerId: 1, deletedAt: 1, updatedAt: -1 },
        { name: "client_day_favorites_owner_updated" }
      ),
      db.collection("access_audit_events").createIndex(
        { dedupeKey: 1 },
        {
          unique: true,
          partialFilterExpression: { dedupeKey: { $type: "string" } },
          name: "access_audit_events_dedupe",
        }
      ),
    ]);

    const [accessAuditsDeleted, impersonationAuditsDeleted, favoritesDeleted] = await Promise.all([
      db.collection("access_audit_events").deleteMany({ expiresAt: { $lte: now } }),
      db.collection("impersonation_audit_logs").deleteMany({ expiresAt: { $lte: now } }),
      db.collection("client_day_favorites").deleteMany({
        deletedAt: { $type: "date", $lte: softDeleteCutoff },
      }),
    ]);
    const droppedIndexes = await dropRedundantIndexes(db, redundantIndexes);

    console.log(JSON.stringify({
      mode: "apply",
      backupPath,
      plan,
      tracking,
      modified: {
        summaries: summariesUpdated.modifiedCount,
        accessAudits: accessAuditsUpdated.modifiedCount,
        impersonationAudits: impersonationAuditsUpdated.modifiedCount,
        favorites: favoritesCompacted.modifiedCount,
        planConfigs: planConfigsUpdated.modifiedCount,
      },
      deleted: {
        summaries: Number(summariesDeleted.deletedCount || 0),
        accessAudits: Number(accessAuditsDeleted.deletedCount || 0),
        impersonationAudits: Number(impersonationAuditsDeleted.deletedCount || 0),
        favorites: Number(favoritesDeleted.deletedCount || 0),
      },
      droppedIndexes,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
