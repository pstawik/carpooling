# Deklaracja obecności dziecka i plan dzieci terminu — plan implementacji

## Overview

Rodzic ustawia na stronie planu terminu każdemu swojemu dziecku „jedzie” albo „nie jedzie”. Każdy członek grupy widzi na tej stronie listę dzieci jadących i niejadących. Dziecko bez wiersza deklaracji jest liczone jako „nie jedzie” i oznaczone etykietą „bez deklaracji”. Od chwili rozpoczęcia terminu (`starts_at <= now()`) deklaracje są tylko do odczytu, co egzekwuje baza danych. Wycinek S-07 z roadmapy (FR-014, FR-016 bez części o kierowcach, US-01); S-08 dołoży na tę samą stronę kierowców i bilans miejsc.

## Current State Analysis

- Tabela deklaracji nie istnieje. Ostatnia migracja to `supabase/migrations/20261112150000_create_events.sql`.
- `events.starts_at` to pojedynczy `timestamptz`. Blokada po rozpoczęciu działa już w politykach RLS terminów jako `starts_at > now()` (`create_events.sql:56-78`). Strefa czasowa (Europe/Warsaw) jest obsługiwana wyłącznie w `src/lib/time.ts`; w bazie porównujemy chwile, więc „rozpoczęty” nie zależy od strefy.
- Dzieci: `children (id, group_id, parent_id, name)`, każde dziecko należy do jednej grupy. Wszyscy członkowie czytają wszystkie dzieci grupy (`children_select_group_member`), zapisuje tylko rodzic (`supabase/migrations/20261112140000_create_children.sql:46-69`).
- Strony planu terminu nie ma. S-05 odłożył ją do S-07 pod ścieżką `/groups/[id]/terminy/[eventId]` (`context/archive/2026-11-12-group-admin-manages-events/plan.md:35`). `/groups` jest już w `PROTECTED_ROUTES` (`src/middleware.ts:5`).
- Lista terminów jest renderowana na `src/pages/groups/[id].astro:134-189`. Admin dostaje wyspę `EventItem` (`src/components/groups/EventItem.tsx`), pozostali zwykły tekst; minione terminy są w `<details>`.
- Endpointy to formularze POST z przekierowaniem: zod → serwis → `?error=<kod>` / `?message=<kod>` (wzorzec: `src/pages/api/groups/children/update.ts`). Kody i teksty są w `src/lib/services/group-errors.ts`.
- Testy: pgTAP w `supabase/tests/*_rls.test.sql` (`supabase test db` w CI), smoke HTTP w `scripts/smoke.mjs`.

## Desired End State

- Członek grupy otwiera z listy terminów (nadchodzących i minionych) stronę `/groups/[id]/terminy/[eventId]`. Widzi na niej datę i notatkę terminu, sekcję „Twoje dzieci” oraz listy „Jadą (N)” i „Nie jadą (M)”. Dzieci bez deklaracji są na liście niejadących z etykietą „bez deklaracji”.
- Przed rozpoczęciem terminu przy każdym własnym dziecku są dwa przyciski: „Jedzie” i „Nie jedzie”. Jedno stuknięcie zapisuje deklarację, a bieżący stan jest wyróżniony. Po rozpoczęciu przycisków nie ma, jest tylko status i informacja, że termin się rozpoczął.
- Baza odrzuca: zapis za cudze dziecko, zapis w obcej grupie, zapis po rozpoczęciu terminu, przypięcie dziecka do terminu innej grupy. Rodzic nie może usunąć deklaracji (nie ma powrotu do „bez deklaracji”). Usunięcie terminu albo dziecka usuwa jego deklaracje kaskadowo.
- Weryfikacja: pgTAP (`npx supabase test db`), `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`.

### Key Discoveries:

