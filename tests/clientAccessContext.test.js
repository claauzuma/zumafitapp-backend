import assert from "node:assert/strict";
import test from "node:test";

import ServicioClientAccessContext, {
  canCoachOfferServicePackage,
  resolveClientAccessContext,
} from "../servicio/clientAccessContext.js";

const now = new Date("2026-06-26T12:00:00.000Z");

test("cliente free autogestionado queda en Free Lite con limites bajos", () => {
  const context = resolveClientAccessContext({
    _id: "507f1f77bcf86cd799439011",
    role: "cliente",
    plan: "free",
  }, { now });

  assert.equal(context.personalPlan, "free");
  assert.equal(context.effectivePersonalPlan, "free");
  assert.equal(context.mode, "self_managed");
  assert.equal(context.billing.owner, "none");
  assert.equal(context.effectiveAccess.id, "free");
  assert.equal(context.primaryAccess.type, "personal");
  assert.equal(context.capabilities.limits.ownMenus, 1);
  assert.equal(context.capabilities.limits.ownMeals, 5);
  assert.equal(context.capabilities.canUseGlobalLibrary, false);
  assert.equal(context.featureAvailability.nutrition.autoMenus.status, "blocked");
});

test("premium y premium2 se normalizan como pro/vip", () => {
  assert.equal(resolveClientAccessContext({ role: "cliente", plan: "premium" }, { now }).personalPlan, "pro");
  assert.equal(resolveClientAccessContext({ role: "cliente", plan: "premium2" }, { now }).personalPlan, "vip");
});

test("trial Pro activo modifica solo el plan efectivo", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    plan: "free",
    personalTrial: {
      status: "active",
      used: true,
      startedAt: "2026-06-25T00:00:00.000Z",
      endsAt: "2026-07-09T00:00:00.000Z",
    },
  }, { now });

  assert.equal(context.personalPlan, "free");
  assert.equal(context.effectivePersonalPlan, "pro");
  assert.equal(context.accessSource, "trial");
  assert.equal(context.effectiveAccess.source, "trial");
  assert.equal(context.trial.active, true);
  assert.equal(context.trial.daysRemaining, 13);
  assert.equal(context.personalAccess.source, "trial");
  assert.equal(context.capabilities.limits.ownMenus, 10);
});

test("trial Pro disponible no vence Free ni cambia el plan efectivo", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
  }, { now });

  assert.equal(context.personalPlan, "free");
  assert.equal(context.effectivePersonalPlan, "free");
  assert.equal(context.trial.status, "available");
  assert.equal(context.trial.active, false);
  assert.equal(context.billing.owner, "none");
  assert.equal(context.effectiveAccess.id, "free");
});

test("trial Pro disponible muestra oferta post-onboarding una sola vez", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    onboarding: {
      enabled: true,
      done: true,
      completedAt: "2026-06-26T10:00:00.000Z",
    },
  }, { now });

  assert.equal(context.trial.status, "available");
  assert.equal(context.trialOffer.eligible, true);
  assert.equal(context.trialOffer.showOnboardingOffer, true);
});

test("usuario legacy sin campo onboarding puede ver oferta y access-context no la reconoce", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
  }, { now });

  assert.equal(context.onboarding.done, true);
  assert.equal(context.onboarding.proTrialOfferSeenAt, null);
  assert.equal(context.trialOffer.eligible, true);
  assert.equal(context.trialOffer.showOnboardingOffer, true);
});

test("trial Pro disponible no muestra oferta si ya fue vista o hay invitacion de coach", () => {
  const seen = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    onboarding: {
      done: true,
      proTrialOfferSeenAt: "2026-06-26T10:00:00.000Z",
    },
  }, { now });
  const invited = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    onboarding: {
      done: true,
    },
    coachAccess: {
      status: "accepted_pending_activation",
      coachId: "coach-1",
    },
  }, { now });

  assert.equal(seen.trialOffer.eligible, true);
  assert.equal(seen.trialOffer.showOnboardingOffer, false);
  assert.equal(invited.trialOffer.eligible, false);
  assert.equal(invited.trialOffer.reason, "coach_invitation");
});

