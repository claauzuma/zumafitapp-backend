import ModelMongoDBComidas from "./comidasMongoDB.js";

class ModelFactoryComidas {
  static get(tipo) {
    switch (tipo) {
      case "MONGODB":
        console.log("**** Persistiendo Comidas en MongoDB ****");
        return new ModelMongoDBComidas();

      default:
        console.log("**** Persistencia no reconocida, usando MongoDB por defecto (Comidas) ****");
        return new ModelMongoDBComidas();
    }
  }
}

export default ModelFactoryComidas;
