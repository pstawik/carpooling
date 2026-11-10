import { z } from "zod";

// Same rule as the profiles_phone_format check in the database.
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

const emailSchema = z
  .string({ error: "Podaj adres e-mail" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Podaj prawidłowy adres e-mail" }));

const phoneSchema = z
  .string({ error: "Podaj prawidłowy numer telefonu" })
  .optional()
  .transform((value) => {
    const normalized = (value ?? "").replace(/[\s\-()]/g, "");
    return normalized === "" ? undefined : normalized;
  })
  .pipe(
    z
      .string()
      .regex(PHONE_PATTERN, { error: "Numer telefonu musi mieć 9–15 cyfr (opcjonalnie z + na początku)" })
      .optional(),
  );

// confirmPassword is checked only in the browser; unknown keys are stripped here.
export const signUpSchema = z.object({
  first_name: z
    .string({ error: "Podaj imię" })
    .trim()
    .min(1, { error: "Podaj imię" })
    .max(50, { error: "Imię może mieć najwyżej 50 znaków" }),
  nick: z
    .string({ error: "Podaj nick" })
    .trim()
    .min(1, { error: "Podaj nick" })
    .max(30, { error: "Nick może mieć najwyżej 30 znaków" }),
  email: emailSchema,
  password: z.string({ error: "Podaj hasło" }).min(6, { error: "Hasło musi mieć co najmniej 6 znaków" }),
  phone: phoneSchema,
});

export const signInSchema = z.object({
  email: z.string({ error: "Podaj adres e-mail" }).trim().toLowerCase().min(1, { error: "Podaj adres e-mail" }),
  password: z.string({ error: "Podaj hasło" }).min(1, { error: "Podaj hasło" }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
