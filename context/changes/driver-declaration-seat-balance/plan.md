# Deklaracja kierowcy i bilans miejsc — plan implementacji

## Overview

Członek grupy deklaruje się na stronie planu terminu jako kierowca z liczbą miejsc dla dzieci (1–8). Może zmienić liczbę miejsc albo wycofać deklarację do chwili rozpoczęcia terminu. Plan terminu pokazuje na górze kartę bilansu: liczbę jadących dzieci, sumę miejsc i ostrzeżenie „Brakuje K miejsc” albo potwierdzenie „Miejsc wystarcza”. Pokazuje też listę kierowców z liczbą miejsc i telefonem (jeśli podany). Wycinek S-08 z roadmapy (FR-015, FR-016, US-01) i jej gwiazda przewodnia: po nim plan terminu odpowiada w całości na US-01.

## Current State Analysis

- Tabeli deklaracji kierowców nie ma. Ostatnia migracja to `supabase/migrations/20261113120000_create_child_attendance.sql`.
- Strona planu `src/pages/groups/[id]/terminy/[eventId].astro` pokazuje sekcję „Twoje dzieci” i „Plan dzieci” (`Jadą (N)` / `Nie jadą (M)`). Brakuje kierowców i bilansu.
- `events` ma już unikalne `(id, group_id)` (`create_child_attendance.sql:27-28`), więc złożony FK z nowej tabeli nie wymaga zmian w `events`.
- Telefon jest czytelny dla członków wspólnej grupy dzięki polityce `profiles` przez `shares_group_with(id)` (`supabase/migrations/20261110120000_create_groups.sql:129-134`). Zmiany RLS profili nie są potrzebne.
- Członkostwo: `group_members (group_id, user_id)`, PK `(group_id, user_id)` (`create_groups.sql:28-34`); `is_group_member(group_id)` jest dostępne dla `authenticated`.
- Endpoint deklaracji dziecka (`src/pages/api/groups/events/attendance.ts`) to wzorzec: zod → serwis (RPC) → rozróżnienie 42501 przez `getGroupEvent` + `hasStarted` → `?error=attendance_locked#kotwica` albo 404.
- Testy: pgTAP w `supabase/tests/*_rls.test.sql` (wzorzec `child_attendance_rls.test.sql`), smoke HTTP w `scripts/smoke.mjs` (kroki planu terminu przy `:122-160` i `:540-555`).

## Desired End State

- Na stronie planu terminu, pod nagłówkiem, jest karta „Bilans miejsc” z wierszem „<jadący> · <miejsca>”, np. „Jedzie 1 dziecko · 2 miejsca”, „Jadą 3 dzieci · 5 miejsc”, „Jedzie 0 dzieci · 0 miejsc”. Pod nią:
  - czerwone ostrzeżenie „Brakuje K miejsc”, gdy `M < N` (także przy 0 kierowców i co najmniej jednym jadącym dziecku);
  - zielone „Miejsc wystarcza”, gdy `N ≥ 1` i `M ≥ N`;
  - neutralne „Żadne dziecko jeszcze nie jedzie”, gdy `N = 0`, bez ostrzeżenia.
- Sekcja `id="twoj-przejazd"` (dla każdego członka): przed rozpoczęciem formularz z polem liczby miejsc (1–8) i przyciskiem „Jadę jako kierowca” albo „Zapisz miejsca”, gdy deklaracja już istnieje, oraz przycisk „Wycofaj”. Po rozpoczęciu terminu tylko stan deklaracji i informacja o blokadzie.
- Sekcja „Kierowcy (K)”: każdy kierowca z nickiem, liczbą miejsc i telefonem jako link `tel:`, jeśli podany. Pusta lista ma tekst zastępczy.
- Baza odrzuca: deklarację za kogoś innego, deklarację w obcej grupie lub jako nie-członek, zapis, zmianę i wycofanie po rozpoczęciu terminu oraz liczbę miejsc spoza 1–8. Usunięcie terminu usuwa jego deklaracje kierowców kaskadowo.
- Weryfikacja: pgTAP (`npx supabase test db`), `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`.

