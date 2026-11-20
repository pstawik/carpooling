import { describe, expect, it } from "vitest";
import { joinRedirect } from "@/lib/services/invites";
import { optionalInviteToken } from "@/lib/validation/invites";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
// 32 url-safe base64 characters: 24 random bytes, no padding (20261112130000_create_group_invites.sql:66-67).
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";

// Oracle: join-group-by-invite-link F2 — both `invalid` and `error` go back to /join/<token>, never
// to a page that looks like success (context/archive/2026-11-12-join-group-by-invite-link/reviews/impl-review.md:78).
// Observability audit G-8 (context/audits/observability/2026-11-19_groups.md:116): `error` also carries
// `?error=unknown` so the join page tells the user the attempt failed.
describe("joinRedirect", () => {
  it("joined -> the group page with message=joined", () => {
    expect(joinRedirect({ kind: "joined", groupId: GROUP_ID }, TOKEN)).toBe(`/groups/${GROUP_ID}?message=joined`);
  });

  it("already_member -> the group page with message=already_member", () => {
    expect(joinRedirect({ kind: "already_member", groupId: GROUP_ID }, TOKEN)).toBe(
      `/groups/${GROUP_ID}?message=already_member`,
    );
  });

  it("invalid -> back to /join/<token>, no message (F2)", () => {
    expect(joinRedirect({ kind: "invalid" }, TOKEN)).toBe(`/join/${TOKEN}`);
  });

  it("error -> back to /join/<token>?error=unknown (F2: not /dashboard)", () => {
    expect(joinRedirect({ kind: "error" }, TOKEN)).toBe(`/join/${TOKEN}?error=unknown`);
  });
});

// Token format: exactly 32 chars of [A-Za-z0-9_-] (20261112130000_create_group_invites.sql:66-67,85).
describe("optionalInviteToken", () => {
  it("32 valid characters -> the token", () => {
    expect(optionalInviteToken(TOKEN)).toBe(TOKEN);
  });

  it("31 characters -> null", () => {
    expect(optionalInviteToken(TOKEN.slice(0, 31))).toBeNull();
  });

  it("33 characters -> null", () => {
    expect(optionalInviteToken(`${TOKEN}a`)).toBeNull();
  });

  it("null -> null", () => {
    expect(optionalInviteToken(null)).toBeNull();
  });

  it("a character outside the url-safe alphabet (+) -> null", () => {
    expect(optionalInviteToken(`+${TOKEN.slice(1)}`)).toBeNull();
  });
});
