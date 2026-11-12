import React, { useState } from "react";
import { Mail, Lock, UserPlus, User, AtSign, Phone } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { signUpSchema } from "@/lib/validation/auth";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  serverError?: string | null;
  /** Well-formed invite token to join with after sign-up; posted as a hidden field. */
  invite?: string | null;
}

type FieldErrors = Partial<Record<"first_name" | "nick" | "email" | "phone" | "password" | "confirmPassword", string>>;

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-blue-100/50">{children}</p>;
}

export default function SignUpForm({ serverError, invite }: Props) {
  const [firstName, setFirstName] = useState("");
  const [nick, setNick] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useSubmitting();

  function validate() {
    const next: FieldErrors = {};

    const result = signUpSchema.safeParse({ first_name: firstName, nick, email, phone, password });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        next[field] ??= issue.message;
      }
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (submitting || !validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  const missingChars = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && missingChars > 0 ? (
      <Hint>Brakujące znaki: {missingChars}</Hint>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {invite && <input type="hidden" name="invite" value={invite} />}
      <FormField
        id="first_name"
        label="Imię"
        value={firstName}
        onChange={(v) => {
          setFirstName(v);
          clearError("first_name");
        }}
        placeholder="np. Anna"
        autoComplete="given-name"
        error={errors.first_name}
        icon={<User className="size-4" />}
      />

      <FormField
        id="nick"
        label="Nick"
        value={nick}
        onChange={(v) => {
          setNick(v);
          clearError("nick");
        }}
        placeholder="np. mama Zosi"
        autoComplete="nickname"
        error={errors.nick}
        hint={<Hint>Widoczny dla innych rodziców w grupie</Hint>}
        icon={<AtSign className="size-4" />}
      />

      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="ty@example.com"
        autoComplete="email"
        inputMode="email"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="phone"
        type="tel"
        label="Telefon (opcjonalnie)"
        value={phone}
        onChange={(v) => {
          setPhone(v);
          clearError("phone");
        }}
        placeholder="np. 600 123 456"
        autoComplete="tel"
        inputMode="tel"
        error={errors.phone}
        hint={<Hint>Widoczny tylko dla członków Twoich grup</Hint>}
        icon={<Phone className="size-4" />}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Min. 6 znaków"
        autoComplete="new-password"
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło ponownie"
        autoComplete="new-password"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Tworzenie konta..." icon={<UserPlus className="size-4" />}>
        Załóż konto
      </SubmitButton>
    </form>
  );
}
