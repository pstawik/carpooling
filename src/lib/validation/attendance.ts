import { z } from "zod";

/**
 * One child's declaration from the event plan's "Jedzie" / "Nie jedzie" buttons. Every field comes
 * from hidden inputs or the button value, so any failure means a tampered form and gets a 404.
 */
export const setAttendanceSchema = z.object({
  group_id: z.uuid(),
  event_id: z.uuid(),
  child_id: z.uuid(),
  going: z.enum(["true", "false"]).transform((going) => going === "true"),
});