### Key Discoveries:

- Wzorzec tabeli, grantów kolumnowych, polityk z blokadą czasową i RPC `security invoker`: `supabase/migrations/20261113120000_create_child_attendance.sql:37-177`.
- Kwalifikacja kolumn w podzapytaniach `exists` nazwą tabeli (`child_attendance.group_id`): bez niej warunek binduje się do aliasu podzapytania i jest zawsze prawdziwy (`create_child_attendance.sql:75-77`).
- Embedding `profiles(nick)` w `listGroupChildren` (`src/lib/services/children.ts:36-48`) działa, bo istnieje FK do `profiles`. Nowa tabela potrzebuje FK `user_id → profiles(id)`, żeby `profiles(nick, phone)` dało się dociągnąć w jednym zapytaniu.
- `buildChildPlan` (`src/lib/services/attendance.ts:71-84`) zwraca `plan.going`. Bilans liczy `N = plan.going.length`, więc dzieci „bez deklaracji” nie zwiększają zapotrzebowania (FR-014).
- Kody błędów i ich teksty są w `src/lib/services/group-errors.ts:8-27`. Strona planu wyświetla tylko swoje kody (`[eventId].astro:37-39`).

## What We're NOT Doing

- Przypisywanie dzieci do konkretnych aut („kto kogo zabiera”) — PRD Non-Goals.
- Dodatkowa uwaga przy bilansie o dzieciach „bez deklaracji” — wystarcza etykieta przy dziecku (FR-014, decyzja z planowania).
- Kierowca bez wolnych miejsc (0 miejsc) i auta z więcej niż 8 miejscami dla dzieci — zakres 1–8 (decyzja z planowania).
- Flaga „nie jadę” w wierszu: wycofanie usuwa wiersz, brak wiersza = brak deklaracji kierowcy.
- Deklaracje kierowcy członka usuniętego z grupy (FR-007 w `## Parked`). Polityki zapisu wymagają członkostwa, a odczyt pokazuje istniejące wiersze. Decyzja zostaje przy FR-007.
- Statystyki przejazdów w roli kierowcy (S-09).
- Odświeżanie na żywo: nowy stan widać po przeładowaniu (NFR „Aktualność planu”).
- Deklarowanie z poziomu strony grupy: formularz jest tylko na stronie planu terminu.

## Implementation Approach

Kolejność jak w S-07: baza → API → UI.

- **Model danych:** `event_drivers (event_id, user_id, group_id, seats smallint check 1..8)` z kluczem `(event_id, user_id)`, czyli jedna deklaracja na członka na termin, a w terminie może być wielu kierowców. Złożony FK `(event_id, group_id) → events (id, group_id) on delete cascade` gwarantuje zgodność grupy. `user_id → profiles(id) on delete cascade` umożliwia embedding nicku i telefonu.
- **Zapis i zmiana przez RPC `set_event_driver(p_event_id, p_seats)`** (`security invoker`): z tego samego powodu co w S-07 upsert z PostgREST wymagałby UPDATE na kolumnach kluczy. `user_id` bierze się z `auth.uid()`, nie z formularza.
- **Wycofanie to bezpośredni `DELETE`** pod polityką „własny wiersz, członek, termin nierozpoczęty”, z `.select()`, żeby wykryć 0 usuniętych wierszy.
- **Bilans** liczy czysta funkcja `buildSeatBalance(drivers, goingCount)`; strona tylko go renderuje.
- **Strona** zostaje czystym Astro z formularzami POST, bez wyspy React.

## Critical Implementation Details

- **DELETE pod RLS nie rzuca błędu:** wycofanie po rozpoczęciu terminu albo przez nie-członka usuwa 0 wierszy bez błędu. Endpoint przy 0 usuniętych wierszach pobiera termin (`getGroupEvent`):
  - brak terminu (obca grupa, nie-członek) → 404;
  - termin rozpoczęty → `?error=driver_locked#twoj-przejazd`;
  - termin nierozpoczęty → zwykły powrót na plan, bo deklaracji już nie było (podwójne kliknięcie, nieaktualna strona).
