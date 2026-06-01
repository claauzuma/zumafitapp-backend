import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBAlimentos {
    

    obtenerAlimentos = async () => {   
        if (!CnxMongoDB.connection) {
            // Si no hay conexión, podrías manejar esto de manera más explícita.
            throw new Error('No hay conexión a la base de datos');
        }
            const alimentos = await CnxMongoDB.db.collection('fooddatabase2').find({}).toArray()
            return alimentos
        }

    obtenerAlimentoPorId = async (id) => {
        if (!CnxMongoDB.connection) {
            throw new Error('No hay conexion a la base de datos');
        }

        const value = String(id || '').trim()
        if (!value) return null

        if (ObjectId.isValid(value)) {
            return await CnxMongoDB.db.collection('fooddatabase2').findOne({ _id: new ObjectId(value) })
        }

        return await CnxMongoDB.db.collection('fooddatabase2').findOne({ id: value })
    }

   
}

export default ModelMongoDBAlimentos;