- Wzorzec blokady czasowej w RLS: `create_events.sql:66-78`. W nowej tabeli warunek idzie przez `exists` na `events`, wykonywany pod RLS wywołującego (członek widzi terminy swojej grupy).
- Wzorzec uprawnień: `revoke all … from anon; revoke truncate, update … from authenticated; grant update (<kolumny>) …` (`create_events.sql:41-44`). Komentarz w migracji: grant tabelowy na UPDATE trzeba odebrać przed grantem kolumnowym.
- `writeResult` w `src/lib/services/events.ts:27-35` mapuje 42501 na `forbidden`, a 23505 na duplikat. To wzorzec dla serwisu deklaracji.
- Dialog usuwania terminu już obiecuje „Deklaracje tego terminu też zostaną usunięte” (`EventItem.tsx:29`), więc kaskada przy usunięciu terminu jest wymagana (S-05 impl-review F5).
- `getGroupWithAdmins` (`src/lib/services/groups.ts:57-82`) zwraca `null` dla nie-członków i błędnych id. Strona planu używa go jako bramki członkostwa, tak jak strona grupy.
- `splitEvents` (`events.ts:55-64`) definiuje „nadchodzący” jako `Date.parse(startsAt) > now`, jedno `now` na żądanie. Strona planu ocenia blokadę tak samo.

## What We're NOT Doing

- Kierowcy, liczba miejsc, bilans i ostrzeżenie o niedoborze (S-08).
- Statystyki zakończonych terminów (S-09).
- Cofanie deklaracji do stanu „bez deklaracji”: rodzic tylko przełącza „jedzie” ↔ „nie jedzie”, a polityki DELETE dla rodzica nie ma (decyzja z planowania).
- Deklarowanie z poziomu strony grupy: przyciski są tylko na stronie planu terminu.
- Dzieci i deklaracje rodzica usuniętego z grupy: plan pokazuje wszystkie dzieci z `children` danej grupy. Decyzja zostaje przy FR-007 (roadmap S-07 Unknowns).
- Zachowanie deklaracji usuniętego dziecka: usuwamy je kaskadowo, a statystyki S-09 tracą to dziecko (kompromis zaakceptowany w S-04).
- Odświeżanie na żywo: nowy stan widać po przeładowaniu strony (NFR „Aktualność planu”).

## Implementation Approach

Kolejność: baza → API → UI. Każda faza kończy się stanem, który da się sprawdzić niezależnie.

- **Model danych:** `child_attendance (event_id, child_id, group_id, going boolean)` z kluczem `(event_id, child_id)`. Brak wiersza oznacza „bez deklaracji”. `group_id` jest zdenormalizowany, żeby złożone klucze obce `(event_id, group_id) → events (id, group_id)` i `(child_id, group_id) → children (id, group_id)` gwarantowały w bazie, że dziecko i termin są z tej samej grupy. Oba klucze mają `on delete cascade`.
- **Zapis przez funkcję `security invoker`:** upsert z PostgREST w `ON CONFLICT DO UPDATE` ustawia wszystkie przesłane kolumny, a to wymagałoby `UPDATE` także na kluczach. Funkcja `set_child_attendance` sama robi `insert … on conflict do update set going = excluded.going`, więc kolumny kluczy zostają niezmienne. Działa z uprawnieniami wywołującego, czyli pod RLS. Autoryzację w całości trzymają polityki, nie funkcja.
- **Strona planu** jest czystym Astro bez wyspy React: przyciski to zwykłe formularze POST, jak w istniejących widokach.

## Critical Implementation Details

- **Uprawnienia kolumnowe a upsert:** nie używaj `supabase.from("child_attendance").upsert(...)`. Przy grancie UPDATE tylko na `going`/`updated_at` PostgREST dostałby „permission denied” na kolumnach kluczy. Jedyna ścieżka zapisu to `supabase.rpc("set_child_attendance", …)`.
- **Funkcja musi rzucać, a nie milczeć:** grupę dziecka funkcja odczytuje z `children` pod RLS wywołującego. Dla nie-członka albo nieistniejącego dziecka `select` zwraca 0 wierszy i `insert … select` po cichu nic by nie zapisał. Funkcja (`plpgsql`) musi wtedy rzucić `42501`, żeby endpoint nie zgłosił sukcesu.
- **Przesłanianie nazw w politykach:** w `exists (select 1 from public.children c where …)` niekwalifikowane `group_id` oznacza `c.group_id`, a warunek staje się zawsze prawdziwy. W każdej polityce (select, insert, update) kolumny wiersza `child_attendance` w podzapytaniach kwalifikuj nazwą tabeli (`child_attendance.group_id`). Pomyłkę wyłapie test pgTAP „zapis za cudze dziecko → 42501”.
- **Rozróżnienie błędu 42501 w endpoincie:** zarówno „termin się rozpoczął”, jak i „cudze dziecko” dają 42501. Endpoint po `forbidden` pobiera termin (`getGroupEvent`). Jeśli termin istnieje w grupie i się rozpoczął, przekierowuje z `?error=attendance_locked`; w każdym innym przypadku zwraca `rewrite("/404")`.