- **Liczba miejsc pochodzi od użytkownika:** zła wartość (pusta, 0, 9, nie liczba) to błąd formularza z komunikatem `invalid_driver_seats`, a nie 404. 404 dostają tylko pola ukryte (`group_id`, `event_id`, `action`). CHECK w bazie (23514) jest drugą linią obrony i mapuje się na ten sam kod.

## Phase 1: Tabela kierowców i RLS

### Overview

Migracja tworzy tabelę deklaracji kierowców z izolacją grup, zapisem tylko własnej deklaracji, blokadą po rozpoczęciu terminu, wycofaniem przez DELETE i kaskadą z terminu. Do tego funkcja zapisu i testy pgTAP.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261113130000_create_event_drivers.sql`

**Intent**: Nowa tabela z politykami w tej samej migracji (twarda reguła AGENTS.md) i funkcja zapisu. Nagłówek opisuje reguły w stylu `create_child_attendance.sql:1-20`: brak wiersza = nie jest kierowcą, wycofanie = DELETE, blokada od `starts_at`, miejsca 1–8, kaskada z terminu, `user_id` i klucze niezmienne.

**Contract**:
- `public.event_drivers`:
  - kolumny: `event_id uuid not null`, `user_id uuid not null references public.profiles (id) on delete cascade`, `group_id uuid not null`, `seats smallint not null constraint event_drivers_seats_range check (seats between 1 and 8)`, `created_at` / `updated_at timestamptz not null default now()`;
  - `primary key (event_id, user_id)`;
  - `foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade`;
  - indeks na `user_id` (kaskada z profilu, przyszłe statystyki S-09).
- RLS włączone. `revoke all … from anon`; `revoke truncate, insert, update, delete … from authenticated`; `grant insert (event_id, user_id, group_id, seats)`, `grant update (seats, updated_at)`, `grant delete … to authenticated`.
- Polityki (`to authenticated`, kolumny wiersza w podzapytaniach kwalifikowane `event_drivers.`):
  - `event_drivers_select_group_member`: `using (public.is_group_member(group_id))`;
  - `event_drivers_insert_own`: `with check`: `user_id = (select auth.uid())`, `is_group_member(event_drivers.group_id)` i `exists` na `events` (`id = event_drivers.event_id`, `group_id = event_drivers.group_id`, `starts_at > now()`);
  - `event_drivers_update_own`: ten sam warunek w `using` i `with check`;
  - `event_drivers_delete_own`: ten sam warunek w `using`.
- Funkcja `public.set_event_driver(p_event_id uuid, p_seats smallint) returns void`, `language plpgsql security invoker set search_path = ''`:
  - odczytuje `group_id` terminu z `public.events` pod RLS wywołującego; gdy brak wiersza, rzuca `42501`;
  - `insert … (event_id, user_id, group_id, seats) values (p_event_id, auth.uid(), v_group_id, p_seats) on conflict (event_id, user_id) do update set seats = excluded.seats, updated_at = now()`;
  - `revoke execute … from public, anon; grant execute … to authenticated`.

#### 2. Testy pgTAP

**File**: `supabase/tests/event_drivers_rls.test.sql`

**Intent**: Dowód, że reguły działają w bazie. Struktura jak w `supabase/tests/child_attendance_rls.test.sql`: użytkownicy-fixture A/B (członkowie) i C (nie-członek), impersonacja przez `request.jwt.claims`, termin miniony wstawiany jako postgres.

**Contract** — przypadki:
- `policies_are` dokładnie cztery polityki; `anon` bez uprawnień; `authenticated` ma UPDATE tylko na `seats` i `updated_at`.
- A deklaruje 3 miejsca, potem 5: jeden wiersz z `seats = 5`. A i B deklarują się na ten sam termin: dwa wiersze.
- B widzi deklarację A razem z `profiles.phone`; C widzi 0 wierszy.
- C wywołuje `set_event_driver` → 42501. Liczba miejsc 0 i 9 → 23514.
- Termin rozpoczęty: `set_event_driver` → 42501, także zmiana istniejącej deklaracji; `delete` własnego wiersza usuwa 0 wierszy.
- B usuwa wiersz A → 0 wierszy; A usuwa własny wiersz na nierozpoczętym terminie → wiersz znika.
- Bezpośredni `update … set user_id = …` jako A → 42501 (brak uprawnienia kolumnowego).
- Bezpośredni `insert` z `group_id` innym niż grupa terminu (jako postgres) → 23503.
- Usunięcie terminu usuwa jego deklaracje kierowców.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`

