const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCESS_AUDIT_RETENTION_DAYS = 180;
export const IMPORTANT_ACCESS_AUDIT_RETENTION_DAYS = 365;
export const IMPERSONATION_AUDIT_RETENTION_DAYS = 365;
export const SOFT_DELETED_FAVORITE_RETENTION_DAYS = 30;

// Cambios de acceso, suscripción y vínculo profesional se conservan más que
// las notificaciones y la actividad cotidiana.
export const IMPORTANT_ACCESS_AUDIT_EVENTS = Object.freeze([
  "coach_access_activated",
  "coach_access_ended",
  "coach_invitation_accepted",
  "coach_invitation_blocked",
  "coach_invitation_created",
  "coach_invitation_linked_after_registration",
  "coach_invitation_linked_to_existing_client",
  "coach_invitation_rejected",
  "coach_invitation_reported",
  "coach_subscription_approved",
  "coach_subscription_changed",
  "coach_subscription_rejected",
  "coach_subscription_requested",
  "client_invitation_accepted",
  "client_menu_autonomy_updated_by_admin",
  "personal_plan_change_requested",
  "professional_application_created",
  "professional_approved",
  "professional_corrections_requested",
  "professional_rejected",
  "professional_suspended",
  "professional_scopes_changed",
  "trial_activated",
]);

const IMPORTANT_EVENT_SET = new Set(IMPORTANT_ACCESS_AUDIT_EVENTS);

function validDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date : new Date(fallback);
}

export function addRetentionDays(value, days) {
  const date = validDate(value);
  return new Date(date.getTime() + Number(days || 0) * DAY_MS);
}

export function isImportantAccessAuditEvent(event = "") {
  return IMPORTANT_EVENT_SET.has(String(event || "").trim());
}

export function accessAuditRetentionDays(event = "") {
  return isImportantAccessAuditEvent(event)
    ? IMPORTANT_ACCESS_AUDIT_RETENTION_DAYS
    : ACCESS_AUDIT_RETENTION_DAYS;
}

export function accessAuditExpiresAt(event = "", createdAt = new Date()) {
  return addRetentionDays(createdAt, accessAuditRetentionDays(event));
}

export function impersonationAuditExpiresAt(createdAt = new Date()) {
  return addRetentionDays(createdAt, IMPERSONATION_AUDIT_RETENTION_DAYS);
}
