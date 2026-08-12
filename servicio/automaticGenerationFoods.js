import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import { getAutomaticGenerationFoods as queryAutomaticFoods } from "./foodGenerationMetadata.js";

export async function getAutomaticGenerationFoods(filters = {}, { model = new ModelMongoDBAlimentos() } = {}) {
  return queryAutomaticFoods(filters, { model });
}

export default getAutomaticGenerationFoods;