#### Manual Verification:

- Przegląd migracji: cztery polityki per operacja, granty kolumnowe, CHECK 1–8 i komentarz nagłówka zgodne ze wzorcem `create_child_attendance.sql`

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Serwis i endpoint

### Overview

Warstwa aplikacji: typ wiersza, walidacja formularza, serwis odczytu, zapisu i wycofania, czysta funkcja bilansu, kody komunikatów i endpoint POST.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Typ wiersza deklaracji kierowcy obok `ChildAttendance`.

**Contract**: `EventDriver { event_id; user_id; group_id; seats: number; created_at; updated_at }` z komentarzem: czytelny dla członków, zapis przez `set_event_driver`, wycofanie przez DELETE, tylko do rozpoczęcia terminu.

#### 2. Walidacja

**File**: `src/lib/validation/drivers.ts`

**Intent**: Schemat zod formularza kierowcy. Pola ukryte i liczba miejsc są walidowane osobno, żeby endpoint odróżnił zmanipulowany formularz (404) od złej liczby miejsc (komunikat).

**Contract**:
- `driverFormSchema`: `group_id`, `event_id` jako `z.uuid()`, `action` jako `z.enum(["set", "withdraw"])`.
- `driverSeatsSchema`: `seats` jako `z.coerce.number().int().min(1).max(8)`; sprawdzany tylko przy `action = "set"`.

#### 3. Serwis kierowców

**File**: `src/lib/services/drivers.ts`

**Intent**: Odczyt kierowców terminu z nickiem i telefonem, zapis przez RPC, wycofanie przez DELETE oraz bilans miejsc.

**Contract**:
- `EventDriverEntry { userId; nick: string | null; phone: string | null; seats: number }`.
- `listEventDrivers(supabase, eventId): Promise<EventDriverEntry[]>`: `select("user_id, seats, profiles(nick, phone)")`, posortowane po nicku (locale `pl`); rzuca przy błędzie.
- `setEventDriver(supabase, { eventId, seats })`: 42501 → `forbidden`, 23514 → `invalid_seats`, reszta → `unknown`.
- `withdrawEventDriver(supabase, { eventId, userId })`: `.delete().eq("event_id").eq("user_id").select("event_id")`; zwraca `{ ok: true; deleted: boolean }` albo `{ ok: false; failure: "unknown" }`.
- `SeatBalance { going: number; seats: number; missing: number; status: "none_going" | "enough" | "shortage" }`.
- `buildSeatBalance(drivers, goingCount): SeatBalance`: `seats` = suma miejsc, `missing = max(0, going − seats)`, a `status`: `none_going` gdy `going = 0`, `shortage` gdy `seats < going`, w przeciwnym razie `enough`.

#### 4. Kody komunikatów

**File**: `src/lib/services/group-errors.ts`

**Intent**: Komunikaty dla sekcji „Twój przejazd”.

**Contract**: `ERROR_MESSAGES.driver_locked = "Termin już się rozpoczął — deklaracji kierowcy nie można zmienić"`, `ERROR_MESSAGES.invalid_driver_seats = "Podaj liczbę miejsc od 1 do 8"`.

#### 5. Endpoint

**File**: `src/pages/api/groups/events/driver.ts`

**Intent**: Deklaracja, zmiana albo wycofanie deklaracji kierowcy zalogowanego członka i powrót na plan. Wzorzec jak w `src/pages/api/groups/events/attendance.ts`.

