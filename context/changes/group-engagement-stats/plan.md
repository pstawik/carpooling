# Statystyki zaangażowania grupy — plan implementacji

## Overview

Członek grupy otwiera ze strony grupy osobną stronę `/groups/[id]/statystyki`. Widzi na niej surowe liczby z zakończonych terminów: liczbę przejazdów w roli kierowcy dla każdego członka oraz liczbę obecności i nieobecności dla każdego dziecka. Liczby pochodzą z zapisanych deklaracji i liczą je dwie funkcje SQL `security invoker`. Żeby historia nie znikała, baza blokuje usunięcie dziecka, które ma deklarację na rozpoczętym terminie. Wycinek S-09 z roadmapy (FR-017) zamyka kamień milowy M-1.

## Current State Analysis

- `event_drivers` (wiersz = członek jest kierowcą) i `child_attendance` (wiersz z `going`, brak wiersza = „bez deklaracji”) mają SELECT `is_group_member(group_id)` i są tylko do odczytu od `starts_at <= now()` (`supabase/migrations/20261113120000_create_child_attendance.sql`, `20261113130000_create_event_drivers.sql`). Statystyki niczego nie zapisują, wystarczy odczyt pod RLS wywołującego.
- Indeks `event_drivers_user_id_idx` powstał z myślą o S-09 (`20261113130000_create_event_drivers.sql`). PK `child_attendance (event_id, child_id)` i `child_attendance_child_id_idx` obsługują łączenia po terminie i po dziecku.
- Członkowie czytają wszystkie `group_members` grupy (`20261112120000_tune_group_policies.sql:10-12`) i profile współczłonków (`profiles_select_group_peers`, `20261110120000_create_groups.sql:130`), więc listę członków z nickami da się zbudować pod RLS.
- „Zakończony” znaczy to samo co blokada: `starts_at <= now()` (PRD → Zakończenie terminu). W aplikacji to samo robią `hasStarted` / `splitEvents` (`src/lib/services/events.ts:83-100`).
- **Luka w historii:** `children_delete_own` (`20261112140000_create_children.sql:65-69`) nie ma warunku czasu, a `child_attendance_child_fkey` ma `on delete cascade`. Usunięcie dziecka kasuje więc jego deklaracje z rozpoczętych terminów (komentarz „Revisit before S-09” w `20261113120000_create_child_attendance.sql`, roadmapa S-09 Unknowns).
- Usuwanie dziecka: `deleteChild` (`src/lib/services/children.ts:71-82`) przy 0 usuniętych wierszach zwraca `child_not_found`, a endpoint (`src/pages/api/groups/children/delete.ts`) przekierowuje z `?error=child_not_found#dzieci`.
- Wzorzec strony podrzędnej grupy z 404 dla nie-członków: `src/pages/groups/[id]/terminy/[eventId].astro` (przez `getGroupWithAdmins`).
- Testy: pgTAP w `supabase/tests/*_rls.test.sql`. Rozpoczęte terminy wstawia się tam jako postgres (`child_attendance_rls.test.sql:122`). Smoke HTTP: `scripts/smoke.mjs`. Usuwania członków (FR-007) nie ma w MVP.

## Desired End State

- Na stronie grupy, w karcie „Terminy”, jest link „Statystyki grupy” (min. 44 px) do `/groups/[id]/statystyki`.
- Strona statystyk (nie-członek, nieznane lub błędne id → 404) pokazuje:
  - wiersz „Zakończone terminy: N” i krótkie wyjaśnienie reguł liczenia;
  - kartę „Kierowcy”: każdy obecny członek grupy z nickiem i liczbą przejazdów, np. „0 przejazdów”, „1 przejazd”, „2 przejazdy”, „5 przejazdów”. Członkowie bez przejazdów są na liście;
  - kartę „Dzieci”: każde dziecko grupy z imieniem, nickiem rodzica i wierszem „Obecności: X · Nieobecności: Y”;
  - gdy nie ma zakończonych terminów: tekst „Brak zakończonych terminów — statystyki pojawią się po pierwszym terminie.” zamiast list;
  - obie listy sortowane alfabetycznie (locale `pl`), bez rankingu.
