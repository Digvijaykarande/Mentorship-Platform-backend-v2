import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDb } from "./helpers/fakeDb.js";

const db = installFakeDb();
const { createApp } = await import("../src/app.js");
const authService = await import("../src/modules/auth/auth.service.js");
const { verifyRefreshToken } = await import("../src/modules/auth/tokens.js");

let base;
let server;
before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const call = async (path, { method = "GET", body, token, cookie } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body && { "content-type": "application/json" }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...(cookie && { cookie }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    json: text ? JSON.parse(text) : null,
    setCookie: res.headers.getSetCookie?.() ?? [],
  };
};
const cookieOf = (r) => r.setCookie.find((c) => c.startsWith("refreshToken="))?.split(";")[0];

const ada = { name: "Ada Lovelace", email: "ada@loyanox.com", password: "analytical-engine-1" };

test("register -> cookie + access token, never leaks the hash", async () => {
  const r = await call("/auth/register", { method: "POST", body: ada });
  assert.equal(r.status, 201);
  assert.equal(r.json.success, true);
  assert.match(r.json.data.user.code, /^LYX-INT-\d{4}-001$/);
  assert.equal(r.json.data.user.role, "intern");
  assert.equal(r.json.data.user.profile.firstName, "Ada");
  assert.equal(r.json.data.user.profile.lastName, "Lovelace");
  assert.equal(r.json.data.user.passwordHash, undefined);
  assert.ok(r.json.data.accessToken);
  const raw = r.setCookie.find((c) => c.startsWith("refreshToken="));
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /Path=\/api\/auth/);
  assert.match(raw, /SameSite=Lax/i);
});

test("register: duplicate email, bad body, privilege escalation", async () => {
  const dup = await call("/auth/register", { method: "POST", body: ada });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, "EMAIL_TAKEN");

  const bad = await call("/auth/register", {
    method: "POST",
    body: { name: "A", email: "nope", password: "1" },
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.code, "VALIDATION_ERROR");
  assert.ok(bad.json.errors.length >= 3);
  assert.equal(typeof bad.json.message, "string");

  const admin = await call("/auth/register", {
    method: "POST",
    body: { ...ada, email: "evil@x.io", role: "admin" },
  });
  assert.equal(admin.status, 422);
});

test("mentor self-registration is unapproved and blocked from mentor-only routes", async () => {
  const r = await call("/auth/register", {
    method: "POST",
    body: {
      name: "Grace Hopper",
      email: "grace@loyanox.com",
      password: "compiler-1950",
      role: "mentor",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.user.isApproved, false);
  assert.match(r.json.data.user.code, /^MTR-001$/);
});

test("login, me, wrong password, unknown email", async () => {
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "ADA@loyanox.com", password: ada.password },
  });
  assert.equal(login.status, 200);
  const me = await call("/auth/me", { token: login.json.data.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.user.email, "ada@loyanox.com");

  const wrong = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: "wrong-password" },
  });
  const unknown = await call("/auth/login", {
    method: "POST",
    body: { email: "ghost@loyanox.com", password: "wrong-password" },
  });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(
    wrong.json.message,
    unknown.json.message,
    "must not reveal whether the email exists",
  );
});

test("protected routes: missing/garbage/expired tokens", async () => {
  assert.equal((await call("/auth/me")).json.code, "NO_TOKEN");
  assert.equal((await call("/auth/me", { token: "garbage" })).json.code, "INVALID_TOKEN");
  assert.equal((await call("/auth/me", { token: "garbage" })).status, 401);
});

test("account locks after 5 bad passwords, even with the right one afterwards", async () => {
  const body = { email: "grace@loyanox.com", password: "nope-nope-nope" };
  for (let i = 0; i < 5; i += 1)
    assert.equal((await call("/auth/login", { method: "POST", body })).status, 401);
  const locked = await call("/auth/login", {
    method: "POST",
    body: { email: "grace@loyanox.com", password: "compiler-1950" },
  });
  assert.equal(locked.status, 429);
  assert.equal(locked.json.code, "ACCOUNT_LOCKED");
});

test("refresh rotates the token and invalidates the old one", async () => {
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const c1 = cookieOf(login);
  const r1 = await call("/auth/refresh", { method: "POST", cookie: c1 });
  assert.equal(r1.status, 200);
  assert.ok(r1.json.data.accessToken);
  const c2 = cookieOf(r1);
  assert.notEqual(c1, c2);

  const old = db.tokens.find((t) => t.jti === verifyRefreshToken(c1.split("=")[1]).jti);
  assert.ok(old.revokedAt, "old token revoked");
  assert.equal(old.replacedBy, verifyRefreshToken(c2.split("=")[1]).jti);

  // Replaying the old token right away is a client race: rejected, but the new session survives.
  assert.equal(
    (await call("/auth/refresh", { method: "POST", cookie: c1 })).json.code,
    "TOKEN_REVOKED",
  );
  assert.equal((await call("/auth/refresh", { method: "POST", cookie: c2 })).status, 200);
});

test("refresh token reuse (after the grace window) revokes the whole family", async () => {
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const stolen = cookieOf(login);
  const legit = cookieOf(await call("/auth/refresh", { method: "POST", cookie: stolen }));

  const rec = db.tokens.find((t) => t.jti === verifyRefreshToken(stolen.split("=")[1]).jti);
  rec.revokedAt = new Date(Date.now() - 60_000); // pretend the rotation happened a minute ago

  const replay = await call("/auth/refresh", { method: "POST", cookie: stolen });
  assert.equal(replay.status, 401);
  assert.equal(replay.json.code, "TOKEN_REUSED");
  assert.equal(
    (await call("/auth/refresh", { method: "POST", cookie: legit })).status,
    401,
    "legit token dies too",
  );
});