## Phase 1: Tabela deklaracji i RLS

### Overview

Migracja tworzy tabelę deklaracji z izolacją grup, blokadą po rozpoczęciu, zapisem tylko za własne dzieci i kaskadami. Do tego funkcja zapisu i testy pgTAP.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261113120000_create_child_attendance.sql`

**Intent**: Nowa tabela deklaracji obecności z politykami w tej samej migracji (twarda reguła AGENTS.md), z unikalnymi `(id, group_id)` na `events` i `children` pod złożone klucze obce oraz z funkcją zapisu. Nagłówek migracji opisuje reguły tak jak w `create_events.sql:1-11`: brak wiersza = „bez deklaracji”, blokada od `starts_at`, brak DELETE dla rodzica, kaskady.

**Contract**:
- `alter table public.events add constraint events_id_group_unique unique (id, group_id)`; to samo dla `public.children` (`children_id_group_unique`).
- `public.child_attendance`:
  - kolumny: `event_id uuid not null`, `child_id uuid not null`, `group_id uuid not null`, `going boolean not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`;
  - `primary key (event_id, child_id)`;
  - `foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade`;
  - `foreign key (child_id, group_id) references public.children (id, group_id) on delete cascade`;
  - indeks na `child_id`, żeby kaskada przy usunięciu dziecka nie skanowała tabeli.
- RLS włączone. `revoke all … from anon`; `revoke truncate, update, delete … from authenticated`; `grant update (going, updated_at) … to authenticated`.
- Polityki (nazewnictwo `<tabela>_<operacja>_<kto>`, wszystkie `to authenticated`):
  - `child_attendance_select_group_member`: `using (public.is_group_member(group_id))`;
  - `child_attendance_insert_own`: `with check`, gdy dziecko należy do wywołującego (`exists` na `children`: `id = child_id`, `parent_id = auth.uid()`, `group_id = child_attendance.group_id`), wywołujący jest członkiem grupy, a termin jeszcze się nie rozpoczął (`exists` na `events`: `id = event_id`, `starts_at > now()`);
  - `child_attendance_update_own`: ten sam warunek w `using` i w `with check`;
  - brak polityki DELETE (kaskady z FK nie podlegają RLS ani grantom).
- Funkcja `public.set_child_attendance(p_event_id uuid, p_child_id uuid, p_going boolean) returns void`, `language plpgsql security invoker set search_path = ''`:
  - odczytuje `group_id` dziecka z `public.children`; gdy brak wiersza, rzuca `42501` (`insufficient_privilege`);
  - wykonuje `insert … (event_id, child_id, group_id, going) … on conflict (event_id, child_id) do update set going = excluded.going, updated_at = now()`;
  - `revoke execute … from public, anon; grant execute … to authenticated`.

#### 2. Testy pgTAP

**File**: `supabase/tests/child_attendance_rls.test.sql`

**Intent**: Dowód, że reguły działają w bazie, niezależnie od UI. Struktura jak w `supabase/tests/events_rls.test.sql`: jedna transakcja, użytkownicy-fixture A/B/C, impersonacja przez `request.jwt.claims`, termin miniony wstawiany jako postgres.

**Contract** — przypadki:
- `policies_are` dokładnie trzy polityki (select, insert, update); `anon` nie ma żadnych uprawnień; `authenticated` ma UPDATE tylko na `going` i `updated_at` i nie ma DELETE.
- Rodzic A ustawia swojemu dziecku `true`, potem `false`: jeden wiersz z `going = false`.
- Członek B widzi deklarację A; nie-członek C widzi 0 wierszy.
- Członek B próbuje zapisać za dziecko A → 42501. Nie-członek C → 42501.
- Zapis na rozpoczęty termin → 42501, także przełączenie istniejącej deklaracji na rozpoczętym terminie.
- Bezpośredni `insert` dziecka grupy X do terminu grupy Y (jako postgres) → 23503.
- Bezpośredni `update … set event_id = …` jako A → 42501 (brak uprawnienia kolumnowego); bezpośredni `delete` jako A → 42501.
- Usunięcie terminu i usunięcie dziecka usuwa ich deklaracje.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`

