/**
 * End-to-end check of the auth flow against a RUNNING server and real database:
 *   npm run dev            (in one terminal)
 *   npm run smoke          (in another)
 * Creates one throwaway intern account (smoke-<timestamp>@example.com).
 */
const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const email = `smoke-${Date.now()}@example.com`;
const password = "smoke-test-password-1";
let cookie = "";
let failed = 0;

async function call(path, { method = "GET", body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && { "content-type": "application/json" }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...(cookie && { cookie }),
    },
    body: body && JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.().find((c) => c.startsWith("refreshToken="));
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function check(label, condition, extra = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  ${extra}`}`);
  if (!condition) failed += 1;
}

console.log(`Smoke testing ${BASE}\n`);
const ready = await call("/health/ready").catch((e) => ({ status: 0, json: { error: e.message } }));
check("server is up and database connected", ready.status === 200, JSON.stringify(ready.json));
if (ready.status !== 200) process.exit(1);

const reg = await call("/auth/register", {
  method: "POST",
  body: { name: "Smoke Test", email, password },
});
check("register", reg.status === 201, JSON.stringify(reg.json));
let token = reg.json?.data?.accessToken;

const me = await call("/auth/me", { token });
check(
  "me with access token",
  me.status === 200 && me.json.data.user.email === email,
  JSON.stringify(me.json),
);

const ref = await call("/auth/refresh", { method: "POST" });
check(
  "refresh rotates cookie + returns new access token",
  ref.status === 200 && !!ref.json.data?.accessToken,
  JSON.stringify(ref.json),
);
token = ref.json?.data?.accessToken ?? token;

const upd = await call("/auth/profile", {
  method: "PUT",
  token,
  body: { headline: "Smoke tester", skills: ["QA"] },
});
check(
  "profile update",
  upd.status === 200 && upd.json.data.user.profile.headline === "Smoke tester",
  JSON.stringify(upd.json),
);

const set = await call("/auth/settings", {
  method: "PATCH",
  token,
  body: { notifications: { email: false } },
});
check(
  "settings update (Map field)",
  set.status === 200 && set.json.data.user.settings.notifications.email === false,
  JSON.stringify(set.json),
);

const bad = await call("/auth/login", {
  method: "POST",
  body: { email, password: "wrong-password-1" },
});
check("wrong password rejected", bad.status === 401);

const out = await call("/auth/logout", { method: "POST" });
check("logout", out.status === 204);
const after = await call("/auth/refresh", { method: "POST" });
check("refresh after logout rejected", after.status === 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
