import CnxMongoDB from "../model/DBMongo.js";
import {
  TRACKING_SUMMARY_RETENTION_DAYS,
  trackingRetentionWindow,
  trackingSummaryExpiresAt,
} from "../utils/trackingRetention.js";

const SUMMARY_COLLECTION = "nutrition_daily_summaries";
const RAW_COLLECTIONS = [
  "food_logs",
  "food_log_allocations",
  "client_menu_tracking",
  "food_log_days",
];

function compactNutrition(nutrition = {}) {
  return {
    status: nutrition?.status || null,
    adherencePercent: Number(nutrition?.adherencePercent || 0),
    completedMealsCount: Number(nutrition?.completedMealsCount || 0),
    totalMealsCount: Number(nutrition?.totalMealsCount || 0),
  };
}

function compactManualCompletion(completion = null) {
  if (!completion || typeof completion !== "object") return null;
  return {
    startedAt: completion.startedAt || null,
    startedFromMenu: completion.startedFromMenu === true,
    startedCompletedMealsCount: Number(completion.startedCompletedMealsCount || 0),
    startedTotalMealsCount: Number(completion.startedTotalMealsCount || 0),
  };
}

function summaryIdentity(value) {
  return String(value || "").trim();
}

async function flushOperations(collection, operations = []) {
  if (!operations.length) return;
  const batch = operations.splice(0, operations.length);
  await collection.bulkWrite(batch, { ordered: false });
}

export class TrackingRetentionService {
  constructor({ db = null } = {}) {
    this.db = db;
  }

  _db() {
    const db = this.db || CnxMongoDB.db;
    if (!db) throw new Error("No hay conexion a la base de datos");
    return db;
  }

  _summaries() {
    return this._db().collection(SUMMARY_COLLECTION);
  }

  async ensureIndexes() {
    const summaries = this._summaries();
    await summaries.createIndex({ userId: 1, date: 1 }, { unique: true });
    await summaries.createIndex({ date: -1 });
    await summaries.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "nutrition_daily_summaries_ttl" }
    );
  }

  async _summarizeFoodDays({ summaryFrom, now }) {
    const db = this._db();
    const cursor = db.collection("food_log_days").find(
      { date: { $gte: summaryFrom } },
      { projection: { userId: 1, date: 1, totals: 1, objetivo: 1, status: 1 } }
    );
    const operations = [];
    let summarized = 0;

    for await (const doc of cursor) {
      const userId = summaryIdentity(doc.userId);
      if (!userId || !doc.date) continue;
      operations.push({
        updateOne: {
          filter: { userId, date: doc.date },
          update: {
            $setOnInsert: { userId, date: doc.date, createdAt: now },
            $set: {
              foodTotals: doc.totals || null,
              objective: doc.objetivo || null,
              foodLogStatus: doc.status || null,
              expiresAt: trackingSummaryExpiresAt(doc.date),
              updatedAt: now,
            },
          },
          upsert: true,
        },
      });
      summarized += 1;
      if (operations.length >= 500) await flushOperations(this._summaries(), operations);
    }

    await flushOperations(this._summaries(), operations);
    return summarized;
  }

  async _summarizeMenuTracking({ summaryFrom, now }) {
    const db = this._db();
    const cursor = db.collection("client_menu_tracking").find(
      { date: { $gte: summaryFrom } },
      {
        projection: {
          clientId: 1,
          date: 1,
          target: 1,
          menuTotals: 1,
          consumedTotals: 1,
          remainingTotals: 1,
          nutrition: 1,
          dayCompletionMode: 1,
          manualCompletion: 1,
        },
      }
    );
    const operations = [];
    let summarized = 0;

    for await (const doc of cursor) {
      const userId = summaryIdentity(doc.clientId);
      if (!userId || !doc.date) continue;
      operations.push({
        updateOne: {
          filter: { userId, date: doc.date },
          update: {
            $setOnInsert: { userId, date: doc.date, createdAt: now },
            $set: {
              target: doc.target || null,
              menuTotals: doc.menuTotals || null,
              consumedTotals: doc.consumedTotals || null,
              remainingTotals: doc.remainingTotals || null,
              nutrition: compactNutrition(doc.nutrition),
              dayCompletionMode: doc.dayCompletionMode || null,
              manualCompletion: compactManualCompletion(doc.manualCompletion),
              expiresAt: trackingSummaryExpiresAt(doc.date),
              updatedAt: now,
            },
          },
          upsert: true,
        },
      });
      summarized += 1;
      if (operations.length >= 500) await flushOperations(this._summaries(), operations);
    }

    await flushOperations(this._summaries(), operations);
    return summarized;
  }

  async run({ now = new Date() } = {}) {
    const currentNow = now instanceof Date ? now : new Date(now);
    const { detailFrom, summaryFrom } = trackingRetentionWindow(currentNow);
    await this.ensureIndexes();

    // Primero se conserva un resumen liviano. Si esta etapa falla, no se borra detalle.
    const summarizedFoodDays = await this._summarizeFoodDays({ summaryFrom, now: currentNow });
    const summarizedMenuDays = await this._summarizeMenuTracking({ summaryFrom, now: currentNow });

    const deleted = {};
    for (const collectionName of RAW_COLLECTIONS) {
      const result = await this._db()
        .collection(collectionName)
        .deleteMany({ date: { $lt: detailFrom } });
      deleted[collectionName] = Number(result?.deletedCount || 0);
    }

    return {
      detailFrom,
      summaryFrom,
      summaryRetentionDays: TRACKING_SUMMARY_RETENTION_DAYS,
      summarizedFoodDays,
      summarizedMenuDays,
      deleted,
    };
  }
}

export function startTrackingRetentionMaintenance({
  service = new TrackingRetentionService(),
  intervalMs = 6 * 60 * 60 * 1000,
  logger = console,
} = {}) {
  let running = false;

  const execute = async () => {
    if (running) return null;
    running = true;
    try {
      const result = await service.run();
      logger.info?.("Retencion de tracking aplicada", result);
      return result;
    } catch (error) {
      logger.error?.("No se pudo aplicar la retencion de tracking", error?.message || error);
      return null;
    } finally {
      running = false;
    }
  };

  void execute();
  const timer = setInterval(execute, intervalMs);
  timer.unref?.();
  return { execute, stop: () => clearInterval(timer) };
}

export default TrackingRetentionService;
