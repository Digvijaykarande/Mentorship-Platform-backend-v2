/**
 * Applied globally (see config/mongoose.js): every document serialises as
 *   { id: "<ObjectId string>", ...fields }   — no _id / __v.
 *
 * Safety net: any path declared `select: false` (e.g. passwordHash) is stripped from JSON output
 * even if a query explicitly selected it, so secrets cannot leak by accident.
 */
export function jsonPlugin(schema) {
  const hidden = Object.entries(schema.paths)
    .filter(([, type]) => type.options?.select === false)
    .map(([path]) => path);

  schema.set("toJSON", {
    virtuals: true,
    flattenMaps: true,
    versionKey: false,
    transform(_doc, ret) {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.__v;
      for (const path of hidden) delete ret[path];
      return ret;
    },
  });
  schema.set("toObject", { virtuals: true, versionKey: false });
}
