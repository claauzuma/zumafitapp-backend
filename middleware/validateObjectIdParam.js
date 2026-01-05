import mongoose from "mongoose";

export function validateObjectIdParam(paramName) {
  return (req, res, next) => {
    const val = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(val)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    next();
  };
}
