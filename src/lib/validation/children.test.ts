import { describe, expect, it } from "vitest";
import { addChildSchema, groupIdIfOnlyNameInvalid } from "@/lib/validation/children";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";

// children_name_length: 1–40 after trim (20261112140000_create_children.sql:18).
// A bad name is a user mistake (redirect with invalid_child_name); a bad group_id is a tampered form (404).
describe("addChildSchema + groupIdIfOnlyNameInvalid", () => {
  function onlyNameGroupId(input: Record<string, unknown>) {
    const result = addChildSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? "parsed" : groupIdIfOnlyNameInvalid(input, result.error.issues);
  }

  it("40-character name -> success (children_name_length <= 40)", () => {
    expect(addChildSchema.safeParse({ group_id: GROUP_ID, name: "a".repeat(40) }).success).toBe(true);
  });

  it("41-character name -> the group id (redirect invalid_child_name)", () => {
    expect(onlyNameGroupId({ group_id: GROUP_ID, name: "a".repeat(41) })).toBe(GROUP_ID);
  });

  it("whitespace-only name -> the group id (check trims: char_length(trim(name)) >= 1)", () => {
    expect(onlyNameGroupId({ group_id: GROUP_ID, name: "   " })).toBe(GROUP_ID);
  });

  it("malformed group_id with a valid name -> null (404)", () => {
    expect(onlyNameGroupId({ group_id: "not-a-uuid", name: "Ola" })).toBeNull();
  });

  it("malformed group_id and a bad name -> null (404 wins)", () => {
    expect(onlyNameGroupId({ group_id: "not-a-uuid", name: "a".repeat(41) })).toBeNull();
  });
});
