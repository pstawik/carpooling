# Trwałość historii i granica startu terminu — plan wdrożenia (rollout Phase 2)

## Overview

Faza 2 planu testów (`context/foundation/test-plan.md:70`, ryzyka #2 i #4). Dodajemy testy,
które udowadniają, że (a) blokada zapisu deklaracji dziecka i kierowcy działa dokładnie od chwili
startu terminu, (b) konwersja czasu warszawskiego jest poprawna przy zmianie czasu, (c) usunięcia
nie zmieniają statystyk zakończonych terminów. Jedyna zmiana produkcyjna naprawia lukę G1:
przejazdy byłego członka grupy znikają dziś ze statystyk wbrew PRD `prd.md:147`.

## Current State Analysis

Na podstawie `context/changes/testing-history-durability-start-boundary/research.md`:

- **Blokada (#4) jest egzekwowana poprawnie w bazie.** 7 predykatów zapisu ma ściśle
  `starts_at > now()`: `child_attendance` INSERT/UPDATE (`20261113120000_create_child_attendance.sql:101,123,138`),
  `event_drivers` INSERT/UPDATE/DELETE (`20261113130000_create_event_drivers.sql:86,103,113,130`);
  `child_attendance` nie ma DELETE (`:65,72`). Oba RPC są `security invoker`
  (`set_child_attendance(p_event_id, p_child_id, p_going)` `:151`, `set_event_driver(p_event_id, p_seats)` `:144`).
- **Brak testu na samej granicy:** testy blokady używają terminu `now() - interval '1 day'`
  (`supabase/tests/child_attendance_rls.test.sql:127`, `event_drivers_rls.test.sql:126`).
- **Strefa i DST żyją tylko w TS:** `warsawLocalToUtc`, `utcToWarsawParts`, `formatEventStart`
  (`src/lib/time.ts:52-84`), `weeklyDates` (`src/lib/weekly-events.ts:29-41`), `hasStarted`
  (`src/lib/services/events.ts:83-85`) — bez testów jednostkowych; DST sprawdzone tylko ręcznie
  (`context/archive/2026-11-12-group-admin-manages-events/plan.md:253`). Baza nie konwertuje stref.
- **Usunięcia (#2):** wiersze deklaracji zakończonych terminów przetrwają usunięcie dziecka
  (blokada `20261116120000_lock_child_delete_with_history.sql:19-31`), terminu (tylko przyszłe,
  `create_events.sql:74-78`) i członka (trigger `20261118120000:27-58`). Istniejące testy
  sprawdzają wiersze, nie statystyki.
- **G1:** `group_driver_stats` buduje wiersze z `group_members`
  (`20261116130000_create_engagement_stats.sql:55-57`), więc były członek znika ze statystyk
  kierowców; dziś pgTAP `todo` (`supabase/tests/engagement_stats_boundaries.test.sql:144-154`).

## Desired End State

- `npx supabase test db` zawiera test granicy: zapis na terminie `now() + 1 s` przechodzi,
  na terminie `now()` jest odrzucany — dla każdej operacji i obu RPC.
- `npm test` zawiera testy `src/lib/time.ts`, `src/lib/weekly-events.ts` i `hasStarted`
  z wyrocznią z kalendarza zmian czasu 2026.
- Były członek grupy z co najmniej jednym zaliczonym przejazdem zostaje w `group_driver_stats`;
  `todo` w `engagement_stats_boundaries.test.sql` jest zwykłą asercją.
- Test migawki: statystyki zakończonych terminów są identyczne przed i po każdym dozwolonym
  usunięciu.
- §6.2 i §6.5 test-plan opisują wzorzec; roadmapa nie wymienia #14 jako otwartego, a FR-007
  niesie decyzję o dzieciach usuniętego rodzica.

### Key Discoveries:

- `now()` jest stałe w transakcji testu pgTAP — fixture `starts_at = now()` / `now() + interval '1 second'`
  to deterministyczny „kontrolowany czas” (`test-plan.md` §6.1, `engagement_stats_boundaries.test.sql:9-17,58-64`).
- Polityka SELECT `event_drivers` jest grupowa (`create_event_drivers.sql:69-73`), więc członek
  grupy widzi wiersze byłych członków — naprawa G1 nie wymaga zmian RLS.
- Profil byłego członka jest widoczny tylko przy wspólnej innej grupie
  (`profiles_select_group_peers` → `shares_group_with`, `create_groups.sql:130-134`); widok
  pokazuje wtedy fallback „Członek grupy” (`src/pages/groups/[id]/statystyki.astro:87`).
- Wzorzec Vitest: ręcznie policzone oczekiwania z komentarzem (`src/lib/services/drivers.test.ts:4-14`).
- Kalendarz Europe/Warsaw 2026: czas letni od niedzieli 29 marca 02:00 → 03:00 (CET +1 → CEST +2),
  zimowy od niedzieli 25 października 03:00 → 02:00.

## What We're NOT Doing

- **G2:** dziecko bez żadnego wiersza deklaracji na zakończonych terminach nadal można usunąć,
  a jego nieobecności „bez deklaracji” znikają ze statystyk — świadomy kompromis
  (`archive/2026-11-16-group-engagement-stats/plan.md:49-50`); bez testu zatwierdzającego.
- **G3:** usunięcie grupy lub profilu kaskadowo kasuje całą historię — kompromis bez ścieżki
  w aplikacji (`20261116120000:10-12`); bez nowych testów.
- **G4:** dzieci usuniętego rodzica — bez testu (bez zapisanej chwili usunięcia nie ma wyroczni);
  zapisane jako decyzja do podjęcia przy FR-007.
- Etykieta „Były członek” i kolumna `is_member` w statystykach — fallback „Członek grupy” zostaje.
- Testy `generateEvents` z mockiem klienta Supabase (anty-wzorzec §2 #5).
- Weryfikacja danych ICU w workerd (Vitest działa w Node).
- Korekta §2 / Risk Response Guidance (warstwa DST = Vitest) — należy do backportu w `/10x-test-plan`.
- Zmiana komunikatu 404 vs „zablokowane” przy rozjeździe zegarów Workera i bazy (zaakceptowany kompromis).

## Implementation Approach

Kolejność wg ryzyka i kosztu: najpierw najtańsze testy granicy w istniejącej warstwie (pgTAP,
Vitest), potem jedyna zmiana produkcyjna (G1) w osobnej fazie, następnie test migawki, który
z niej korzysta, na końcu dokumentacja. Każda faza testowa kończy się celowym zepsuciem
operatora granicznego i potwierdzeniem czerwieni (§6.1 „Dowód”). Wyrocznia zawsze pochodzi
z PRD lub kalendarza, nigdy z kodu.

## Phase 1: Granica blokady zapisu deklaracji

### Overview

Nowy plik pgTAP udowadnia, że deklaracje dziecka i kierowcy można zapisać, zmienić i wycofać
sekundę przed startem, a od chwili startu nie.

### Changes Required:

#### 1. Test granicy

**File**: `supabase/tests/declaration_lock_boundary.test.sql`

**Intent**: Pokryć brakujący przypadek graniczny (`starts_at = now()` vs `now() + 1 s`) dla
wszystkich ścieżek zapisu deklaracji, w tym ścieżki konfliktu RPC (insert → update).

**Contract**: Nagłówek jak w `engagement_stats_boundaries.test.sql` (wyrocznia: PRD FR-014, FR-015,
„Zakończenie terminu” `prd.md:104,106,130`; „jedna transakcja, now() stałe”). Fixture jako
postgres: grupa, członek-rodzic A z dziećmi (Ola, Kuba), członek B; termin L = `now()`
(rozpoczęty), termin O = `now() + interval '1 second'` (otwarty); na L zasiane: Ola `going = false`,
A kierowca z miejscami. Asercje jako A/B (`set local role authenticated` + `request.jwt.claims`):
- `child_attendance` na O: `set_child_attendance` wstawia (lives_ok + wiersz), drugie wywołanie
  zmienia wartość (ścieżka `on conflict do update`).
- `child_attendance` na L: wstawienie dla Kuby → `throws_ok` 42501; zmiana Oli przez RPC → 42501;
  bezpośredni UPDATE → 0 wierszy; wiersz Oli na L nadal `false`.
- `event_drivers` na O: `set_event_driver` wstawia, zmienia miejsca; wycofanie jak w aplikacji
  (`withdrawEventDriver`, `src/lib/services/drivers.ts:76-85`) usuwa 1 wiersz.
- `event_drivers` na L: wstawienie przez B → 42501; zmiana przez A → 42501 / 0 wierszy;
  DELETE A → 0 wierszy; deklaracja A na L bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi, łącznie z `declaration_lock_boundary.test.sql`
- Celowe zepsucie (`starts_at > now()` → `starts_at >= now()` w jednej polityce `child_attendance` i jednej `event_drivers` w roboczej migracji, `npx supabase db reset`) daje czerwone asercje dla L; po cofnięciu zielono
- `npm run lint` przechodzi

#### Manual Verification:

- Asercje czytają się jako zdania z PRD (opis każdej asercji mówi, co i kiedy jest dozwolone)

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na
potwierdzenie ręcznej weryfikacji.

---

## Phase 2: Strefa i zmiana czasu

### Overview

Testy Vitest czystych funkcji czasu z wyrocznią z kalendarza Europe/Warsaw 2026.

### Changes Required:

#### 1. Konwersja czasu

**File**: `src/lib/time.test.ts`

**Intent**: Udowodnić, że godzina wpisana przez admina oznacza czas warszawski po obu stronach
zmiany czasu, a godziny nieistniejące są odrzucane.

**Contract**: `warsawLocalToUtc(date, time): Date | null`, `utcToWarsawParts(iso)`,
`formatEventStart(iso)`. Przypadki (oczekiwane wartości z kalendarza, w komentarzu):
- zima `2026-01-15 17:00` → `2026-01-15T16:00:00.000Z`; lato `2026-07-15 17:00` → `15:00Z`;
- wiosna `2026-03-29`: `01:59` → `00:59Z`; `02:00` i `02:30` → `null` (luka); `03:00` → `01:00Z`;
- jesień `2026-10-25`: `01:59` → `2026-10-24T23:59Z`; `02:30` → `00:30Z` (wcześniejsza chwila, CEST);
  `03:00` → `02:00Z`;
- granica doby `2026-01-01 00:30` → `2025-12-31T23:30Z`;
- `2026-02-30`, `2026-1-05`, `24:00` → `null`;
- `utcToWarsawParts` odwraca konwersję dla przypadków letniego i zimowego;
- `formatEventStart("2026-11-17T16:00:00Z")` → `"wtorek, 17 listopada 2026, 17:00"`.

#### 2. Seria tygodniowa przez zmianę czasu

**File**: `src/lib/weekly-events.test.ts`

**Intent**: Udowodnić, że seria nie gubi ani nie przesuwa dni przy zmianie czasu i że po konwersji
godzina zostaje 17:00 czasu warszawskiego.

**Contract**: `weeklyDates(from, to, weekday)`:
- poniedziałki `2026-03-23`..`2026-04-06` → `["2026-03-23","2026-03-30","2026-04-06"]`;
  po `warsawLocalToUtc(…, "17:00")` → `16:00Z`, `15:00Z`, `15:00Z`;
- niedziele `2026-10-18`..`2026-11-01` → trzy daty; 17:00 → `15:00Z`, `16:00Z`, `16:00Z`;
- `from` poza dniem tygodnia (`2026-03-25`..`2026-04-08`, poniedziałek) → `["2026-03-30","2026-04-06"]`;
- zakres odwrócony i dłuższy niż `MAX_SERIES_DAYS` → `[]`.

#### 3. Granica `hasStarted`

**File**: `src/lib/services/events.test.ts`

**Intent**: Pilnować, że TS-owy wybór komunikatu „zablokowane” jest dokładnym dopełnieniem
predykatu bazy (`starts_at <= now()` = rozpoczęty).

**Contract**: `hasStarted(event, now)` (`src/lib/services/events.ts:83-85`): `now` = start → `true`;
start − 1 ms → `false`; start + 1 ms → `true`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi i raportuje testy z `time.test.ts`, `weekly-events.test.ts`, `events.test.ts`
- Celowe zepsucie (w `warsawLocalToUtc` sortowanie kandydatów malejąco zamiast rosnąco) daje czerwony test godziny dwuznacznej `02:30`; po cofnięciu zielono
- `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Każda oczekiwana wartość ma w komentarzu rachunek offsetu (CET +1 / CEST +2), nie wywołanie testowanej funkcji

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na
potwierdzenie ręcznej weryfikacji.

---

## Phase 3: Przejazdy byłych członków w statystykach (G1)

### Overview

Naprawa `group_driver_stats`, żeby przejazdy byłego członka z zakończonych terminów zostawały
w statystykach (PRD `prd.md:147`).

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261118130000_keep_former_member_drives_in_stats.sql`

**Intent**: Lista kierowców w statystykach = obecni członkowie (zawsze, także z 0) + byli członkowie
z co najmniej jednym zaliczonym przejazdem. Definicja przejazdu bez zmian.

**Contract**: `create or replace function public.group_driver_stats(p_group_id uuid) returns table
(user_id uuid, nick text, drives integer)` — sygnatura, `security invoker`, `stable`,
`search_path = ''` i warunek `is_group_member(p_group_id)` bez zmian; ponownie
`revoke … from public, anon` / `grant … to authenticated`. Zbiór kandydatów: `user_id` z
`group_members` grupy ∪ `user_id` z `event_drivers` grupy; filtr: obecny członek **lub**
`drives > 0`. Nagłówek migracji cytuje PRD i opisuje, że nick byłego członka jest zwykle `null`
(RLS profili) i widok pokazuje „Członek grupy”.

#### 2. Asercja zamiast `todo`

**File**: `supabase/tests/engagement_stats_boundaries.test.sql`

**Intent**: Wymaganie PRD jest teraz spełnione, więc `todo` (`:146`) znika, a asercja X → 1 przejazd
(`:148-154`) zostaje; dopisać przypadek byłego członka z 0 zaliczonych przejazdów (nie jest listowany).

**Contract**: Fixture: dodatkowy członek Y kierowca tylko na P (brak jadących dzieci → 0 przejazdów),
usunięty z grupy; asercja: Y nie występuje w `group_driver_stats`. Licznik `plan(n)` zaktualizowany.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację bez błędów
- `npx supabase test db` przechodzi; `engagement_stats_boundaries.test.sql` nie zawiera `todo`
- Celowe zepsucie (usunięcie gałęzi `event_drivers` z kandydatów) daje czerwoną asercję X; po cofnięciu zielono
- `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Lokalnie: kierowca z zaliczonym przejazdem usunięty SQL-em z `group_members`; strona statystyk grupy nadal pokazuje jego przejazdy (jako „Członek grupy”, jeśli nie dzieli innej grupy)

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na
potwierdzenie ręcznej weryfikacji.

---

## Phase 4: Statystyki bez zmian po usunięciach

### Overview

Test migawki: statystyki zakończonych terminów są identyczne przed i po każdym dozwolonym
usunięciu (przyszłego terminu, dziecka bez historii, członka) oraz po odrzuconej próbie usunięcia
dziecka z historią.

### Changes Required:

#### 1. Test migawki

**File**: `supabase/tests/deletion_history_stats.test.sql`

**Intent**: Wyrocznia „bez zmian” pochodzi z PRD (`prd.md:130,147`); migawka przed usunięciem
porównana z wynikiem po, plus ręcznie policzone wartości w komentarzu, żeby migawka nie była
pusta ani trywialna.

**Contract**: Fixture jako postgres: grupa z adminem A (rodzic Oli), członkiem B (rodzic Zosi) i
kierowcą C; terminy P (`now() - 1 day`), N (`now()`, zakończony), F (`now() + 7 days`); C kieruje
na N, na którym Ola jedzie (1 zaliczony przejazd); Zosia ma deklarację na P; dziecko Lena (rodzic A)
ma `created_at = now() + interval '1 second'`, więc jej zakres statystyk jest pusty (żaden zakończony
termin nie ma `starts_at >= created_at`), i deklarację tylko na F.
Kroki, każdy z porównaniem `group_child_stats` i `group_driver_stats` (tymczasowa tabela migawki,
`results_eq` przed vs po):
1. A (admin) usuwa F przez RLS → statystyki bez zmian;
2. B próbuje usunąć Zosię z deklaracją na P → 0 wierszy; statystyki bez zmian;
3. A usuwa Lenę (brak historii, pusty zakres) → wiersze innych dzieci bez zmian, a jej deklaracja na F znika kaskadą;
4. C usunięty z `group_members` (jako postgres) → `group_driver_stats` nadal ma C z przejazdami
   z P/N; `group_child_stats` bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi, łącznie z `deletion_history_stats.test.sql`
- Celowe zepsucie (w roboczej migracji polityka `events_delete_group_admin` bez `starts_at > now()`, plus dodatkowy krok usuwający P) daje czerwone porównanie migawki; po cofnięciu zielono
- `npm run lint` przechodzi

#### Manual Verification:

- Każdy krok ma w komentarzu ręcznie policzone wartości statystyk przed i po

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na
potwierdzenie ręcznej weryfikacji.

---

## Phase 5: Dokumentacja

### Overview

Wzorzec trafia do cookbooka, roadmapa przestaje wprowadzać w błąd.

### Changes Required:

#### 1. Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.2 wzorcem fazy 2 i dopisać notatkę fazy 2 w §6.5.

**Contract**: §6.2 „Test trwałości danych i granicy czasu”: granica blokady (`now()` vs
`now() + 1 s`, wszystkie operacje i ścieżka konfliktu RPC), migawka statystyk przed/po usunięciu,
DST w Vitest z wyrocznią z kalendarza, dowód przez zepsucie operatora; wzorce: trzy nowe pliki.
§6.5 „Faza 2”: G1 naprawione migracją, G2/G3 jako kompromisy, G4 przekazane do FR-007, korekta
warstwy dla #4 czeka na backport w `/10x-test-plan`. §1–§5 bez zmian.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Oznaczyć #14 jako rozstrzygnięte i dopisać decyzję G4 do FR-007.

**Contract**: `## Open Roadmap Questions` pkt 2 (`:212`) — oznaczenie „rozstrzygnięte: Europe/Warsaw,
konwersja w `src/lib/time.ts`”. `## Parked` FR-007 (`:217`) — dopisane wymaganie: zdecydować los
dzieci usuniętego rodzica (koniec zakresu statystyk vs ukrywanie) i wtedy dodać test.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (prettier dla `*.md`)

#### Manual Verification:

- §6.2 da się zastosować do nowej reguły czasu lub usuwania bez czytania tego planu

**Implementation Note**: Po fazie zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Testing Strategy

### Unit Tests:

- `warsawLocalToUtc`, `utcToWarsawParts`, `formatEventStart`, `weeklyDates`, `hasStarted` — granice
  zmiany czasu, luka, godzina dwuznaczna, granica doby, złe wejście.

### Integration Tests:

- pgTAP: granica blokady zapisu (Phase 1), byli członkowie w statystykach (Phase 3), migawka
  statystyk po usunięciach (Phase 4).

### Manual Testing Steps:

1. Usuń SQL-em z `group_members` kierowcę z zaliczonym przejazdem i otwórz statystyki grupy.
2. Przejrzyj komentarze wyroczni w nowych testach pod kątem niezależności od kodu.

## Performance Considerations

`group_driver_stats` dostaje dodatkowe źródło kandydatów (`event_drivers` grupy); przy skali
grup MVP (kilkanaście osób, setki terminów) bez znaczenia.

## Migration Notes

Migracja to `create or replace` funkcji bez zmian schematu; cofnięcie = poprzednia definicja
z `20261116130000_create_engagement_stats.sql:29-61`.

## References

- Research: `context/changes/testing-history-durability-start-boundary/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (`:41,43,55,57`), §3 (`:70`), §6.1
- Wzorce: `supabase/tests/engagement_stats_boundaries.test.sql`, `supabase/tests/member_removal_declarations.test.sql`, `src/lib/services/drivers.test.ts`
- Poprzednia faza: `context/archive/2026-11-18-testing-seat-balance-stats/plan.md`
- Issue: https://github.com/pstawik/carpooling/issues/62

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Granica blokady zapisu deklaracji

#### Automated

- [x] 1.1 `npx supabase test db` przechodzi, łącznie z `declaration_lock_boundary.test.sql` — 17f421f
- [x] 1.2 Celowe zepsucie (`starts_at > now()` → `starts_at >= now()` w jednej polityce `child_attendance` i jednej `event_drivers` w roboczej migracji, `npx supabase db reset`) daje czerwone asercje dla L; po cofnięciu zielono — 17f421f
- [x] 1.3 `npm run lint` przechodzi — 17f421f

#### Manual

- [x] 1.4 Asercje czytają się jako zdania z PRD (opis każdej asercji mówi, co i kiedy jest dozwolone) — 17f421f

### Phase 2: Strefa i zmiana czasu

#### Automated

- [x] 2.1 `npm test` przechodzi i raportuje testy z `time.test.ts`, `weekly-events.test.ts`, `events.test.ts` — f1a1999
- [x] 2.2 Celowe zepsucie (w `warsawLocalToUtc` sortowanie kandydatów malejąco zamiast rosnąco) daje czerwony test godziny dwuznacznej `02:30`; po cofnięciu zielono — f1a1999
- [x] 2.3 `npm run lint` i `npx astro check` przechodzą — f1a1999

#### Manual

- [x] 2.4 Każda oczekiwana wartość ma w komentarzu rachunek offsetu (CET +1 / CEST +2), nie wywołanie testowanej funkcji — f1a1999

### Phase 3: Przejazdy byłych członków w statystykach (G1)

#### Automated

- [x] 3.1 `npx supabase db reset` stosuje migrację bez błędów — 7af264c
- [x] 3.2 `npx supabase test db` przechodzi; `engagement_stats_boundaries.test.sql` nie zawiera `todo` — 7af264c
- [x] 3.3 Celowe zepsucie (usunięcie gałęzi `event_drivers` z kandydatów) daje czerwoną asercję X; po cofnięciu zielono — 7af264c
- [x] 3.4 `npm run lint` i `npx astro check` przechodzą — 7af264c

#### Manual

- [x] 3.5 Lokalnie: kierowca z zaliczonym przejazdem usunięty SQL-em z `group_members`; strona statystyk grupy nadal pokazuje jego przejazdy (jako „Członek grupy”, jeśli nie dzieli innej grupy) — 7af264c

### Phase 4: Statystyki bez zmian po usunięciach

#### Automated

- [x] 4.1 `npx supabase test db` przechodzi, łącznie z `deletion_history_stats.test.sql` — 7e4ddaf
- [x] 4.2 Celowe zepsucie (w roboczej migracji polityka `events_delete_group_admin` bez `starts_at > now()`, plus dodatkowy krok usuwający P) daje czerwone porównanie migawki; po cofnięciu zielono — 7e4ddaf
- [x] 4.3 `npm run lint` przechodzi — 7e4ddaf

#### Manual

- [x] 4.4 Każdy krok ma w komentarzu ręcznie policzone wartości statystyk przed i po — 7e4ddaf

### Phase 5: Dokumentacja

#### Automated

- [x] 5.1 `npm run lint` przechodzi (prettier dla `*.md`)

#### Manual

- [x] 5.2 §6.2 da się zastosować do nowej reguły czasu lub usuwania bez czytania tego planu
