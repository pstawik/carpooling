---
change_id: auth-signin-ui
title: Sign-in view on design tokens, with an autofill colour from the app palette
status: impl_reviewed
created: 2026-11-17
updated: 2026-11-18
archived_at: null
---

## Notes

- **View (one):** `/auth/signin` — `src/pages/auth/signin.astro` + `src/components/auth/` (`SignInForm`, `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`).
- **Token source:** `src/styles/global.css` (values in `.dark`, published via `@theme inline`); components in `src/components/ui/` (`input`, `alert`, `button`, `card`).
- **Contract variant:** existing design system — extend it, no second `shadcn init`, no second palette.
- **Motivating bug:** after browser autofill the fields turn mustard (UA `:autofill` background through translucent `bg-white/10`). User decision: replace it with the app's purple — a darkened, opaque `--primary` as a new `--autofill` role, text `--primary-foreground`; contrast to verify.
- **Scope open for /10x-plan:** auth components are shared with `/auth/signup` — include `signup.astro` or leave it for a separate change.
- **GitHub issue:** https://github.com/pstawik/carpooling/issues/54
- **Pre-audit:** 15 literal lines in the sign-in path (+1 in `SignUpForm.tsx`); 1 `ui/` import (`SubmitButton`).
