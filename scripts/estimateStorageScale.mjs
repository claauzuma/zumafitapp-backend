import { BSON, MongoClient } from "mongodb";

import config from "../config.js";
import { packFavoriteStorageFields } from "../model/DAO/clientDayFavoritesMongoDB.js";
import {
  TRACKING_DETAIL_RETENTION_DAYS,
  TRACKING_SUMMARY_RETENTION_DAYS,
} from "../utils/trackingRetention.js";

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

function percentile(values = [], ratio = 0.5) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const nearestRank = Math.max(1, Math.ceil(sorted.length * ratio));
  return sorted[Math.min(sorted.length - 1, nearestRank - 1)];
}

async function collectionSizes(db, name) {
  const present = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!present) return { count: 0, average: 0, p90: 0, max: 0 };
  const docs = await db.collection(name).find({}).toArray();
  const sizes = docs.map((doc) => BSON.calculateObjectSize(doc));
  return {
    count: sizes.length,
    average: sizes.length ? Math.round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length) : 0,
    p90: percentile(sizes, 0.9),
    max: sizes.length ? Math.max(...sizes) : 0,
  };
}

function favoriteFixture() {
  return packFavoriteStorageFields({
    dailyTarget: { kcal: 2500, proteina: 160, carbs: 285, grasas: 80 },
    plannedTotals: { kcal: 2500, proteina: 160, carbs: 285, grasas: 80 },
    physicalMeals: Array.from({ length: 5 }, (_, mealIndex) => ({
      id: `meal-${mealIndex + 1}`,
      nombre: `Comida ${mealIndex + 1}`,
      tipoComida: ["desayuno", "almuerzo", "merienda", "cena", "snack"][mealIndex],
      totals: { kcal: 500, proteina: 32, carbs: 57, grasas: 16 },
      items: Array.from({ length: 3 }, (_, itemIndex) => ({
        id: `food-${mealIndex}-${itemIndex}`,
        alimentoId: `66d0000000000000000000${mealIndex}${itemIndex}`,
        nombreSnapshot: `Alimento ${itemIndex + 1}`,
        cantidad: 150,
        unidad: "g",
        kcal: 166.7,
        proteina: 10.7,
        carbs: 19,
        grasas: 5.3,
        imagenUrl: `https://cdn.example.test/food/${itemIndex}.webp`,
      })),
    })),
    targetMeals: [],
  });
}

function scenarioBytes(scenario, unit, detailDays = TRACKING_DETAIL_RETENTION_DAYS) {
  const raw = {
    profileAndProgress: unit.user + scenario.checkins * unit.checkin,
    customFoods: scenario.customFoods * unit.customFood,
    savedMeals: scenario.savedMeals * unit.savedMeal,
    dayFavorites: scenario.dayFavorites * unit.dayFavorite,
    ownMenus: scenario.ownMenus * unit.menu,
    menuTracking: detailDays * unit.menuTracking,
    foodDays: detailDays * unit.foodDay,
    foodLogs: detailDays * scenario.logsPerDay * unit.foodLog,
    allocations: detailDays * scenario.allocationsPerDay * unit.allocation,
    summaries: scenario.summaryDays * unit.summary,
    audits: scenario.auditEvents * unit.audit,
    relationsAndAssignments: scenario.relationReserve,
  };
  return { raw, totalRaw: Object.values(raw).reduce((sum, value) => sum + value, 0) };
}

function rangeWithIndexes(raw, lower = 1.25, upper = 1.5) {
  return { lower: raw * lower, upper: raw * upper };
}

function formatRange(range, divisor = MiB) {
  return {
    lower: Math.round((range.lower / divisor) * 100) / 100,
    upper: Math.round((range.upper / divisor) * 100) / 100,
  };
}

