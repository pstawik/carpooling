# Group stats UI — Plan Brief

> Full plan: `context/changes/group-stats-ui/plan.md`
> Research: `context/changes/group-stats-ui/research.md`

## What & Why

Widok statystyk grupy `/groups/[id]/statystyki` jest ostatnim widokiem grupy, który nie korzysta z design-systemu: 11 linii z literałami palety, 0 tokenów, 0 komponentów z `ui/`. Przez to wygląda inaczej niż strona grupy i plan terminu, błąd ładowania sygnalizuje tylko kolorem, a „Wróć do grupy” nie ma widocznego fokusu. Issue: #49.

## Starting Point

Kontrakt istnieje i działa w dwóch widokach: tokeny `.dark` w `global.css`, `Card`/`Alert` w `src/components/ui/`, stałe w `group-page-classes.ts`, kitchen sinki `/dev/ui-group` i `/dev/ui-event`, guard `CLEANED_VIEWS` w lincie. Wartości tokenów pokrywają literały tego widoku 1:1 dla kart, wierszy i tekstu wyciszonego.

## Desired End State

Członek grupy widzi statystyki w tym samym stylu co resztę grupy: nazwa grupy nad nagłówkiem „Statystyki”, błąd w czerwonym `Alert` z ikoną, standardowy przycisk powrotu z obwódką fokusu. Nowa grupa widzi jedną kartę „Brak zakończonych terminów…”, a nie licznik 0 z regułami. `/dev/ui-stats` pokazuje 7 stanów, a lint pilnuje, by literały nie wróciły.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Istniejący design system, bez nowych tokenów i komponentów | Każdy literał ma gotową rolę w `.dark`. | Research |
| Pusty stan | Jedna karta, sam komunikat; licznik i reguły tylko z danymi | Jedna jasna informacja zamiast „0” i reguł przy braku danych. | Plan |
| Nagłówek | Nazwa grupy jako wyciszony wiersz + `h1` „Statystyki” | Wzór planu terminu, krótki `h1` na 360 px. | Plan |
| Kitchen sink | Nowa strona `/dev/ui-stats` | Osobny zrzut na widok, precedens `/dev/ui-event`. | Plan |
| Pusta lista kierowców | Bez osobnego stanu | SQL zwraca wiersz na każdego członka, więc lista ma ≥1 wiersz. | Research |
| Teksty smoke | „Statystyki” i „Brak zakończonych terminów” zostają | `smoke.mjs:621` ich wymaga. | Research |

## Scope

**In scope:**
- `statystyki.astro` na `Card`, `Alert`, `listItemClass`, `linkButtonClass`, klasach tokenowych
- Nowy nagłówek, jedna karta pustego stanu, regiony z `aria-labelledby`
- `/dev/ui-stats` z 7 stanami
- `CLEANED_VIEWS` (+2 pliki) i wpis w AGENTS.md § UI

**Out of scope:**
- Serwis, SQL, RLS, reguły liczenia, treści etykiet
- Nowe tokeny i komponenty shadcn
- Inne widoki, zmiana nazwy `group-page-classes.ts`, Playwright

## Architecture / Approach

Czysty markup SSR w Astro, bez wysp React. Kolejność `/10x-ui`: biblioteka i tokeny są N/A, więc zaczynamy od widoku (faza 1 neutralna wizualnie poza nagłówkiem, błędem i przyciskiem), potem zmiana struktury pustego stanu (faza 2), bramka wizualna (faza 3) i strażnik (faza 4).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Widok na tokenach i komponentach | 0 literałów, `Card`/`Alert`/`linkButtonClass`, nowy nagłówek | Promień i cień `Card` odrobinę inne niż dziś |
| 2. Pusty stan i regiony | Jedna karta przy 0 terminach, 3 regiony z nazwami | Smoke zależy od tekstu pustego stanu |
| 3. Kitchen sink `/dev/ui-stats` | 7 stanów, zrzuty desktop + 360 px | Stan „są dane” tylko w sinku — lokalnie wymaga terminu w przeszłości |
| 4. Strażnik | `CLEANED_VIEWS` 11 plików, AGENTS.md | Brak |

**Prerequisites:** `npx supabase start`, `.dev.vars`, serwer dev uruchomiony przez użytkownika do smoke i zrzutów.
**Estimated effort:** ~1 sesja, 4 małe fazy.

## Open Risks & Assumptions

- Stan „są dane” sprawdzany ręcznie wymaga terminu z `starts_at` w przeszłości (Supabase Studio); smoke go nie tworzy.
- Wygląd fokusu „Wróć do grupy” przed zmianą jest inferencją z CSS — potwierdzi go zrzut.

## Success Criteria (Summary)

- Statystyki wyglądają spójnie ze stroną grupy i planem terminu na 360 px i desktopie.
- Nowa grupa widzi jedną, jasną informację o braku statystyk.
- `npm run lint` łapie każdy nowy literał w widoku i w jego kitchen sinku.