- Reguły liczenia:
  - **przejazd** to wiersz `event_drivers` członka na zakończonym terminie grupy, na który co najmniej jedno dziecko miało `going = true`;
  - **zakres dziecka** to zakończone terminy grupy z `starts_at >= children.created_at`;
  - **obecność** to `going = true` w zakresie dziecka, a **nieobecność** to pozostałe terminy z zakresu (jawne „nie jedzie” i brak deklaracji razem, pokazywane jako jedna liczba).
- Baza odrzuca usunięcie dziecka, które ma deklarację (dowolną, `going` true lub false) na rozpoczętym terminie. Rodzic widzi w `#dzieci` komunikat „Nie można usunąć dziecka, które ma deklaracje na rozpoczętych terminach”. Kaskady z usunięcia grupy i profilu działają dalej, bo akcje referencyjne omijają RLS.
- Weryfikacja: `npx supabase db reset`, `npx supabase test db`, `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`.

### Key Discoveries:

- Wzorzec funkcji `security invoker`, `set search_path = ''`, revoke/grant execute: `supabase/migrations/20261113130000_create_event_drivers.sql` (`set_event_driver`).
- Kolumny wiersza w podzapytaniach `exists` polityk trzeba kwalifikować nazwą tabeli (`children.id`), bo inaczej warunek wiąże się z aliasem podzapytania (`create_child_attendance.sql`, komentarz przed politykami).
- Odczyt pod RLS: funkcja `security invoker` wywołana przez nie-członka zwraca 0 wierszy, a nie błąd. Strona i tak daje wcześniej 404 przez `getGroupWithAdmins`.
- Odmiana: `pluralPl` w `src/lib/plural.ts`, obok `seatsLabel`.
- Kody i teksty błędów: `src/lib/services/group-errors.ts` (`ERROR_MESSAGES`, mapa sekcji, gdzie `child_not_found → "dzieci"`).
- Test „B deletes Kuba” (`supabase/tests/child_attendance_rls.test.sql:330-343`) usuwa dziecko bez deklaracji na rozpoczętym E2, więc po blokadzie nadal przechodzi.

## What We're NOT Doing

- Wskaźnik sprawiedliwości, ranking i sortowanie po liczbie przejazdów (PRD Non-Goals).
- Rozbicie nieobecności na „nie jedzie” i „bez deklaracji”: tylko suma (decyzja z planowania).
- Liczenie przejazdu z samej deklaracji kierowcy, gdy żadne dziecko nie jechało (decyzja z planowania: tylko terminy z co najmniej jednym jadącym dzieckiem).
- Nieobecności za terminy sprzed dodania dziecka (decyzja: zakres od `children.created_at`).
- Miękkie usuwanie dzieci. Zamiast niego jest blokada usunięcia, gdy dziecko ma historię.
- Przetrwanie w statystykach usuniętego dziecka *bez* deklaracji na rozpoczętych terminach. Takie dziecko da się usunąć, a jego nieobecności (same „bez deklaracji”) znikają ze statystyk. Granica decyzji: blokuje tylko istniejąca deklaracja.
- Byli członkowie i ich przejazdy: usuwania członków nie ma (FR-007 w `## Parked`). Lista kierowców obejmuje obecnych członków.
- Filtr okresu, eksport statystyk (PRD Non-Goals), odświeżanie na żywo.
- Statystyki na stronie grupy: tam jest tylko link.

## Implementation Approach

Kolejność jak w S-07/S-08: baza → serwis/API → UI.

