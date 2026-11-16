import { z } from "zod";

/**
 * The hidden fields of the event plan's driver forms. They never come from typing, so any failure
 * means a tampered form and gets a 404.
 */
export const driverFormSchema = z.object({
  group_id: z.uuid(),
  event_id: z.uuid(),
  action: z.enum(["set", "withdraw"]),
});

/**
 * The seats the member typed, checked only for `action = "set"`. A failure is a form error shown
 * next to the field (`invalid_driver_seats`), not a 404. The table's check is the second line.
 */
export const driverSeatsSchema = z.object({
  seats: z.coerce.number().int().min(1).max(8),
});
