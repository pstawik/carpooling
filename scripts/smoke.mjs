// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { randomBytes, randomUUID } from "node:crypto";

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
  // 24 random bytes in url-safe base64: a well-formed token that matches no group.
  ["unknown invite link renders 404", () => request(`/join/${randomBytes(24).toString("base64url")}`), { status: 404 }],
];

const profile = { first_name: "Rodzic", nick: "Smoke", phone: "600 123 456" };

// App admin from supabase/seed.sql (local/CI only); override for other environments.
const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "Admin-Passw0rd!";
const groupName = `Smoke ${Date.now()}`;
// A second account that is in no group, to prove isolation.
const strangerEmail = `smoke-stranger-${Date.now()}@example.com`;
// A brand-new account that signs up straight from the invite link.
const joinerEmail = `smoke-joiner-${Date.now()}@example.com`;
// Filled from the smoke user's dashboard link once the admin has created the group.
let groupPath = "/groups/missing";
// Filled from the group page once the designated admin has generated the invite link.
let inviteToken = "missing";
let oldInviteToken = "missing";

const groupId = () => groupPath.slice("/groups/".length);

// Unique per run, so `contains` / `notContains` can't match other text on the page.
const childSuffix = randomBytes(4).toString("hex");
const childName = `Dziecko-${childSuffix}`;
const childRenamed = `Dziecko-${childSuffix}-K`;
const childToDelete = `Dziecko-${childSuffix}-B`;
// Filled from the group page once the stranger (by then a member) has added the child.
let childId = "missing";
let childToDeleteId = "missing";

/** Id of the own child named `name`, read from the hidden `child_id` field rendered after it. */
function childIdAfterName(body, name) {
  const at = body.indexOf(`>${name}<`);
  if (at === -1) return "missing";
  const match = /name="child_id" value="([0-9a-f-]{36})"/.exec(body.slice(at));
  return match ? match[1] : "missing";
}

/** Reads the group page and remembers the id of the child named `childName`. */
async function groupPageWithChildId() {
  const result = await request(groupPath, { readBody: true });
  childId = childIdAfterName(result.body, childName);
  return result;
}

const addChildForm = (name) => () =>
  request("/api/groups/children", { method: "POST", form: { group_id: groupId(), name } });

/** Reads the group page and remembers the invite token shown to the group admin. */
async function groupPageWithInviteToken() {
  const result = await request(groupPath, { readBody: true });
  const match = /\/join\/([A-Za-z0-9_-]{32})/.exec(result.body);
  if (match) inviteToken = match[1];
  return result;
}

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
  [
    "group admin generates invite link",
    () => request("/api/groups/invite", { method: "POST", form: { group_id: groupId() } }),
    { status: 302, location: () => `${groupPath}?message=invite_ready` },
  ],
  ["group page shows the invite link", groupPageWithInviteToken, { status: 200, contains: "/join/" }],
  ["member signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "anonymous invite page shows the group name",
    () => request(`/join/${inviteToken}`, { readBody: true }),
    { status: 200, contains: groupName },
  ],
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
  [
    "new user signs up with invite and joins",
    () =>
      request("/api/auth/signup", {
        method: "POST",
        form: { ...profile, email: joinerEmail, password, invite: inviteToken },
      }),
    { status: 302, location: () => `${groupPath}?message=joined` },
  ],
  ["group page renders for new member", () => request(groupPath), { status: 200 }],
  ["new member signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "stranger signs in with invite and joins",
    () =>
      request("/api/auth/signin", { method: "POST", form: { email: strangerEmail, password, invite: inviteToken } }),
    { status: 302, location: () => `${groupPath}?message=joined` },
  ],
  [
    "joining again reports already member",
    () => request("/api/groups/join", { method: "POST", form: { token: inviteToken } }),
    { status: 302, location: () => `${groupPath}?message=already_member` },
  ],
  ["member adds a child", addChildForm(childName), { status: 302, location: () => `${groupPath}?message=child_added` }],
  [
    "adding the same name again reports a duplicate",
    addChildForm(` ${childName.toUpperCase()} `),
    { status: 302, location: () => `${groupPath}?error=duplicate_child` },
  ],
  [
    "adding an empty name is rejected",
    addChildForm("   "),
    { status: 302, location: () => `${groupPath}?error=invalid_child_name` },
  ],
  ["group page shows the child", groupPageWithChildId, { status: 200, contains: childName }],
  [
    "member renames the child",
    () =>
      request("/api/groups/children/update", {
        method: "POST",
        form: { group_id: groupId(), child_id: childId, name: childRenamed },
      }),
    { status: 302, location: () => `${groupPath}?message=child_updated` },
  ],
  [
    "group page shows the new name",
    () => request(groupPath, { readBody: true }),
    { status: 200, contains: childRenamed },
  ],
  [
    "member adds a second child",
    addChildForm(childToDelete),
    { status: 302, location: () => `${groupPath}?message=child_added` },
  ],
  [
    "member deletes the second child",
    async () => {
      childToDeleteId = childIdAfterName((await request(groupPath, { readBody: true })).body, childToDelete);
      return request("/api/groups/children/delete", {
        method: "POST",
        form: { group_id: groupId(), child_id: childToDeleteId },
      });
    },
    { status: 302, location: () => `${groupPath}?message=child_deleted` },
  ],
  [
    "group page no longer shows the deleted child",
    () => request(groupPath, { readBody: true }),
    { status: 200, notContains: childToDelete },
  ],
  [
    "adding a child with a malformed group id renders 404",
    () => request("/api/groups/children", { method: "POST", form: { group_id: "not-a-uuid", name: childName } }),
    { status: 404 },
  ],
  ["stranger signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "designated admin signs in again",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "another member sees the child",
    () => request(groupPath, { readBody: true }),
    { status: 200, contains: childRenamed },
  ],
  [
    "another member cannot delete the child",
    () => request("/api/groups/children/delete", { method: "POST", form: { group_id: groupId(), child_id: childId } }),
    { status: 302, location: () => `${groupPath}?error=child_not_found` },
  ],
  [
    "the child is still in the group",
    () => request(groupPath, { readBody: true }),
    { status: 200, contains: childRenamed },
  ],
  [
    "group admin regenerates invite link",
    () => {
      oldInviteToken = inviteToken;
      return request("/api/groups/invite", { method: "POST", form: { group_id: groupId() } });
    },
    { status: 302, location: () => `${groupPath}?message=invite_ready` },
  ],
  [
    "joining with the old token redirects to its join page",
    () => request("/api/groups/join", { method: "POST", form: { token: oldInviteToken } }),
    { status: 302, location: () => `/join/${oldInviteToken}` },
  ],
  ["old invite link renders 404", () => request(`/join/${oldInviteToken}`), { status: 404 }],
  ["admin signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...writeSteps];
console.log(`Smoke against ${BASE_URL}${READONLY ? " (read-only)" : ""}`);

let failed = 0;
for (const [name, run, raw] of steps) {
  const actual = await run();
  // A location may depend on values captured by earlier steps (group id, invite token): resolve it late.
  const expected = { ...raw, location: typeof raw.location === "function" ? raw.location() : raw.location };
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