#### Manual Verification:

- Przegląd migracji: polityki per operacja, granty kolumnowe i komentarz nagłówka zgodne ze wzorcem `create_events.sql`

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Serwis i endpoint zapisu

### Overview

Warstwa aplikacji: walidacja formularza, serwis odczytu i zapisu deklaracji, pobieranie pojedynczego terminu i endpoint POST z mapowaniem błędów.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Typ wiersza deklaracji obok `Child` i `GroupEvent`.

**Contract**: `ChildAttendance { event_id; child_id; group_id; going: boolean; created_at; updated_at }`.

#### 2. Walidacja

**File**: `src/lib/validation/attendance.ts`

**Intent**: Schemat zod formularza deklaracji. Każdy błąd oznacza ręcznie zmieniony formularz, więc nie ma błędów pól dla użytkownika.

**Contract**: `setAttendanceSchema`: `group_id`, `event_id`, `child_id` jako `z.uuid()`, `going` jako `"true" | "false"` przekształcane na `boolean`.

#### 3. Pojedynczy termin

**File**: `src/lib/services/events.ts`

**Intent**: Strona planu i endpoint potrzebują jednego terminu z gwarancją, że należy do grupy z URL.

**Contract**: `getGroupEvent(supabase, groupId, eventId): Promise<GroupEventItem | null>`. Zwraca `null` dla błędnego uuid (sprawdzenie przed zapytaniem), dla obcej grupy i braku terminu (RLS); rzuca przy błędzie zapytania. Do tego czysta funkcja `hasStarted(event, now): boolean` zgodna z `splitEvents` (`startsAt <= now`).

#### 4. Serwis deklaracji

**File**: `src/lib/services/attendance.ts`

**Intent**: Odczyt deklaracji terminu, zapis przez RPC i złożenie planu dzieci z regułą „brak wiersza = nie jedzie, bez deklaracji”.

**Contract**:
- `listEventAttendance(supabase, eventId): Promise<Map<string, boolean>>` (child_id → going); rzuca przy błędzie.
- `setChildAttendance(supabase, { eventId, childId, going }): Promise<{ ok: true } | { ok: false; failure: "forbidden" | "not_found" | "unknown"; error? }>`: 42501 → `forbidden`, 23503 → `not_found`, reszta → `unknown`.
- `buildChildPlan(children: GroupChild[], attendance: Map<string, boolean>, userId)` zwraca:
  - `mine`: dzieci rodzica ze statusem `"going" | "not_going" | "undeclared"`;
  - `going` i `notGoing`: wszystkie dzieci grupy, w tym własne; `notGoing` zawiera `not_going` i `undeclared` z flagą `undeclared`.
  Kolejność dzieci jak z `listGroupChildren` (po imieniu, locale `pl`).

#### 5. Kody komunikatów

**File**: `src/lib/services/group-errors.ts`

**Intent**: Komunikat o zablokowanym terminie wyświetlany na stronie planu.

**Contract**: `ERROR_MESSAGES.attendance_locked = "Termin już się rozpoczął — deklaracji nie można zmienić"`. Strona planu wyświetla tylko swoje kody (`attendance_locked`, `not_configured`, `unknown`). Nie trzeba zmieniać `FEEDBACK_SECTIONS` strony grupy.

#### 6. Endpoint

**File**: `src/pages/api/groups/events/attendance.ts`

**Intent**: Zapis deklaracji jednego dziecka i powrót na stronę planu. Wzorzec jak w `src/pages/api/groups/children/update.ts`.

**Contract**: `POST` z polami `group_id`, `event_id`, `child_id`, `going`:
- brak użytkownika → `/auth/signin`;
- body nie jest formularzem albo walidacja nie przechodzi → `rewrite("/404")`;
- brak klienta Supabase → `?error=not_configured`;
- sukces → `/groups/{g}/terminy/{e}#twoje-dzieci`;
- `forbidden` → `getGroupEvent`: termin istnieje i `hasStarted` → `/groups/{g}/terminy/{e}?error=attendance_locked#twoje-dzieci`, w przeciwnym razie `rewrite("/404")`;
- `not_found` → `rewrite("/404")`;
- `unknown` → `console.error` i `?error=unknown` bez kotwicy.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Ręczny POST za własne dziecko zapisuje wiersz w `child_attendance`, a za cudze dziecko i z błędnym uuid zwraca 404

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Strona planu terminu

