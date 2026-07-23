import CnxMongoDB from "../DBMongo.js";
import {
  BASE_COACH_PLAN_CONFIGS,
  COACH_PLAN_CODES,
  clonePlanConfig,
  normalizeCoachPlanCode,
  normalizePlanConfig,
} from "../../servicio/coachPlans.js";

class ModelMongoDBCoachPlanConfigs {
  constructor() {
    this.defaultsReady = false;
    this.defaultsPromise = null;
  }

  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("coach_plan_configs");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ code: 1 }, { unique: true });
    await col.createIndex({ updatedAt: -1 });
  }

  async ensureSeedDefaults() {
    if (this.defaultsReady) return;
    if (this.defaultsPromise) return await this.defaultsPromise;

    this.defaultsPromise = this._ensureSeedDefaults();
    try {
      await this.defaultsPromise;
      this.defaultsReady = true;
    } finally {
      this.defaultsPromise = null;
    }
  }

  async _ensureSeedDefaults() {
    await this.ensureIndexes();
    const col = this._col();
    const now = new Date();

    for (const code of COACH_PLAN_CODES) {
      const base = clonePlanConfig(BASE_COACH_PLAN_CONFIGS[code]);
      await col.updateOne(
        { code },
        {
          $setOnInsert: {
            ...base,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    }
  }

  async list() {
    await this.ensureSeedDefaults();
    const docs = await this._col()
      .find({ code: { $in: COACH_PLAN_CODES } })
      .sort({ code: 1 })
      .toArray();

    const byCode = new Map(docs.map((doc) => [doc.code, doc]));
    return COACH_PLAN_CODES.map((code) => normalizePlanConfig(byCode.get(code) || code));
  }

  async getByCode(planCode) {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) return null;

    const doc = await this._col().findOne({ code });
    return normalizePlanConfig(doc || code);
  }

  async updateByCode(planCode, patch = {}, { updatedBy = null } = {}) {
    await this.ensureSeedDefaults();
    const code = normalizeCoachPlanCode(planCode);
    if (!code) return null;

    const current = await this.getByCode(code);
    const next = normalizePlanConfig({
      ...current,
      ...patch,
      code,
      features: {
        ...(current?.features || {}),
        ...(patch?.features || {}),
        clients: {
          ...(current?.features?.clients || {}),
          ...(patch?.features?.clients || {}),
        },
        routines: {
          ...(current?.features?.routines || {}),
          ...(patch?.features?.routines || {}),
        },
        menus: {
          ...(current?.features?.menus || {}),
          ...(patch?.features?.menus || {}),
        },
        metrics: {
          ...(current?.features?.metrics || {}),
          ...(patch?.features?.metrics || {}),
        },
        exports: {
          ...(current?.features?.exports || {}),
          ...(patch?.features?.exports || {}),
        },
      },
    });

    await this._col().updateOne(
      { code },
      { $set: { ...next, updatedAt: new Date(), updatedBy: updatedBy || null } },
      { upsert: true }
    );

    return await this.getByCode(code);
  }

  async resetByCode(planCode, { updatedBy = null } = {}) {
    await this.ensureSeedDefaults();
    const code = normalizeCoachPlanCode(planCode);
    if (!code) return null;

    const base = clonePlanConfig(BASE_COACH_PLAN_CONFIGS[code]);
    await this._col().updateOne(
      { code },
      {
        $set: {
          ...base,
          updatedAt: new Date(),
          updatedBy: updatedBy || null,
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return await this.getByCode(code);
  }
}

export default ModelMongoDBCoachPlanConfigs;
