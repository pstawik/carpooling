import { z } from "zod";
import { emailSchema } from "@/lib/validation/auth";

export { emailSchema };

// Same limits as the groups_name_length check in the database.
const NAME_MAX = 80;
const MAX_ADMIN_EMAILS = 10;

/** Splits a free-text field on commas, semicolons, whitespace or newlines into unique, lower-cased e-mails. */
function splitEmails(value: string): string[] {
  const parts = value
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
  return [...new Set(parts)];
}

export const createGroupSchema = z.object({
  name: z
    .string({ error: "Podaj nazwę grupy" })
    .trim()
    .min(1, { error: "Podaj nazwę grupy" })
    .max(NAME_MAX, { error: `Nazwa grupy może mieć najwyżej ${NAME_MAX} znaków` }),
  admin_emails: z
    .string({ error: "Podaj adresy e-mail administratorów" })
    .transform(splitEmails)
    .pipe(
      z
        .array(z.email({ error: "Podaj prawidłowe adresy e-mail" }))
        .min(1, { error: "Podaj co najmniej jeden adres e-mail" })
        .max(MAX_ADMIN_EMAILS, { error: `Podaj najwyżej ${MAX_ADMIN_EMAILS} adresów e-mail` }),
    ),
});

export const addGroupAdminSchema = z.object({
  group_id: z.uuid({ error: "Nieprawidłowa grupa" }),
  email: emailSchema,
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AddGroupAdminInput = z.infer<typeof addGroupAdminSchema>;