- **Blokada usunięcia w polityce, nie w triggerze:** `alter policy children_delete_own` dokłada warunek „brak deklaracji na rozpoczętym terminie”. Polityka nie dotyczy kaskad (usunięcie grupy, profilu), a trigger blokowałby także je.
- **Dwie funkcje statystyk** zamiast jednej, bo zwracają dwa różne zbiory wierszy. Obie są `stable`, `security invoker` i używają `now()` z bazy, czyli tego samego zegara co blokada deklaracji. Zwracają gotowe liczby, więc rozmiar odpowiedzi nie rośnie z liczbą terminów.
- **Sortowanie i formatowanie w TS** (`localeCompare("pl")`, `pluralPl`), jak w istniejących serwisach.
- **Strona jest czystym Astro**, bez wyspy React, bo nic tu nie jest interaktywne.

## Critical Implementation Details

- **DELETE odrzucony przez RLS usuwa 0 wierszy bez błędu.** Żeby odróżnić „to nie Twoje dziecko / go nie ma” od „ma historię”, `deleteChild` przy 0 wierszach sprawdza, czy dziecko o tym id w tej grupie należy do wywołującego (`children` z `parent_id = userId`). Jeśli tak, wynik to `child_has_history`, a w przeciwnym razie `child_not_found` jak dziś. Członek usunięty z grupy, który próbuje usunąć swoje dziecko, nie widzi go już pod RLS, więc dostaje `child_not_found`, tak jak dziś.
- **Liczba przejazdów to liczba różnych terminów**, nie wierszy po złączeniu z `child_attendance`. Łączenie wiersza kierowcy z wieloma jadącymi dziećmi bez `exists` / `count(distinct …)` zawyżyłoby wynik.

## Phase 1: Baza — blokada usuwania dziecka z historią i funkcje statystyk

### Overview

Dwie migracje: zmiana polityki usuwania dzieci oraz dwie funkcje odczytu statystyk. Do tego testy pgTAP, które dowodzą reguł liczenia i blokady.

### Changes Required:

#### 1. Blokada usunięcia dziecka z historią

**File**: `supabase/migrations/20261116120000_lock_child_delete_with_history.sql`

**Intent**: Usunięcie dziecka z deklaracją na rozpoczętym terminie skasowałoby kaskadowo historię statystyk. Polityka DELETE ma takie dziecko odrzucać. Nagłówek wyjaśnia, że to zamyka wyjątek opisany w `20261113120000_create_child_attendance.sql` („Accepted exception to the lock”), a kaskady z grupy i profilu omijają RLS.

**Contract**: `alter policy children_delete_own on public.children using (...)`: dotychczasowy warunek plus brak deklaracji na rozpoczętym terminie. Kolumna wiersza jest kwalifikowana nazwą tabeli:

```sql
using (
  parent_id = (select auth.uid())
  and public.is_group_member(group_id)
  and not exists (
    select 1
    from public.child_attendance ca
    join public.events e on e.id = ca.event_id
    where ca.child_id = children.id
      and e.starts_at <= now()
  )
)
```

#### 2. Funkcje statystyk

**File**: `supabase/migrations/20261116130000_create_engagement_stats.sql`

**Intent**: Gotowe liczby FR-017 dla jednej grupy, liczone pod RLS wywołującego. Nagłówek opisuje trzy reguły: przejazd wymaga co najmniej jednego jadącego dziecka, zakres dziecka zaczyna się od `created_at`, a nieobecność = zakres − obecności.

**Contract**:
- `public.group_driver_stats(p_group_id uuid) returns table (user_id uuid, nick text, drives integer)`, `language sql stable security invoker set search_path = ''`:
  - jeden wiersz na każdego członka z `public.group_members` grupy (left join, bo członek bez przejazdów ma `drives = 0`); `nick` z `public.profiles`;
  - `drives` = liczba różnych terminów `e` z `e.group_id = p_group_id`, `e.starts_at <= now()`, gdzie istnieje `event_drivers` członka na `e` i istnieje `child_attendance` z `going = true` na `e`.
