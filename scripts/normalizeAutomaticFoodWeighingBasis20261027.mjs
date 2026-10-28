import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EJSON } from "bson";
import { MongoClient } from "mongodb";

import config from "../config.js";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
if (APPLY && ROLLBACK) throw new Error("Usar --apply o --rollback, nunca ambos.");

const migrationId = "automatic-food-weighing-basis-2026-10-27-v1";
const runAt = new Date();
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(
  here,
  "..",
  "..",
  "..",
  "zumafitront",
  "artifacts",
  "food-catalog-verified-raw-2026-10-27",
);
const snapshotPath = path.join(outputDir, "weighing-basis-before.ejson");
const checksumPath = path.join(outputDir, "weighing-basis-before.sha256");
const collectionName = "fooddatabase2";
const tapaDeAsadoId = 534;

const explicitOnly = {
  mode: "EXPLICIT_ONLY",
  roles: { P1: false, P2: false, C1: false, C2: false, V: false, F: false, G: false },
  mealTypes: { breakfast: false, lunch: false, snack: false, dinner: false, extraSnack: false },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
};

const explicitLegacyFlags = {
  aptoDesayuno: false,
  aptoAlmuerzo: false,
  aptoMerienda: false,
  aptoCena: false,
  aptoPreEntreno: false,
  aptoPostEntreno: false,
  esProteinaPrincipal: false,
  esProteinaSecundaria: false,
  esCarboPrincipal: false,
  esGrasaPrincipal: false,
  esVegetalLibre: false,
};

