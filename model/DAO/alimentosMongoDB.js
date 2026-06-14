import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

export const ALIMENTOS_COLLECTION = "fooddatabase2";

class ModelMongoDBAlimentos {
    collection = () => CnxMongoDB.db.collection(ALIMENTOS_COLLECTION)

    asegurarIndices = async () => {
        if (!CnxMongoDB.connection) {
            throw new Error("No hay conexion a la base de datos");
        }

        await Promise.all([
            this.collection().createIndex({ alimentoId: 1 }, { sparse: true, background: true }),
            this.collection().createIndex({ nombreKey: 1, unidadBase: 1 }, { sparse: true, background: true }),
            this.collection().createIndex({ nombre: "text", Alimentos: "text", tags: "text" }, { background: true }).catch(() => null),
        ]);
    }

    obtenerAlimentos = async () => {
        if (!CnxMongoDB.connection) {
            throw new Error("No hay conexion a la base de datos");
        }

        return await this.collection().find({}).toArray();
    }

    obtenerAlimentoPorId = async (id) => {
        if (!CnxMongoDB.connection) {
            throw new Error("No hay conexion a la base de datos");
        }

        const value = String(id || "").trim();
        if (!value) return null;

        if (ObjectId.isValid(value)) {
            return await this.collection().findOne({ _id: new ObjectId(value) });
        }

        const numericId = Number(value);
        if (Number.isFinite(numericId)) {
            const byAlimentoId = await this.collection().findOne({ alimentoId: numericId });
            if (byAlimentoId) return byAlimentoId;
        }

        return await this.collection().findOne({ id: value });
    }
}

export default ModelMongoDBAlimentos;