**Contract**: `POST` z polami `group_id`, `event_id`, `action`, opcjonalnie `seats`:
- brak użytkownika → `/auth/signin`;
- body nie jest formularzem albo `driverFormSchema` nie przechodzi → `rewrite("/404")`;
- `action = set` i zła liczba miejsc → `{plan}?error=invalid_driver_seats#twoj-przejazd`;
- brak klienta Supabase → `?error=not_configured`;
- `set` sukces / `withdraw` z `deleted = true` → `{plan}#twoj-przejazd`;
- `set` `forbidden` albo `withdraw` z `deleted = false` → `getGroupEvent`: brak terminu → `rewrite("/404")`; termin rozpoczęty → `?error=driver_locked#twoj-przejazd`; `set` na nierozpoczętym → `rewrite("/404")`; `withdraw` na nierozpoczętym → `{plan}#twoj-przejazd`;
- `invalid_seats` → `?error=invalid_driver_seats#twoj-przejazd`;
- `unknown` → `console.error` i `?error=unknown` bez kotwicy.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Ręczny POST `set` zapisuje wiersz w `event_drivers`, `withdraw` go usuwa, `seats=9` wraca z komunikatem, a błędny uuid daje 404

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Plan terminu z kierowcami i bilansem

### Overview

Strona planu dostaje kartę bilansu na górze, sekcję własnej deklaracji kierowcy i listę kierowców; smoke pokrywa przepływ end-to-end.

### Changes Required:

#### 1. Strona planu

**File**: `src/pages/groups/[id]/terminy/[eventId].astro`

**Intent**: Pełny plan terminu z US-01. Bilans jest widoczny od razu po wejściu, bez przewijania na 360 px. Klasy kart, przycisków i kotwic jak w istniejących sekcjach strony.

**Contract**:
- Wczytanie: `listEventDrivers` dołączone do istniejącego `Promise.all`. Błąd → karta z komunikatem „Nie udało się wczytać planu”, jak dziś. `balance = buildSeatBalance(drivers, plan.going.length)`.
- Kolejność sekcji: nagłówek → banner błędu → **karta „Bilans miejsc”** → „Twój przejazd” → „Twoje dzieci” → „Kierowcy (K)” → „Plan dzieci”.
- Karta bilansu (`id="bilans"`): wiersz „<jadący> · <miejsca>” według reguły odmiany niżej (np. „Jadą 3 dzieci · 5 miejsc”) oraz:
  - `shortage` → czerwony alert `role="alert"` „Brakuje K miejsc”;
  - `enough` → zielone „Miejsc wystarcza”;
  - `none_going` → neutralne „Żadne dziecko jeszcze nie jedzie”.
- „Twój przejazd” (`id="twoj-przejazd"`, scroll-mt) dla każdego członka. Pokazuje błędy `driver_locked` / `invalid_driver_seats`.
  - Przed startem: formularz POST `/api/groups/events/driver` (`action=set`) z polem `type="number" inputmode="numeric" min=1 max=8 required`. Bez deklaracji pole jest puste z placeholderem „np. 3” (nie zgadujemy liczby za członka); przy istniejącej deklaracji ma jej bieżącą liczbę miejsc. Przycisk „Jadę jako kierowca” albo „Zapisz miejsca”. Przy istniejącej deklaracji osobny formularz `action=withdraw` z przyciskiem „Wycofaj”. Wszystko min. 44 px.
  - Po starcie: „Jedziesz jako kierowca: M miejsc” albo „Nie jedziesz jako kierowca” oraz zdanie o blokadzie.