async function main() {
  const client = new MongoClient(config.STRCNX, { maxPoolSize: 2, minPoolSize: 0 });
  await client.connect();
  try {
    const db = client.db(config.BASE);
    const names = [
      "usuarios",
      "client_custom_foods",
      "menus_base",
      "comidasGuardadas",
      "client_menu_tracking",
      "food_log_days",
      "food_logs",
      "nutrition_daily_summaries",
      "access_audit_events",
      "menus_asignados",
      "rutinas_asignadas",
      "invited_users",
      "plan_change_requests",
    ];
    const stats = {};
    for (const name of names) stats[name] = await collectionSizes(db, name);

    const fallback = (value, defaultValue) => Number(value) > 0 ? Number(value) : defaultValue;
    const unit = {
      user: fallback(stats.usuarios.average, 4000),
      checkin: 235,
      customFood: fallback(stats.client_custom_foods.average, 725),
      savedMeal: fallback(stats.comidasGuardadas.average, 1550),
      dayFavorite: BSON.calculateObjectSize(favoriteFixture()),
      menu: fallback(stats.menus_base.average, 7600),
      menuTracking: fallback(stats.client_menu_tracking.average, 2300),
      foodDay: fallback(stats.food_log_days.average, 600),
      foodLog: fallback(stats.food_logs.average, 800),
      allocation: 715,
      summary: fallback(stats.nutrition_daily_summaries.average, 600),
      audit: fallback(stats.access_audit_events.average, 1150),
    };

    const scenarios = {
      average_active: {
        label: "Promedio activo",
        checkins: 26,
        customFoods: 5,
        savedMeals: 10,
        dayFavorites: 5,
        ownMenus: 3,
        logsPerDay: 6,
        allocationsPerDay: 1,
        summaryDays: 90,
        auditEvents: 30,
        relationReserve: 8_000,
      },
      requested_30: {
        label: "30 alimentos + 30 comidas + 30 favoritos + 30 menús",
        checkins: 183,
        customFoods: 30,
        savedMeals: 30,
        dayFavorites: 30,
        ownMenus: 30,
        logsPerDay: 12,
        allocationsPerDay: 4,
        summaryDays: TRACKING_SUMMARY_RETENTION_DAYS,
        auditEvents: 90,
        relationReserve: 20_000,
      },
      pro_full: {
        label: "Tope Pro actual",
        checkins: 183,
        customFoods: 30,
        savedMeals: 100,
        dayFavorites: 20,
        ownMenus: 10,
        logsPerDay: 20,
        allocationsPerDay: 6,
        summaryDays: TRACKING_SUMMARY_RETENTION_DAYS,
        auditEvents: 180,
        relationReserve: 30_000,
      },
      vip_full: {
        label: "Tope VIP actual",
        checkins: 183,
        customFoods: 30,
        savedMeals: 500,
        dayFavorites: 100,
        ownMenus: 50,
        logsPerDay: 20,
        allocationsPerDay: 6,
        summaryDays: TRACKING_SUMMARY_RETENTION_DAYS,
        auditEvents: 180,
        relationReserve: 50_000,
      },
    };

    const users = 5000;
    const projections = {};
    for (const [key, scenario] of Object.entries(scenarios)) {
      const calculated = scenarioBytes(scenario, unit);
      const previousRetention = scenarioBytes(scenario, unit, 21);
      const rawRetentionSavings = previousRetention.totalRaw - calculated.totalRaw;
      const indexedPerUser = rangeWithIndexes(calculated.totalRaw);
      const indexedRetentionSavings = rangeWithIndexes(rawRetentionSavings);
      projections[key] = {
        label: scenario.label,
        rawPerUserMiB: Math.round((calculated.totalRaw / MiB) * 1000) / 1000,
        withIndexesPerUserMiB: formatRange(indexedPerUser),
        users5000GiB: formatRange({
          lower: indexedPerUser.lower * users,
          upper: indexedPerUser.upper * users,
        }, GiB),
        retentionSavingsVersus21Days: {
          rawPerUserMiB: Math.round((rawRetentionSavings / MiB) * 1000) / 1000,
          users5000GiB: formatRange({
            lower: indexedRetentionSavings.lower * users,
            upper: indexedRetentionSavings.upper * users,
          }, GiB),
        },
        breakdownBytes: calculated.raw,
      };
    }

    const menuAverage = fallback(stats.menus_base.average, 7600);
    const menuHigh = fallback(stats.menus_base.p90, menuAverage * 1.75);
    const mealAverage = fallback(stats.comidasGuardadas.average, 1550);
    const mealHigh = fallback(stats.comidasGuardadas.p90, mealAverage * 1.75);
    const globalRawLow = menuAverage * 10_000 + mealAverage * 3_000;
    const globalRawHigh = menuHigh * 10_000 + mealHigh * 3_000;
    const globalWithIndexes = {
      lower: globalRawLow * 1.25,
      upper: globalRawHigh * 1.5,
    };

    console.log(JSON.stringify({
      assumptions: {
        users,
        detailDays: TRACKING_DETAIL_RETENTION_DAYS,
        summaryDays: TRACKING_SUMMARY_RETENTION_DAYS,
        indexOverheadRange: "25%-50%",
        globalMenus: 10_000,
        globalMeals: 3_000,
      },
      measuredDocumentSizes: stats,
      unitBytes: unit,
      projections,
      globalLibrary: {
        rawLowMiB: Math.round((globalRawLow / MiB) * 100) / 100,
        rawHighMiB: Math.round((globalRawHigh / MiB) * 100) / 100,
        withIndexesMiB: formatRange(globalWithIndexes),
      },
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
