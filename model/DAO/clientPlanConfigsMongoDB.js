import CnxMongoDB from "../DBMongo.js";
import {
  BASE_CLIENT_PLAN_SETTINGS,
  CLIENT_PLAN_SETTING_CODES,
  cloneClientPlanSetting,
  normalizeClientPlanSetting,
  normalizeClientPlanSettingCode,
  setRuntimeClientPlanSetting,
  setRuntimeClientPlanSettings,
} from "../../servicio/clientPlanSettings.js";

class ModelMongoDBClientPlanConfigs {
  constructor() {
    this.defaultsReady = false;
    this.defaultsPromise = null;
  }

  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection("client_plan_configs");
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
    const now = new Date();
    for (const code of CLIENT_PLAN_SETTING_CODES) {
      await this._col().updateOne(
        { code },
        {
          $setOnInsert: {
            ...cloneClientPlanSetting(BASE_CLIENT_PLAN_SETTINGS[code]),
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    }
    await this.list();
  }

  async list() {
    if (!this.defaultsReady && !this.defaultsPromise) await this.ensureSeedDefaults();
    const docs = await this._col().find({ code: { $in: CLIENT_PLAN_SETTING_CODES } }).toArray();
    const byCode = new Map(docs.map((doc) => [doc.code, doc]));
    const plans = CLIENT_PLAN_SETTING_CODES.map((code) => normalizeClientPlanSetting(byCode.get(code) || code));
    setRuntimeClientPlanSettings(plans);
    return plans;
  }

  async getByCode(planCode) {
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) return null;
    const doc = await this._col().findOne({ code });
    return setRuntimeClientPlanSetting(normalizeClientPlanSetting(doc || code));
  }

  async updateByCode(planCode, patch = {}, { updatedBy = null } = {}) {
    await this.ensureSeedDefaults();
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) return null;
    const current = await this.getByCode(code);
    const next = normalizeClientPlanSetting({
      ...current,
      ...patch,
      code,
      limits: { ...(current?.limits || {}), ...(patch?.limits || {}) },
    });
    const now = new Date();
    await this._col().updateOne(
      { code },
      {
        $set: { ...next, updatedAt: now, updatedBy: updatedBy || null },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    return await this.getByCode(code);
  }

  async resetByCode(planCode, { updatedBy = null } = {}) {
    await this.ensureSeedDefaults();
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) return null;
    const now = new Date();
    await this._col().updateOne(
      { code },
      {
        $set: {
          ...cloneClientPlanSetting(BASE_CLIENT_PLAN_SETTINGS[code]),
          updatedAt: now,
          updatedBy: updatedBy || null,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    return await this.getByCode(code);
  }
}

export default ModelMongoDBClientPlanConfigs;
