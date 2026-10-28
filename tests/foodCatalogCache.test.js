import assert from "node:assert/strict";
import test from "node:test";

import { sendCatalogJson } from "../controlador/alimentos.js";
import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import { foodForPublicCatalog } from "../servicio/alimentos.js";
import {
  FoodCatalogCache,
  globalFoodCatalogCacheInfo,
  invalidateGlobalFoodCatalogCache,
} from "../servicio/foodCatalogCache.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeResponse() {
  const headers = new Map([["pragma", "no-cache"]]);
  return {
    headers,
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    status(value) { this.statusCode = value; return this; },
    type(value) { this.setHeader("content-type", value); return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; },
  };
}

test("el cache del catalogo comparte una unica lectura Mongo concurrente", async () => {
  const pending = deferred();
  const cache = new FoodCatalogCache({ ttlMs: 10_000 });
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return await pending.promise;
  };

  const first = cache.get(loader);
  const second = cache.get(loader);
  pending.resolve([{ _id: "food-1", nombre: "Pollo" }]);

  assert.deepEqual(await first, [{ _id: "food-1", nombre: "Pollo" }]);
  assert.deepEqual(await second, [{ _id: "food-1", nombre: "Pollo" }]);
  assert.equal(loads, 1);
  assert.equal(cache.info().misses, 1);
  assert.equal(cache.info().coalesced, 1);
});

test("el cache respeta TTL, invalidacion y fallback temporal a datos validos", async () => {
  let now = 1_000;
  let version = 0;
  const cache = new FoodCatalogCache({ ttlMs: 1_000, now: () => now });
  const loader = async () => [{ version: ++version }];

  assert.equal((await cache.get(loader))[0].version, 1);
  assert.equal((await cache.get(loader))[0].version, 1);
  assert.equal(cache.info().hits, 1);

  now = 2_001;
  assert.equal((await cache.get(async () => { throw new Error("Mongo temporalmente caido"); }))[0].version, 1);
  assert.equal(cache.info().staleServed, 1);

  cache.invalidate();
  assert.equal(cache.info().cached, false);
  assert.equal((await cache.get(loader))[0].version, 2);
  assert.equal(cache.info().invalidations, 1);
});

test("el DAO usa cache solo cuando la app lo solicita y una escritura lo invalida", async () => {
  const previousConnection = CnxMongoDB.connection;
  CnxMongoDB.connection = true;
  invalidateGlobalFoodCatalogCache();
  let reads = 0;
  const collection = {
    find: () => ({
      toArray: async () => {
        reads += 1;
        return [{ _id: "food-1", nombre: `Lectura ${reads}` }];
      },
    }),
    insertOne: async () => ({ insertedId: "food-2" }),
    findOne: async () => ({ _id: "food-2", nombre: "Creado" }),
  };
  const model = new ModelMongoDBAlimentos();
  model.collection = () => collection;

  try {
    await model.obtenerAlimentos();
    await model.obtenerAlimentos();
    assert.equal(reads, 2, "las auditorias sin opt-in deben leer Mongo cada vez");

    await model.obtenerAlimentos({ cache: true });
    await model.obtenerAlimentos({ cache: true });
    assert.equal(reads, 3, "la app debe compartir la lectura cacheada");
    assert.equal(globalFoodCatalogCacheInfo().cached, true);

    await model.crearAlimento({ nombre: "Creado" });
    assert.equal(globalFoodCatalogCacheInfo().cached, false);
  } finally {
    invalidateGlobalFoodCatalogCache();
    CnxMongoDB.connection = previousConnection;
  }
});

test("la vista compacta conserva el contrato nutricional y omite auditoria pesada", () => {
  const compact = foodForPublicCatalog({
    _id: { toString: () => "mongo-food-1" },
    alimentoId: 42,
    Alimentos: "Pechuga de pollo cruda",
    Unidad: "gr",
    Calorias: 120,
    Proteinas: 22.5,
    Carbohidratos: 0,
    Grasas: 3.3,
    macroBasis: "per100",
    basePesaje: "crudo",
    generation: { mode: "GENERIC", roles: { P1: true } },
    imagen: { url: "/pollo.webp" },
    referenciaNutricional: { fuente: "SARA 2", pagina: 45 },
    auditoriaNutricionalUltima: { evidencia: "documento extenso" },
    historialCambios: Array.from({ length: 20 }, (_, index) => ({ index })),
  });

  assert.equal(compact._id, "mongo-food-1");
  assert.equal(compact.Calorias, 120);
  assert.equal(compact.Proteinas, 22.5);
  assert.equal(compact.basePesaje, "crudo");
  assert.equal(compact.generation.roles.P1, true);
  assert.equal(compact.imagen.url, "/pollo.webp");
  assert.equal("referenciaNutricional" in compact, false);
  assert.equal("auditoriaNutricionalUltima" in compact, false);
  assert.equal("historialCambios" in compact, false);
});

test("el catalogo global es cacheable y responde 304 con el mismo ETag", () => {
  const payload = [{ _id: "food-1", nombre: "Arroz" }];
  const first = fakeResponse();
  sendCatalogJson({ headers: {} }, first, payload, {
    publicCache: true,
    cacheInfo: { cached: true, count: 1 },
  });

  const etag = first.headers.get("etag");
  assert.match(etag, /^W\/"foods-[A-Za-z0-9_-]+"$/);
  assert.match(first.headers.get("cache-control"), /^public,/);
  assert.equal(first.headers.has("pragma"), false);
  assert.equal(first.headers.get("x-catalog-cache"), "MEMORY");
  assert.equal(first.headers.get("x-catalog-items"), "1");
  assert.equal(JSON.parse(first.body)[0].nombre, "Arroz");

  const second = fakeResponse();
  sendCatalogJson({ headers: { "if-none-match": etag } }, second, payload, { publicCache: true });
  assert.equal(second.statusCode, 304);
  assert.equal(second.ended, true);
  assert.equal(second.body, null);
});

test("el catalogo combinado conserva cache privada", () => {
  const response = fakeResponse();
  sendCatalogJson({ headers: {} }, response, [{ privateFood: true }], { publicCache: false });
  assert.equal(response.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  assert.match(response.headers.get("vary"), /Authorization/);
});