- `public.group_child_stats(p_group_id uuid) returns table (child_id uuid, name text, parent_nick text, present integer, absent integer)`, ta sama konfiguracja:
  - jeden wiersz na każde dziecko z `public.children` grupy; `parent_nick` z `public.profiles`;
  - zakres = terminy grupy z `starts_at <= now()` i `starts_at >= c.created_at`;
  - `present` = terminy z zakresu z `child_attendance.going = true` dla dziecka;
  - `absent` = liczność zakresu − `present`.
- Obie: liczniki rzutowane na `integer`; `revoke execute … from public, anon; grant execute … to authenticated`.

#### 3. Testy pgTAP

**File**: `supabase/tests/engagement_stats.test.sql` (nowy); `supabase/tests/children_rls.test.sql` (rozszerzenie)

**Intent**: Dowód reguł liczenia, izolacji i blokady w bazie. Fixture jak w `child_attendance_rls.test.sql`: użytkownicy A, B (członkowie G1) i C (nie-członek). Terminy i deklaracje wstawiane jako postgres, z jawnym `created_at` dzieci.

**Contract** — przypadki w `engagement_stats.test.sql`:
- Fixture G1: terminy T1 (zakończony, sprzed dodania Zosi), T2, T3 i T5 (zakończone, po dodaniu obu dzieci), T4 (przyszły). Dziecko Ola (A, dodana przed T1), Zosia (B, dodana między T1 a T2). Członek D w G1 bez żadnych deklaracji.
- Ola: T1 jedzie, T2 nie jedzie, T3 jedzie, T5 nie jedzie, T4 jedzie → `present = 2`, `absent = 2` (przyszły T4 się nie liczy).
- Zosia: T2 jedzie, T3 jedzie, T5 bez deklaracji → `present = 2`, `absent = 1` (T1 sprzed dodania pominięty).
- A kierowcą na T1, T3 i T5 → `drives = 2`: T5 bez jadących dzieci się nie liczy, a T3 z dwojgiem jadących liczy się raz.
- B kierowcą na T2 i T4 → `drives = 1` (T4 przyszły).
- D jest w wynikach z `drives = 0`.
- C wywołuje obie funkcje dla G1 → 0 wierszy. Dane G2 nie trafiają do wyników G1.
- `anon` nie ma `execute` na żadnej z funkcji.

Przypadki dopisane w `children_rls.test.sql`. Dzisiejszy fixture (A, B w G1, C w G2, D bez grupy) nie ma terminów ani deklaracji, więc:
- jako postgres wstawić w G1 termin rozpoczęty i termin przyszły oraz dwoje dodatkowych dzieci A: jedno z deklaracją `going = false` na rozpoczętym terminie, drugie z deklaracją `going = true` tylko na przyszłym;
- nowe przypadki umieścić przed blokiem „A deletes their own child” (`children_rls.test.sql:220` i dalej), żeby nie zmieniać stanu, na którym opierają się dalsze asercje;
- podbić `select plan(39)` (linia 7) o liczbę nowych asercji.

Przypadki:
- A usuwa swoje dziecko z deklaracją `going = false` na rozpoczętym terminie → 0 wierszy, dziecko i deklaracja zostają.
- A usuwa swoje dziecko z deklaracją tylko na przyszłym terminie → usunięte.
- Usunięcie grupy nadal usuwa dzieci z historią (kaskada omija RLS).
- `policies_are` bez zmian (te same cztery nazwy).

### Success Criteria:

#### Automated Verification:

- Migracje aplikują się na czystej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, w tym nowy plik i rozszerzone `children_rls.test.sql`: `npx supabase test db`

#### Manual Verification:

- Przegląd migracji: kwalifikacja `children.id` w polityce, `stable security invoker set search_path = ''`, granty execute i nagłówki zgodne ze wzorcem `create_event_drivers.sql`

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Serwis statystyk i komunikat blokady usuwania

