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

    obtenerAlimentosPorIds = async (ids = []) => {
        if (!CnxMongoDB.connection) {
            throw new Error("No hay conexion a la base de datos");
        }

        const values = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
        if (!values.length) return [];
        const objectIds = values.filter(ObjectId.isValid).map((id) => new ObjectId(id));
        const numericIds = values.map(Number).filter(Number.isFinite);
        const clauses = [];
        if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
        if (numericIds.length) clauses.push({ alimentoId: { $in: numericIds } });
        clauses.push({ id: { $in: values } });
        return await this.collection().find({ $or: clauses }).toArray();
    }

    crearAlimento = async (documento) => {
        if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
        const result = await this.collection().insertOne(documento);
        return await this.collection().findOne({ _id: result.insertedId });
    }

    actualizarGenerationPorId = async (id, generation) => {
        if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
        const value = String(id || "").trim();
        if (!ObjectId.isValid(value)) return null;
        return await this.collection().findOneAndUpdate(
            { _id: new ObjectId(value) },
            { $set: { generation, updatedAt: new Date() } },
            { returnDocument: "after" }
        );
    }

    obtenerAlimentosGeneracionAutomatica = async ({ mealType, roles = [] } = {}) => {
        if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
        if (!mealType || !roles.length) return [];
        return await this.collection().find({
            activo: { $ne: false },
            "generation.mode": "GENERIC",
            [`generation.mealTypes.${mealType}`]: true,
            $or: roles.map((role) => ({ [`generation.roles.${role}`]: true })),
        }).toArray();
    }
}

export default ModelMongoDBAlimentos;
