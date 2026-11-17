# Panel (`/dashboard`) na kontrakcie design-systemu — Plan Brief

> Full plan: `context/changes/dashboard-ui/plan.md`
> Research: `context/changes/dashboard-ui/research.md`
> Issue: https://github.com/pstawik/carpooling/issues/52

## What & Why

Panel to pierwszy ekran po zalogowaniu, a wygląda jak ekran logowania: literały palety, ręcznie zbudowane przyciski bez obwódki fokusu, brak `Topbar`, błąd sygnalizowany tylko kolorem i pusty stan bez wskazówki. Przenosimy go na ten sam kontrakt co trzy widoki grupy, żeby aplikacja wyglądała spójnie, a każda przyszła zmiana tokenu obejmowała też panel.

## Starting Point

`src/pages/dashboard.astro` (83 linie) czyta tylko `bg-cosmic`; 11 linii z literałami, 0 importów z `ui/`, `Topbar` i `group-page-classes.ts`. Kontrakt (tokeny `.dark`, `Card`/`Badge`/`Alert`/`buttonVariants`, `Topbar`, stałe klas) istnieje i jest kompletny.

## Desired End State

Panel ma `Topbar`, nagłówek „Cześć, {imię}!” i kartę „Twoje grupy” w układzie strony grupy; wiersze grup z widocznym fokusem i pigułką `Badge`; błąd w `Alert`; pusty stan mówi, że trzeba poprosić administratora o link zaproszeniowy. Kitchen sink `/dev/ui-dashboard` pokazuje 7 stanów, a lint pilnuje, żeby literały nie wróciły.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Istniejący design system, bez nowych tokenów | Każdy literał ma rolę w `.dark` | Research |
| Układ | Jak widoki grupy (`max-w-xl` + `Topbar`) | Panel i strony grupy wyglądają jak jedna aplikacja | Plan |
| Duplikaty nawigacji | Usunąć nick i „Wyloguj” z treści; `aria-current="page"` na „Panel” w `Topbar` | Jedno miejsce na nawigację; smoke widzi nick w `Topbar` | Plan |
| Pusty stan | „… Poproś administratora grupy o link zaproszeniowy.” | Jedyna ścieżka dołączenia (PRD FR-006) | Plan |
| Stałe klas | Import z `group-page-classes.ts` + nowa stała wiersza grupy | Bez rename 6 plików | Plan |
| Kitchen sink | Osobna strona `/dev/ui-dashboard` | Precedens `/dev/ui-event`, `/dev/ui-stats` | Research |

## Scope

**In scope:**
- `src/pages/dashboard.astro`, `src/components/Topbar.astro` (`aria-current`), `group-page-classes.ts` (nowa stała, komentarz)
- `src/pages/dev/ui-dashboard.astro` (nowy), `scripts/check-ui-literals.mjs`, `AGENTS.md`

**Out of scope:**
- Strony auth, 404, `index`, `join/[token]`, `LibBadge.astro` — osobne zmiany
- Rename `group-page-classes.ts`, nowe tokeny/komponenty, nowe funkcje panelu

## Architecture / Approach

Kolejność `/10x-ui`: środowisko i tokeny N/A → widok → stany → strażnik. Najpierw podmiana na kontrakt przy starym układzie (łatwa do porównania), potem zmiana układu w osobnym commicie. Widok i sink dzielą stałe z `group-page-classes.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Widok na tokenach i komponentach | 0 literałów, `Card`/`Badge`/`Alert`/przyciski, fokus `--ring` | Kolejność `cn()`: `focusRingClass` przed `listItemClass` (promień) |
| 2. Układ i nawigacja | `Topbar`, `max-w-xl`, bez duplikatów, nowy pusty stan | Smoke: nick w HTML, `href` przed nazwą grupy |
| 3. Kitchen sink `/dev/ui-dashboard` | 7 stanów na jednej stronie, zrzuty | Sink rozjedzie się z widokiem, jeśli skopiuje klasy |
| 4. Strażnik | `CLEANED_VIEWS` 11 → 13, `AGENTS.md` | — |

**Prerequisites:** lokalny Supabase (`npx supabase start`) i `.dev.vars` do smoke i zrzutów.
**Estimated effort:** ~1 sesja, 4 małe fazy.

## Open Risks & Assumptions

- `text-muted-foreground` ma 70 % zamiast dawnych 80 % — czytelność do potwierdzenia na zrzutach (faza 3).
- Konto bez profilu: nagłówek „Cześć!”, e-mail tylko w `Topbar` — zakładamy, że to wystarcza.

## Success Criteria (Summary)

- Nowy rodzic po rejestracji widzi panel spójny z resztą aplikacji i wie, że potrzebuje linku zaproszeniowego.
- Użytkownik klawiatury widzi, na której grupie jest fokus.
- `npm run lint` pada, jeśli ktoś wróci z literałem do panelu.