- „Kierowcy (K)”: lista z nickiem, „M miejsc” i telefonem jako `<a href="tel:…">` (min. 44 px), gdy podany. Pusta lista: „Nikt jeszcze nie zadeklarował się jako kierowca”.
- Rozdzielenie kodów błędów: `driver_locked` i `invalid_driver_seats` w „Twój przejazd”, `attendance_locked` w „Twoje dzieci”, `not_configured` / `unknown` na górze.
- Polska odmiana według wzorca `eventsNoun` (`group-errors.ts:131-136`), wydzielona jako ogólny helper liczebnika w `src/lib/`:
  - miejsca (karta bilansu i lista kierowców), liczba przed rzeczownikiem: „0 miejsc”, „1 miejsce”, „2 miejsca”, „5 miejsc”, „22 miejsca”;
  - jadący: „Jedzie 0 dzieci”, „Jedzie 1 dziecko”, „Jadą 2 dzieci”, „Jadą 5 dzieci” (czasownik „Jedzie” dla 0 i 1, „Jadą” dla ≥ 2);
  - ostrzeżenie w dopełniaczu: „Brakuje 1 miejsca”, „Brakuje 2 miejsc”, „Brakuje 5 miejsc”.
- Przy 360 px brak przewijania w poziomie; długie nicki łamane (`break-words`).

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Przepływ kierowcy end-to-end po HTTP, w stylu istniejących kroków planu terminu (ten sam `planPath()`, cookie jar, `contains` / `notContains`).

**Contract** — kroki na terminie `planEventId` z kroków S-07. Stan wyjściowy (`smoke.mjs:514-554`): po krokach S-07 dziecko `childRenamed` jest „nie jedzie”, zalogowany jest rodzic `strangerEmail`, admin jest już wylogowany, a obcy powstaje dopiero w sekcji `outsider`.

Wstawić po kroku „declaring for an unknown event renders 404” (`:542-546`), przed „parent signs out”, jako rodzic:
- POST `going=true` za dziecko → plan pokazuje „Brakuje 1 miejsca” i „Nikt jeszcze nie zadeklarował się jako kierowca”;
- POST `action=set seats=2` → przekierowanie na `{plan}#twoj-przejazd`; plan pokazuje „Miejsc wystarcza” oraz nick rodzica z „2 miejsca” na liście kierowców;
- POST `action=set seats=9` → przekierowanie z `error=invalid_driver_seats#twoj-przejazd`;
- POST `action=set` z losowym `event_id` → 404;
- POST `action=withdraw` → przekierowanie na `{plan}#twoj-przejazd`; plan znów pokazuje „Brakuje 1 miejsca”.

W sekcji obcego, po „outsider signs up” (`:549-552`), przed „outsider signs out”:
- obcy POST `action=set seats=2` na `planEventId` → 404.

Widoczność deklaracji dla innego członka pokrywa pgTAP (B widzi wiersz A) i test ręczny 3.6; smoke nie loguje ponownie admina.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na uruchomionym serwerze: `npm run smoke`

#### Manual Verification:

- Przy 360 px karta bilansu jest widoczna bez przewijania, strona nie przewija się w poziomie, a pole miejsc i przyciski da się wygodnie obsłużyć bez powiększania
- Dwóch członków deklaruje się jako kierowcy; drugi po odświeżeniu widzi obu, sumę miejsc i telefon tego, kto go podał (link `tel:` działa na telefonie)
- Bilans przechodzi przez trzy stany: „Żadne dziecko jeszcze nie jedzie” → „Brakuje K miejsc” → „Miejsc wystarcza”
- Plan rozpoczętego terminu pokazuje deklarację kierowcy bez formularza i informację o blokadzie

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (AGENTS.md). Reguły bazy pokrywa pgTAP. `buildSeatBalance` jest czystą funkcją; jego trzy stany sprawdza smoke (niedobór → wystarcza → niedobór po wycofaniu) i ręczny test stanu `none_going`.

### Integration Tests:

- pgTAP `event_drivers_rls.test.sql`: izolacja, tylko własna deklaracja, wielu kierowców, zakres 1–8, blokada po starcie dla zapisu, zmiany i wycofania, niezmienne klucze, zgodność grup, kaskada.
- Smoke: deklaracja, zmiana bilansu, zła liczba miejsc, wycofanie, 404 dla błędnego id i obcego. Widoczność dla innego członka: pgTAP i test ręczny 3.6.

