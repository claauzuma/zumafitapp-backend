import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function idValue(id) {
  const value = String(id || "").trim();
  if (!value) return [];
  return ObjectId.isValid(value) ? [value, new ObjectId(value)] : [value];
}

function populatedKeys(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => value[key] !== undefined && value[key] !== null);
}

function weeklyPlanHasLegacyData() {
  return {
    $or: [
      { "menu.weeklyPlan.caloriesByDay": { $exists: true, $ne: {} } },
      { "menu.weeklyPlan.macrosByDay": { $exists: true, $ne: {} } },
      { "menu.weeklyPlan.mealsByDay": { $exists: true, $ne: {} } },
      { "menu.weeklyPlan.assignedMenusByDay": { $exists: true, $ne: {} } },
    ],
  };
}

function legacyClientFilter({ userId = null } = {}) {
  const filter = {
    $and: [
      { $or: [{ role: "cliente" }, { rol: "cliente" }, { tipo: "cliente" }] },
      {
        $or: [
          { "coach.entrenadorId": { $exists: false } },
          { "coach.entrenadorId": null },
          { "coach.entrenadorId": "" },
        ],
      },
      {
        $or: [
          { "menu.activeSource": { $exists: false } },
          { "menu.activeSource": null },
          { "menu.activeSource": "" },
          { "menu.activeSource": "none" },
          { "menu.activeSource": { $ne: "own" } },
        ],
      },
      {
        $or: [
          { "menu.activeOwnMenuId": { $exists: false } },
          { "menu.activeOwnMenuId": null },
          { "menu.activeOwnMenuId": "" },
        ],
      },
      weeklyPlanHasLegacyData(),
    ],
  };

  const ids = idValue(userId);
  if (ids.length) filter.$and.unshift({ _id: { $in: ids } });
  return filter;
}

const userId = argValue("--userId");
const apply = hasFlag("--apply");
const allowAll = hasFlag("--all");

if (apply && !userId && !allowAll) {
  console.error("Para aplicar cambios usa --userId <id> o --all.");
  process.exit(1);
}

if (!process.env.STRCNX) {
  console.error("Falta STRCNX en .env.");
  process.exit(1);
}

const client = new MongoClient(process.env.STRCNX);
await client.connect();
const db = client.db(process.env.BASE || "test");
const users = db.collection("usuarios");

const filter = legacyClientFilter({ userId });
const projection = {
  email: 1,
  role: 1,
  rol: 1,
  plan: 1,
  coach: 1,
  "menu.activeSource": 1,
  "menu.activeOwnMenuId": 1,
  "menu.weeklyPlan.caloriesByDay": 1,
  "menu.weeklyPlan.macrosByDay": 1,
  "menu.weeklyPlan.mealsByDay": 1,
  "menu.weeklyPlan.assignedMenusByDay": 1,
  "menu.weeklyPlan.sourceCoachId": 1,
  "menu.weeklyPlan.updatedByCoachId": 1,
  "menu.weeklyPlan.coachClearedAt": 1,
  "menu.weeklyPlan.generatedBy": 1,
};

const matches = await users.find(filter, { projection }).limit(allowAll ? 250 : 25).toArray();
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  matched: matches.length,
  users: matches.map((user) => ({
    id: String(user._id),
    emailHint: user.email ? `${String(user.email).slice(0, 2)}***${String(user.email).slice(-8)}` : null,
    role: user.role || user.rol || null,
    plan: user.plan || null,
    coachEntrenadorId: user.coach?.entrenadorId || null,
    menuActiveSource: user.menu?.activeSource || null,
    activeOwnMenuId: user.menu?.activeOwnMenuId || null,
    weeklyPlanKeys: {
      caloriesByDay: populatedKeys(user.menu?.weeklyPlan?.caloriesByDay),
      macrosByDay: populatedKeys(user.menu?.weeklyPlan?.macrosByDay),
      mealsByDay: populatedKeys(user.menu?.weeklyPlan?.mealsByDay),
      assignedMenusByDay: populatedKeys(user.menu?.weeklyPlan?.assignedMenusByDay),
      sourceCoachId: user.menu?.weeklyPlan?.sourceCoachId || null,
      updatedByCoachId: user.menu?.weeklyPlan?.updatedByCoachId || null,
      coachClearedAt: user.menu?.weeklyPlan?.coachClearedAt || null,
      generatedBy: user.menu?.weeklyPlan?.generatedBy || null,
    },
  })),
}, null, 2));

if (apply && matches.length) {
  const now = new Date();
  const result = await users.updateMany(
    { _id: { $in: matches.map((user) => user._id) } },
    {
      $set: {
        "menu.activeSource": "none",
        "menu.activeOwnMenuId": null,
        "menu.weeklyPlan.caloriesByDay": {},
        "menu.weeklyPlan.macrosByDay": {},
        "menu.weeklyPlan.mealsByDay": {},
        "menu.weeklyPlan.assignedMenusByDay": {},
        "menu.weeklyPlan.sourceCoachId": null,
        "menu.weeklyPlan.updatedByCoachId": null,
        "menu.weeklyPlan.generatedBy": null,
        "menu.weeklyPlan.generatorMode": null,
        "menu.weeklyPlan.coachClearedAt": now,
        "menu.weeklyPlan.legacyCoachPlanClearedAt": now,
        "menu.weeklyPlan.legacyCoachPlanClearedBy": "repairLegacyCoachWeeklyPlan",
        "menu.updatedAt": now,
        updatedAt: now,
      },
    }
  );

  console.log(JSON.stringify({
    applied: true,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  }, null, 2));
}

await client.close();