### Overview

Serwis odczytu statystyk oraz rozpoznanie blokady przy usuwaniu dziecka, z komunikatem w sekcji „Dzieci”.

### Changes Required:

#### 1. Serwis statystyk

**File**: `src/lib/services/stats.ts`

**Intent**: Odczyt obu funkcji SQL i mapowanie na kształty widoku, posortowane alfabetycznie.

**Contract**:
- `DriverStat { userId: string; nick: string | null; drives: number }`.
- `ChildStat { childId: string; name: string; parentNick: string | null; present: number; absent: number }`.
- `getGroupStats(supabase, groupId): Promise<{ drivers: DriverStat[]; children: ChildStat[] }>`: oba `rpc` w `Promise.all`; `drivers` po nicku, `children` po imieniu (`localeCompare(…, "pl")`); rzuca przy błędzie (jak `listEventDrivers`).

#### 2. Usuwanie dziecka rozpoznaje historię

**File**: `src/lib/services/children.ts`

**Intent**: Odróżnić odmowę z powodu historii od nieznanego lub cudzego dziecka (patrz Critical Implementation Details).

**Contract**:
- `ChildWriteFailure` dostaje `"child_has_history"`.
- `deleteChild(supabase, { groupId, childId, userId })`: przy 0 usuniętych wierszach `select id from children where id = childId and group_id = groupId and parent_id = userId`. Wiersz istnieje → `child_has_history`, a w przeciwnym razie `child_not_found`.

#### 3. Endpoint usuwania

**File**: `src/pages/api/groups/children/delete.ts`

**Intent**: Przekazać `userId` do serwisu. Nowy kod idzie istniejącą ścieżką `?error=<failure>#dzieci`, a komentarz nagłówka wspomina blokadę.

**Contract**: `deleteChild(supabase, { groupId, childId, userId: context.locals.user.id })`; `child_has_history` → `/groups/${groupId}?error=child_has_history#dzieci`.

#### 4. Komunikat

**File**: `src/lib/services/group-errors.ts`

**Intent**: Tekst i sekcja dla nowego kodu.

**Contract**: `ERROR_MESSAGES.child_has_history = "Nie można usunąć dziecka, które ma deklaracje na rozpoczętych terminach"`; w mapie sekcji `child_has_history → "dzieci"`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Po przestawieniu w bazie `starts_at` terminu z deklaracją dziecka na przeszłość usunięcie tego dziecka wraca z komunikatem w karcie „Dzieci”, a dziecko zostaje; dziecko bez historii usuwa się jak dotąd

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Strona statystyk, link i smoke

### Overview

Widok `/groups/[id]/statystyki` zoptymalizowany pod 360 px, link ze strony grupy i kroki smoke.

### Changes Required:

#### 1. Strona statystyk

**File**: `src/pages/groups/[id]/statystyki.astro`

**Intent**: FR-017 w jednym widoku. Ochrona i 404 jak w `terminy/[eventId].astro` (`createClient`, `getGroupWithAdmins`, a przy braku → `rewrite("/404")`). Klasy kart, nagłówka i linku powrotu jak na stronie grupy.

