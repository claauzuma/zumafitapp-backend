import CnxMongoDB from "../model/DBMongo.js";

const toSafeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const metricFromSettled = (result, fallback = 0) =>
  result?.status === "fulfilled" ? toSafeNumber(result.value) : fallback;

const collectionErrorMessage = "No se pudieron consultar todas las metricas de esta coleccion.";

class ServicioDatabaseStats {
  obtenerEstadisticas = async () => {
    const db = CnxMongoDB.db;
    if (!CnxMongoDB.connection || !db) {
      const error = new Error("DATABASE_NOT_AVAILABLE");
      error.code = "DATABASE_NOT_AVAILABLE";
      throw error;
    }

    const generatedAt = new Date().toISOString();
    const collectionDefinitions = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const collections = await Promise.all(
      collectionDefinitions.map(({ name }) => this.obtenerEstadisticasColeccion(db, name))
    );

    collections.sort((a, b) => b.totalSize - a.totalSize || a.name.localeCompare(b.name));

    const calculatedDatabase = collections.reduce(
      (summary, collection) => ({
        ...summary,
        totalDocuments: summary.totalDocuments + collection.documents,
        dataSize: summary.dataSize + collection.dataSize,
        storageSize: summary.storageSize + collection.storageSize,
        indexSize: summary.indexSize + collection.indexSize,
        totalSize: summary.totalSize + collection.totalSize,
      }),
      {
        totalDocuments: 0,
        dataSize: 0,
        storageSize: 0,
        indexSize: 0,
        totalSize: 0,
      }
    );

    let databaseCommandStats = null;
    try {
      databaseCommandStats = await db.command({ dbStats: 1, scale: 1 });
    } catch {
      databaseCommandStats = null;
    }

    const databaseHasPartialData = collections.some((collection) => collection.status !== "ok");
    const commandStorageSize = toSafeNumber(databaseCommandStats?.storageSize);
    const commandIndexSize = toSafeNumber(databaseCommandStats?.indexSize);
    const database = {
      name: db.databaseName,
      collectionsCount: collections.length,
      totalDocuments: toSafeNumber(databaseCommandStats?.objects) || calculatedDatabase.totalDocuments,
      dataSize: toSafeNumber(databaseCommandStats?.dataSize) || calculatedDatabase.dataSize,
      storageSize: commandStorageSize || calculatedDatabase.storageSize,
      indexSize: commandIndexSize || calculatedDatabase.indexSize,
      totalSize:
        toSafeNumber(databaseCommandStats?.totalSize) ||
        commandStorageSize + commandIndexSize ||
        calculatedDatabase.storageSize + calculatedDatabase.indexSize,
      generatedAt,
      status: databaseHasPartialData || !databaseCommandStats ? "partial" : "ok",
    };

    return { database, collections };
  };

  obtenerEstadisticasColeccion = async (db, name) => {
    const collection = db.collection(name);
    const [documentsResult, statsResult, indexesResult] = await Promise.allSettled([
      collection.estimatedDocumentCount(),
      db.command({ collStats: name, scale: 1 }),
      collection.listIndexes().toArray(),
    ]);

    const stats = statsResult.status === "fulfilled" ? statsResult.value : {};
    const failedMetrics = [];

    if (documentsResult.status === "rejected") failedMetrics.push("documents");
    if (statsResult.status === "rejected") failedMetrics.push("collStats");
    if (indexesResult.status === "rejected") failedMetrics.push("indexes");

    const documents = metricFromSettled(documentsResult, toSafeNumber(stats.count));
    const dataSize = toSafeNumber(stats.size);
    const storageSize = toSafeNumber(stats.storageSize);
    const indexSize = toSafeNumber(stats.totalIndexSize);
    const indexesCount =
      indexesResult.status === "fulfilled"
        ? indexesResult.value.length
        : toSafeNumber(stats.nindexes);
    const avgObjSize =
      toSafeNumber(stats.avgObjSize) || (documents > 0 ? dataSize / documents : 0);

    return {
      name,
      documents,
      dataSize,
      storageSize,
      indexSize,
      totalSize: storageSize + indexSize,
      indexesCount,
      avgObjSize,
      status: failedMetrics.length === 0 ? "ok" : failedMetrics.length === 3 ? "error" : "partial",
      ...(failedMetrics.length > 0
        ? {
            error: collectionErrorMessage,
            unavailableMetrics: failedMetrics,
          }
        : {}),
    };
  };
}

export default ServicioDatabaseStats;