test("trial Pro vencido vuelve a Free sin borrar el estado de uso", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    personalTrial: {
      status: "active",
      used: true,
      startedAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-06-15T00:00:00.000Z",
    },
  }, { now });

  assert.equal(context.personalPlan, "free");
  assert.equal(context.effectivePersonalPlan, "free");
  assert.equal(context.trial.status, "expired");
  assert.equal(context.trial.used, true);
  assert.equal(context.trial.expiryNoticeRequired, true);
  assert.equal(context.capabilities.limits.ownMenus, 1);
});

test("aviso de trial vencido deja de requerirse si fue reconocido", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "free",
    personalTrial: {
      status: "active",
      used: true,
      startedAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-06-15T00:00:00.000Z",
      expiryNoticeAcknowledgedAt: "2026-06-26T10:00:00.000Z",
    },
  }, { now });

  assert.equal(context.trial.status, "expired");
  assert.equal(context.trial.expiryNoticeRequired, false);
});

test("cliente Pro con Coach Pro usa servicio profesional y suprime renovacion personal", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "pro",
    personalSubscription: {
      plan: "pro",
      status: "active",
      autoRenew: true,
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    },
    coachAccess: {
      status: "active",
      coachId: "coach-1",
      servicePackage: "service_pro",
      startedAt: "2026-06-20T00:00:00.000Z",
    },
  }, { now });

  assert.equal(context.personalPlan, "pro");
  assert.equal(context.effectivePersonalPlan, "pro");
  assert.equal(context.effectiveAccess.id, "service_pro");
  assert.equal(context.billing.owner, "coach");
  assert.equal(context.primaryAccess.billingOwner, "coach");
  assert.equal(context.personalSubscription.status, "suppressed_by_coach");
  assert.equal(context.personalSubscription.autoRenew, false);
  assert.equal(context.personalSubscription.suppressedByCoach, true);
  assert.equal(context.personalAccess.subscriptionStatus, "suppressed_by_coach");
  assert.equal(context.authority.nutrition, "coach");
  assert.equal(context.authority.training, "coach");
  assert.equal(context.authority.goals, "coach");
});

test("cliente VIP con Coach VIP usa acceso profesional como acceso principal", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    plan: "premium2",
    coach: {
      entrenadorId: "coach-1",
      servicePackage: "service_vip",
      assignedAt: "2026-06-20T00:00:00.000Z",
    },
  }, { now });

  assert.equal(context.hasCoach, true);
  assert.equal(context.mode, "coach");
  assert.equal(context.billing.owner, "coach");
  assert.equal(context.effectiveAccess.id, "service_vip");
  assert.equal(context.clientType, "with_coach");
  assert.equal(context.primaryAccess.type, "coach_service");
  assert.equal(context.primaryAccess.id, "service_vip");
  assert.equal(context.primaryAccess.billingOwner, "coach");
  assert.equal(context.capabilities.primaryAuthority, "coach");
  assert.equal(context.authority.nutrition, "coach");
  assert.equal(context.featureAvailability.nutrition.autoCoach.status, "coming_soon");
  assert.equal(context.personalSubscription.status, "suppressed_by_coach");
  assert.equal(context.personalSubscription.autoRenew, false);
  assert.equal(context.statusWarnings.length, 1);
});

test("cancel_at_period_end personal se conserva al entrar con coach", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "vip",
    personalSubscription: {
      plan: "vip",
      status: "cancel_at_period_end",
      autoRenew: false,
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    },
    coachAccess: {
      status: "active",
      coachId: "coach-1",
      servicePackage: "service_pro",
    },
  }, { now });

  assert.equal(context.effectiveAccess.id, "service_pro");
  assert.equal(context.personalSubscription.status, "cancel_at_period_end");
  assert.equal(context.personalSubscription.autoRenew, false);
  assert.equal(context.personalSubscription.suppressedByCoach, true);
});

