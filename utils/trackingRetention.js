// El detalle permite reconstruir cada comida. Los resúmenes conservan las
// métricas necesarias para gráficos y progreso sin repetir todos los items.
export const TRACKING_DETAIL_RETENTION_DAYS = 14;
export const TRACKING_SUMMARY_RETENTION_DAYS = 183;

const DAY_MS = 24 * 60 * 60 * 1000;
const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function validIsoDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function argentinaCalendarDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isoDateAtArgentinaMidnight(value = "") {
  if (!validIsoDate(value)) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + ARGENTINA_UTC_OFFSET_MS);
}

export function addIsoDays(value = "", amount = 0) {
  const start = isoDateAtArgentinaMidnight(value);
  if (!start) return "";
  return new Date(start.getTime() + Number(amount || 0) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function trackingDetailExpiresAt(value = "") {
  const start = isoDateAtArgentinaMidnight(value);
  return start
    ? new Date(start.getTime() + TRACKING_DETAIL_RETENTION_DAYS * DAY_MS)
    : null;
}

export function trackingSummaryExpiresAt(value = "") {
  const start = isoDateAtArgentinaMidnight(value);
  return start
    ? new Date(start.getTime() + TRACKING_SUMMARY_RETENTION_DAYS * DAY_MS)
    : null;
}

export function trackingRetentionWindow(now = new Date()) {
  const today = argentinaCalendarDate(now);
  return {
    today,
    detailFrom: addIsoDays(today, -(TRACKING_DETAIL_RETENTION_DAYS - 1)),
    summaryFrom: addIsoDays(today, -(TRACKING_SUMMARY_RETENTION_DAYS - 1)),
  };
}
