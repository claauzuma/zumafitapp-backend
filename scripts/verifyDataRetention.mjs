import { MongoClient } from "mongodb";

import config from "../config.js";
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

const RAW_COLLECTIONS = [
  "food_logs",
  "food_log_allocations",
  "client_menu_tracking",
  "food_log_days",
];
const RELEVANT_COLLECTIONS = [
  ...RAW_COLLECTIONS,
  "nutrition_daily_summaries",
  "access_audit_events",
  "impersonation_audit_logs",
  "client_day_favorites",
];

async function exists(db, name) {
  return await db.listCollections({ name }, { nameOnly: true }).hasNext();
}

function sameInstant(left, right) {
  const first = left instanceof Date ? left : new Date(left || 0);
  const second = right instanceof Date ? right : new Date(right || 0);
  return Number.isFinite(first.getTime()) && Number.isFinite(second.getTime())
    && first.getTime() === second.getTime();
}

async function main() {
  const now = new Date();
  const { detailFrom, summaryFrom } = trackingRetentionWindow(now);
  const softDeleteCutoff = new Date(
    now.getTime() - SOFT_DELETED_FAVORITE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const client = new MongoClient(config.STRCNX, { maxPoolSize: 2, minPoolSize: 0 });
  await client.connect();

  try {
    const db = client.db(config.BASE);
    const collections = {};
    let totalDataBytes = 0;
    let totalIndexBytes = 0;
    let databaseDataBytes = 0;
    let databaseIndexBytes = 0;

    const allCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of allCollections) {
      if (!name || name.startsWith("system.")) continue;
      const stats = await db.command({ collStats: name });
      databaseDataBytes += Number(stats.size || 0);
      databaseIndexBytes += Number(stats.totalIndexSize || 0);
    }

    for (const name of RELEVANT_COLLECTIONS) {
      if (!(await exists(db, name))) {
        collections[name] = { count: 0, dataBytes: 0, indexBytes: 0, indexes: [] };
        continue;
      }
      const stats = await db.command({ collStats: name });
      const indexes = await db.collection(name).indexes();
      const dataBytes = Number(stats.size || 0);
      const indexBytes = Number(stats.totalIndexSize || 0);
      totalDataBytes += dataBytes;
      totalIndexBytes += indexBytes;
      collections[name] = {
        count: Number(stats.count || 0),
        dataBytes,
        indexBytes,
        indexes: indexes.map((index) => ({
          name: index.name,
          expireAfterSeconds: index.expireAfterSeconds ?? null,
        })),
      };
    }

    const expiredRaw = {};
    for (const name of RAW_COLLECTIONS) {
      expiredRaw[name] = await db.collection(name).countDocuments({ date: { $lt: detailFrom } });
    }
    const expiredSummaries = await db.collection("nutrition_daily_summaries").countDocuments({
      date: { $lt: summaryFrom },
    });
    const summaryDocuments = await db.collection("nutrition_daily_summaries")
      .find({}, { projection: { date: 1, expiresAt: 1 } }).toArray();
    const invalidSummaryExpirations = summaryDocuments.filter((document) => (
      !sameInstant(document.expiresAt, trackingSummaryExpiresAt(document.date))
    )).length;

    const accessAudits = await db.collection("access_audit_events")
      .find({}, { projection: { event: 1, createdAt: 1, expiresAt: 1 } }).toArray();
    const invalidAccessAuditExpirations = accessAudits.filter((document) => (
      !sameInstant(document.expiresAt, accessAuditExpiresAt(document.event, document.createdAt || now))
    )).length;
    const impersonationAudits = await db.collection("impersonation_audit_logs")
      .find({}, { projection: { createdAt: 1, expiresAt: 1 } }).toArray();
    const invalidImpersonationExpirations = impersonationAudits.filter((document) => (
      !sameInstant(document.expiresAt, impersonationAuditExpiresAt(document.createdAt || now))
    )).length;
    const purgeableFavorites = await db.collection("client_day_favorites").countDocuments({
      deletedAt: { $type: "date", $lte: softDeleteCutoff },
    });
    const legacyFavorites = await db.collection("client_day_favorites").countDocuments({
      favoriteStorageVersion: { $ne: 2 },
    });
    const invalidPlanConfigs = await db.collection("client_plan_configs").countDocuments({
      "limits.trackingHistoryDays": { $ne: TRACKING_DETAIL_RETENTION_DAYS },
    });

    const invariants = {
      expiredRaw,
      expiredSummaries,
      invalidSummaryExpirations,
      invalidAccessAuditExpirations,
      invalidImpersonationExpirations,
      purgeableFavorites,
      legacyFavorites,
      invalidPlanConfigs,
      missingRequiredIndexes: [
        ["nutrition_daily_summaries", "nutrition_daily_summaries_ttl"],
        ["access_audit_events", "access_audit_events_ttl"],
        ["access_audit_events", "access_audit_events_dedupe"],
        ["impersonation_audit_logs", "impersonation_audit_logs_ttl"],
        ["client_day_favorites", "client_day_favorites_soft_delete_ttl"],
        ["client_day_favorites", "client_day_favorites_owner_updated"],
      ].filter(([collection, name]) => (
        !collections[collection]?.indexes?.some((index) => index.name === name)
      )),
    };
    const ok = Object.values(expiredRaw).every((count) => count === 0)
      && expiredSummaries === 0
      && invalidSummaryExpirations === 0
      && invalidAccessAuditExpirations === 0
      && invalidImpersonationExpirations === 0
      && purgeableFavorites === 0
      && legacyFavorites === 0
      && invalidPlanConfigs === 0
      && invariants.missingRequiredIndexes.length === 0;

    console.log(JSON.stringify({
      ok,
      checkedAt: now,
      detailFrom,
      summaryFrom,
      totals: {
        relevantDataBytes: totalDataBytes,
        relevantIndexBytes: totalIndexBytes,
        databaseDataBytes,
        databaseIndexBytes,
        databaseQuotaBytes: databaseDataBytes + databaseIndexBytes,
      },
      invariants,
      collections,
    }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
