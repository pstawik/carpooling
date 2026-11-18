# Bilans miejsc i statystyki na danych granicznych — plan implementacji

## Overview

Faza 1 planu testów (`context/foundation/test-plan.md:69`, ryzyka #1 i #6). Udowadniamy na ręcznie
policzonych przykładach z PRD, że ostrzeżenie o niedoborze miejsc i statystyki zaangażowania liczą
poprawnie na danych granicznych. Przy okazji zamykamy lukę produktu wykrytą w researchu: usunięcie
członka z grupy nie usuwa jego deklaracji na przyszłe terminy, więc usunięty kierowca dalej dokłada
miejsc do bilansu (PRD `prd.md:147`).

## Current State Analysis

- Bilans liczą czyste funkcje TS: `buildSeatBalance` (`src/lib/services/drivers.ts:94-99`) i
  `buildChildPlan` (`src/lib/services/attendance.ts:71-84`), złożone w
  `src/pages/groups/[id]/terminy/[eventId].astro:71-79`. Pokrywa je tylko smoke z jednym kierowcą
  (`scripts/smoke.mjs:572-614`). Runnera testów jednostkowych nie ma (`package.json:5-14`), w CI nie ma
  kroku unit (`.github/workflows/ci.yml:9-25`).
- Statystyki liczą funkcje SQL `group_driver_stats` / `group_child_stats`
  (`supabase/migrations/20261116130000_create_engagement_stats.sql:29-61`, `:72-96`). „Zakończony” =
  `starts_at <= now()` na zegarze bazy. Pokrycie: `supabase/tests/engagement_stats.test.sql` (15 asercji)
  bez granic czasowych i bez byłych członków.
- `event_drivers` i `child_attendance` nie są powiązane z `group_members`. Po usunięciu członka jego
  wiersze zostają (`supabase/tests/event_drivers_rls.test.sql:347`, `supabase/tests/child_attendance_rls.test.sql:372`),
  a `listEventDrivers` / `listGroupChildren` nie filtrują po członkostwie. W migracjach nie ma triggera
  na `group_members` (research, sekcja „Bilans miejsc”).

## Desired End State

- `npm test` uruchamia Vitest. Testy jednostkowe bilansu przechodzą lokalnie i w jobie `ci`.
- Usunięcie wiersza z `group_members` kasuje w tej grupie deklaracje kierowcy tego członka i deklaracje
  jego dzieci na terminach z `starts_at > now()`. Wiersze rozpoczętych terminów zostają. Udowadnia to pgTAP.
- Nowy plik pgTAP sprawdza statystyki na granicach czasu i zakresu dziecka. Wymaganie PRD dla byłych
  członków jest zapisane jako test `todo` (naprawa w fazie 2 planu testów).
- `test-plan.md` ma wypełniony wzorzec §6.1 i status fazy, a AGENTS.md opisuje `npm test`.

### Key Discoveries:

- `buildSeatBalance`: `shortage` ⇔ `going > 0 && seats < going` (`drivers.ts:97`). Równość daje `enough`.
- Dziecko bez wiersza `child_attendance` trafia do `notGoing` z `undeclared: true` i nie liczy się do `going` (`attendance.ts:74-80`).
- Polityka DELETE `event_drivers` przepuszcza tylko własne wiersze członka (`20261113130000_create_event_drivers.sql:119-132`),
  więc trigger musi działać jako właściciel (`security definer`).
- W pgTAP `now()` jest stałe w transakcji (`engagement_stats.test.sql:7-8`), więc termin z `starts_at = now()`
  to deterministyczna granica „zakończony”. `events` ma tylko unikalność `(group_id, starts_at)` (`20261112150000_create_events.sql:32-33`),
  więc start w przeszłości i w `now()` wstawia się jako postgres bez przeszkód.
- Moduły bilansu importują z `@/…` tylko typy (`drivers.ts:2`, `attendance.ts:2-3`), ale Vitest i tak musi znać alias `@/*` (`tsconfig.json:8-10`).

## What We're NOT Doing

- Byli członkowie w statystykach przejazdów (PRD `:147`: „zostają w statystykach”). W tej zmianie jest tylko test `todo`. Zmiana `group_driver_stats` i strony należy do fazy 2 planu testów (ryzyko #2).
- Usuwanie członków w UI (FR-007, `roadmap.md:217`) i los samych dzieci usuniętego rodzica (`roadmap.md:165`). Dzieci zostają w grupie, a ich przyszłe deklaracje znikają, więc w planie terminu pokażą się jako „bez deklaracji”.
- Granica startu dla blokady zapisu, strefy czasowe i zmiana czasu (ryzyko #4, faza 2).
- Licznik „Zakończone terminy: N” na zegarze Workera (`src/lib/services/stats.ts:46-56`): rozjazd z zegarem bazy jest sekundowy i dotyczy tylko licznika.
- Zmiana PRD. Dwie potwierdzone reguły wyroczni (przejazd wymaga ≥1 jadącego dziecka; zakres dziecka od `created_at`) trafiają do wzorca §6.1 planu testów.
- Testy e2e i zmiany smoke.

## Implementation Approach

Każda reguła jest testowana w warstwie, w której żyje: bilans przez Vitest na czystych funkcjach,
statystyki i usuwanie członka przez pgTAP. Oczekiwane liczby pochodzą z przykładów policzonych ręcznie
wg PRD i są zapisane w komentarzach fixture, nigdy przepisane ze wzoru w kodzie. Luka usuniętego członka
jest naprawiana w bazie (Hard Rules: reguły egzekwuje serwer), żeby obowiązywała niezależnie od tego,
kto i jak usuwa członka (dziś technicznie, później FR-007).

## Critical Implementation Details

- **Trigger a kaskady:** usunięcie profilu albo grupy kasuje `group_members` kaskadowo, a wiersze `event_drivers` / `child_attendance` mogą być wtedy już usunięte albo usuwane równolegle. Funkcja triggera musi być idempotentna: zwykły `delete … where …`, bez założenia, że wiersze istnieją, i bez rzucania błędów.
- **Definicja „przyszły”:** dokładnie `starts_at > now()`, dopełnienie „zakończony” (`starts_at <= now()`). Termin rozpoczynający się w chwili usunięcia zostaje nietknięty.

## Faza 1: Vitest i testy jednostkowe bilansu

### Overview

Bootstrap runnera i testy `buildSeatBalance` oraz `buildChildPlan` na ręcznie policzonych przykładach.

### Changes Required:

#### 1. Runner

**File**: `package.json`, `vitest.config.ts`

**Intent**: Dodać Vitest jako zależność dev (aktualna wersja z npm, zapisana w lockfile) i skrypt `test`. Konfiguracja niezależna od integracji Astro/Cloudflare, żeby testy czystych funkcji nie uruchamiały workerd.

**Contract**: `"test": "vitest run"`; `vitest.config.ts` z `test.environment: "node"`, `test.include: ["src/**/*.test.ts"]` i `resolve.alias` `@` → `./src` (jak `tsconfig.json` `paths`). Plik konfiguracji i testy muszą przejść `npm run lint` i `npx astro check`.

#### 2. Testy bilansu

**File**: `src/lib/services/drivers.test.ts`

**Intent**: Przypadki graniczne bilansu z oczekiwaniami policzonymi ręcznie wg PRD „Bilans miejsc” (`prd.md:124`). Każdy przypadek ma w nazwie lub komentarzu rachunek (np. „2 + 1 = 3 miejsca < 4 dzieci → brakuje 1”).

**Contract**: przypadki i oczekiwane `SeatBalance`:
- kierowcy 2 i 1 miejsce, 4 jadących → `{ going: 4, seats: 3, missing: 1, status: "shortage" }` (kilku kierowców);
- kierowcy 3 i 2, 5 jadących → `{ going: 5, seats: 5, missing: 0, status: "enough" }` (równość);
- brak kierowców, 2 jadących → `{ going: 2, seats: 0, missing: 2, status: "shortage" }`;
- kierowca 4, 0 jadących → `{ going: 0, seats: 4, missing: 0, status: "none_going" }`;
- kierowcy 8 i 8, 17 jadących → `{ going: 17, seats: 16, missing: 1, status: "shortage" }` (maksimum miejsc z `create_event_drivers.sql:31`).

#### 3. Testy planu dzieci

**File**: `src/lib/services/attendance.test.ts`

**Intent**: Udowodnić, że dziecko bez deklaracji nie zwiększa zapotrzebowania, ale jest oznaczone. Złożenie z `buildSeatBalance` pokazuje, że „bez deklaracji” nie zamienia niedoboru w „wystarcza” ani odwrotnie.

**Contract**: dzieci Ala (jedzie), Kuba (nie jedzie), Ola (jedzie), Zosia (brak wpisu w mapie). Oczekiwane: `going` = [Ala, Ola], `notGoing` = [Kuba z `undeclared: false`, Zosia z `undeclared: true`] w kolejności wejścia; Zosia należy do wywołującego rodzica, więc `mine` zawiera ją ze statusem `undeclared`. Przy 2 miejscach bilans `enough` (2 = 2), przy 1 miejscu `shortage`, `missing: 1`. Gdyby Zosia się liczyła, byłoby 3 dzieci i `missing: 2`.

#### 4. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Unit gate wymagany po fazie 1 (`test-plan.md:99`).

**Contract**: krok `- run: npm test` w jobie `ci` po `npx astro check`, przed `npm run build`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi i raportuje testy z `drivers.test.ts` i `attendance.test.ts`
- `npm run lint` przechodzi
- `npx astro check` przechodzi
- Celowe zepsucie (`seats < going` → `seats <= going` w `drivers.ts:97`) daje czerwony test równości; po cofnięciu zielono

#### Manual Verification:

- Job `ci` na PR pokazuje krok `npm test` i jest zielony

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 2.

---

## Faza 2: Usunięcie członka czyści jego przyszłe deklaracje

### Overview

Migracja z triggerem na `group_members` oraz pgTAP, który dowodzi, że usunięty kierowca nie dokłada
miejsc, a usunięty rodzic nie dokłada jadących dzieci na przyszłych terminach. Historia rozpoczętych
terminów zostaje.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261118120000_delete_future_declarations_on_member_removal.sql`

**Intent**: Egzekwować PRD `prd.md:147` w bazie: po usunięciu członka z grupy znikają jego deklaracje kierowcy i deklaracje jego dzieci na przyszłych terminach tej grupy. Nagłówek migracji opisuje regułę, definicję „przyszły” i powód `security definer`.

**Contract**:
- funkcja `public.delete_future_declarations_of_member()` `returns trigger`, `language plpgsql`, `security definer`, `set search_path = ''`; `execute` odebrane `public`, `anon`, `authenticated`;
- usuwa `event_drivers` z `group_id = old.group_id`, `user_id = old.user_id` na terminach z `starts_at > now()`;
- usuwa `child_attendance` z `group_id = old.group_id` dla dzieci z `children.parent_id = old.user_id` na terminach z `starts_at > now()`;
- trigger `after delete on public.group_members for each row`;
- brak nowych tabel, więc brak nowych polityk RLS; istniejące polityki bez zmian.

#### 2. Test pgTAP

**File**: `supabase/tests/member_removal_declarations.test.sql`

**Intent**: Ręcznie policzony scenariusz bilansu przed i po usunięciu członków. Liczby odczytywane są z perspektywy pozostającego członka pod RLS, tak jak czyta je strona planu (`listEventDrivers`, `listEventAttendance`).

**Contract**: fixture (wszystko jako postgres, opisane w komentarzu nagłówka):
- G1: A (admin, dziecko Ala), B (członek, kierowca), C (członek, dziecko Ola);
- terminy: F (`now() + 7 days`), S (`now()`, granica: już rozpoczęty), P (`now() - 7 days`);
- F: A kieruje 1 miejsce, B kieruje 3; Ala i Ola „jedzie”. Przed usunięciem: 4 miejsca, 2 dzieci → wystarcza;
- S i P: B kieruje, Ola „jedzie”.

Asercje:
- funkcja istnieje, jest `security definer`, `authenticated` nie może jej wykonać; trigger istnieje na `group_members`;
- po usunięciu B, jako A: suma miejsc F = 1, jadących na F = 2, więc niedobór 1 (ręcznie: 1 < 2); wiersze B na S i P zostają;
- po usunięciu C, jako A: jadących na F = 1 (tylko Ala), wiersze Oli na S i P zostają, dziecko Ola nadal istnieje;
- usunięcie członka G1 nie dotyka deklaracji tej samej osoby w G2 (B jest też w G2 z deklaracją na przyszłym terminie G2).

#### 3. Komentarze istniejących testów

**File**: `supabase/tests/event_drivers_rls.test.sql:347`, `supabase/tests/child_attendance_rls.test.sql:372`

**Intent**: Komentarze „row stays, as it does today” opisują stare zachowanie. Poprawić je tak, by mówiły, że przyszłe deklaracje znikają z triggerem, a sprawdza to `member_removal_declarations.test.sql`. Asercje tych plików się nie zmieniają.

**Contract**: tylko komentarze; `plan(…)` bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację bez błędów
- `npx supabase test db` przechodzi, łącznie z `member_removal_declarations.test.sql` i dotychczasowymi plikami
- Celowe zepsucie (`starts_at > now()` → `starts_at >= now()` w triggerze) daje czerwoną asercję dla terminu S; po cofnięciu zielono
- `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Lokalnie: kierowca na przyszłym terminie usunięty SQL-em z `group_members`; po odświeżeniu planu terminu jego miejsca znikają z bilansu i pojawia się ostrzeżenie o niedoborze, gdy miejsc jest za mało

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznego kroku przed fazą 3.

---

## Faza 3: Statystyki na granicach

### Overview

Nowy plik pgTAP z ręcznie policzonym fixture dla przypadków, których brakuje w
`engagement_stats.test.sql`: granica `starts_at = now()`, termin sekundę w przyszłości, dziecko dodane
dokładnie w chwili startu i sekundę po nim, kierowca na terminie, na którym wszystkie dzieci „nie jedzie”,
oraz były członek jako `todo`.

### Changes Required:

#### 1. Test pgTAP

**File**: `supabase/tests/engagement_stats_boundaries.test.sql`

**Intent**: Wyrocznia z PRD (`prd.md:126`, FR-017) i dwóch potwierdzonych reguł: przejazd wymaga ≥1 jadącego dziecka; zakres dziecka zaczyna się od `created_at`. Rachunek każdej liczby jest w komentarzu przy asercji.

**Contract**: fixture (jako postgres):
- G1: A (admin, dzieci Ola i Kuba), B (członek, dziecko Zosia), X (członek, później usunięty);
- terminy: P (`now() - 1 day`), N (`now()`), F (`now() + 1 second`);
- dzieci: Ola `created_at = now() - 10 days`, Zosia `created_at` = dokładnie start P, Kuba `created_at` = start P + 1 sekunda;
- P: Ola i Zosia „nie jedzie”, Kuba brak (poza zakresem); kieruje B;
- N: Ola „jedzie”, Zosia i Kuba bez deklaracji; kierują A i X;
- F: Ola i Zosia „jedzie”; kierują A i B;
- na końcu fixture X zostaje usunięty z `group_members` (trigger z fazy 2 zostawia wiersz X na N, bo N już się rozpoczął).

Oczekiwane, jako A:
- kierowcy (obecni): A = 1 (N; F w przyszłości), B = 0 (P bez jadącego dziecka; F w przyszłości);
- Ola: zakres P, N → obecności 1 (N), nieobecności 1 (P „nie jedzie”);
- Zosia: zakres P, N (P wchodzi, bo `created_at = starts_at`) → obecności 0, nieobecności 2 (P „nie jedzie”, N brak deklaracji);
- Kuba: zakres N (P przed dodaniem) → obecności 0, nieobecności 1 (N brak deklaracji);
- `todo('faza 2 planu testów: byli członkowie zostają w statystykach (PRD Access Control)')`: lista kierowców zawiera X z 1 przejazdem.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi; nowy plik raportuje test `todo` jako oczekiwaną porażkę, bez czerwieni
- Celowe zepsucie (`e.starts_at <= now()` → `e.starts_at < now()` w `group_child_stats`, w lokalnej kopii funkcji w transakcji testu albo w roboczej migracji) daje czerwone asercje dla N; po cofnięciu zielono
- Celowe zepsucie zakresu (`>=` → `>` przy `created_at`) daje czerwoną asercję Zosi; po cofnięciu zielono

**Implementation Note**: Celowe zepsucia wykonuj tylko lokalnie i cofnij przed commitem.

---

## Faza 4: Dokumentacja

### Overview

Zapisać wzorzec testu reguły liczenia i nową bramkę, żeby kolejne fazy i agenci z nich korzystali.

### Changes Required:

#### 1. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.1 wzorcem z tej fazy i zaktualizować tabele o stan po fazie 1.

**Contract**:
- §6.1: wyrocznia = ręcznie policzony przykład z rachunkiem w komentarzu; reguły wyroczni (przejazd wymaga ≥1 jadącego dziecka; zakres dziecka od `created_at`; „zakończony” = `starts_at <= now()` na zegarze bazy); przypadki graniczne: równość miejsc, brak kierowców, bez deklaracji, `starts_at = now()`, `created_at = starts_at`, były członek; warstwa: czyste funkcje TS → Vitest, SQL → pgTAP; celowe zepsucie jako dowód;
- §6.5: notatka o fazie 1 (trigger usuwania członka, `todo` dla byłych członków przekazane fazie 2);
- §3: status fazy 1 według konwencji orkiestratora; §4: wiersz unit = Vitest; §5: bramka unit aktywna.

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Intent**: Sekcja Testing mówi dziś, że nie ma frameworka testów jednostkowych. Zastąpić to informacją o `npm test` (Vitest, `src/**/*.test.ts`) i `npx supabase test db`, a w Commands dopisać `npm test`.

**Contract**: sekcje `## Commands` i `## Testing`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (prettier dla `*.md` w lint-staged)

#### Manual Verification:

- §6.1 test-plan da się zastosować do nowej reguły liczenia bez czytania tego planu

---

## Testing Strategy

### Unit Tests:

- `buildSeatBalance`: kilku kierowców z niedoborem, równość, brak kierowców, zero jadących, maksimum miejsc.
- `buildChildPlan`: dziecko bez deklaracji oznaczone i nieliczone; złożenie z bilansem.

### Integration Tests:

- pgTAP `member_removal_declarations.test.sql`: usunięty kierowca i rodzic nie zmieniają przyszłego bilansu; historia zostaje; izolacja między grupami.
- pgTAP `engagement_stats_boundaries.test.sql`: granice `now()` i `created_at`, termin bez jadących dzieci, były członek (`todo`).

### Manual Testing Steps:

1. W lokalnej bazie usuń SQL-em kierowcę przyszłego terminu z `group_members`, odśwież plan terminu: miejsca znikają, pojawia się „Brakuje N miejsc”.
2. Sprawdź na PR, że job `ci` uruchamia `npm test`.

## Performance Considerations

Trigger wykonuje dwa `delete` ograniczone do jednej grupy i jednego użytkownika. Służy mu indeks `event_drivers_user_id_idx` i klucze `child_attendance`. Usunięcie członka jest rzadkie.

## Migration Notes

Migracja dodaje tylko funkcję i trigger. Nie zmienia istniejących danych: wiersze byłych członków usuniętych wcześniej technicznie zostają. Jeśli takie istnieją w produkcji, można je wyczyścić jednorazowo poza tą zmianą.

## References

- Research: `context/changes/testing-seat-balance-stats/research.md`
- Plan testów: `context/foundation/test-plan.md:54`, `:59`, `:69`
- Wzorzec fixture pgTAP: `supabase/tests/engagement_stats.test.sql`
- Decyzje S-08 / S-09: `context/archive/2026-11-13-driver-declaration-seat-balance/plan.md`, `context/archive/2026-11-16-group-engagement-stats/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest i testy jednostkowe bilansu

#### Automated

- [x] 1.1 `npm test` przechodzi i raportuje testy z `drivers.test.ts` i `attendance.test.ts` — 9c4e4ea
- [x] 1.2 `npm run lint` przechodzi — 9c4e4ea
- [x] 1.3 `npx astro check` przechodzi — 9c4e4ea
- [x] 1.4 Celowe zepsucie (`seats < going` → `seats <= going` w `drivers.ts:97`) daje czerwony test równości; po cofnięciu zielono — 9c4e4ea

#### Manual

- [ ] 1.5 Job `ci` na PR pokazuje krok `npm test` i jest zielony

### Phase 2: Usunięcie członka czyści jego przyszłe deklaracje

#### Automated

- [x] 2.1 `npx supabase db reset` stosuje migrację bez błędów — 721a6f2
- [x] 2.2 `npx supabase test db` przechodzi, łącznie z `member_removal_declarations.test.sql` i dotychczasowymi plikami — 721a6f2
- [x] 2.3 Celowe zepsucie (`starts_at > now()` → `starts_at >= now()` w triggerze) daje czerwoną asercję dla terminu S; po cofnięciu zielono — 721a6f2
- [x] 2.4 `npm run lint` i `npx astro check` przechodzą — 721a6f2

#### Manual

- [x] 2.5 Lokalnie: kierowca na przyszłym terminie usunięty SQL-em z `group_members`; po odświeżeniu planu terminu jego miejsca znikają z bilansu i pojawia się ostrzeżenie o niedoborze, gdy miejsc jest za mało — 721a6f2

### Phase 3: Statystyki na granicach

#### Automated

- [x] 3.1 `npx supabase test db` przechodzi; nowy plik raportuje test `todo` jako oczekiwaną porażkę, bez czerwieni
- [x] 3.2 Celowe zepsucie (`e.starts_at <= now()` → `e.starts_at < now()` w `group_child_stats`, w lokalnej kopii funkcji w transakcji testu albo w roboczej migracji) daje czerwone asercje dla N; po cofnięciu zielono
- [x] 3.3 Celowe zepsucie zakresu (`>=` → `>` przy `created_at`) daje czerwoną asercję Zosi; po cofnięciu zielono

### Phase 4: Dokumentacja

#### Automated

- [ ] 4.1 `npm run lint` przechodzi (prettier dla `*.md` w lint-staged)

#### Manual

- [ ] 4.2 §6.1 test-plan da się zastosować do nowej reguły liczenia bez czytania tego planu