function decideBasis(document) {
  if (document.alimentoId === 58) return "crudo";
  if (document.alimentoId === 528) return "seco";
  const state = String(document.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (state.includes("crudo")) return "crudo";
  if (state.includes("seco") || state.includes("polvo")) return "seco";
  return "listo_para_consumir";
}

function basisDescription(basis) {
  if (basis === "crudo") return "Usar el peso crudo de la parte comestible, antes de cualquier cocción.";
  if (basis === "seco") return "Usar el peso seco/crudo, antes de hidratar o cocinar.";
  return "Usar el alimento tal como se consume; escurrido cuando el nombre lo indique.";
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCurrentPending(documents) {
  const rows = documents.map((document) => ({
    alimentoId: document.alimentoId,
    alimento: document.nombre || document.Alimentos || "",
    unidad: document.unidad || document.Unidad || "",
    kcal100: document.kcal100 ?? "",
    proteina100: document.proteina100 ?? "",
    carbohidratos100: document.carbohidratos100 ?? "",
    grasas100: document.grasas100 ?? "",
    basePesaje: document.basePesaje || "",
    modoGeneracion: document.generation?.mode || "",
    activo: document.activo === true,
    motivoRevision: document.motivoRevision || "",
  }));
  const headers = Object.keys(rows[0] || {});
  const csv = rows.length
    ? `${headers.map(csvEscape).join(",")}\n${rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`
    : "";
  fs.writeFileSync(path.join(outputDir, "PENDIENTES_CONFIRMACION_ACTUALES.csv"), csv);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new MongoClient(config.STRCNX);
  try {
    await client.connect();
    const collection = client.db(config.BASE).collection(collectionName);
    const beforeCount = await collection.countDocuments({});

    if (ROLLBACK) {
      if (!fs.existsSync(snapshotPath) || !fs.existsSync(checksumPath)) {
        throw new Error("Falta el snapshot o su checksum para rollback.");
      }
      const snapshotText = fs.readFileSync(snapshotPath, "utf8");
      const declaredHash = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
      const actualHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
      if (declaredHash !== actualHash) throw new Error("El checksum del snapshot no coincide.");
      const snapshot = EJSON.parse(snapshotText);
      if (snapshot.migrationId !== migrationId) throw new Error("El snapshot pertenece a otra migración.");

      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          for (const document of snapshot.documents) {
            const result = await collection.replaceOne({
              _id: document._id,
              "auditoriaCatalogoUltima.migrationId": migrationId,
            }, document, { upsert: false, session });
            if (result.matchedCount !== 1) {
              throw new Error(`Rollback bloqueado para alimentoId ${document.alimentoId}; fue modificado después.`);
            }
          }
          const count = await collection.countDocuments({}, { session });
          if (count !== beforeCount) throw new Error(`El conteo cambió ${beforeCount} -> ${count}.`);
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      } finally {
        await session.endSession();
      }
      console.log(JSON.stringify({ rolledBack: true, restored: snapshot.documents.length, count: beforeCount }, null, 2));
      return;
    }

    const missingBasis = await collection.find({
      activo: true,
      "generation.mode": "GENERIC",
      $or: [{ basePesaje: null }, { basePesaje: { $exists: false } }],
    }).sort({ alimentoId: 1 }).toArray();
    const tapaDeAsado = await collection.findOne({ alimentoId: tapaDeAsadoId });
    if (!tapaDeAsado) throw new Error("No existe Tapa de asado (alimentoId 534). ");
    if (tapaDeAsado.generation?.mode !== "GENERIC" || tapaDeAsado.requiereRevision === true) {
      throw new Error("Tapa de asado no coincide con el estado previo esperado.");
    }

    const targets = [...missingBasis, tapaDeAsado];
    const uniqueIds = new Set(targets.map((document) => String(document._id)));
    if (uniqueIds.size !== targets.length) throw new Error("Hay objetivos duplicados.");
    const snapshot = EJSON.stringify({ migrationId, capturedAt: runAt, documents: targets }, { relaxed: false, indent: 2 });
    fs.writeFileSync(snapshotPath, snapshot);
    const snapshotSha256 = crypto.createHash("sha256").update(snapshot).digest("hex");
    fs.writeFileSync(checksumPath, `${snapshotSha256}  weighing-basis-before.ejson\n`);

    const operations = missingBasis.map((document) => {
      const basis = decideBasis(document);
      const set = {
        basePesaje: basis,
        descripcionBasePesaje: basisDescription(basis),
        auditoriaCatalogoUltima: {
          migrationId,
          appliedAt: runAt,
          decision: "BASE_DE_PESAJE_ESTRUCTURADA",
        },
      };
      if (document.alimentoId === 58) {
        set.estado = "Crudo / a cocinar";
        set.requiereCoccion = true;
      }
      if (document.alimentoId === 528) {
        set.estado = "Seco / a hidratar o cocinar";
        set.requiereCoccion = true;
      }
      return {
        updateOne: {
          filter: {
            _id: document._id,
            alimentoId: document.alimentoId,
            activo: true,
            "generation.mode": "GENERIC",
            estado: document.estado,
            requiereCoccion: document.requiereCoccion,
            $or: [{ basePesaje: null }, { basePesaje: { $exists: false } }],
          },
          update: { $set: set },
          upsert: false,
        },
      };
    });
    operations.push({
      updateOne: {
        filter: {
          _id: tapaDeAsado._id,
          alimentoId: tapaDeAsadoId,
          activo: true,
          "generation.mode": "GENERIC",
          requiereRevision: { $ne: true },
        },
        update: { $set: {
          generation: explicitOnly,
          ...explicitLegacyFlags,
          requiereRevision: true,
          motivoRevision: "Tapa de asado: el valor actual es plausible, pero falta una composición argentina primaria específica que defina el nivel de grasa visible; queda disponible solo para selección manual.",
          auditoriaCatalogoUltima: {
            migrationId,
            appliedAt: runAt,
            decision: "FUERA_DE_AUTOGENERACION_HASTA_CONFIRMAR_FUENTE",
          },
        } },
        upsert: false,
      },
    });

    if (!APPLY) {
      console.log(JSON.stringify({
        applied: false,
        beforeCount,
        missingBasisTargets: missingBasis.length,
        totalTargets: targets.length,
        raw: missingBasis.filter((document) => decideBasis(document) === "crudo").length,
        dry: missingBasis.filter((document) => decideBasis(document) === "seco").length,
        ready: missingBasis.filter((document) => decideBasis(document) === "listo_para_consumir").length,
        quarantined: [tapaDeAsadoId],
        snapshotSha256,
      }, null, 2));
      return;
    }

    const session = client.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await collection.bulkWrite(operations, { ordered: true, session });
        if (result.matchedCount !== operations.length || result.modifiedCount !== operations.length) {
          throw new Error(`Actualización incompleta: matched=${result.matchedCount}, modified=${result.modifiedCount}, esperados=${operations.length}.`);
        }
        const count = await collection.countDocuments({}, { session });
        if (count !== beforeCount) throw new Error(`El conteo cambió ${beforeCount} -> ${count}.`);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally {
      await session.endSession();
    }

    const remainingMissingBasis = await collection.countDocuments({
      activo: true,
      "generation.mode": "GENERIC",
      $or: [{ basePesaje: null }, { basePesaje: { $exists: false } }],
    });
    const tapaAfter = await collection.findOne({ alimentoId: tapaDeAsadoId });
    if (remainingMissingBasis !== 0 || tapaAfter?.generation?.mode !== "EXPLICIT_ONLY" || tapaAfter?.requiereRevision !== true) {
      throw new Error("Falló la verificación posterior de base de pesaje o Tapa de asado.");
    }
    const pending = await collection.find({ alimentoId: { $ne: null }, requiereRevision: true }).sort({ alimentoId: 1 }).toArray();
    writeCurrentPending(pending);
    fs.writeFileSync(path.join(outputDir, "weighing-basis-after.ejson"), EJSON.stringify({
      migrationId,
      verifiedAt: new Date(),
      beforeCount,
      afterCount: await collection.countDocuments({}),
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      remainingMissingBasis,
      pendingCount: pending.length,
      snapshotSha256,
    }, { relaxed: false, indent: 2 }));
    console.log(JSON.stringify({
      applied: true,
      beforeCount,
      afterCount: await collection.countDocuments({}),
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      remainingMissingBasis,
      pendingCount: pending.length,
      snapshotSha256,
    }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
