import ModelMongoDBAlimentos from "./alimentosMongoDB.js";

class ModelFactoryAlimentos {
    static get(tipo) {
        switch (tipo) {
            case 'MONGODB':
                console.log('**** Persistiendo en MongoDB ****');
                return new ModelMongoDBAlimentos();

            default:
                console.log('**** Persistencia no reconocida, usando MongoDB por defecto ****');
                return new ModelMongoDBAlimentos();
        }
    }
}

export default ModelFactoryAlimentos;
