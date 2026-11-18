---
date: 2026-11-18T07:51:00+01:00
researcher: Claude (Opus 5.5)
git_commit: 877128824af16de6c70706c9ddde319472944c0d
branch: main
repository: carpooling
topic: "Gdzie i jak liczone są bilans miejsc i statystyki zaangażowania — podstawa testów ryzyk #1 i #6 (rollout Phase 1)"
tags: [research, testing, seat-balance, engagement-stats, pgtap, vitest]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (Opus 5.5)
---

# Research: bilans miejsc i statystyki na danych granicznych

**Date**: 2026-11-18T07:51:00+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 877128824af16de6c70706c9ddde319472944c0d
**Branch**: main
**Repository**: carpooling

## Research Question

Dla fazy 1 planu testów (`context/foundation/test-plan.md:69`, ryzyka #1 i #6) ustalić to, co
tabela Risk Response Guidance (`test-plan.md:54`, `:59`) każe ugruntować:

- **#1:** gdzie liczony jest bilans (SQL czy TS), jakie wiersze wchodzą do sumy, jak traktowane są
  deklaracje byłych członków i dzieci bez deklaracji.
- **#6:** gdzie liczone są statystyki, która definicja „zakończony” obowiązuje, jak traktowani są
  byli członkowie.
- Która warstwa testu jest najtańsza z prawdziwym sygnałem (pgTAP vs unit / Vitest) i co już jest pokryte.

## Summary

- **Bilans (#1) jest liczony w TS**, w czystej funkcji `buildSeatBalance`
  (`src/lib/services/drivers.ts:94-99`). Wejścia: wszystkie wiersze `event_drivers` terminu
  widoczne dla oglądającego (`drivers.ts:34-51`) oraz `plan.going.length` z `buildChildPlan`
  (`src/lib/services/attendance.ts:71-84`), wywołane w `src/pages/groups/[id]/terminy/[eventId].astro:71-79`.
  Ostrzeżenie renderuje się wtedy i tylko wtedy, gdy `status === "shortage"` (`[eventId].astro:125-132`),
  a `shortage` zachodzi przy `going > 0 && seats < going` (`drivers.ts:97`). Obie funkcje są czyste,
  więc test jednostkowy nie wymaga Supabase. Projekt nie ma runnera testów jednostkowych
  (`package.json:5-14`, AGENTS.md §Testing).
- **Luka w produkcie, nie tylko w testach:** kierowca usunięty z grupy **nadal dokłada miejsc**
  na przyszłych terminach przy obecnym modelu danych. `event_drivers` nie ma klucza obcego do
  `group_members` (`supabase/migrations/20261113130000_create_event_drivers.sql:26-38`), polityka
  SELECT sprawdza członkostwo oglądającego, nie kierowcy (`:69-73`), a `listEventDrivers` nie
  filtruje po członkostwie (`drivers.ts:35-38`). Istniejący pgTAP potwierdza, że wiersz zostaje po
  usunięciu członka (`supabase/tests/event_drivers_rls.test.sql:347-350`). PRD wymaga, by
  deklaracje na przyszłe terminy były usuwane (`context/foundation/prd.md:147`). Test intencji
  „kierowca usunięty z grupy nie dokłada miejsc” będzie dziś **czerwony**.
- **Statystyki (#6) są liczone w SQL**, w funkcjach `group_driver_stats` i `group_child_stats`
  (`supabase/migrations/20261116130000_create_engagement_stats.sql:29-61`, `:72-96`), które działają
  jako `security invoker`. „Zakończony” = `starts_at <= now()` na zegarze bazy (`:3`, `:43`, `:89`).
  Nieobecność = (terminy zakończone w zakresie dziecka) − obecności (`:84`). Zakres zaczyna się od
  `children.created_at` (`:90`). Najtańsza warstwa to pgTAP. Plik `supabase/tests/engagement_stats.test.sql`
  już istnieje (15 asercji), z wartościami policzonymi ręcznie w komentarzach.
- **Dwie reguły statystyk wykraczają poza tekst PRD** i trzeba je potwierdzić jako wyrocznię
  w planie: (a) przejazd liczy się tylko wtedy, gdy na termin jechało co najmniej jedno dziecko
  (`engagement_stats.sql:49-53`; decyzja w `context/archive/2026-11-16-group-engagement-stats/plan.md:28`, `:47`);
  (b) zakres dziecka zaczyna się od jego dodania (`:90`). Poza tym `group_driver_stats` wymienia
  tylko **obecnych** członków (`:55-57`), więc przejazdy usuniętego członka znikają ze statystyk,
  choć PRD mówi, że deklaracje z zakończonych terminów „zostają w statystykach” (`prd.md:147`).
  Tę lukę świadomie wyłączono z zakresu w `archive/.../group-engagement-stats/plan.md:51`.

## Detailed Findings

### Bilans miejsc — miejsce obliczenia i wejścia (#1)

- `buildSeatBalance(drivers, goingCount)` (`src/lib/services/drivers.ts:94-99`):
  `seats = Σ driver.seats`; `missing = max(0, goingCount − seats)`;
  `status = goingCount === 0 ? "none_going" : seats < goingCount ? "shortage" : "enough"`.
  Konsekwencje dla przypadków granicznych, wyprowadzone z tej linii:
  - `going == seats` → `enough` (granica równości);
  - `going > 0`, brak kierowców → `shortage`, `missing = going`;
  - `going == 0`, dowolne `seats` → `none_going`, bez ostrzeżenia i bez „Miejsc wystarcza”.
- `goingCount` to `plan.going.length` (`[eventId].astro:79`). `buildChildPlan` (`attendance.ts:71-84`)
  wkłada dziecko do `going` tylko przy `attendance.get(id) === true`. Brak wiersza daje
  `undeclared` → `notGoing` z `undeclared: true` (`:74-80`), więc dziecko bez deklaracji nie
  zwiększa zapotrzebowania, ale jest oznaczone. Zgadza się to z PRD (`prd.md:59`, `:124`, FR-014 `:104`).
- Zbiór dzieci pochodzi z `listGroupChildren` (`src/lib/services/children.ts:36-40`, `.eq("group_id", …)`)
  bez filtra członkostwa rodzica. Dzieci rodzica usuniętego z grupy zostają więc w planie, a ich
  deklaracje „jedzie” na przyszłe terminy nadal liczą się do `going`. Wiersz `child_attendance`
  zostaje po usunięciu członka (`supabase/tests/child_attendance_rls.test.sql:372-373`). Kwestia jest
  otwarta w roadmapie (`context/foundation/roadmap.md:165`).
- Zbiór kierowców: `listEventDrivers` (`drivers.ts:34-51`) wybiera każdy wiersz `event_drivers`
  z `event_id`, który przejdzie RLS. Polityka `event_drivers_select_group_member`
  (`20261113130000_create_event_drivers.sql:69-73`) sprawdza `is_group_member(group_id)`,
  czyli członkostwo **oglądającego**. Klucze obce `event_drivers` to `profiles` i `events`
  (`:28`, `:36-37`), nie `group_members`. W `supabase/migrations/` nie ma triggera ani funkcji, która
  przy usunięciu z `group_members` usuwa deklaracje (sprawdzone: grep `trigger|on delete|delete from public.(event_drivers|child_attendance)`
  w `supabase/migrations/`; jedyny trigger to signup w `20261109120000_create_profiles.sql:57`).
- Ograniczenia danych wpływające na fixture: `seats` 1–8 (`create_event_drivers.sql:31`), jedna
  deklaracja na członka na termin (PK `(event_id, user_id)`, `:34`). Tylko członek może się zadeklarować
  (`:75-88`), a po usunięciu `set_event_driver` rzuca 42501 (`event_drivers_rls.test.sql:355-358`).
- Render: wiersz `goingLabel · seatsLabel` (`[eventId].astro:124`), ostrzeżenie `missingLabel`
  w `<Alert variant="destructive" role="alert">` dla `shortage` (`:125-132`), „Miejsc wystarcza” dla
  `enough` (`:133-138`), tekst „Żadne dziecko jeszcze nie jedzie” dla `none_going` (`:139-141`).
  Błąd wczytania daje „Nie udało się wczytać planu” zamiast bilansu (`:113-117`), nie pozorny sukces.

### Bilans — istniejące pokrycie (#1)

- Smoke (`scripts/smoke.mjs:572-614`) sprawdza na działającym serwerze trzy przejścia: niedobór
  („Jedzie 1 dziecko · 0 miejsc”, „Brakuje 1 miejsca”) → wystarcza (1 dziecko · 2 miejsca) → niedobór
  po wycofaniu. Brak przypadków: kilku kierowców, równości `going == seats`, dzieci bez deklaracji
  obok jadących, usuniętego kierowcy.
- Plan archiwum zapisał, że `buildSeatBalance` nie ma testu jednostkowego z powodu braku frameworka
  (`context/archive/2026-11-13-driver-declaration-seat-balance/plan.md:284`).

### Statystyki — miejsce obliczenia i reguły (#6)

- `group_driver_stats(p_group_id)` (`20261116130000_create_engagement_stats.sql:29-61`): jeden wiersz
  na wiersz `group_members` grupy (`:55-57`). `drives` = liczba terminów grupy z `starts_at <= now()`,
  na których członek ma wiersz `event_drivers` **i** co najmniej jedno dziecko ma `going` (`:40-53`).
  Każdy termin liczy się raz (`exists`, nie join). Strażnik `is_group_member(p_group_id)` (`:60`)
  odcina admina aplikacji spoza grupy.
- `group_child_stats(p_group_id)` (`:72-96`): jeden wiersz na dziecko grupy. Zakres to terminy grupy
  z `starts_at <= now()` i `starts_at >= c.created_at` (`:87-90`). `present` = liczba `ca.going`
  w zakresie (`:83`), `absent` = `count(e.id) − present` (`:84`), więc jawne „nie jedzie” i brak
  wiersza liczą się tak samo.
- „Zakończony”: zegar bazy, `starts_at <= now()`, ta sama chwila co blokada deklaracji (`:2-3`; blokada
  `starts_at > now()` w `create_event_drivers.sql:86`). Termin z `starts_at = now()` jest więc
  zakończony i zablokowany jednocześnie. W pgTAP `now()` jest stałe w transakcji
  (`engagement_stats.test.sql:7-8`), więc granicę da się ustawić deterministycznie.
- Drugi zegar: licznik „Zakończone terminy: N” na stronie statystyk liczy w TS `countFinishedEvents`
  z `now` Workera (`src/lib/services/stats.ts:46-56`, wywołanie `src/pages/groups/[id]/statystyki.astro:33`).
  Liczby przejazdów i obecności pochodzą wyłącznie z zegara bazy. Rozjazd dotyczy tylko licznika
  i tylko terminu, którego start wypada między odczytem zegara Workera a zapytaniem.
- Warstwa TS `getGroupStats` (`stats.ts:63-92`) tylko mapuje pola i sortuje (kierowcy po nicku,
  dzieci po imieniu, `pl`). Nie liczy niczego.

### Statystyki — byli członkowie i usunięcia (#6)

- Usunięty członek znika z listy kierowców razem z przejazdami, bo źródłem wierszy jest
  `group_members` (`engagement_stats.sql:55-57`). PRD `prd.md:147` mówi, że deklaracje z zakończonych
  terminów „zostają w statystykach”. Plan archiwum świadomie ograniczył listę do obecnych członków,
  bo usuwania członków nie ma (`archive/2026-11-16-group-engagement-stats/plan.md:51`; FR-007
  zaparkowane w `roadmap.md:217`).
- Dzieci rodzica usuniętego z grupy zostają w `group_child_stats`, bo funkcja nie łączy się
  z `group_members` (`:85-95`).
- Usunięcie dziecka z deklaracją na rozpoczętym terminie blokuje polityka
  (`supabase/migrations/20261116120000_lock_child_delete_with_history.sql:4-27`). Trwałość historii
  to ryzyko #2 / faza 2, poza tym zakresem.

### Statystyki — istniejące pokrycie (#6)

`supabase/tests/engagement_stats.test.sql` (plan 15) już sprawdza na ręcznie opisanym fixture
(`:79-138`): przejazd wymaga jadącego dziecka (T5), termin liczy się raz przy dwóch jadących dzieciach
(T3), przyszły termin jest pominięty (T4), członek z 0 jest na liście (D), zakres od `created_at`
(Zosia, T1), brak deklaracji to nieobecność (Zosia, T5), izolacja G1/G2, admin aplikacji spoza grupy,
`anon`. **Brak** w tym pliku: terminu dokładnie w `now()` (granica `<=`), terminu sekundę po `now()`,
dziecka dodanego dokładnie w chwili startu terminu (granica `>=`), byłego członka (kierowcy i rodzica),
terminu z jawnym „nie jedzie” u wszystkich dzieci przy zadeklarowanym kierowcy (T5 ma tylko jedno
dziecko „nie jedzie” i jedno bez deklaracji).

### Warstwa testu i bootstrap

- #6: logika jest w SQL, więc pgTAP przez `supabase test db`, uruchamiany już w CI (`.github/workflows/ci.yml:45-46`).
- #1: logika jest w TS i jest czysta (`buildSeatBalance`, `buildChildPlan`), więc test jednostkowy
  daje sygnał bez bazy. Runner nie istnieje: brak skryptu `test` (`package.json:5-14`) i brak kroku
  unit w CI (`ci.yml:9-25`). Bootstrap musi rozwiązać alias `@/*` (`tsconfig.json:8-10`), którego
  używają oba moduły (`drivers.ts:2`, `attendance.ts:2-3`, importy tylko typów). Test-plan wskazuje
  Vitest jako kandydata (`test-plan.md:81`) i robi z unit gate wymagany po fazie 1 (`:99`).
- Zachowanie „kierowca usunięty nie dokłada miejsc” zależy od danych w bazie (które wiersze istnieją
  po usunięciu członka), nie od `buildSeatBalance`. Test jednostkowy go nie złapie. Potrzebny jest
  pgTAP po stronie usunięcia (albo filtr odczytu, zależnie od decyzji w Open Questions).

## Code References

- `src/lib/services/drivers.ts:94-99` — `buildSeatBalance`, reguła statusu i braku
- `src/lib/services/drivers.ts:34-51` — `listEventDrivers`, wejście sumy miejsc (bez filtra członkostwa)
- `src/lib/services/attendance.ts:71-84` — `buildChildPlan`, `going` / `undeclared`
- `src/lib/services/children.ts:36-40` — `listGroupChildren`, wszystkie dzieci grupy
- `src/pages/groups/[id]/terminy/[eventId].astro:71-79`, `:113-141` — złożenie i render bilansu
- `src/lib/plural.ts:13-25` — `seatsLabel`, `goingLabel`, `missingLabel`
- `supabase/migrations/20261113130000_create_event_drivers.sql:26-38`, `:69-73` — model i SELECT `event_drivers`
- `supabase/migrations/20261116130000_create_engagement_stats.sql:29-61`, `:72-96` — funkcje statystyk
- `src/lib/services/stats.ts:46-56` — licznik zakończonych terminów na zegarze Workera
- `supabase/tests/engagement_stats.test.sql:79-169` — fixture i oczekiwane liczby statystyk
- `supabase/tests/event_drivers_rls.test.sql:347-358` — wiersz kierowcy zostaje po usunięciu członka
- `supabase/tests/child_attendance_rls.test.sql:372-373` — wiersz deklaracji dziecka zostaje po usunięciu członka
- `scripts/smoke.mjs:572-614` — smoke trzech stanów bilansu

## Architecture Insights

- Podział: reguły liczenia, które muszą działać pod RLS na wielu terminach, siedzą w SQL `security invoker`
  (statystyki). Reguły dla jednego terminu siedzą w czystych funkcjach TS nad danymi już odczytanymi
  pod RLS (bilans). Testy idą za tym podziałem.
- „Brak wiersza = nie jedzie / nie jedzie jako kierowca” jest modelem danych (`create_event_drivers.sql:7-8`),
  więc każdy fixture musi zawierać dzieci bez wiersza `child_attendance`.
- Usunięcie członka nie ma dziś ścieżki w aplikacji (brak polityki DELETE na `group_members`; FR-007
  zaparkowane). Istnieje tylko „technicznie” (`prd.md:87`), dlatego PRD `:147` nie ma implementacji.

## Historical Context (from prior changes)

- `context/archive/2026-11-13-driver-declaration-seat-balance/plan.md:42` — deklaracje kierowcy usuniętego
  członka świadomie odłożone do FR-007. **Supported**: kod nadal ich nie obsługuje.
- `…/driver-declaration-seat-balance/plan.md:33`, `:39` — bilans liczy `plan.going.length`, a „bez deklaracji”
  oznacza tylko etykieta. **Supported** (`[eventId].astro:79`, `attendance.ts:74-80`).
- `…/driver-declaration-seat-balance/plan.md:284` — `buildSeatBalance` bez testu jednostkowego, stany
  pokrywa smoke. **Supported** (`smoke.mjs:572-614`).
- `context/archive/2026-11-16-group-engagement-stats/plan.md:28`, `:47` — przejazd tylko z jadącym dzieckiem
  (decyzja z planowania). **Supported** (`engagement_stats.sql:49-53`).
- `…/group-engagement-stats/plan.md:51` — lista kierowców = obecni członkowie, bo usuwania nie ma.
  **Supported** jako opis kodu. **Partial** wobec PRD `:147`, które chce zachować wkład byłych członków.
- `context/foundation/roadmap.md:165` — los dzieci rodzica usuniętego z grupy nierozstrzygnięty. **Supported**.

## Related Research

Brak osobnych `research.md` w `context/archive/**` dla tych obszarów. Źródłem decyzji są plany wymienione wyżej.

## Open Questions

Decyzje dla `/10x-plan` (fakty są ustalone, wybór należy do użytkownika):

1. **Usunięty kierowca dokłada miejsc (luka produktu).** Do wyboru: (a) w tej zmianie dodać egzekwowanie
   PRD `:147` w bazie, np. trigger `after delete on group_members`, który usuwa deklaracje kierowcy
   i dzieci tego członka na przyszłych terminach, i przykryć to pgTAP; (b) tylko napisać test jako
   wykryty błąd i przenieść naprawę do FR-007 / fazy 2 (ryzyko #2 obejmuje usuwanie członka).
   Zasada „czerwony test = sygnał” (CLAUDE.md) wyklucza zmianę asercji tak, by pasowała do obecnego zachowania.
2. **Byli członkowie w statystykach przejazdów:** wyrocznia wg PRD `:147` (przejazdy zostają widoczne)
   czy obecna decyzja archiwum (tylko obecni członkowie)? Od tego zależy oczekiwana wartość
   w przypadku „były członek”.
3. **Potwierdzenie wyroczni spoza tekstu PRD:** przejazd wymaga co najmniej jednego jadącego dziecka;
   zakres dziecka od `created_at`. Bez potwierdzenia ręcznie liczone przykłady odtworzą wzór z kodu
   (anty-wzorzec z `test-plan.md:54`, `:59`).
4. **Runner jednostkowy:** bootstrap Vitest dla `buildSeatBalance` / `buildChildPlan` (zgodnie z `test-plan.md:69`, `:81`)
   razem z krokiem w CI. Alternatywa (przeniesienie bilansu do SQL, żeby został sam pgTAP) zmienia kod
   produkcyjny dla testu i nie wynika z żadnego wymagania.