test("refresh without / with junk cookie", async () => {
  assert.equal((await call("/auth/refresh", { method: "POST" })).json.code, "NO_REFRESH_TOKEN");
  assert.equal(
    (await call("/auth/refresh", { method: "POST", cookie: "refreshToken=junk" })).json.code,
    "INVALID_REFRESH_TOKEN",
  );
});

test("remember=false issues a session cookie with a short server-side lifetime", async () => {
  const r = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password, remember: false },
  });
  const raw = r.setCookie.find((c) => c.startsWith("refreshToken="));
  assert.doesNotMatch(raw, /Expires=/i, "session cookie has no Expires");
  const rec = db.tokens.at(-1);
  assert.equal(rec.persistent, false);
  assert.ok(rec.expiresAt - Date.now() <= 24 * 3600 * 1000 + 1000);
  const rotated = await call("/auth/refresh", { method: "POST", cookie: cookieOf(r) });
  assert.doesNotMatch(
    rotated.setCookie.find((c) => c.startsWith("refreshToken=")),
    /Expires=/i,
    "stays a session cookie after rotation",
  );
});

test("logout revokes the session and clears the cookie", async () => {
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const c = cookieOf(login);
  const out = await call("/auth/logout", { method: "POST", cookie: c });
  assert.equal(out.status, 204);
  assert.match(out.setCookie[0], /refreshToken=;/);
  assert.equal((await call("/auth/refresh", { method: "POST", cookie: c })).status, 401);
  assert.equal(
    (await call("/auth/logout", { method: "POST" })).status,
    204,
    "logout without a cookie still succeeds",
  );
});

test("profile + settings update only whitelisted fields", async () => {
  const { json } = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const token = json.data.accessToken;
  const upd = await call("/auth/profile", {
    method: "PUT",
    token,
    body: {
      headline: "Mathematician",
      skills: ["Maths", "Maths", "Poetry"],
      role: "admin",
      isApproved: false,
      location: "London",
    },
  });
  assert.equal(upd.status, 200);
  const u = upd.json.data.user;
  assert.equal(u.profile.headline, "Mathematician");
  assert.equal(u.profile.location, "London");
  assert.equal(u.profile.firstName, "Ada", "untouched fields survive");
  assert.deepEqual(u.skills, ["Maths", "Poetry"]);
  assert.equal(u.role, "intern", "role cannot be changed through the profile endpoint");

  const set = await call("/auth/settings", {
    method: "PATCH",
    token,
    body: { compactSidebar: true, notifications: { email: false, push: true } },
  });
  assert.equal(set.status, 200);
  assert.equal(set.json.data.user.settings.compactSidebar, true);
  assert.deepEqual(set.json.data.user.settings.notifications, { email: false, push: true });
});

test("change password: wrong current rejected; success signs out other devices and old access tokens", async () => {
  const a = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const other = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: ada.password },
  });
  const token = a.json.data.accessToken;

  const bad = await call("/auth/password", {
    method: "PUT",
    token,
    body: { currentPassword: "nope-nope-1", newPassword: "brand-new-pass-2" },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, "WRONG_PASSWORD");

  const ok = await call("/auth/password", {
    method: "PUT",
    token,
    body: { currentPassword: ada.password, newPassword: "brand-new-pass-2" },
  });
  assert.equal(ok.status, 200);
  assert.ok(cookieOf(ok), "current device gets a fresh session");

  assert.equal((await call("/auth/me", { token })).status, 401, "old access token is dead");
  assert.equal(
    (await call("/auth/me", { token: ok.json.data.accessToken })).status,
    200,
    "new access token works",
  );
  assert.equal(
    (await call("/auth/refresh", { method: "POST", cookie: cookieOf(other) })).status,
    401,
    "other device signed out",
  );
  assert.equal(
    (
      await call("/auth/login", {
        method: "POST",
        body: { email: "ada@loyanox.com", password: ada.password },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", {
        method: "POST",
        body: { email: "ada@loyanox.com", password: "brand-new-pass-2" },
      })
    ).status,
    200,
  );
});

test("disabled account is rejected by login, refresh and existing access tokens", async () => {
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "ada@loyanox.com", password: "brand-new-pass-2" },
  });
  db.users.find((u) => u.email === "ada@loyanox.com").isActive = false;
  assert.equal((await call("/auth/me", { token: login.json.data.accessToken })).status, 401);
  assert.equal(
    (await call("/auth/refresh", { method: "POST", cookie: cookieOf(login) })).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", {
        method: "POST",
        body: { email: "ada@loyanox.com", password: "brand-new-pass-2" },
      })
    ).status,
    403,
  );
});

test("service-level: concurrent refresh with the same token lets exactly one win", async () => {
  db.users.find((u) => u.email === "ada@loyanox.com").isActive = true;
  const login = await authService.login(
    { email: "ada@loyanox.com", password: "brand-new-pass-2", remember: true },
    {},
  );
  const results = await Promise.allSettled([
    authService.refresh(login.refresh.token, {}),
    authService.refresh(login.refresh.token, {}),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
