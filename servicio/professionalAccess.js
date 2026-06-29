import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBProfessionalApplications from "../model/DAO/professionalApplicationsMongoDB.js";
import ModelMongoDBCoachSubscriptionRequests from "../model/DAO/coachSubscriptionRequestsMongoDB.js";
import ModelMongoDBAccessAuditEvents from "../model/DAO/accessAuditEventsMongoDB.js";
import { recordAccessAuditEvent } from "./accessAuditEvents.js";
import {
  PROFESSIONAL_SUBSCRIPTION_PLANS,
  normalizeCoachSubscription,
  normalizeProfessionalStatus,
  normalizeProfessionalSubscriptionPlan,
  professionalScopesFor,
  professionalSubscriptionPatch,
} from "./professionalAccessRules.js";

function clean(value = "", max = 500) {
  return String(value || "").trim().slice(0, max);
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeEmail(email = "") {
  return clean(email, 180).toLowerCase();
}

function idString(value) {
  return value?.toString?.() || String(value || "");
}

function toObjectIdOrString(value) {
  const raw = idString(value);
  return raw && ObjectId.isValid(raw) ? new ObjectId(raw) : raw;
}

function normalizeScopes(raw = {}) {
  return {
    training: bool(raw.training),
    nutrition: bool(raw.nutrition),
  };
}

function normalizeProfessionalType(value = "") {
  const raw = clean(value, 80).toLowerCase();
  if (["personal_trainer", "trainer", "entrenador"].includes(raw)) return "personal_trainer";
  if (["nutritionist", "nutricionista", "nutri"].includes(raw)) return "nutritionist";
  if (["integral", "trainer_nutri", "entrenador_nutri"].includes(raw)) return "integral";
  return "other_verified";
}

function normalizeApplicationPayload(payload = {}) {
  const account = payload.account || payload;
  const personal = payload.personal || {};
  const professional = payload.professional || {};
  const credentials = payload.credentials || {};
  const requestedScopes = normalizeScopes(payload.requestedScopes || professional.requestedScopes || {});

  if (!requestedScopes.training && !requestedScopes.nutrition) {
    requestedScopes.training = true;
  }

  const email = normalizeEmail(account.email || payload.email);
  const password = String(account.password || payload.password || "");
  const confirmPassword = String(account.confirmPassword || payload.confirmPassword || password);
  if (!email) throw new Error("EMAIL_REQUERIDO");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("EMAIL_INVALIDO");
  if (password.length < 6) throw new Error("PASSWORD_CORTA");
  if (password !== confirmPassword) throw new Error("PASSWORD_CONFIRMATION_MISMATCH");
  if (!bool(payload.termsAccepted) || !bool(payload.truthDeclarationAccepted) || !bool(payload.reviewConsentAccepted)) {
    throw new Error("TERMS_REQUIRED");
  }

  return {
    email,
    password,
    telefono: clean(account.telefono || account.phone || payload.telefono, 80),
    personal: {
      nombre: clean(personal.nombre || payload.nombre, 120),
      apellido: clean(personal.apellido || payload.apellido, 120),
      documento: clean(personal.documento || payload.documento, 80),
      pais: clean(personal.pais || payload.pais, 80),
      provincia: clean(personal.provincia || payload.provincia, 80),
      ciudad: clean(personal.ciudad || payload.ciudad, 80),
    },
    professional: {
      tipo: normalizeProfessionalType(professional.tipo || payload.tipoProfesional),
      experiencia: clean(professional.experiencia || payload.experiencia, 1200),
      biografia: clean(professional.biografia || payload.biografia, 2000),
      especialidades: Array.isArray(professional.especialidades) ? professional.especialidades.map((item) => clean(item, 80)).filter(Boolean).slice(0, 20) : [],
      modalidad: clean(professional.modalidad || payload.modalidad, 120),
      disponibilidad: clean(professional.disponibilidad || payload.disponibilidad, 1200),
    },
    requestedScopes,
    credentials: {
      certificacion: clean(credentials.certificacion || payload.certificacion, 180),
      institucion: clean(credentials.institucion || payload.institucion, 180),
      numero: clean(credentials.numero || payload.matricula || payload.numero, 120),
      matricula: clean(credentials.matricula || payload.matricula, 120),
      documentoRespaldoUrl: clean(credentials.documentoRespaldoUrl || payload.documentoRespaldoUrl, 600),
      vencimiento: clean(credentials.vencimiento || payload.vencimiento, 40),
    },
    termsAccepted: true,
    truthDeclarationAccepted: true,
    reviewConsentAccepted: true,
  };
}

function publicApplication(doc = {}) {
  return {
    id: idString(doc._id || doc.id),
    userId: idString(doc.userId),
    email: doc.email,
    status: doc.status,
    personal: doc.personal || {},
    professional: doc.professional || {},
    requestedScopes: doc.requestedScopes || {},
    approvedScopes: doc.approvedScopes || null,
    credentials: doc.credentials || {},
    resolution: doc.resolution || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function publicSubscriptionRequest(doc = {}) {
  return {
    id: idString(doc._id || doc.id),
    coachId: idString(doc.coachId),
    requestedPlan: doc.requestedPlan,
    status: doc.status,
    notes: doc.notes || "",
    resolution: doc.resolution || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

class ServicioProfessionalAccess {
  constructor() {
    this.usuarios = new ModelMongoDBUsuarios();
    this.applications = new ModelMongoDBProfessionalApplications();
    this.subscriptionRequests = new ModelMongoDBCoachSubscriptionRequests();
    this.auditEvents = new ModelMongoDBAccessAuditEvents();
  }

  async registerProfessionalApplication(payload = {}) {
    const normalized = normalizeApplicationPayload(payload);
    const existing = await this.usuarios.obtenerPorEmail(normalized.email);
    if (existing) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(normalized.password, 10);
    const now = new Date();
    const user = await this.usuarios.registrarUsuario({
      role: "coach",
      tipo: "entrenador",
      plan: "trial_pro",
      email: normalized.email,
      passwordHash,
      emailVerificado: true,
      estado: "activo",
      profile: {
        nombre: normalized.personal.nombre,
        apellido: normalized.personal.apellido,
        telefono: normalized.telefono,
      },
      professionalStatus: "pending_verification",
      professionalScopes: { training: false, nutrition: false },
      coachProfile: {
        status: "pending_verification",
        type: normalized.professional.tipo,
        specialties: { ...normalized.requestedScopes },
        bio: normalized.professional.biografia,
        experience: normalized.professional.experiencia,
        modalities: normalized.professional.modalidad,
        availability: normalized.professional.disponibilidad,
      },
      coachSubscription: {
        plan: "coach_initial",
        status: "pending",
        startedAt: null,
        currentPeriodEnd: null,
        graceEndsAt: null,
        clientLimit: PROFESSIONAL_SUBSCRIPTION_PLANS.coach_initial.clientLimit,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    const application = await this.applications.create({
      userId: toObjectIdOrString(user._id),
      email: normalized.email,
      status: "pending_verification",
      telefono: normalized.telefono,
      personal: normalized.personal,
      professional: normalized.professional,
      requestedScopes: normalized.requestedScopes,
      credentials: normalized.credentials,
      terms: {
        accepted: normalized.termsAccepted,
        truthDeclarationAccepted: normalized.truthDeclarationAccepted,
        reviewConsentAccepted: normalized.reviewConsentAccepted,
        acceptedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    await recordAccessAuditEvent({
      subjectType: "coach",
      subjectId: user._id,
      actorType: "public",
      event: "professional_application_created",
      nextValue: { applicationId: application._id, requestedScopes: normalized.requestedScopes },
      reason: "public_professional_registration",
    });

    return { application: publicApplication(application), userId: idString(user._id) };
  }

  async listApplications(query = {}) {
    const data = await this.applications.list(query);
    return {
      applications: (data.items || []).map(publicApplication),
      total: data.total,
      limit: data.limit,
      skip: data.skip,
    };
  }

  async updateApplicationStatus(id, payload = {}, adminUser = {}) {
    const application = await this.applications.getById(id);
    if (!application) throw new Error("APPLICATION_NOT_FOUND");
    const user = await this.usuarios.obtenerPorId(application.userId);
    if (!user) throw new Error("COACH_NOT_FOUND");

    const status = normalizeProfessionalStatus(payload.status || "approved");
    const approvedScopes = status === "approved"
      ? normalizeScopes(payload.approvedScopes || application.requestedScopes || {})
      : { training: false, nutrition: false };
    const now = new Date();
    const resolution = {
      status,
      reason: clean(payload.reason || payload.motivo, 1000),
      resolvedBy: idString(adminUser?._id || adminUser?.id) || null,
      resolvedAt: now,
    };

    const updatedApplication = await this.applications.updateById(id, {
      status,
      approvedScopes,
      resolution,
    });

    const userPatch = {
      professionalStatus: status,
      professionalScopes: approvedScopes,
      coachProfile: {
        ...(user.coachProfile || {}),
        status,
        specialties: approvedScopes,
        approvedAt: status === "approved" ? now : user.coachProfile?.approvedAt || null,
        suspendedAt: status === "suspended" ? now : null,
        lastReviewReason: resolution.reason || null,
      },
      updatedAt: now,
    };

    await this.usuarios.updateById(user._id, userPatch);

    const auditEvent =
      status === "approved"
        ? "professional_approved"
        : status === "corrections_required"
          ? "professional_corrections_requested"
          : status === "suspended"
            ? "professional_suspended"
            : "professional_rejected";

    await recordAccessAuditEvent({
      subjectType: "coach",
      subjectId: user._id,
      actorType: "admin",
      actorId: adminUser?._id || adminUser?.id || null,
      event: auditEvent,
      previousValue: { status: user.professionalStatus, scopes: professionalScopesFor(user) },
      nextValue: { status, scopes: approvedScopes },
      reason: resolution.reason || "admin_professional_review",
      metadata: { applicationId: idString(application._id) },
    });

    if (status === "approved") {
      await recordAccessAuditEvent({
        subjectType: "coach",
        subjectId: user._id,
        actorType: "admin",
        actorId: adminUser?._id || adminUser?.id || null,
        event: "professional_scopes_changed",
        previousValue: professionalScopesFor(user),
        nextValue: approvedScopes,
        reason: "professional_approved",
      });
    }

    return { application: publicApplication(updatedApplication) };
  }

  async getCoachSubscription(user = {}) {
    const coach = await this.usuarios.obtenerPorId(user?._id || user?.id);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    const latestRequest = await this.subscriptionRequests.getLatestByCoachId(coach._id).catch(() => null);
    return {
      subscription: normalizeCoachSubscription(coach),
      latestRequest: latestRequest ? publicSubscriptionRequest(latestRequest) : null,
      scopes: professionalScopesFor(coach),
      professionalStatus: normalizeProfessionalStatus(coach.professionalStatus || coach.coachProfile?.status || "approved"),
      catalogs: { professionalSubscriptions: PROFESSIONAL_SUBSCRIPTION_PLANS },
    };
  }

  async createCoachSubscriptionRequest(user = {}, payload = {}) {
    const coach = await this.usuarios.obtenerPorId(user?._id || user?.id);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    const open = await this.subscriptionRequests.getOpenByCoachId(coach._id);
    if (open) throw new Error("SUBSCRIPTION_REQUEST_OPEN");
    const requestedPlan = normalizeProfessionalSubscriptionPlan(payload.requestedPlan || payload.plan);
    if (!requestedPlan) throw new Error("PLAN_INVALIDO");

    const request = await this.subscriptionRequests.create({
      coachId: toObjectIdOrString(coach._id),
      email: coach.email,
      requestedPlan,
      status: "pending",
      notes: clean(payload.notes || payload.observaciones, 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await recordAccessAuditEvent({
      subjectType: "coach",
      subjectId: coach._id,
      actorType: "coach",
      actorId: coach._id,
      event: "coach_subscription_requested",
      nextValue: { requestedPlan },
      reason: "coach_requested_subscription",
      metadata: { requestId: idString(request._id) },
    });

    return { request: publicSubscriptionRequest(request) };
  }

  async listSubscriptionRequests(query = {}) {
    const data = await this.subscriptionRequests.list(query);
    return {
      requests: (data.items || []).map(publicSubscriptionRequest),
      total: data.total,
      limit: data.limit,
      skip: data.skip,
    };
  }

  async resolveSubscriptionRequest(id, payload = {}, adminUser = {}, action = "approve") {
    const request = await this.subscriptionRequests.getById(id);
    if (!request) throw new Error("SUBSCRIPTION_REQUEST_NOT_FOUND");
    const coach = await this.usuarios.obtenerPorId(request.coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");

    const now = new Date();
    const status = action === "approve" ? "approved" : "rejected";
    const resolution = {
      status,
      reason: clean(payload.reason || payload.motivo, 1000),
      resolvedBy: idString(adminUser?._id || adminUser?.id) || null,
      resolvedAt: now,
    };

    const updatedRequest = await this.subscriptionRequests.updateById(id, {
      status,
      resolution,
    });

    if (action === "approve") {
      const plan = normalizeProfessionalSubscriptionPlan(payload.plan || request.requestedPlan);
      const patch = professionalSubscriptionPatch(plan, {
        status: payload.status || "active",
        now,
        currentPeriodEnd: payload.currentPeriodEnd || null,
        clientLimit: payload.clientLimit,
      });
      await this.usuarios.updateById(coach._id, {
        plan: PROFESSIONAL_SUBSCRIPTION_PLANS[patch.plan]?.legacyPlan || coach.plan,
        coachSubscription: patch,
        subscription: {
          ...(coach.subscription || {}),
          status: patch.status,
          paidUntil: patch.currentPeriodEnd,
          updatedAt: now,
        },
        updatedAt: now,
      });

      await recordAccessAuditEvent({
        subjectType: "coach",
        subjectId: coach._id,
        actorType: "admin",
        actorId: adminUser?._id || adminUser?.id || null,
        event: "coach_subscription_approved",
        previousValue: normalizeCoachSubscription(coach),
        nextValue: patch,
        reason: resolution.reason || "admin_approved_subscription",
        metadata: { requestId: idString(request._id) },
      });
    } else {
      await recordAccessAuditEvent({
        subjectType: "coach",
        subjectId: coach._id,
        actorType: "admin",
        actorId: adminUser?._id || adminUser?.id || null,
        event: "coach_subscription_rejected",
        previousValue: { requestedPlan: request.requestedPlan },
        reason: resolution.reason || "admin_rejected_subscription",
        metadata: { requestId: idString(request._id) },
      });
    }

    return { request: publicSubscriptionRequest(updatedRequest) };
  }

  async adminPatchCoachSubscription(coachId, payload = {}, adminUser = {}) {
    const coach = await this.usuarios.obtenerPorId(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    const plan = normalizeProfessionalSubscriptionPlan(payload.plan || coach.coachSubscription?.plan || coach.plan);
    if (!plan) throw new Error("PLAN_INVALIDO");
    const now = new Date();
    const patch = professionalSubscriptionPatch(plan, {
      status: payload.status || coach.coachSubscription?.status || "active",
      now,
      currentPeriodEnd: payload.currentPeriodEnd || coach.coachSubscription?.currentPeriodEnd || null,
      clientLimit: payload.clientLimit,
    });
    const updated = await this.usuarios.updateById(coach._id, {
      plan: PROFESSIONAL_SUBSCRIPTION_PLANS[patch.plan]?.legacyPlan || coach.plan,
      coachSubscription: patch,
      subscription: {
        ...(coach.subscription || {}),
        status: patch.status,
        paidUntil: patch.currentPeriodEnd,
        updatedAt: now,
      },
      updatedAt: now,
    });

    await recordAccessAuditEvent({
      subjectType: "coach",
      subjectId: coach._id,
      actorType: "admin",
      actorId: adminUser?._id || adminUser?.id || null,
      event: "coach_subscription_changed",
      previousValue: normalizeCoachSubscription(coach),
      nextValue: patch,
      reason: clean(payload.reason || payload.motivo, 1000) || "admin_patch_subscription",
    });

    return { coach: updated, subscription: normalizeCoachSubscription(updated) };
  }

  async adminListAuditEvents(query = {}) {
    const data = await this.auditEvents.list(query);
    return {
      events: data.items || [],
      total: data.total,
      limit: data.limit,
      skip: data.skip,
    };
  }
}

export default ServicioProfessionalAccess;
