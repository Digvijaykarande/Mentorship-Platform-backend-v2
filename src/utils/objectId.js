import { z } from "zod";
import mongoose from "../config/mongoose.js";

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), "Invalid id");
export const idParams = z.object({ id: objectId });
