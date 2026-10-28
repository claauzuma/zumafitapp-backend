import { createHash } from "node:crypto";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function positiveMilliseconds(value, fallback = DEFAULT_TTL_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 24 * 60 * 60 * 1000);
}

function catalogHash(documents = []) {
  return createHash("sha256")
    .update(JSON.stringify(documents))
    .digest("base64url");
}

export class FoodCatalogCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = positiveMilliseconds(ttlMs);
    this.now = now;
    this.documents = null;
    this.expiresAt = 0;
    this.loadedAt = 0;
    this.etagSeed = "";
    this.loadingPromise = null;
    this.stats = {
      hits: 0,
      misses: 0,
      coalesced: 0,
      staleServed: 0,
      invalidations: 0,
    };
  }

  isFresh() {
    return Array.isArray(this.documents) && this.now() < this.expiresAt;
  }

  async get(loader, { forceRefresh = false } = {}) {
    if (typeof loader !== "function") throw new TypeError("El loader del catalogo debe ser una funcion.");

    if (!forceRefresh && this.isFresh()) {
      this.stats.hits += 1;
      return [...this.documents];
    }

    if (this.loadingPromise) {
      this.stats.coalesced += 1;
      return [...await this.loadingPromise];
    }

    const staleDocuments = Array.isArray(this.documents) ? this.documents : null;
    this.stats.misses += 1;
    const currentLoad = Promise.resolve()
      .then(loader)
      .then((documents) => {
        if (!Array.isArray(documents)) throw new TypeError("MongoDB no devolvio un catalogo valido.");
        const loadedAt = this.now();
        this.documents = documents;
        this.loadedAt = loadedAt;
        this.expiresAt = loadedAt + this.ttlMs;
        this.etagSeed = catalogHash(documents);
        return documents;
      });
    this.loadingPromise = currentLoad;

    try {
      return [...await currentLoad];
    } catch (error) {
      // Si un refresco temporal falla, un catalogo previamente valido es mas
      // seguro que dejar sin alimentos a todos los usuarios.
      if (staleDocuments) {
        this.stats.staleServed += 1;
        this.documents = staleDocuments;
        this.expiresAt = this.now() + Math.min(this.ttlMs, 60 * 1000);
        return [...staleDocuments];
      }
      throw error;
    } finally {
      if (this.loadingPromise === currentLoad) this.loadingPromise = null;
    }
  }

  invalidate() {
    this.documents = null;
    this.expiresAt = 0;
    this.loadedAt = 0;
    this.etagSeed = "";
    this.stats.invalidations += 1;
  }

  info() {
    return {
      cached: Array.isArray(this.documents),
      count: this.documents?.length || 0,
      ttlMs: this.ttlMs,
      loadedAt: this.loadedAt || null,
      expiresAt: this.expiresAt || null,
      etagSeed: this.etagSeed,
      loading: Boolean(this.loadingPromise),
      ...this.stats,
    };
  }
}

export const globalFoodCatalogCache = new FoodCatalogCache({
  ttlMs: positiveMilliseconds(process.env.FOOD_CATALOG_CACHE_TTL_MS),
});

export function invalidateGlobalFoodCatalogCache() {
  globalFoodCatalogCache.invalidate();
}

export function globalFoodCatalogCacheInfo() {
  return globalFoodCatalogCache.info();
}

export default globalFoodCatalogCache;
