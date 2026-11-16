# Statystyki zaangażowania grupy — Plan Brief

> Full plan: `context/changes/group-engagement-stats/plan.md`

## What & Why

Członek grupy widzi na osobnej stronie surowe liczby z zakończonych terminów: ile razy każdy członek jechał jako kierowca oraz ile obecności i nieobecności ma każde dziecko (FR-017, roadmapa S-09). Cel z PRD: żeby było widać sytuację „wozimy 4 dzieci, a jeździ tylko 2 rodziców”, a ocenę zostawić grupie. To ostatni wycinek kamienia milowego M-1.

## Starting Point

Deklaracje dzieci (`child_attendance`) i kierowców (`event_drivers`) są zapisane, czytelne dla członków i zablokowane od rozpoczęcia terminu. Usunięcie dziecka kasuje jednak kaskadowo jego deklaracje także z rozpoczętych terminów, co wymazuje historię statystyk.

## Desired End State

Z karty „Terminy” na stronie grupy prowadzi link „Statystyki grupy” do `/groups/[id]/statystyki`. Strona ma listę członków z liczbą przejazdów (także „0 przejazdów”) i listę dzieci z „Obecności: X · Nieobecności: Y”, obie alfabetycznie. Bez zakończonych terminów pokazuje pusty stan. Rodzic nie może usunąć dziecka, które ma deklarację na rozpoczętym terminie, i widzi wtedy komunikat w sekcji „Dzieci”.

## Key Decisions Made

| Decision                    | Choice                                                                 | Why (1 sentence)                                                                 |
| --------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Usunięcie dziecka z historią | Blokada w polityce DELETE, gdy dziecko ma deklarację na rozpoczętym terminie | Jedna zmiana polityki chroni historię, a kaskady z grupy i profilu nadal działają. |
| Zakres terminów dziecka     | Zakończone terminy z `starts_at >= children.created_at`                | Nie przypisuje nieobecności za czas, gdy dziecka nie było w aplikacji.            |
| Definicja przejazdu         | Deklaracja kierowcy na zakończonym terminie z co najmniej jednym dzieckiem „jedzie” | Bliżej faktycznie odbytych przejazdów niż sama deklaracja.                        |
| Prezentacja nieobecności    | Jedna suma („nie jedzie” + brak deklaracji)                            | Dosłownie według PRD, najprostsze na 360 px.                                     |
| Miejsce widoku              | Osobna strona `/groups/[id]/statystyki`                                | Strona grupy jest już długa, a agregaty liczą się tylko na żądanie.               |
| Gdzie liczyć                | Dwie funkcje SQL `stable security invoker`                             | Stały rozmiar odpowiedzi, ten sam zegar `now()` co blokada, RLS decyduje o widoczności. |
| Kolejność list              | Alfabetycznie (pl), bez rankingu                                       | PRD wyklucza ocenę, kto „powinien” jeździć.                                       |

## Scope

**In scope:**
- Migracja z blokadą usuwania dziecka z historią i migracja z `group_driver_stats` / `group_child_stats`
- Testy pgTAP reguł liczenia, izolacji i blokady
- Serwis `stats.ts`, kod `child_has_history` z komunikatem
- Strona statystyk, link ze strony grupy, kroki smoke

**Out of scope:**
- Wskaźnik sprawiedliwości, ranking, filtr okresu, eksport
- Rozbicie nieobecności na „nie jedzie” i „bez deklaracji”
- Miękkie usuwanie dzieci; dziecko bez deklaracji na rozpoczętych terminach da się usunąć (jego nieobecności znikają)
- Byli członkowie (usuwanie członków, FR-007, jest zaparkowane)

## Architecture / Approach

Baza → serwis → strona Astro. Funkcje SQL zwracają po jednym wierszu na członka (`drives`) i na dziecko (`present`, `absent`) i są liczone pod RLS wywołującego. Nie-członek dostaje 0 wierszy, a strona i tak daje 404 przez `getGroupWithAdmins`. Serwis sortuje i mapuje, a strona tylko renderuje. Blokada usuwania żyje w `alter policy children_delete_own`. `deleteChild` przy 0 usuniętych wierszach sprawdza, czy dziecko należy do wywołującego, i odróżnia w ten sposób `child_has_history` od `child_not_found`.

## Phases at a Glance

| Phase                                   | What it delivers                                                        | Key risk                                                           |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Baza: blokada i funkcje statystyk    | Dwie migracje + pgTAP dowodzące reguł                                   | Podwójne liczenie przejazdu przy kilku jadących dzieciach; kwalifikacja `children.id` w polityce |
| 2. Serwis i komunikat blokady           | `getGroupStats`, `child_has_history` w usuwaniu dziecka                 | Rozróżnienie odmowy RLS (0 wierszy) od nieznanego dziecka          |
| 3. Strona statystyk, link, smoke        | Widok na 360 px, pusty stan, link, smoke                                | Smoke nie tworzy zakończonych terminów, więc liczby sprawdza tylko pgTAP i test ręczny |

**Prerequisites:** S-08 (`driver-declaration-seat-balance`) zakończony; lokalnie `npx supabase start`, `.dev.vars`.
**Estimated effort:** ~1–2 sesje, 3 fazy.

## Open Risks & Assumptions

- Zmiana polityki działa od razu na istniejących danych: dzieci z historią przestają być usuwalne przez rodzica. Nie ma dziś ścieżki „dziecko zrezygnowało z zajęć”.
- Zakres od `created_at` zakłada, że data dodania dziecka w aplikacji oznacza początek jego udziału.
- Liczba „Zakończone terminy” pochodzi z zegara Workera, a funkcje używają `now()` z bazy. Na granicy startu terminu mogą się chwilowo różnić o jeden termin.

## Success Criteria (Summary)

- Członek otwiera statystyki ze strony grupy i widzi przejazdy każdego członka oraz obecności i nieobecności każdego dziecka, zgodne z deklaracjami zakończonych terminów.
- Historia statystyk nie znika: rodzic nie może usunąć dziecka z deklaracją na rozpoczętym terminie i dostaje czytelny komunikat.
- Nie-członek dostaje 404, a strona działa na 360 px bez przewijania w poziomie.