### Overview

Widok planu terminu z przyciskami dla własnych dzieci i listami dzieci, linki do niego z listy terminów i pokrycie w smoke.

### Changes Required:

#### 1. Strona planu

**File**: `src/pages/groups/[id]/terminy/[eventId].astro`

**Intent**: Plan dzieci terminu dla członka grupy (US-01 bez części o kierowcach). Wygląd jak `src/pages/groups/[id].astro`: te same klasy kart i przycisków, `max-w-xl`, `Topbar`.

**Contract**:
- `getGroupWithAdmins` i `getGroupEvent`; brak którejkolwiek → `rewrite("/404")`. Jedno `now` na żądanie, `locked = hasStarted(event, now)`.
- Nagłówek: nazwa grupy, `formatEventStart(event.startsAt)`, notatka. Link „Wróć do grupy” → `/groups/{id}#terminy`.
- Sekcja `id="twoje-dzieci"` (tylko gdy rodzic ma dzieci w grupie) z komunikatem błędu z `?error=`. Dla każdego dziecka:
  - przed startem: dwa formularze POST do `/api/groups/events/attendance` z przyciskami „Jedzie” / „Nie jedzie” (min. 44 px, bieżący stan wyróżniony i oznaczony `aria-pressed="true"`), a przy braku deklaracji widoczne „bez deklaracji”;
  - po starcie: sam status oraz zdanie „Termin się rozpoczął — deklaracje są tylko do odczytu”.
- Sekcja planu: „Jadą (N)” i „Nie jadą (M)”, przy każdym dziecku imię i nick rodzica, przy niezadeklarowanych etykieta „bez deklaracji”. Puste listy z tekstem zastępczym.
- Błąd wczytania dzieci lub deklaracji pokazuje komunikat w karcie zamiast 500 (wzorzec z `[id].astro:57-79`).
- Przy 360 px brak przewijania w poziomie; długie imiona łamane (`break-words`).

#### 2. Linki z listy terminów

**File**: `src/pages/groups/[id].astro`, `src/components/groups/EventItem.tsx`

**Intent**: Każdy termin, nadchodzący i miniony, prowadzi do swojego planu.

**Contract**:
- Nadchodzące terminy dla nie-adminów i wszystkie minione: etykieta daty jako link `/groups/{id}/terminy/{eventId}` z min. 44 px wysokości.
- `EventItem` dostaje prop `planHref: string` i renderuje etykietę jako link; „Edytuj” i „Usuń” bez zmian.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Przepływ deklaracji end-to-end po HTTP, w stylu istniejących kroków (cookie jar, `redirect: "manual"`, `contains` / `notContains`, id wyciągane z HTML).

**Contract** — aktorzy i dane (stan `scripts/smoke.mjs` po istniejących krokach terminów):
- termin: pojedynczy termin z kroków S-05 jest usuwany (`smoke.mjs:380-383`), a terminy z generatora nie mają notatki. Admin grupy (zalogowany do `:464`) dodaje więc osobny przyszły termin z unikalną notatką i go nie usuwa. Id czytamy z widoku admina przez `eventIdAfterNote`;
- dziecko: istniejące `childRenamed` członka `strangerEmail` (dodane `:270`, nieusuwane);
- „inny członek”: admin grupy (wzorzec z `:436-449`);
- obcy: po `:260` nie ma już nie-członka, więc rejestrujemy nowego użytkownika `smoke-outsider-${Date.now()}` tylko do sprawdzenia 404.

Kroki:
- plan terminu pokazuje dziecko z „bez deklaracji”;
- POST `going=true` → przekierowanie na plan; plan pokazuje dziecko pod „Jadą (1)”;
- POST `going=false` → dziecko pod „Nie jadą”, bez etykiety „bez deklaracji”;
- inny członek POST za to dziecko → 404; błędny `event_id` → 404;
- obcy użytkownik GET planu → 404.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na uruchomionym serwerze: `npm run smoke`

#### Manual Verification:

