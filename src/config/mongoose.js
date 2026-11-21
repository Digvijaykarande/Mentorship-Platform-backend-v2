import mongoose from "mongoose";
import { jsonPlugin } from "../utils/mongoosePlugins.js";

// Global Mongoose setup. Every model (and db.js) imports mongoose from HERE, so the plugin is
// always registered before any schema is compiled, regardless of import order.
mongoose.set("strictQuery", true);
mongoose.plugin(jsonPlugin);

export default mongoose;
