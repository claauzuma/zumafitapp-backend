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

   
}

export default ModelMongoDBAlimentos;
