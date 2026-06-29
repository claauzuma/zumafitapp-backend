import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const uri = process.env.MONGO_URI || process.env.STRCNX;
const dbName = process.env.BASE || process.env.DB_NAME || "zumafit";
const apply = process.argv.includes("--apply");

function normalizePersonalPlan(plan = "free") {
  const value = String(plan || "").trim().toLowerCase();
  if (value === "premium" || value === "pro") return "pro";
  if (value === "premium2" || value === "vip") return "vip";
  return "free";
}

function legacyPlanValue(plan = "") {
  const value = String(plan || "").trim().toLowerCase();
  return value || "missing";
}

function isKnownLegacyPlan(plan = "") {
  return ["free", "premium", "premium2", "pro", "vip"].includes(legacyPlanValue(plan));
}

function activeCoachId(user = {}) {
  const access = user.coachAccess || {};
  if (String(access.status || "") === "active") {
    return access.coachId?.toString?.() || String(access.coachId || "");
  }
  return user?.coach?.entrenadorId?.toString?.() || String(user?.coach?.entrenadorId || "");
}

function buildPersonalSubscription(user, personalPlan) {
  const current = user.personalSubscription || {};
  return {
    plan: current.plan ? normalizePersonalPlan(current.plan) : personalPlan,
    status: current.status || (personalPlan === "free" ? "free" : "active"),
    startedAt: current.startedAt || user.createdAt || null,
    currentPeriodStart: current.currentPeriodStart || null,
    currentPeriodEnd: current.currentPeriodEnd || current.paidUntil || null,
    autoRenew: current.autoRenew === true,
    billingOwner: "client",
    provider: current.provider || null,
    updatedAt: new Date(),
  };
}

function normalizeCoachSubscriptionPlan(plan = "") {
  const value = String(plan || "").trim().toLowerCase();
  if (["vip", "premium2", "coach_ai"].includes(value)) return "coach_ai";
  if (["pro", "premium", "coach_pro"].includes(value)) return "coach_pro";
  return "coach_initial";
}

function defaultCoachClientLimit(plan) {
  if (plan === "coach_ai") return 50;
  if (plan === "coach_pro") return 25;
  return 5;
}