**Contract**:
- Wczytanie: `listGroupEvents` + `splitEvents(…, now)` dają `past.length`, a `getGroupStats` daje listy, oba w `Promise.all`. Błąd → karta z komunikatem „Nie udało się wczytać statystyk” i `console.error` (wzorzec strony grupy).
- Nagłówek `h1` „Statystyki — <nazwa grupy>” (`break-words`), wiersz „Zakończone terminy: N” i zdanie wyjaśnienia: „Przejazd liczy się, gdy na termin jechało co najmniej jedno dziecko. Nieobecność to „nie jedzie” albo brak deklaracji, liczone od dodania dziecka.”
- `past.length === 0` → tekst „Brak zakończonych terminów — statystyki pojawią się po pierwszym terminie.” bez list.
- `past.length` liczy się z zegara Workera, a listy z `now()` w bazie. Rozjazd jest akceptowalny: dotyczy tylko terminu startującego w tych samych milisekundach i znika przy następnym odświeżeniu. Nie synchronizujemy zegarów.
- Karta „Kierowcy”: wiersz na członka: nick (`break-words`) i etykieta przejazdów przez nowy helper `drivesLabel(count)` w `src/lib/plural.ts` („0 przejazdów”, „1 przejazd”, „2 przejazdy”, „5 przejazdów”, „22 przejazdy”).
- Karta „Dzieci”: imię, „(nick rodzica)” i „Obecności: X · Nieobecności: Y”. Pusta lista dzieci → „W grupie nie ma jeszcze dzieci.”
- Link „Wróć do grupy” (`/groups/[id]`, min. 44 px).
- Przy 360 px brak przewijania w poziomie; liczby łamią się pod nazwą zamiast rozpychać wiersz.

#### 2. Link ze strony grupy

**File**: `src/pages/groups/[id].astro`

**Intent**: Wejście do statystyk z karty „Terminy”, widoczne dla każdego członka.

**Contract**: link `<a href="/groups/${group.id}/statystyki">Statystyki grupy</a>` pod listą „Minione terminy” (przed formularzami admina), `min-h-11`, w stylu linku „Wróć do panelu”.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Strona renderuje się dla członka i jest ukryta przed obcym. Liczby z zakończonych terminów pokrywa pgTAP, bo smoke nie tworzy rozpoczętych terminów.

**Contract**:
- Jako rodzic (w sekcji z krokami planu terminu, przed wylogowaniem): GET strony grupy zawiera `/statystyki`; GET `/groups/<id>/statystyki` → 200, zawiera „Statystyki” i „Brak zakończonych terminów”.
- Jako obcy (sekcja `outsider`): GET `/groups/<id>/statystyki` → 404.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na uruchomionym serwerze: `npm run smoke`

#### Manual Verification:

- Przy 360 px strona statystyk nie przewija się w poziomie, długie nicki i imiona się łamią, a link powrotu i link ze strony grupy mają co najmniej 44 px
- Po przestawieniu w bazie kilku terminów na przeszłość liczby na stronie zgadzają się z regułami (przejazd tylko z jadącym dzieckiem, zakres od dodania dziecka, nieobecność = „nie jedzie” + brak deklaracji)
- Członek bez przejazdów jest na liście z „0 przejazdów”; pusty stan pojawia się w grupie bez zakończonych terminów

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (AGENTS.md). Reguły liczenia są w SQL i pokrywa je pgTAP. `drivesLabel` sprawdza się wzrokowo na stronie (0, 1, 2, 5).

### Integration Tests:

- pgTAP `engagement_stats.test.sql`: przejazd tylko z jadącym dzieckiem, brak podwójnego liczenia, członek z 0, zakres od `created_at`, przyszłe terminy pominięte, izolacja grup, brak dostępu `anon`.
- pgTAP `children_rls.test.sql`: blokada usunięcia z historią (także `going = false`), brak blokady dla przyszłych deklaracji, kaskada z grupy.
- Smoke: render strony dla członka, link ze strony grupy, 404 dla obcego.

### Manual Testing Steps:

1. Jako członek otwórz stronę grupy i przejdź linkiem „Statystyki grupy”. W grupie bez zakończonych terminów widać pusty stan.
2. W bazie przestaw `starts_at` dwóch terminów z deklaracjami na przeszłość; odśwież. Liczby przejazdów i obecności zgadzają się z deklaracjami.
3. Dodaj nowe dziecko i odśwież. Ma „Obecności: 0 · Nieobecności: 0”, bo wcześniejsze terminy go nie dotyczą.
4. Spróbuj usunąć dziecko z deklaracją na zakończonym terminie. Pojawia się komunikat w „Dzieci”, a dziecko zostaje.
5. Ustaw szerokość 360 px i sprawdź brak poziomego przewijania.

