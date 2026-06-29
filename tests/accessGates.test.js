import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoalsChangeStatus,
  goalsMetadataPatch,
  requireCapability,
  requireGoalsChangeAllowed,
  requireMenuDaysLimit,
  requireQuota,
  requireTrackingHistoryRange,
} from "../servicio/accessGates.js";
import {
  normalizeCoachSubscription,
  requireCoachCanOfferService,
  requireCoachSubscriptionActive,
  requireProfessionalScope,
} from "../servicio/professionalAccessRules.js";

test("bloquea el segundo menu propio de un cliente Free", () => {
  assert.throws(
    () => requireQuota({ role: "cliente", plan: "free" }, "ownMenus", 1),
    (error) => error.code === "PLAN_LIMIT_REACHED" && error.resource === "ownMenus" && error.limit === 1
  );
});

test("usa el plan efectivo del trial Pro para cuotas", () => {
  const user = {
    role: "cliente",
    personalPlan: "free",
    personalTrial: {
      status: "active",
      endsAt: "2026-07-10T00:00:00.000Z",
    },
  };

  assert.doesNotThrow(() => requireQuota(user, "ownMenus", 9));
  assert.throws(
    () => requireQuota(user, "ownMenus", 10),
    (error) => error.code === "PLAN_LIMIT_REACHED" && error.limit === 10
  );
});

test("limita menus Free a un solo dia", () => {
  assert.doesNotThrow(() => requireMenuDaysLimit({ role: "cliente", plan: "free" }, {
    dias: { monday: { comidas: [] } },
  }));

  assert.throws(
    () => requireMenuDaysLimit({ role: "cliente", plan: "free" }, {
      dias: {
        monday: { comidas: [] },
        tuesday: { comidas: [] },
      },
    }),
    (error) => error.code === "PLAN_LIMIT_REACHED" && error.resource === "menuDays" && error.limit === 1
  );
});

test("limita historial de tracking Free a los ultimos 7 dias", () => {
  const user = { role: "cliente", plan: "free" };
  const now = new Date("2026-06-26T12:00:00.000Z");

  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-06-20", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-06-19", now }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED" && error.feature === "nutrition.tracking.fullHistory"
  );
});

test("Free permite dos cambios manuales de objetivos cada 30 dias", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const user = {
    role: "cliente",
    plan: "free",
    goalsMetadata: {
      manualChangesWindow: {
        windowStartedAt: "2026-06-01T00:00:00.000Z",
        changesUsed: 1,
        changesLimit: 2,
        windowDays: 30,
      },
    },
  };

  assert.doesNotThrow(() => requireGoalsChangeAllowed(user, { now }));
  const status = getGoalsChangeStatus(user, { now });
  assert.equal(status.changesUsed, 1);
  assert.equal(status.changesRemaining, 1);

  assert.throws(
    () => requireGoalsChangeAllowed({
      ...user,
      goalsMetadata: {
        manualChangesWindow: {
          windowStartedAt: "2026-06-01T00:00:00.000Z",
          changesUsed: 2,
          changesLimit: 2,
          windowDays: 30,
        },
      },
    }, { now }),
    (error) => error.code === "GOALS_CHANGE_LIMIT_REACHED" && error.changesRemaining === 0
  );
});

test("metadata de objetivos consume cambios solo al guardar exitosamente", () => {
  const first = goalsMetadataPatch("client", new Date("2026-06-01T00:00:00.000Z"), {
    previousMetadata: {},
    changesLimit: 2,
    windowDays: 30,
  });
  assert.equal(first.manualChangesWindow.changesUsed, 1);

  const second = goalsMetadataPatch("client", new Date("2026-06-10T00:00:00.000Z"), {
    previousMetadata: first,
    changesLimit: 2,
    windowDays: 30,
  });
  assert.equal(second.manualChangesWindow.changesUsed, 2);

  const reset = goalsMetadataPatch("client", new Date("2026-07-05T00:00:00.000Z"), {
    previousMetadata: second,
    changesLimit: 2,
    windowDays: 30,
  });
  assert.equal(reset.manualChangesWindow.changesUsed, 1);
});

test("cliente con coach no modifica objetivos profesionales", () => {
  assert.throws(
    () => requireGoalsChangeAllowed({
      role: "cliente",
      plan: "vip",
      coachAccess: {
        status: "active",
        coachId: "coach-1",
        servicePackage: "service_pro",
      },
    }),
    (error) => error.code === "COACH_SERVICE_IS_PRIMARY" && error.domain === "nutrition"
  );
});

test("coach con scope de entrenamiento no bloquea edicion nutricional del cliente", () => {
  assert.doesNotThrow(() => requireGoalsChangeAllowed({
    role: "cliente",
    plan: "pro",
    coachAccess: {
      status: "active",
      coachId: "coach-1",
      servicePackage: "service_pro",
      serviceScopes: ["training"],
    },
  }));
});

test("funciones automaticas se mantienen coming soon", () => {
  assert.throws(
    () => requireCapability({ role: "cliente", plan: "pro" }, "nutrition.autoMenus"),
    (error) => error.code === "FEATURE_COMING_SOON" && error.feature === "nutrition.autoMenus"
  );
});

test("profesional pendiente no puede operar aunque tenga specialties legacy", () => {
  assert.throws(
    () => requireProfessionalScope({
      role: "coach",
      professionalStatus: "pending_verification",
      coachProfile: { specialties: { nutrition: true } },
    }, "nutrition"),
    (error) => error.code === "PROFESSIONAL_NOT_APPROVED"
  );
});

test("scope profesional explicito prevalece sobre specialties legacy", () => {
  assert.throws(
    () => requireProfessionalScope({
      role: "coach",
      professionalStatus: "approved",
      professionalScopes: { training: false, nutrition: true },
      coachProfile: { specialties: { training: true, nutrition: true } },
    }, "training"),
    (error) => error.code === "PROFESSIONAL_SCOPE_REQUIRED" && error.scope === "training"
  );
});

test("Coach IA puede ofrecer Coach VIP y Coach Pro no", () => {
  assert.throws(
    () => requireCoachCanOfferService({
      role: "coach",
      professionalStatus: "approved",
      professionalScopes: { training: true, nutrition: true },
      coachSubscription: { plan: "coach_pro", status: "active" },
    }, "service_vip"),
    (error) => error.code === "COACH_SERVICE_PACKAGE_NOT_ALLOWED"
  );

  assert.doesNotThrow(() => requireCoachCanOfferService({
    role: "coach",
    professionalStatus: "approved",
    professionalScopes: { training: true, nutrition: true },
    coachSubscription: { plan: "coach_ai", status: "active" },
  }, "service_vip"));
});

test("suscripcion past_due en gracia conserva datos pero no habilita nuevas activaciones", () => {
  const user = {
    role: "coach",
    coachSubscription: {
      plan: "coach_pro",
      status: "past_due",
      currentPeriodEnd: "2026-06-25T00:00:00.000Z",
    },
  };
  const normalized = normalizeCoachSubscription(user, { now: new Date("2026-06-26T00:00:00.000Z") });
  assert.equal(normalized.inGrace, true);
  assert.equal(normalized.canInviteOrActivate, false);
  assert.throws(
    () => requireCoachSubscriptionActive(user, { now: new Date("2026-06-26T00:00:00.000Z") }),
    (error) => error.code === "COACH_SUBSCRIPTION_REQUIRED"
  );
});