- Przy 360 px strona planu nie przewija się w poziomie, a przyciski „Jedzie” / „Nie jedzie” da się wygodnie stuknąć bez powiększania
- Rodzic z dwójką dzieci ustawia każdemu inny status, a drugi członek po odświeżeniu widzi oba w odpowiednich listach
- Plan terminu, który się rozpoczął, pokazuje statusy bez przycisków i informację o blokadzie
- Linki z listy nadchodzących i minionych terminów (admin i zwykły członek) otwierają właściwy plan

**Implementation Note**: Po fazie i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (AGENTS.md). Reguły bazy pokrywa pgTAP; `buildChildPlan` jest czystą funkcją, a jego zachowanie sprawdza smoke (bez deklaracji, jedzie, nie jedzie).

### Integration Tests:

- pgTAP `child_attendance_rls.test.sql`: izolacja, własne dzieci, blokada po starcie, zgodność grup, brak DELETE, kaskady.
- Smoke: deklaracja i przełączenie, widoczność dla innego członka, 404 dla cudzego dziecka, błędnego id i obcego.

### Manual Testing Steps:

1. Jako rodzic z dzieckiem otwórz plan nadchodzącego terminu z listy na stronie grupy; dziecko jest pod „Nie jadą” z „bez deklaracji”.
2. Stuknij „Jedzie”; strona wraca na „Twoje dzieci”, przycisk „Jedzie” jest wyróżniony, a dziecko jest pod „Jadą (1)”.
3. Jako inny członek otwórz ten sam plan; dziecko jest pod „Jadą”, a sekcji przycisków dla cudzych dzieci nie ma.
4. W bazie przestaw `starts_at` terminu na przeszłość; plan pokazuje statusy bez przycisków. Ręczny POST zwraca komunikat o blokadzie.
5. Usuń termin jako admin; jego deklaracje znikają razem z nim (bez błędu).

## Performance Considerations

Skala mała (dziesiątki dzieci na grupę). Plan to trzy zapytania na żądanie (termin, dzieci, deklaracje terminu). Klucz `(event_id, child_id)` obsługuje odczyt po terminie, a indeks na `child_id` kaskadę po dziecku.

## Migration Notes

Nowa tabela, brak danych do migracji. Dodanie unikalnych `(id, group_id)` na istniejących `events` i `children` zawsze się powiedzie, bo `id` jest już kluczem głównym.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-07)
- PRD: `context/foundation/prd.md` (FR-014, FR-016, US-01, Business Logic → Zakończenie terminu)
- Wzorzec RLS z blokadą czasową: `supabase/migrations/20261112150000_create_events.sql:41-78`
- Wzorzec RLS własnych wierszy: `supabase/migrations/20261112140000_create_children.sql:46-69`
- Wzorzec pgTAP: `supabase/tests/events_rls.test.sql`
- Wzorzec endpointu: `src/pages/api/groups/children/update.ts`
- Wzorzec strony: `src/pages/groups/[id].astro`
- Odłożona ścieżka planu terminu: `context/archive/2026-11-12-group-admin-manages-events/plan.md:35`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tabela deklaracji i RLS

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- [x] 1.2 Wszystkie testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`

#### Manual

- [x] 1.3 Przegląd migracji: polityki per operacja, granty kolumnowe i komentarz nagłówka zgodne ze wzorcem `create_events.sql`

### Phase 2: Serwis i endpoint zapisu

#### Automated

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Typy przechodzą: `npx astro check`
- [ ] 2.3 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.4 Ręczny POST za własne dziecko zapisuje wiersz w `child_attendance`, a za cudze dziecko i z błędnym uuid zwraca 404

### Phase 3: Strona planu terminu

#### Automated

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Typy przechodzą: `npx astro check`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke przechodzi na uruchomionym serwerze: `npm run smoke`

#### Manual

- [ ] 3.5 Przy 360 px strona planu nie przewija się w poziomie, a przyciski „Jedzie” / „Nie jedzie” da się wygodnie stuknąć bez powiększania
- [ ] 3.6 Rodzic z dwójką dzieci ustawia każdemu inny status, a drugi członek po odświeżeniu widzi oba w odpowiednich listach
- [ ] 3.7 Plan terminu, który się rozpoczął, pokazuje statusy bez przycisków i informację o blokadzie
- [ ] 3.8 Linki z listy nadchodzących i minionych terminów (admin i zwykły członek) otwierają właściwy plan
