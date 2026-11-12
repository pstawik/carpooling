// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, readBody = false } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  const body = readBody ? await response.text() : "";
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

// SMOKE_READONLY=1 skips every step that creates users or sessions — use it against production,
// where throwaway sign-ups would pollute auth.users and profiles with test accounts.
const READONLY = process.env.SMOKE_READONLY === "1";

const readonlySteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "group page redirects anonymous user",
    () => request(`/groups/${randomUUID()}`),
    { status: 302, location: "/auth/signin" },
  ],
];

const profile = { first_name: "Rodzic", nick: "Smoke", phone: "600 123 456" };

// App admin from supabase/seed.sql (local/CI only); override for other environments.
const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "Admin-Passw0rd!";
const groupName = `Smoke ${Date.now()}`;
// A second account that is in no group, to prove isolation.
const strangerEmail = `smoke-stranger-${Date.now()}@example.com`;
// Filled from the smoke user's dashboard link once the admin has created the group.
let groupPath = "/groups/missing";

/** Reads the dashboard and remembers the link of the group named `groupName`. */
async function dashboardWithGroupLink() {
  const result = await request("/dashboard", { readBody: true });
  const at = result.body.indexOf(groupName);
  if (at !== -1) {
    const match = /\/groups\/[0-9a-f-]{36}/.exec(result.body.slice(result.body.lastIndexOf("/groups/", at), at));
    if (match) groupPath = match[0];
  }
  return result;
}

const writeSteps = [
  [
    "signup rejects missing nick",
    () => request("/api/auth/signup", { method: "POST", form: { first_name: profile.first_name, email, password } }),
    { status: 302, location: "/auth/signup?error=" },
  ],
  [
    "signup creates account and signs in",
    () => request("/api/auth/signup", { method: "POST", form: { ...profile, email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "dashboard shows profile nick",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: profile.nick },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["regular user gets 404 on admin groups", () => request("/admin/groups"), { status: 404 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "seed app admin signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email: adminEmail, password: adminPassword } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "create group rejects unknown e-mail",
    () =>
      request("/api/admin/groups", {
        method: "POST",
        form: { name: groupName, admin_emails: `nobody-${Date.now()}@example.com` },
      }),
    { status: 302, location: "/admin/groups?error=unknown_email" },
  ],
  [
    "app admin creates group with smoke user as admin",
    () => request("/api/admin/groups", { method: "POST", form: { name: groupName, admin_emails: email } }),
    { status: 302, location: "/admin/groups?message=group_created" },
  ],
  [
    "admin groups page lists the new group",
    () => request("/admin/groups", { readBody: true }),
    { status: 200, contains: groupName },
  ],
  ["admin signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "designated admin signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  ["dashboard lists the new group", dashboardWithGroupLink, { status: 200, contains: groupName }],
  ["group page renders for member", () => request(groupPath, { readBody: true }), { status: 200, contains: groupName }],
  ["member signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "stranger signs up",
    () => request("/api/auth/signup", { method: "POST", form: { ...profile, email: strangerEmail, password } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "stranger dashboard does not list the group",
    () => request("/dashboard", { readBody: true }),
    { status: 200, notContains: groupName },
  ],
  ["stranger gets 404 on the group page", () => request(groupPath), { status: 404 }],
  ["stranger signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...writeSteps];
console.log(`Smoke against ${BASE_URL}${READONLY ? " (read-only)" : ""}`);

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.contains === undefined || actual.body.includes(expected.contains)) &&
    (expected.notContains === undefined || !actual.body.includes(expected.notContains));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    const containsNote =
      expected.contains !== undefined
        ? ` (body containing "${expected.contains}")`
        : expected.notContains !== undefined
          ? ` (body without "${expected.notContains}")`
          : "";
    console.log(`      expected ${expected.status} ${expected.location ?? ""}${containsNote}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
