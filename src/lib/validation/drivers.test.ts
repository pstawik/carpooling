import { describe, expect, it } from "vitest";
import { driverFormSchema, driverSeatsSchema } from "@/lib/validation/drivers";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

// event_drivers_seats_range: seats between 1 and 8, integer column (20261113130000_create_event_drivers.sql:31).
describe("driverSeatsSchema", () => {
  it.each(["0", "9", "1.5", "abc"])("seats = %s -> failure (outside 1–8 or not an integer)", (seats) => {
    expect(driverSeatsSchema.safeParse({ seats }).success).toBe(false);
  });

  it.each([
    ["1", 1],
    ["8", 8],
  ])("seats = %s -> success (%d)", (seats, expected) => {
    const result = driverSeatsSchema.safeParse({ seats });
    expect(result.success && result.data.seats).toBe(expected);
  });
});

// Hidden fields: only "set" and "withdraw" exist in the event plan's driver forms.
describe("driverFormSchema", () => {
  it('action = "delete" -> failure (tampered form, 404)', () => {
    expect(driverFormSchema.safeParse({ group_id: GROUP_ID, event_id: EVENT_ID, action: "delete" }).success).toBe(
      false,
    );
  });

  it('action = "set" -> success (control)', () => {
    expect(driverFormSchema.safeParse({ group_id: GROUP_ID, event_id: EVENT_ID, action: "set" }).success).toBe(true);
  });
});
