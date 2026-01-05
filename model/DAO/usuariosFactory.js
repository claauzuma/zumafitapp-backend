import ModelMongoDBUsuarios from "./usuariosMongoDB.js";

class ModelFactoryUsuarios {
    static get(tipo) {
        switch (tipo) {
            case 'MONGODB':
                console.log('**** Persistiendo en MongoDB ****');
                return new ModelMongoDBUsuarios();

            default:
                console.log('**** Persistencia no reconocida, usando MongoDB por defecto ****');
                return new ModelMongoDBUsuarios();
        }
    }
}

export default ModelFactoryUsuarios;
