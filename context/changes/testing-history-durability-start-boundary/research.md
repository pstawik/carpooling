---
date: 2026-11-18T10:07:50+01:00
researcher: Claude (Opus 5.5)
git_commit: 567ccdab244d4633af9121f82882a69938ae81d3
branch: main
repository: carpooling
topic: "Jak usunięcia i granica startu terminu wpływają na deklaracje i statystyki — podstawa testów ryzyk #2 i #4 (rollout Phase 2)"
tags: [research, testing, deletion, history, start-boundary, timezone, dst, pgtap, vitest]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (Opus 5.5)
---

# Research: trwałość historii i granica startu terminu

**Date**: 2026-11-18T10:07:50+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 567ccdab244d4633af9121f82882a69938ae81d3
**Branch**: main
**Repository**: carpooling

## Research Question

Dla fazy 2 planu testów (`context/foundation/test-plan.md:70`, ryzyka #2 i #4) ugruntować to,
czego wymaga Risk Response Guidance (`test-plan.md:55`, `:57`):

- **#2:** reguły usuwania (kaskady, ograniczenia, triggery) dla dzieci, terminów i członkostwa;
  czy po usunięciu deklaracje **i statystyki** zakończonych terminów pozostają bez zmian;
  które obecne zachowania to świadome kompromisy.
- **#4:** jak przechowywany jest start (typ, strefa), który zegar egzekwuje blokadę, czy granica
  jest dokładnie w chwili startu, jak obsłużona jest zmiana czasu; stan pytania #14 z roadmapy.
- Istniejące pokrycie testami i najtańsza warstwa z prawdziwym sygnałem.

## Summary

- **Definicja „rozpoczęty/zakończony” jest jedna:** `starts_at <= now()`; „przyszły” to
  `starts_at > now()`, gdzie `now()` to czas startu transakcji na zegarze bazy. Ten sam predykat
  występuje w politykach terminów (`20261112150000_create_events.sql:62,71-72,78`), deklaracji
  (`20261113120000_create_child_attendance.sql:101,123,138`;
  `20261113130000_create_event_drivers.sql:86,103,113,130`), blokadzie usuwania dziecka
  (`20261116120000_lock_child_delete_with_history.sql:29`), triggerze usunięcia członka
  (`20261118120000_delete_future_declarations_on_member_removal.sql:39,47`) i statystykach
  (`20261116130000_create_engagement_stats.sql:43,89`). Zgodne z PRD `prd.md:130`.
- **#2 — wiersze deklaracji zakończonych terminów przetrwają każde usunięcie dostępne klientowi**
  (dziecko, termin) oraz usunięcie członka (trigger). **Statystyki nie zawsze:**
  - **G1 (luka względem PRD):** `group_driver_stats` buduje wiersze z `group_members`
    (`20261116130000_create_engagement_stats.sql:55-57`), więc po usunięciu członka jego przejazdy
    z zakończonych terminów znikają ze statystyk, choć wiersze `event_drivers` zostają. Istnieje
    tylko pgTAP `todo` (`supabase/tests/engagement_stats_boundaries.test.sql:146`). PRD
    `prd.md:147`: „deklaracje z zakończonych terminów zostają w statystykach”.
  - **G2 (zaakceptowany kompromis):** dziecko bez żadnego wiersza deklaracji na rozpoczętym
    terminie można usunąć (`20261116120000:19-31` sprawdza tylko istnienie wierszy), a jego
    nieobecności „bez deklaracji” (`20261116130000:84-90`) znikają ze statystyk
    (`archive/2026-11-16-group-engagement-stats/plan.md:49-50`).
  - **G3 (zaakceptowany / otwarty):** usunięcie grupy lub profilu kaskadowo kasuje całą historię,
    bo akcje referencyjne omijają RLS (`20261116120000:10-12`). Brak ścieżki w aplikacji;
    decyzja odłożona (`archive/2026-11-12-group-admin-manages-events/change.md:14`).
  - **G4 (otwarta decyzja produktowa):** dzieci usuniętego rodzica zostają w grupie i dalej
    zbierają nieobecności (`archive/2026-11-18-testing-seat-balance-stats/reviews/impl-review.md` F2;
    `test-plan.md` §6.5).
- **#4 — egzekwowanie jest poprawne i po stronie serwera.** Wszystkie 7 predykatów zapisu
  deklaracji (INSERT/UPDATE using+with check w obu tabelach, DELETE w `event_drivers`) to ściśle
  `starts_at > now()`; `child_attendance` nie ma DELETE w ogóle (`create_child_attendance.sql:65,72`).
  Start to `timestamptz` (`create_events.sql:21`); konwersja Europe/Warsaw → UTC dzieje się raz,
  w TS, przez `warsawLocalToUtc` (`src/lib/time.ts:52-73`). Baza nie wykonuje żadnej konwersji stref.
- **Luki są w testach, nie w kodzie:** (a) żaden test pgTAP nie sprawdza blokady zapisu deklaracji
  dokładnie na granicy — testy blokady używają terminu `now() - interval '1 day'`
  (`child_attendance_rls.test.sql:127`, `event_drivers_rls.test.sql:126`); (b) `src/lib/time.ts`
  i `src/lib/weekly-events.ts` nie mają testów jednostkowych — DST sprawdzono tylko ręcznie
  (`archive/2026-11-12-group-admin-manages-events/plan.md:253`).
- **Korekta wskazówek planu testów:** warstwa DST/strefy to **Vitest**, nie pgTAP (baza nie zna
  stref). „Kontrolowany czas” w pgTAP już istnieje: `now()` jest stałe w transakcji testu, więc
  fixture `starts_at = now()` / `now() + interval '1 second'` jest deterministyczny
  (wzorzec `test-plan.md` §6.1, `engagement_stats_boundaries.test.sql:9-17,58-64`).

## Detailed Findings

### Klucze obce i ON DELETE

- `child_attendance`: `(event_id, group_id)` → `events` CASCADE (`create_child_attendance.sql:45-46`);
  `(child_id, group_id)` → `children` CASCADE (`:47-48`).
- `event_drivers`: `user_id` → `profiles` CASCADE (`create_event_drivers.sql:28`);
  `(event_id, group_id)` → `events` CASCADE (`:36-37`).
- `children`: `group_id` → `groups` CASCADE (`20261112140000_create_children.sql:15`);
  `parent_id` → `profiles` CASCADE (`:16`).
- `events.group_id` → `groups` CASCADE (`create_events.sql:20`).
- `group_members`: `group_id`, `user_id` CASCADE (`20261110120000_create_groups.sql:29-30`);
  `profiles.id` → `auth.users` CASCADE (`20261109120000_create_profiles.sql:5`).

### Usunięcie dziecka (#2)

- Polityka `children_delete_own` — właściciel będący członkiem (`create_children.sql:65-69`),
  zaostrzona o `not exists (… e.starts_at <= now())` (`20261116120000:19-31`).
- Ścieżka: `src/pages/api/groups/children/delete.ts:34` → `deleteChild`
  (`src/lib/services/children.ts:77-99`); 0 usuniętych wierszy rozróżniane na
  `child_has_history` / `child_not_found` dodatkowym odczytem.
- Efekt: dziecka z deklaracją (także „nie jedzie”) na rozpoczętym terminie nie da się usunąć;
  dziecko z deklaracjami wyłącznie przyszłymi — tak, a jego przyszłe wiersze znikają kaskadą.
  Luka G2 opisana w Summary.
- Pokrycie: `children_rls.test.sql:309-320` (usunięcie odrzucone, dziecko i deklaracja zostają),
  `:324-327` (usunięcie z wyłącznie przyszłą deklaracją), `:377-384` (kaskada grupy, G3).
  **Brak asercji na `group_child_stats` przed/po** — test sprawdza wiersze, nie statystyki.

### Usunięcie terminu (#2)

- `events_delete_group_admin using (is_group_admin(group_id) and starts_at > now())`
  (`create_events.sql:74-78`); UPDATE wymaga `starts_at > now()` w `using` i `with check`
  (`:67-72`), więc terminu nie da się przesunąć w przeszłość ani z niej wyjąć.
- Ścieżka: `src/pages/api/groups/events/delete.ts:33` → `deleteEvent`
  (`src/lib/services/events.ts:159-165`).
- Efekt: kasowane są tylko przyszłe terminy z ich deklaracjami; przyszłe terminy i tak nie wchodzą
  do statystyk (`20261116130000:43,89`), więc statystyki nie mogą się zmienić tą ścieżką.
- Pokrycie: `events_rls.test.sql:267-277` (0 wierszy, termin zostaje), `:279-288`;
  `child_attendance_rls.test.sql:313-324`, `event_drivers_rls.test.sql:329-340` (kaskada przyszłego).

### Usunięcie członka (#2)

- Klient nie może usuwać z `group_members` (revoke `create_groups.sql:54`, brak polityk zapisu,
  brak RPC; FR-007 w Parked, `prd.md:86`). Dziś tylko SQL właściciela/service_role albo kaskada
  z profilu/grupy.
- Trigger AFTER DELETE `group_members_delete_future_declarations` → funkcja security definer
  `delete_future_declarations_of_member()` (`20261118120000:27-58`): usuwa `event_drivers` członka
  i `child_attendance` jego dzieci w tej grupie przy `starts_at > now()` (`:34-47`). Termin
  startujący w chwili usunięcia jest traktowany jako rozpoczęty i zostaje.
- Pokrycie: `member_removal_declarations.test.sql` — fixture S = `now()` (granica), P = `now() - 7 days`,
  F = `now() + 7 days` (`:82-90`); deklaracje na S i P zostają (`:177-185`, `:201-215`);
  izolacja G2 (`:233-237`); kaskada profilu (`:249-259`).
- Luka G1: statystyki kierowców (zweryfikowane: `20261116130000:36-60` — `from group_members gm …
  where gm.group_id = p_group_id`). `group_child_stats` jest budowane z `children` bez filtra
  członkostwa (`:79-95`), więc dzieci usuniętego rodzica zostają; `parent_nick` z `left join profiles`
  (`:86`) może wrócić jako null przez RLS profili — **niezweryfikowane**.

### Usunięcie grupy i profilu (#2)

- Brak ścieżki w aplikacji (revoke DELETE na `groups`, `create_groups.sql:53`; brak usuwania kont).
- Kaskada usuwa całą historię, łącznie z zakończonymi terminami; blokady RLS nie działają dla akcji
  referencyjnych (`20261116120000:10-12`). Pokryte jako zachowanie udokumentowane:
  `children_rls.test.sql:377-384`, `member_removal_declarations.test.sql:249-259`.

### Przechowywanie startu i strefa czasowa (#4)

- `starts_at timestamptz not null` (`create_events.sql:21`; komentarz `:5-6`). Grupa nie ma kolumny
  strefy; stała `APP_TIME_ZONE = "Europe/Warsaw"` (`src/lib/time.ts:6`).
- `warsawLocalToUtc(date, time)` (`src/lib/time.ts:52-73`): wyszukuje offset dla danej chwili przez
  `Intl.DateTimeFormat`; godzina w luce wiosennej → `null`; dwuznaczna godzina jesienna → wcześniejsza
  chwila (CEST).
- Generator tygodniowy: `weeklyDates` (`src/lib/weekly-events.ts:29-41`) to arytmetyka na datach w UTC;
  `generateEvents` (`src/lib/services/events.ts:124-144`) konwertuje każdą datę, pomija `null` i starty
  bliższe niż 60 s, upsert z `ignoreDuplicates`. Cotygodniowa 17:00 zostaje 17:00 czasu warszawskiego
  po obu stronach zmiany czasu (wynik analizy kodu, niepotwierdzony testem).
- Formularz terminu: `futureStart` (`src/lib/validation/events.ts:30-35`) wymaga startu > `Date.now() + 60 s`
  — przyjazna walidacja; gwarancją jest RLS.
- W `supabase/` nie ma `AT TIME ZONE` (grep).

### Blokada zapisu deklaracji (#4)

- `child_attendance`: INSERT `with check` `:101`; UPDATE `using` `:123` i `with check` `:138`;
  DELETE odebrany (`:65,72`); kolumnowe granty UPDATE tylko na `going`, `updated_at` (`:68-69`).
  RPC `set_child_attendance` (`:151-174`) jest `security invoker`, `insert … on conflict do update`
  → odmowa na ścieżce konfliktu daje 42501.
- `event_drivers`: INSERT `:86`, UPDATE `:103`/`:113`, DELETE `:130` — wszystkie `starts_at > now()`
  (zweryfikowane grepem). RPC `set_event_driver` (`:144-167`) `security invoker`, `user_id` z `auth.uid()`.
- W przejrzanych migracjach i `src/` jedyna funkcja definer pisząca deklaracje to trigger usunięcia członka, który usuwa wyłącznie
  przyszłe wiersze; execute odebrany klientom (`20261118120000`).
- Aplikacja: `src/pages/api/groups/events/attendance.ts:49` i `driver.ts:85` po 42501 sprawdzają
  `hasStarted(event, new Date())` (`src/lib/services/events.ts:83-85`, `Date.parse(startsAt) <= now`)
  tylko po to, by wybrać komunikat (`attendance_locked` / `driver_locked` vs 404). UI liczy `locked`
  raz na żądanie (`src/pages/groups/[id]/terminy/[eventId].astro:53`), bez timera — strona otwarta
  przez chwilę startu pokazuje formularz, a serwer odrzuca zapis.
- Drobna luka UX (zaakceptowana klasa kompromisu z `group-admin-manages-events` impl-review F3,
  `group-engagement-stats` impl-review F1): przy rozjeździe zegara Workera i bazy o kilka sekund
  odrzucenie tuż przy granicy może dać 404 zamiast komunikatu o blokadzie.

### Istniejące testy granicy i czasu

- Wszystkie pliki pgTAP używają przesunięć względem `now()`; brak literałów dat (grep `'20\d\d-`),
  brak ustawień strefy. Pliki zaznaczają „jedna transakcja, now() stałe”
  (`child_attendance_rls.test.sql:5`, `event_drivers_rls.test.sql:5`, `events_rls.test.sql:5`).
- Blokada deklaracji testowana na E2 = `now() - 1 day`: `child_attendance_rls.test.sql:164-174,203-209`;
  `event_drivers_rls.test.sql:171-186,214-220`. **Brak** przypadków `starts_at = now()` (musi odrzucić)
  i `now() + interval '1 second'` (musi przepuścić) dla INSERT, UPDATE i DELETE.
- Granica dokładna testowana tylko dla triggera (`member_removal_declarations.test.sql:7-14`)
  i statystyk (`engagement_stats_boundaries.test.sql:9-17`).
- Testy jednostkowe: tylko `src/lib/services/attendance.test.ts` i `drivers.test.ts`;
  `vitest.config.ts` obejmuje `src/**/*.test.ts` w środowisku `node` (`test-plan.md:81`).

## Code References

- `supabase/migrations/20261113120000_create_child_attendance.sql:85-140` — polityki zapisu z `starts_at > now()`
- `supabase/migrations/20261113130000_create_event_drivers.sql:75-132` — polityki INSERT/UPDATE/DELETE
- `supabase/migrations/20261112150000_create_events.sql:21,56-78` — `timestamptz`, polityki terminów
- `supabase/migrations/20261116120000_lock_child_delete_with_history.sql:10-31` — blokada usunięcia dziecka z historią
- `supabase/migrations/20261118120000_delete_future_declarations_on_member_removal.sql:27-58` — trigger usunięcia członka
- `supabase/migrations/20261116130000_create_engagement_stats.sql:29-61` — `group_driver_stats` z `group_members` (G1)
- `supabase/migrations/20261116130000_create_engagement_stats.sql:72-96` — `group_child_stats` z `children`
- `src/lib/time.ts:52-84` — `warsawLocalToUtc`, `utcToWarsawParts`, `formatEventStart`
- `src/lib/weekly-events.ts:29-41` — `weeklyDates`
- `src/lib/services/events.ts:83-85,124-144,159-165` — `hasStarted`, `generateEvents`, `deleteEvent`
- `src/lib/services/children.ts:77-99` — `deleteChild`
- `src/pages/api/groups/events/attendance.ts:49`, `driver.ts:85` — wybór komunikatu po 42501
- `supabase/tests/engagement_stats_boundaries.test.sql:146` — `todo` dla byłych członków

## Architecture Insights

- Jedna granica czasu w całym systemie: baza egzekwuje `> now()` / `<= now()`, TS ma dokładne
  dopełnienie (`hasStarted`) tylko do komunikatów. Prawdą jest zegar bazy.
- Strefa czasowa istnieje tylko na krawędzi TS (wejście formularza / generator / wyświetlanie);
  w bazie wszystko jest chwilą absolutną. Dlatego ryzyko DST to ryzyko funkcji czystych w TS.
- Ochrona historii jest rozłożona: polityki RLS (dziecko, termin) + trigger (członek); kaskady
  grupy i profilu świadomie nie są chronione.
- Statystyki to funkcje SQL `security invoker`, więc ich wynik zależy od zbioru wierszy bazowych
  (`group_members` vs `children`) — to tam, nie w deklaracjach, pęka „statystyki bez zmian”.

## Historical Context (from prior changes)

- `context/archive/2026-11-13-child-attendance-declaration/reviews/impl-review.md:26-43` (F1) — kaskadowe
  kasowanie deklaracji dziecka; wtedy udokumentowany kompromis, zamknięty później migracją `20261116120000`. Supported.
- `context/archive/2026-11-12-group-admin-manages-events/reviews/plan-review.md:25-42` (F1) — usunięcie
  rozpoczętego terminu; naprawione polityką `starts_at > now()`. Supported.
- `context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:48-56` (F3) — wyścig zegara
  Worker/baza przy tworzeniu terminu; margines 60 s. Supported (`validation/events.ts:30`).
- `context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:58-66` (F4) i `change.md:14` —
  usunięcie grupy kasuje zakończone terminy; decyzja odłożona. Still open.
- `context/archive/2026-11-12-group-admin-manages-events/plan.md:13,47-48` — Europe/Warsaw, issue #14 zamknięte.
  Supported przez kod; **`roadmap.md:212` nadal wymienia #14 jako otwarte — nieaktualne.**
- `context/archive/2026-11-13-weekly-event-generator/reviews/impl-review.md:71-79` (F4) — data w luce DST
  pomijana; zmieniony tylko komunikat. Supported (`events.ts:124-144`).
- `context/archive/2026-11-16-group-engagement-stats/reviews/impl-review.md:26-34` (F1) — licznik zakończonych
  terminów na zegarze Workera; zaakceptowane.
- `context/archive/2026-11-16-group-engagement-stats/plan.md:31,49-51` — kaskady grupy/profilu oraz usunięcie
  dziecka bez deklaracji zaakceptowane; usuwanie członków poza zakresem (FR-007 Parked).
- `context/archive/2026-11-18-testing-seat-balance-stats/plan.md:47-54` — odłożone do fazy 2: byli członkowie
  w statystykach kierowców, los dzieci usuniętego rodzica, granica startu/strefy/DST (#4).
- `context/archive/2026-11-18-testing-seat-balance-stats/reviews/impl-review.md` F1 (wyścig usunięcia członka
  z deklaracją, wymóg `for share` dla FR-007) i F2 (nieobecności dzieci usuniętego rodzica — otwarta decyzja).

## Related Research

- `context/archive/2026-11-18-testing-seat-balance-stats/research.md` — bilans i statystyki (faza 1),
  m.in. `:61-63,133-139` o byłych członkach w statystykach.
- `context/archive/2026-11-16-group-page-ui/research.md`, `2026-11-17-event-plan-ui/research.md` — nie dotyczą.

## Open Questions

1. **G1 — przejazdy byłych członków:** naprawić `group_driver_stats` w tej fazie (zmiana migracji,
   test zamienia `todo` na asercję), czy zostawić `todo` i odłożyć do FR-007? PRD `prd.md:147` wymaga
   zachowania w statystykach; dziś niedostępne z aplikacji (brak usuwania członków).
2. **G4 — dzieci usuniętego rodzica:** zakończyć ich zakres statystyk z chwilą usunięcia, ukryć je, czy
   zostawić? Decyzja produktowa (impl-review F2 fazy 1).
3. **G2 — usunięcie dziecka bez deklaracji:** pozostaje kompromisem; test ma dokumentować obecne
   zachowanie jako kompromis, czy PRD wymaga blokady także dla samych nieobecności?
4. **G3 — kaskady grupy/profilu:** poza zakresem testów fazy 2 (brak ścieżki w aplikacji) — do potwierdzenia.
5. `parent_nick` dla dzieci usuniętego rodzica pod RLS profili — niezweryfikowane.
6. Pełne dane ICU strefy `Europe/Warsaw` w workerd — założone, niezweryfikowane (Vitest działa w Node,
   więc test jednostkowy tego nie potwierdzi).

## Recommended test layers (cost × signal)

| Ryzyko / luka | Warstwa | Zachowanie do udowodnienia | Anti-pattern |
|---|---|---|---|
| #4 granica zapisu | pgTAP, `starts_at = now()` i `now() + interval '1 second'` w jednej transakcji | zapis/zmiana/wycofanie przechodzi sekundę przed startem, odrzucane od chwili startu (INSERT, UPDATE, DELETE, oba RPC) | test tylko na `now() - 1 day`; sprawdzanie stanu UI |
| #4 strefa/DST | Vitest na `warsawLocalToUtc`, `weeklyDates` | 17:00 Warszawa → 16:00Z zimą, 15:00Z latem; godzina w luce → `null`; dwuznaczna → CEST; tydzień przez zmianę czasu | oczekiwane offsety liczone tą samą funkcją; mock `Intl` |
| #2 usunięcia | pgTAP z asercjami na `group_child_stats`/`group_driver_stats` przed i po | po usunięciu dziecka (przyszłe deklaracje) / przyszłego terminu / członka liczby dla zakończonych terminów bez zmian | asercja tylko na liczbie wierszy deklaracji; liczniki zakładające pustą bazę |
| G1 | pgTAP (dziś `todo`) | przejazdy byłego członka zostają w statystykach | zatwierdzenie obecnego zachowania |