## Performance Considerations

Skala mała (jedna grupa, kilkadziesiąt terminów rocznie). Funkcje zwracają po jednym wierszu na członka i na dziecko. Łączenia korzystają z PK `child_attendance`, `event_drivers` i indeksów na `user_id` / `child_id`. Strona robi trzy zapytania w `Promise.all`, a strona grupy nie liczy statystyk.

## Migration Notes

Brak zmian danych. Zmiana polityki działa od razu: dzieci z historią na rozpoczętych terminach przestają być usuwalne przez rodzica. Wycofanie polega na przywróceniu poprzedniego `using` polityki i usunięciu funkcji.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-09)
- PRD: `context/foundation/prd.md` (FR-017, Business Logic → Zaangażowanie, Zakończenie terminu)
- Polityka do zmiany: `supabase/migrations/20261112140000_create_children.sql:65-69`
- Wyjątek do zamknięcia: `supabase/migrations/20261113120000_create_child_attendance.sql` (nagłówek)
- Wzorzec funkcji i grantów: `supabase/migrations/20261113130000_create_event_drivers.sql`
- Wzorzec pgTAP: `supabase/tests/child_attendance_rls.test.sql`, `supabase/tests/children_rls.test.sql`
- Wzorzec strony podrzędnej: `src/pages/groups/[id]/terminy/[eventId].astro`
- Poprzedni wycinek: `context/archive/2026-11-13-driver-declaration-seat-balance/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — blokada usuwania dziecka z historią i funkcje statystyk

#### Automated

- [x] 1.1 Migracje aplikują się na czystej bazie: `npx supabase db reset` — cfd3af5
- [x] 1.2 Wszystkie testy pgTAP przechodzą, w tym nowy plik i rozszerzone `children_rls.test.sql`: `npx supabase test db` — cfd3af5

#### Manual

- [x] 1.3 Przegląd migracji: kwalifikacja `children.id` w polityce, `stable security invoker set search_path = ''`, granty execute i nagłówki zgodne ze wzorcem `create_event_drivers.sql` — cfd3af5

### Phase 2: Serwis statystyk i komunikat blokady usuwania

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 4a3764f
- [x] 2.2 Typy przechodzą: `npx astro check` — 4a3764f
- [x] 2.3 Build przechodzi: `npm run build` — 4a3764f

#### Manual

- [x] 2.4 Po przestawieniu w bazie `starts_at` terminu z deklaracją dziecka na przeszłość usunięcie tego dziecka wraca z komunikatem w karcie „Dzieci”, a dziecko zostaje; dziecko bez historii usuwa się jak dotąd — 4a3764f

### Phase 3: Strona statystyk, link i smoke

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 7b9af9a
- [x] 3.2 Typy przechodzą: `npx astro check` — 7b9af9a
- [x] 3.3 Build przechodzi: `npm run build` — 7b9af9a
- [x] 3.4 Smoke przechodzi na uruchomionym serwerze: `npm run smoke` — 7b9af9a

#### Manual

- [x] 3.5 Przy 360 px strona statystyk nie przewija się w poziomie, długie nicki i imiona się łamią, a link powrotu i link ze strony grupy mają co najmniej 44 px — 7b9af9a
- [x] 3.6 Po przestawieniu w bazie kilku terminów na przeszłość liczby na stronie zgadzają się z regułami (przejazd tylko z jadącym dzieckiem, zakres od dodania dziecka, nieobecność = „nie jedzie” + brak deklaracji) — 7b9af9a
- [x] 3.7 Członek bez przejazdów jest na liście z „0 przejazdów”; pusty stan pojawia się w grupie bez zakończonych terminów — 7b9af9a
