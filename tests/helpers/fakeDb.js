import mongoose from "mongoose";
import { User } from "../../src/modules/users/user.model.js";
import { RefreshToken } from "../../src/modules/auth/refreshToken.model.js";
import { Counter } from "../../src/modules/common/counter.model.js";

/**
 * Minimal in-memory stand-in for the handful of Mongoose calls the auth layer makes, so the
 * real services/controllers/routes can be exercised without a MongoDB server.
 * It supports equality filters plus `{ field: { $exists: false } }`, and $set/$unset updates.
 */
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    if (cond && typeof cond === "object" && "$exists" in cond)
      return (doc[key] !== undefined) === cond.$exists;
    return String(doc[key]) === String(cond);
  });

const apply = (doc, update) => {
  for (const [k, v] of Object.entries(update.$set ?? {})) doc.set ? doc.set(k, v) : (doc[k] = v);
  for (const k of Object.keys(update.$unset ?? {})) doc.set ? doc.set(k, undefined) : delete doc[k];
};

// Awaitable query object that also supports `.select(...)` like a Mongoose Query.
const query = (value) => {
  const q = { then: (res, rej) => Promise.resolve(value).then(res, rej), select: () => q };
  return q;
};

export function installFakeDb() {
  const users = [];
  const tokens = [];
  const counters = new Map();

  User.exists = (f) => query(users.find((u) => matches(u, f)) ? { _id: 1 } : null);
  User.create = async (data) => {
    const doc = new User(data);
    await doc.validate();
    users.push(doc);
    return doc;
  };
  User.findOne = (f) => query(users.find((u) => matches(u, f)) ?? null);
  User.findById = (id) => query(users.find((u) => String(u._id) === String(id)) ?? null);
  User.updateOne = async (f, update) => {
    const doc = users.find((u) => matches(u, f));
    if (doc) apply(doc, update);
    return { modifiedCount: doc ? 1 : 0 };
  };
  User.findByIdAndUpdate = (id, update) => {
    const doc = users.find((u) => String(u._id) === String(id));
    if (doc) apply(doc, update);
    return query(doc ?? null);
  };
  User.prototype.save = async function save() {
    await this.validate();
    return this;
  };

  RefreshToken.create = async (data) => {
    const rec = { _id: new mongoose.Types.ObjectId(), ...data };
    tokens.push(rec);
    return rec;
  };
  RefreshToken.findOne = (f) => query(tokens.find((t) => matches(t, f)) ?? null);
  RefreshToken.findOneAndUpdate = async (f, update) => {
    const rec = tokens.find((t) => matches(t, f));
    if (!rec) return null;
    const before = { ...rec };
    apply(rec, update);
    return before;
  };
  RefreshToken.updateOne = async (f, update) => {
    const rec = tokens.find((t) => matches(t, f));
    if (rec) apply(rec, update);
    return { modifiedCount: rec ? 1 : 0 };
  };
  RefreshToken.updateMany = async (f, update) => {
    const hit = tokens.filter((t) => matches(t, f));
    hit.forEach((t) => apply(t, update));
    return { modifiedCount: hit.length };
  };

  Counter.findOneAndUpdate = async (f) => {
    counters.set(f._id, (counters.get(f._id) ?? 0) + 1);
    return { seq: counters.get(f._id) };
  };

  return { users, tokens };
}