### Manual Testing Steps:

1. Jako członek bez dzieci otwórz plan nadchodzącego terminu; karta bilansu pokazuje „Żadne dziecko jeszcze nie jedzie”, sekcja „Twój przejazd” ma pole miejsc.
2. Jako rodzic ustaw dziecku „Jedzie”; bilans pokazuje „Brakuje 1 miejsca”.
3. Zadeklaruj się jako kierowca z 1 miejscem; bilans pokazuje „Miejsc wystarcza”, a na liście kierowców jest Twój nick i telefon.
4. Zmień liczbę miejsc na 3, potem „Wycofaj”; lista i bilans odpowiednio się zmieniają.
5. W bazie przestaw `starts_at` na przeszłość; formularz znika, a ręczny POST wraca z komunikatem o blokadzie.

## Performance Considerations

Skala mała. Plan terminu robi o jedno zapytanie więcej (kierowcy z embeddingiem profilu) w tym samym `Promise.all`. Klucz `(event_id, user_id)` obsługuje odczyt po terminie.

## Migration Notes

Nowa tabela, brak danych do migracji. `events_id_group_unique` już istnieje (S-07).

## References

- Roadmapa: `context/foundation/roadmap.md` (S-08)
- PRD: `context/foundation/prd.md` (FR-015, FR-016, US-01, Business Logic → Bilans miejsc, Zakończenie terminu)
- Wzorzec tabeli, RLS i RPC: `supabase/migrations/20261113120000_create_child_attendance.sql`
- Widoczność telefonu: `supabase/migrations/20261110120000_create_groups.sql:129-134`
- Wzorzec pgTAP: `supabase/tests/child_attendance_rls.test.sql`
- Wzorzec endpointu: `src/pages/api/groups/events/attendance.ts`
- Strona planu: `src/pages/groups/[id]/terminy/[eventId].astro`
- Poprzedni wycinek: `context/archive/2026-11-13-child-attendance-declaration/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tabela kierowców i RLS

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie: `npx supabase db reset` — b5e8837
- [x] 1.2 Wszystkie testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db` — b5e8837

#### Manual

- [x] 1.3 Przegląd migracji: cztery polityki per operacja, granty kolumnowe, CHECK 1–8 i komentarz nagłówka zgodne ze wzorcem `create_child_attendance.sql` — b5e8837

### Phase 2: Serwis i endpoint

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — ac6fc00
- [x] 2.2 Typy przechodzą: `npx astro check` — ac6fc00
- [x] 2.3 Build przechodzi: `npm run build` — ac6fc00

#### Manual

- [x] 2.4 Ręczny POST `set` zapisuje wiersz w `event_drivers`, `withdraw` go usuwa, `seats=9` wraca z komunikatem, a błędny uuid daje 404 — ac6fc00

### Phase 3: Plan terminu z kierowcami i bilansem

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 897c4d5
- [x] 3.2 Typy przechodzą: `npx astro check` — 897c4d5
- [x] 3.3 Build przechodzi: `npm run build` — 897c4d5
- [x] 3.4 Smoke przechodzi na uruchomionym serwerze: `npm run smoke` — 897c4d5

#### Manual

- [x] 3.5 Przy 360 px karta bilansu jest widoczna bez przewijania, strona nie przewija się w poziomie, a pole miejsc i przyciski da się wygodnie obsłużyć bez powiększania — 897c4d5
- [x] 3.6 Dwóch członków deklaruje się jako kierowcy; drugi po odświeżeniu widzi obu, sumę miejsc i telefon tego, kto go podał (link `tel:` działa na telefonie) — 897c4d5
- [x] 3.7 Bilans przechodzi przez trzy stany: „Żadne dziecko jeszcze nie jedzie” → „Brakuje K miejsc” → „Miejsc wystarcza” — 897c4d5
- [x] 3.8 Plan rozpoczętego terminu pokazuje deklarację kierowcy bez formularza i informację o blokadzie — 897c4d5
