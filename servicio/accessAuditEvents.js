import ModelMongoDBAccessAuditEvents from "../model/DAO/accessAuditEventsMongoDB.js";

const auditModel = new ModelMongoDBAccessAuditEvents();

export async function recordAccessAuditEvent(event = {}) {
  try {
    if (!event?.event) return null;
    return await auditModel.create(event);
  } catch (error) {
    console.warn("access_audit_events skipped:", error?.message || error);
    return null;
  }
}

export async function ensureAccessAuditIndexes() {
  return await auditModel.ensureIndexes();
}

export default {
  recordAccessAuditEvent,
  ensureAccessAuditIndexes,
};
