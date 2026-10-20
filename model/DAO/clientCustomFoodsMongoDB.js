import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

export const CLIENT_CUSTOM_FOODS_COLLECTION = "client_custom_foods";

function idQuery(id) {
  const value = String(id || "").trim();
  return ObjectId.isValid(value) ? { _id: new ObjectId(value) } : { _id: null };
}

export default class ModelMongoDBClientCustomFoods {
  collection = () => {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection(CLIENT_CUSTOM_FOODS_COLLECTION);
  };

  ensureIndexes = async () => {
    await Promise.all([
      this.collection().createIndex({ ownerId: 1, createdAt: -1 }, { background: true }),
      this.collection().createIndex(
        { ownerId: 1, nombreKey: 1, unidadBase: 1 },
        { unique: true, background: true }
      ),
      this.collection().createIndex({ nombre: "text" }, { background: true }).catch(() => null),
    ]);
  };

  listByOwner = async (ownerId) => (
    await this.collection().find({ ownerId: String(ownerId) }).sort({ createdAt: -1 }).toArray()
  );

  listAll = async () => (
    await this.collection().find({}).sort({ createdAt: -1 }).toArray()
  );

  countByOwner = async (ownerId) => (
    await this.collection().countDocuments({ ownerId: String(ownerId) })
  );

  findById = async (id) => this.collection().findOne(idQuery(id));

  create = async (document) => {
    const result = await this.collection().insertOne(document);
    return await this.collection().findOne({ _id: result.insertedId });
  };

  updateById = async (id, patch) => this.collection().findOneAndUpdate(
    idQuery(id),
    { $set: patch },
    { returnDocument: "after" }
  );

  deleteById = async (id) => this.collection().deleteOne(idQuery(id));

  deleteByOwner = async (ownerId) => this.collection().deleteMany({ ownerId: String(ownerId) });
}