if (!uri) {
  console.error("Falta MONGO_URI o STRCNX en el entorno.");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const roleCounts = await db.collection("usuarios").aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]).toArray();
  const users = await db.collection("usuarios").find({ role: "cliente" }).toArray();
  const coaches = await db.collection("usuarios").find({ role: "coach" }).toArray();

  const report = {
    apply,
    dbName,
    totalClientes: users.length,
    missingPersonalPlan: 0,
    changedPersonalPlan: 0,
    missingSubscription: 0,
    withPersonalPlan: 0,
    invalidLegacyPlans: [],
    clientesConCoach: 0,
    excludedByRole: Object.fromEntries(roleCounts
      .filter((row) => String(row._id || "") !== "cliente")
      .map((row) => [String(row._id || "missing"), Number(row.count || 0)])),
    byLegacyPlan: { free: 0, premium: 0, premium2: 0, pro: 0, vip: 0, missing: 0, other: 0 },
    byPlan: { free: 0, pro: 0, vip: 0 },
    coaches: {
      total: coaches.length,
      bySubscriptionPlan: { coach_initial: 0, coach_pro: 0, coach_ai: 0 },
      missingProfessionalStatus: 0,
      missingProfessionalScopes: 0,
      missingCoachSubscription: 0,
      inconsistencies: [],
    },
    clientUpdates: [],
    auxiliaryUpdates: [],
    updates: [],
  };

  for (const user of users) {
    const legacyPlan = legacyPlanValue(user.plan || user.personalPlan || "");
    let invalidLegacyReported = false;
    if (report.byLegacyPlan[legacyPlan] === undefined) {
      report.byLegacyPlan.other += 1;
      report.invalidLegacyPlans.push({
        userId: user._id?.toString?.() || String(user._id),
        email: user.email || "",
        value: legacyPlan,
      });
      invalidLegacyReported = true;
    } else {
      report.byLegacyPlan[legacyPlan] += 1;
    }
    if (!invalidLegacyReported && !isKnownLegacyPlan(user.plan || user.personalPlan || "")) {
      report.invalidLegacyPlans.push({
        userId: user._id?.toString?.() || String(user._id),
        email: user.email || "",
        value: legacyPlan,
      });
    }
    if (user.personalPlan) report.withPersonalPlan += 1;
    if (activeCoachId(user)) report.clientesConCoach += 1;

    const nextPlan = normalizePersonalPlan(user.personalPlan || user.plan || "free");
    report.byPlan[nextPlan] += 1;

    const patch = {};
    if (!user.personalPlan) {
      patch.personalPlan = nextPlan;
      report.missingPersonalPlan += 1;
    } else if (normalizePersonalPlan(user.personalPlan) !== user.personalPlan) {
      patch.personalPlan = nextPlan;
      report.changedPersonalPlan += 1;
    }

    if (!user.personalSubscription) {
      patch.personalSubscription = buildPersonalSubscription(user, nextPlan);
      report.missingSubscription += 1;
    }

    if (Object.keys(patch).length) {
      report.clientUpdates.push({
        userId: user._id?.toString?.() || String(user._id),
        email: user.email || "",
        role: "cliente",
        legacyPlan: user.plan || "",
        patch,
      });

      if (apply) {
        await db.collection("usuarios").updateOne(
          { _id: user._id },
          { $set: { ...patch, updatedAt: new Date() } }
        );
      }
    }
  }

  for (const coach of coaches) {
    const subscriptionPlan = normalizeCoachSubscriptionPlan(coach.coachSubscription?.plan || coach.plan || "trial_pro");
    report.coaches.bySubscriptionPlan[subscriptionPlan] += 1;
    const patch = {};
    if (!coach.professionalStatus) {
      report.coaches.missingProfessionalStatus += 1;
    }
    if (!coach.professionalScopes) {
      report.coaches.missingProfessionalScopes += 1;
    }
    if (!coach.coachSubscription) {
      report.coaches.missingCoachSubscription += 1;
      patch.coachSubscription = {
        plan: subscriptionPlan,
        status: "active",
        startedAt: coach.createdAt || null,
        currentPeriodEnd: coach.subscription?.paidUntil || null,
        graceEndsAt: null,
        clientLimit: defaultCoachClientLimit(subscriptionPlan),
        updatedAt: new Date(),
      };
    }
    if (!coach.coachProfile?.specialties?.training && !coach.coachProfile?.specialties?.nutrition && !coach.professionalScopes) {
      report.coaches.inconsistencies.push({
        coachId: coach._id?.toString?.() || String(coach._id),
        email: coach.email || "",
        issue: "sin_scopes_ni_specialties",
      });
    }
    if (Object.keys(patch).length) {
      report.auxiliaryUpdates.push({
        userId: coach._id?.toString?.() || String(coach._id),
        email: coach.email || "",
        role: "coach",
        category: "professional_subscription_defaults",
        legacyPlan: coach.plan || "",
        patch,
      });
      if (apply) {
        await db.collection("usuarios").updateOne(
          { _id: coach._id },
          { $set: { ...patch, updatedAt: new Date() } }
        );
      }
    }
  }

  report.updates = report.clientUpdates;
  report.summary = {
    clientesModificables: report.clientUpdates.length,
    coachesExcluidos: Number(report.excludedByRole.coach || 0),
    adminsExcluidos: Number(report.excludedByRole.admin || 0),
    documentosAuxiliaresModificables: report.auxiliaryUpdates.length,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log("Dry-run solamente. Ejecuta con --apply para escribir cambios.");
  }
} finally {
  await client.close();
}