test("coachAccess aceptado pendiente no se trata como servicio activo", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    plan: "free",
    coachAccess: {
      status: "accepted_pending_activation",
      coachId: "coach-1",
      servicePackage: "service_pro",
    },
  }, { now });

  assert.equal(context.hasCoach, false);
  assert.equal(context.mode, "self_managed");
  assert.equal(context.coachAccess.status, "accepted_pending_activation");
  assert.equal(context.coachAccess.active, false);
  assert.equal(context.effectiveAccess.id, "free");
});

test("coachAccess suspendido o vencido no se trata como servicio activo", () => {
  for (const status of ["suspended", "expired"]) {
    const context = resolveClientAccessContext({
      role: "cliente",
      personalPlan: "vip",
      coachAccess: {
        status,
        coachId: "coach-1",
        servicePackage: "service_vip",
      },
    }, { now });

    assert.equal(context.hasCoach, false);
    assert.equal(context.mode, "self_managed");
    assert.equal(context.coachAccess.status, status);
    assert.equal(context.effectiveAccess.id, "vip");
    assert.equal(context.billing.owner, "client");
  }
});

test("funciones no implementadas quedan coming_soon sin habilitarse", () => {
  const context = resolveClientAccessContext({
    role: "cliente",
    personalPlan: "vip",
  }, { now });

  assert.equal(context.featureAvailability.nutrition.autoMenus.available, false);
  assert.equal(context.featureAvailability.nutrition.autoMenus.enabled, false);
  assert.equal(context.featureAvailability.nutrition.autoMenus.status, "coming_soon");
  assert.equal(context.featureAvailability.training.routines.generate.status, "coming_soon");
  assert.equal(context.featureAvailability.progress.analytics.status, "coming_soon");
});

test("solo Coach IA puede ofrecer service_vip", () => {
  assert.equal(canCoachOfferServicePackage({ plan: "trial_pro" }, "service_vip"), false);
  assert.equal(canCoachOfferServicePackage({ plan: "pro" }, "service_vip"), false);
  assert.equal(canCoachOfferServicePackage({ plan: "vip" }, "service_vip"), true);
  assert.equal(canCoachOfferServicePackage({ coachSubscription: { plan: "coach_ai" } }, "service_vip"), true);
});

test("solicitud Pro pendiente no se duplica", async () => {
  const servicio = new ServicioClientAccessContext();
  const actor = {
    _id: "507f1f77bcf86cd799439011",
    email: "cliente@zumafit.test",
    role: "cliente",
    personalPlan: "free",
  };
  let createCalled = false;
  servicio.usuariosModel = {
    obtenerAccessContextPorId: async () => actor,
  };
  servicio.planChangeRequestsModel = {
    findPendingByUserAndPlan: async () => ({
      _id: "507f1f77bcf86cd799439012",
      requestedPlan: "pro",
      status: "pending",
      createdAt: now,
    }),
    findPendingByUser: async () => ({
      _id: "507f1f77bcf86cd799439012",
      requestedPlan: "pro",
      status: "pending",
      createdAt: now,
    }),
    create: async () => {
      createCalled = true;
      return null;
    },
  };

  const result = await servicio.createPlanChangeRequest({ id: actor._id }, { requestedPlan: "pro" });

  assert.equal(result.pendingAlreadyExists, true);
  assert.equal(result.accessContext.planChangeRequests.pending.requestedPlan, "pro");
  assert.equal(createCalled, false);
});

test("cliente Pro no puede activar prueba Pro por endpoint", async () => {
  const servicio = new ServicioClientAccessContext();
  const actor = {
    _id: "507f1f77bcf86cd799439011",
    email: "cliente@zumafit.test",
    role: "cliente",
    personalPlan: "pro",
  };
  servicio.usuariosModel = {
    obtenerAccessContextPorId: async () => actor,
    updateById: async () => {
      throw new Error("No deberia actualizar");
    },
  };

  await assert.rejects(
    () => servicio.startProTrial({ id: actor._id }),
    (error) => error?.code === "TRIAL_NOT_AVAILABLE_FOR_PLAN"
  );
});
