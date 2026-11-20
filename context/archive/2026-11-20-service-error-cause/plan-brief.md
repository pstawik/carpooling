# Zachowanie przyczyny błędu serwisów — Plan Brief

> Full plan: `context/changes/service-error-cause/plan.md`

## What & Why

Krok 3 planu poprawek observability (G-4, G-5, P-3). Serwisy rzucają ``new Error(`X failed: ${error.message}`)``, więc kod PostgREST, `details` i `hint` giną, a część `catch` loguje znów samo `message`. Bez kodu nie da się odróżnić awarii (`57014` timeout) od złego wdrożenia (`42P01` brak tabeli) czy wygasłego JWT (`PGRST301`).

## Starting Point

12 miejsc `throw` w `src/lib/services/*` bez `cause` (tylko `invites.ts:19` ma kod w treści), 4 bloki `catch` logujące `message`, middleware i `admin/groups.astro` logujące `message` bez kodu. Sekcje „degraded” na stronach grup już logują cały obiekt błędu.

## Desired End State

Każdy błąd serwisu ma treść `<op> failed: <code> <message>` i oryginał w `cause`; każdy log błędu w `src/` ma kod albo pełny obiekt błędu. Format pilnuje test Vitest.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Format błędu | Kod w treści + pełny `cause` | Nie wiadomo, czy Workers Logs pokazują `cause`, więc kod musi być też w treści. |
| Wykonanie | Helper `serviceError(op, error)` + test Vitest | Jeden format w 11 miejscach, a ścieżek `throw` dziś nic nie testuje. |
| PII w `cause` | Pełny `cause` wszędzie poza `invite_group_name` | `details` mogłoby zawierać token zaproszenia; ten jeden błąd zostaje z kodem i treścią. |
| Zakres | Także `admin/groups.astro:32` | Jedna linia, a w `src/` nie zostaje log z samym `message`. |

## Scope

**In scope:**
- `src/lib/service-error.ts` + test
- 11 miejsc `throw` w serwisach przez helper; `invites.ts:19` z komentarzem, bez `cause`
- 4 bloki `catch` logujące obiekt błędu
- `error.code` w `middleware.ts:66,76` i `admin/groups.astro:32`

**Out of scope:**
- Strukturalny `logError` w JSON i pole `event` (krok 4)
- Status odpowiedzi gałęzi `unknown` (krok 4), P-2 i G-8 (krok 5)
- Testy ścieżek `throw` z fałszywym klientem Supabase

## Architecture / Approach

Czysta funkcja w `src/lib/` (wzorzec `refusal-log.ts`) buduje `Error` z ustaloną treścią i `cause`; serwisy ją wywołują, a logi w `catch` przestają spłaszczać błąd do `message`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Helper i serwisy | `serviceError` + test, 11 throw przez helper | Pusty `code` dający podwójną spację (pokryte testem) |
| 2. Logi w catch i middleware | Obiekt błędu w 4 `catch`, `error.code` w middleware i panelu admina | Przypadkowe zalogowanie tokena (wykluczone: brak `cause` w `invites.ts:19`) |

**Prerequisites:** kroki 1–2 planu poprawek zakończone (PR #80–#84); `npx supabase start` do weryfikacji ręcznej.
**Estimated effort:** ~1 sesja, 2 małe fazy.

## Open Risks & Assumptions

- Nie wiadomo, jak workerd/Workers Logs renderują `cause`; weryfikacja ręczna fazy 1 to zanotuje (audyt §8).
- Zmienia się treść komunikatów; wyszukiwania po prefiksie `failed:` działają dalej.

## Success Criteria (Summary)

- Log błędu odczytu na stronie grupy podaje kod PostgREST, nie tylko treść.
- Żaden log błędu w `src/` nie gubi kodu ani stosu.
- Token zaproszenia nie trafia do logów.

## References

- `context/audits/observability/2026-11-19_groups.md`
- `context/audits/observability/2026-11-19_groups-fix-plan.md`
