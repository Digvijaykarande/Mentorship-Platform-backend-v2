import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { toMs, toSeconds } from "../src/utils/duration.js";
import { registerBody, loginBody, changePasswordBody } from "../src/modules/auth/auth.schema.js";
import { updateProfileBody } from "../src/modules/users/user.schema.js";
import { hashPassword, verifyPassword } from "../src/modules/auth/password.js";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../src/modules/auth/tokens.js";
import { User } from "../src/modules/users/user.model.js";
import { Task } from "../src/modules/tasks/task.model.js";
import { Submission } from "../src/modules/submissions/submission.model.js";
import { Feedback } from "../src/modules/feedback/feedback.model.js";
import { Project } from "../src/modules/projects/project.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";

test("duration helpers", () => {
  assert.equal(toMs("15m"), 900_000);
  assert.equal(toSeconds("7d"), 604_800);
  assert.throws(() => toMs("soon"));
});

test("register schema: defaults role, normalises email, blocks admin self-signup", () => {
  const ok = registerBody.parse({
    name: " Ada Lovelace ",
    email: " ADA@Example.com ",
    password: "longenough1",
  });
  assert.equal(ok.email, "ada@example.com");
  assert.equal(ok.name, "Ada Lovelace");
  assert.equal(ok.role, "intern");
  assert.equal(
    registerBody.safeParse({
      name: "Ada L",
      email: "a@b.co",
      password: "longenough1",
      role: "admin",
    }).success,
    false,
  );
  assert.equal(
    registerBody.safeParse({ name: "Ada L", email: "a@b.co", password: "short" }).success,
    false,
  );
  assert.equal(
    registerBody.safeParse({ name: "Ada L", email: "a@b.co", password: "x".repeat(80) }).success,
    false,
  );
});

test("login + change-password schemas", () => {
  assert.equal(loginBody.parse({ email: "A@B.co", password: "x" }).remember, true);
  assert.equal(
    changePasswordBody.safeParse({ currentPassword: "oldpassword1", newPassword: "oldpassword1" })
      .success,
    false,
  );
  assert.equal(
    changePasswordBody.safeParse({ currentPassword: "oldpassword1", newPassword: "newpassword1" })
      .success,
    true,
  );
});

test("profile schema accepts the frontend form shape and drops unknown/privileged keys", () => {
  const out = updateProfileBody.parse({
    firstName: "Ada",
    skills: ["React"],
    role: "admin",
    email: "x@y.z",
    isApproved: true,
  });
  assert.deepEqual(out, { firstName: "Ada", skills: ["React"] });
  assert.equal(updateProfileBody.safeParse({ username: "bad name!" }).success, false);
});

test("password hashing", async () => {
  const hash = await hashPassword("correct horse");
  assert.notEqual(hash, "correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("tokens: round trip, tamper, wrong secret, wrong token type", () => {
  const user = { id: "u1", role: "intern", passwordChangedAt: undefined };
  const access = signAccessToken(user);
  const payload = verifyAccessToken(access);
  assert.equal(payload.sub, "u1");
  assert.equal(payload.role, "intern");
  assert.equal(payload.pwd, 0);
  assert.throws(() => verifyAccessToken(access.slice(0, -2) + "xx"));
  assert.throws(() =>
    verifyAccessToken(
      jwt.sign({ sub: "u1" }, "different-secret-different-secret-12345", { issuer: "loyanox-api" }),
    ),
  );

  const refresh = signRefreshToken({ userId: "u1", jti: "j1", family: "f1", ttlMs: 60_000 });
  const rp = verifyRefreshToken(refresh);
  assert.equal(rp.jti, "j1");
  assert.equal(rp.fam, "f1");
  assert.throws(() => verifyAccessToken(refresh), "refresh token must not work as access token");
  assert.throws(() => verifyRefreshToken(access), "access token must not work as refresh token");
  const none = jwt.sign({ sub: "u1" }, "", { algorithm: "none", issuer: "loyanox-api" });
  assert.throws(() => verifyAccessToken(none), "alg=none must be rejected");
});

test("User model: validation, enums, hidden fields, Map flattening", async () => {
  const bad = new User({ name: "A", email: "not-an-email", passwordHash: "x", role: "superuser" });
  const err = bad.validateSync();
  assert.ok(err.errors.email && err.errors.role);

  const u = new User({
    name: "Ada",
    email: "ADA@x.io",
    passwordHash: "secret",
    settings: { notifications: { email: true } },
  });
  assert.equal(u.validateSync(), undefined);
  const json = u.toJSON();
  assert.equal(json.email, "ada@x.io");
  assert.equal(json.passwordHash, undefined);
  assert.equal(json.id, String(u._id));
  assert.equal(json._id, undefined);
  assert.deepEqual(json.settings.notifications, { email: true });
  assert.equal(json.role, "intern");
  assert.equal(json.isApproved, true);
});

test("domain models validate required fields and enums", () => {
  const id = new User()._id;
  assert.ok(new Task({ title: "" }).validateSync().errors.title);
  assert.equal(new Task({ title: "t", steps: [{ text: "one" }] }).validateSync(), undefined);
  assert.ok(new Task({ title: "t", status: "Nope" }).validateSync().errors.status);
  assert.ok(new Submission({ title: "t", type: "Video", intern: id }).validateSync().errors.type);
  assert.equal(
    new Submission({ title: "t", type: "Source Code", intern: id }).validateSync(),
    undefined,
  );
  assert.ok(
    new Feedback({ title: "t", rating: 9, mentor: id, mentee: id }).validateSync().errors.rating,
  );
  assert.ok(new Project({ name: "" }).validateSync().errors.name);
  assert.ok(
    new Notification({ user: id, title: "x", accent: "pink" }).validateSync().errors.accent,
  );
  const task = new Task({ title: "t", steps: [{ text: "one" }] }).toJSON();
  assert.ok(task.steps[0].id, "subdocuments expose id");
});

import { formatBytes } from "../src/modules/uploads/usage.service.js";
test("formatBytes renders friendly sizes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(200 * 1024), "200 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");
});

import { mergeUsage } from "../src/modules/uploads/usage.service.js";
import { documentationBody } from "../src/modules/projects/project.schema.js";
test("mergeUsage adds every source per user and ignores rows without an owner", () => {
  const merged = mergeUsage({
    submissions: [{ _id: "u1", bytes: 100, files: 1 }],
    resources: [{ _id: "u1", bytes: 50, files: 2 }, { _id: null, bytes: 9, files: 1 }],
    documentation: [{ _id: "u2", bytes: 7, files: 1 }],
  });
  assert.equal(merged.get("u1").bytes, 150);
  assert.equal(merged.get("u1").files, 3);
  assert.equal(merged.get("u1").breakdown.resources.bytes, 50);
  assert.equal(merged.get("u2").bytes, 7);
  assert.equal(merged.size, 2);
});
test("documentationBody needs notes or an attachment", () => {
  assert.equal(documentationBody.safeParse({ title: "API" }).success, false);
  assert.equal(documentationBody.safeParse({ title: "API", notes: "hello" }).success, true);
  assert.equal(
    documentationBody.safeParse({ title: "API", attachments: [{ name: "spec.pdf", url: "https://x.io/a.pdf", size: 10 }] }).success,
    true,
  );
});
