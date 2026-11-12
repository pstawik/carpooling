import { z } from "zod";

// Same limit as the children_name_length check in the database.
const CHILD_NAME_MAX = 40;

export const childNameSchema = z.string().trim().min(1).max(CHILD_NAME_MAX);

export const addChildSchema = z.object({
  group_id: z.uuid(),
  name: childNameSchema,
});

export const updateChildSchema = z.object({
  group_id: z.uuid(),
  child_id: z.uuid(),
  name: childNameSchema,
});

export const deleteChildSchema = z.object({
  group_id: z.uuid(),
  child_id: z.uuid(),
});

/**
 * The form's group id when only the `name` field failed, otherwise `null`. A malformed `group_id` /
 * `child_id` means a tampered form and gets a 404; a bad name is a normal user mistake that goes
 * back to the group page with an error.
 */
export function groupIdIfOnlyNameInvalid(raw: Record<string, unknown>, issues: z.core.$ZodIssue[]): string | null {
  if (!issues.every((issue) => issue.path[0] === "name")) return null;
  const groupId = z.uuid().safeParse(raw.group_id);
  return groupId.success ? groupId.data : null;
}
