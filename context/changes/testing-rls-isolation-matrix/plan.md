# Macierz izolacji RLS — plan implementacji

## Overview

Faza 3 planu testów (`context/foundation/test-plan.md:71`, ryzyko #3). Cel: udowodnić izolację grup i
własność deklaracji dla każdej tabeli × operacji × roli oraz zablokować regresję — nowa tabela bez RLS,
polityka dla `anon`/`public` albo funkcja `security definer` bez `search_path` ma dać czerwony CI.
Przy okazji domykamy dwie luki grantów znalezione w researchu: `children.created_at` ustawiane przez
klienta (G1) i niepotrzebny SELECT na `profiles` dla `anon`.

## Current State Analysis

- 9 tabel w `public` ma `enable row level security`; wszystkie polityki są `to authenticated`; każda
  polityka UPDATE ma `WITH CHECK`; niezmienność `group_id`/właściciela daje grant kolumnowy
  (`research.md` → „Tabele, RLS i granty”).
- Izolacja jest dziś szczelna na przejrzanych ścieżkach, ale wiele komórek macierzy nie jest asertowanych:
  admin grupy na cudzych wierszach, admin aplikacji (nie-członek), outsider i członek innej grupy na
  bezpośrednich UPDATE/DELETE deklaracji, telefony byłego członka, anon na RPC admina i helperach
  (`research.md` → „Istniejące pokrycie testami”).
- Strażnika katalogowego brak — tylko per-tabelowe `relrowsecurity` + `policies_are` z listą na sztywno
  (`supabase/tests/groups_rls.test.sql:18-62`). Bramka „strażnik RLS na każdej tabeli” jest wymagana po
  tej fazie (`test-plan.md:100`), a §6.3 to „TBD” (`test-plan.md:175-177`).
- Regeneracja linku jest już pokryta (`supabase/tests/group_invites_rls.test.sql:185-202`).
- G1: `children` — dla `authenticated` odebrano tylko `truncate, update`
  (`supabase/migrations/20261112140000_create_children.sql:37-40`), więc INSERT przyjmuje `created_at`;
  `group_child_stats` liczy terminy od `e.starts_at >= c.created_at`
  (`supabase/migrations/20261116130000_create_engagement_stats.sql:90`).
- `profiles`: anon zachował SELECT (`20261109120000_create_profiles.sql:23` odbiera tylko I/U/D/T);
  dziś 0 wierszy tylko dzięki brakowi polityki (`supabase/tests/profiles_rls.test.sql:163`).

## Desired End State

- `children` INSERT przyjmuje tylko `id, group_id, parent_id, name`; próba podania `created_at` → 42501.
- `anon` nie ma żadnego przywileju na `profiles`; SELECT jako anon → 42501.
- `supabase/tests/rls_catalog_guard.test.sql` sprawdza katalog bez listy tabel na sztywno i ma własną
  sondę dowodzącą, że zapytania strażnika nie są puste z definicji.
- `supabase/tests/rls_isolation_matrix.test.sql` zawiera macierz rola × operacja dla wszystkich 9 tabel,
  RPC i statystyk, na własnych fixture'ach, niezależną od zawartości bazy.
- §6.3 planu testów opisuje wzorzec; bramka strażnika działa w CI (job `smoke` → `supabase test db`,
  `.github/workflows/ci.yml:42-47`).

Weryfikacja: `npx supabase db reset && npx supabase test db` zielone; celowe zepsucie (sekcje Manual)
daje czerwony wynik w oczekiwanym teście.

### Key Discoveries:

- Wzorzec grantów kolumnowych do skopiowania: `20261113120000_create_child_attendance.sql:63-69`.
- `src/lib/services/children.ts:54` wstawia tylko `group_id, parent_id, name` — grant nie psuje aplikacji.
- Istniejące testy wstawiają dzieci jako `authenticated` z jawnym `id` (`children_rls.test.sql:108,172,254`)
  — dlatego `id` zostaje w grancie. Fixture'y z `created_at` (`engagement_stats.test.sql:80`,
  `engagement_stats_boundaries.test.sql:56`, `deletion_history_stats.test.sql:59`) idą jako postgres
  (przed `set local role`) — grant ich nie dotyczy.
- `profiles` w aplikacji czyta tylko `src/middleware.ts:29` jako zalogowany użytkownik — revoke dla anon
  nie zmienia żadnego przepływu.
- Wzorce testów: odmowa przywileju → `throws_ok(…, '42501')`; filtrowanie RLS na UPDATE/DELETE →
  `is_empty($$update … returning id$$)` (`children_rls.test.sql:153-163`); impersonacja
  `set local role authenticated; set local "request.jwt.claims" to '{"sub": …}'` (`groups_rls.test.sql:117-118`).
- Jedyna tabela bez polityk to `app_admins` (wszystko revoke, dostęp przez `is_app_admin()`;
  `20261110120000_create_groups.sql:50`). Jedyna funkcja wykonywalna przez anon to `invite_group_name`
  (`20261112130000_create_group_invites.sql:100`).

## What We're NOT Doing

- Nie zmieniamy polityk RLS ani logiki uprawnień — poza dwoma grantami z fazy 1.
- `events.id` / `events.created_at` ustawiane przez klienta — bez konsumenta w logice; poza zakresem.
- F9 punkt smoke (POST `/api/admin/groups` przez zwykłego użytkownika → 404) — warstwa HTTP; dopisany do
  fazy 4 planu testów (ścieżki błędów API), nie tutaj.
- Nie edytujemy `context/archive/` (AGENTS.md) — pokrycie F9 odnotowujemy w tej zmianie, nie w
  archiwalnym `follow-ups/review-fixes.md`.
- Nie przepisujemy ani nie deduplikujemy istniejących plików `*_rls.test.sql`; macierz świadomie powtarza
  część komórek, żeby tabela była kompletna w jednym miejscu.
- Nie testujemy kaskad FK ani triggera usunięcia członka jako ścieżki klienta (omijają RLS — pokryte w fazie 2).
- Nie rozstrzygamy otwartych pytań produktowych (FR-007 usuwanie członka, zmiana nazwy/usuwanie grupy).

## Implementation Approach

Najpierw migracja (faza 1), bo zmienia oczekiwania macierzy dla anon i `created_at`. Potem strażnik
(faza 2) — najtańszy sygnał na przyszłe regresje. Macierz (fazy 3–4) jest jednym nowym plikiem z
własnymi fixture'ami; dzielimy ją na dwie fazy, żeby każda miała zweryfikowany, zielony stan.

Zasady macierzy (z guidance ryzyka #3):
- **Wyrocznia z PRD, nie z polityki.** Oczekiwanie to literalny identyfikator fixture'a i wynik
  „widzi / nie widzi / 42501”, wynikający z wiersza macierzy w `research.md` → „Wyrocznia z PRD”.
  Żadna asercja nie powtarza predykatu polityki (`is_group_member(...)` itp.).
- **Każda operacja osobno.** Dla każdej roli i tabeli z prawem zapisu sprawdzamy I, U i D oddzielnie —
  test SELECT niczego nie mówi o UPDATE/DELETE.
- **Odmowa + stan.** Odmowa UPDATE/DELETE przez RLS to `is_empty(... returning id)`, a po `reset role`
  sprawdzenie jako postgres, że wiersz fixture'a jest niezmieniony.
- **Niezależność od bazy.** Zapytania zawężone do identyfikatorów fixture'ów (`where id = …` / `id in (…)`);
  zero liczenia całych tabel. Unikalne UUID-y (prefiks dedykowany plikowi) i e-maile `rlsm-*@example.test`.
- **Komórki „?” PRD** asertujemy wg decyzji z archiwum, z cytatem źródła w opisie asercji
  (np. `'… (decyzja: archive/2026-11-12-parent-adds-child/plan.md:40)'`).

Role w fixture'ach (dwie grupy G1, G2):

| rola | kto |
|---|---|
| anon | `set local role anon` |
| outsider | O — zalogowany, w żadnej grupie |
| inna grupa | C — członek (admin) G2 |
| członek nie-właściciel | M — członek G1, bez praw do wierszy B |
| właściciel | B — członek G1, rodzic dziecka, kierowca, autor deklaracji |
| admin grupy | A — admin G1 (działa na wierszach B) |
| admin aplikacji | X — wiersz w `app_admins`, nie-członek G1 |
| były członek | F — członek G1 usunięty z `group_members` (jako postgres) w trakcie testu |

Terminy: przyszły i rozpoczęty w G1 (`starts_at = now() + interval` / `now() - interval`, wstawiane jako
postgres, jak `events_rls.test.sql:107-110`), przyszły w G2.

## Faza 1: Migracja hartująca granty

### Overview

Odebranie `created_at` z INSERT na `children` (G1) i SELECT na `profiles` dla anon, z testami.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261118140000_harden_children_insert_and_anon_profiles.sql`

**Intent**: Zawęzić INSERT na `children` do kolumn, które klient ma prawo ustawić, żeby rodzic nie mógł
przesunąć zakresu statystyk swojego dziecka; odebrać anon SELECT na `profiles` dla spójności z resztą
tabel (dwie warstwy: grant + RLS).

**Contract**: `revoke insert on public.children from authenticated;`
`grant insert (id, group_id, parent_id, name) on public.children to authenticated;`
`revoke select on public.profiles from anon;`. Kolejność jak w M5:38 — najpierw revoke całotabelowy,
inaczej grant kolumnowy jest no-op. Komentarz w migracji z odwołaniem do G1 i
`20261116130000_create_engagement_stats.sql:90`.

#### 2. Testy grantów

**File**: `supabase/tests/children_rls.test.sql`, `supabase/tests/profiles_rls.test.sql`

**Intent**: Utrwalić oba granty. W `children_rls`: `has_column_privilege` dla `created_at` (insert) = false
i `throws_ok 42501` dla insertu właściciela z `created_at`. W `profiles_rls`: asercja anon z `:163`
zmienia się z `is_empty` na `throws_ok … '42501'` — to zamierzona zmiana zachowania z tej migracji,
nie dopasowanie testu do błędu.

**Contract**: podbite `plan(N)` w obu plikach.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- `npx supabase test db` przechodzi (w tym zaktualizowane `children_rls` i `profiles_rls`)
- `npm run lint`, `npx astro check`, `npm test` przechodzą

#### Manual Verification:

- Celowe zepsucie: tymczasowo usunąć linię `revoke insert …` z migracji, `db reset` + `test db` → test
  `created_at` czerwony; przywrócić
- `npm run dev`: zalogowany rodzic dodaje dziecko w grupie bez błędu (ścieżka `src/lib/services/children.ts:54`)

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie ręcznych kroków.

---

## Faza 2: Strażnik katalogowy

### Overview

Nowy plik pgTAP sprawdzający strukturalne fakty bezpieczeństwa dla każdego obiektu w `public`, bez listy
tabel na sztywno.

### Changes Required:

#### 1. Plik strażnika

**File**: `supabase/tests/rls_catalog_guard.test.sql`

**Intent**: Złapać przyszłą regresję strukturalną zanim trafi na produkcję. Asercje:
1. każda tabela `public` (`relkind in ('r','p')`) ma `relrowsecurity`;
2. każda taka tabela ma ≥1 politykę w `pg_policies`, poza jawną listą wyjątków — dziś tylko
   `app_admins` (komentarz: wszystko revoke, dostęp przez `is_app_admin()`);
3. żadna polityka w `public` nie ma roli `public` ani `anon`;
4. każda funkcja `prosecdef` w `public` ma `search_path` w `proconfig`;
5. `anon` ma EXECUTE tylko na funkcjach z jawnej listy (dziś `invite_group_name`).

Każda asercja ma postać „zbiór naruszeń jest pusty”, z naruszeniami w komunikacie (`is_empty` /
`results_eq` z pustym zbiorem), żeby czerwony wynik od razu nazywał tabelę lub funkcję.

**Contract**: zapytania naruszeń zdefiniowane raz jako `pg_temp` funkcje, używane przez asercje i sondę.
Sonda (w tej samej transakcji, rollback): utworzenie `public.rls_guard_probe` bez RLS i bez polityk oraz
funkcji `security definer` bez `search_path` → asercje, że funkcje naruszeń zwracają te obiekty; potem
`drop`. Sonda biegnie **po** właściwych asercjach. Strażnik nie odwołuje się do warunków żadnej polityki.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi, w tym `rls_catalog_guard.test.sql`
- Sonda w pliku potwierdza, że każda z 5 funkcji naruszeń wykrywa obiekt sondy

#### Manual Verification:

- Celowe zepsucie: tymczasowa migracja z tabelą bez `enable row level security` → `test db` czerwony
  w asercji 1 z nazwą tabeli; usunąć migrację
- Celowe zepsucie: tymczasowa polityka `to public` na jednej tabeli → czerwona asercja 3; cofnąć

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie ręcznych kroków.

---

## Faza 3: Macierz — dane grupy

### Overview

Nowy plik macierzy: fixture'y wszystkich ról i sekcje dla `children`, `events`, `child_attendance`,
`event_drivers` × S/I/U/D.

### Changes Required:

#### 1. Fixture'y i sekcje danych grupy

**File**: `supabase/tests/rls_isolation_matrix.test.sql`

**Intent**: Pokryć komórki macierzy dla danych dzieci i deklaracji, ze szczególnym naciskiem na luki:
admin grupy A na dziecku/deklaracjach B (zakaz zapisu, odczyt dozwolony), członek M na wierszach B,
outsider O i członek innej grupy C przy bezpośrednich I/U/D (nie tylko przez RPC), admin aplikacji X
(brak odczytu i zapisu), anon (42501). Dla każdej dozwolonej operacji jedna asercja pozytywna (B na
swoich wierszach, A na terminach przed startem). Zapisy po starcie terminu — odmowa dla wszystkich ról
(jedna asercja per tabela deklaracji, granica jest pokryta w `declaration_lock_boundary.test.sql`).

**Contract**: nagłówek pliku z tabelą ról i zasadami (wyrocznia z PRD, bez liczenia tabel, odmowa + stan);
sekcja na tabelę; opis asercji w formacie `'<rola> <operacja> <tabela>: <oczekiwanie> (PRD :NN | decyzja: <plik>)'`.
Komórki „?” z cytatem: admin grupy nie edytuje cudzych dzieci (`archive/2026-11-12-parent-adds-child/plan.md:40`),
admin aplikacji nie czyta terminów (`archive/2026-11-12-group-admin-manages-events/plan.md:38`),
brak DELETE deklaracji obecności (`archive/2026-11-13-child-attendance-declaration/plan.md:36`).

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi, w tym `rls_isolation_matrix.test.sql`
- Każda z 4 tabel ma w pliku asercje dla wszystkich 7 ról i każdej z operacji S/I/U/D (przegląd tabeli
  pokrycia w nagłówku pliku)
- Plik nie zawiera `count(*)` bez filtra po identyfikatorach fixture'ów

#### Manual Verification:

- Celowe zepsucie: tymczasowo zmienić `children_update_own` tak, by przepuszczał admina grupy
  (`or public.is_group_admin(group_id)`) → czerwona asercja „A U children (B)”; cofnąć
- Celowe zepsucie: tymczasowo usunąć warunek właściciela z `event_drivers_delete_own` → czerwona asercja
  „M D event_drivers (B)”; cofnąć

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie ręcznych kroków.

---

## Faza 4: Macierz — członkostwo, profile, linki, RPC, statystyki

### Overview

Dopisanie do tego samego pliku sekcji dla `groups`, `group_members`, `app_admins`, `group_invites`,
`profiles`, RPC `security definer` i statystyk.

### Changes Required:

#### 1. Sekcje strukturalne i RPC

**File**: `supabase/tests/rls_isolation_matrix.test.sql`

**Intent**:
- `groups` / `group_members` S per rola (X widzi G1 jako nie-członek — decyzja
  `archive/2026-11-10-app-admin-creates-group/plan.md:216`); bezpośrednie I/U/D przez X i A → 42501 (F9);
- `app_admins` — każda operacja, także przez samego X → 42501 (F9);
- `group_invites` S per rola (tylko A widzi token; X i M nie — decyzja z cytatem); `regenerate_group_invite`
  przez M, C, X → 42501; po regeneracji przez A `join_group_by_invite(stary)` przez O → `invalid_invite`,
  a O nie trafia do `group_members` G1;
- `profiles` (telefon B) per rola: anon 42501 (po fazie 1), O/C/X — brak wiersza B, M/A — widzą `phone`;
  były członek F: widzi B przed usunięciem, nie widzi po usunięciu z `group_members`;
- anon na `add_group_admin`, `admin_list_groups`, `is_app_admin`, `is_group_member`, `shares_group_with`,
  `is_group_admin` → 42501 (F9); A (nie-app-admin) na `add_group_admin` / `admin_list_groups` → 42501;
- statystyki `group_driver_stats` / `group_child_stats` dla G1: anon 42501; O, C, X → pusty wynik;
  M → wiersze dzieci G1 (zawężone do fixture'ów).

**Contract**: ten sam format opisu asercji co w fazie 3; `plan(N)` zaktualizowany.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` przechodzi
- Pozycje F9 1–3 (`archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:7-9`) mają
  odpowiadające asercje w pliku macierzy (opisy z odwołaniem „F9”)

#### Manual Verification:

- Celowe zepsucie: tymczasowo zmienić `profiles_select_group_peers` na `using (true)` → czerwone asercje
  O/C/X/F dla telefonu B; cofnąć
- Celowe zepsucie: tymczasowo `grant execute on function public.admin_list_groups() to anon` → czerwona
  asercja anon (i strażnik z fazy 2, asercja 5); cofnąć

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie ręcznych kroków.

---

## Faza 5: Domknięcie — cookbook, F9, bramka

### Overview

Zapis wzorca w planie testów i domknięcie śladu decyzji.

### Changes Required:

#### 1. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Zastąpić „TBD” w §6.3 wzorcem: tabela ról na fixture'ach, wyrocznia z PRD z cytatem decyzji
dla komórek „?”, odmowa + stan, brak liczenia tabel, reguła „nowa tabela → wiersz w macierzy + strażnik
musi przejść”; w §5 oznaczyć strażnika jako aktywnego; w wierszu fazy 4 (§3) dopisać punkt F9 smoke
(POST `/api/admin/groups` → 404).

**Contract**: sekcje §6.3, §5 (wiersz strażnika), §3 (wiersz 4 — tylko cel/zakres, status bez zmian).
Status wiersza fazy 3 aktualizuje orkiestrator `/10x-test-plan`.

#### 2. Notatka zmiany

**File**: `context/changes/testing-rls-isolation-matrix/change.md`

**Intent**: Odnotować w Notes, że F9 pozycje 1–3 są pokryte przez `rls_isolation_matrix.test.sql`,
a pozycja 4 przeszła do fazy 4 planu testów (archiwum zostaje nietknięte).

**Contract**: sekcja `## Notes`, bez zmian frontmatter.

### Success Criteria:

#### Automated Verification:

- Pełna weryfikacja jak w CI: `npm run lint`, `npx astro check`, `npm test`, `npm run build`,
  `npx supabase test db`, `npm run smoke`
- `context/foundation/test-plan.md` §6.3 nie zawiera już „TBD”

#### Manual Verification:

- Przegląd §6.3: czy nowa osoba dodająca tabelę wie z niego, co dopisać do macierzy i strażnika

---

## Testing Strategy

### Integration Tests (pgTAP):

- `rls_catalog_guard.test.sql` — strukturalne fakty katalogu + sonda anty-pustości.
- `rls_isolation_matrix.test.sql` — rola × operacja × tabela, RPC, statystyki; komórki „?” z cytatem decyzji.
- Aktualizacje `children_rls.test.sql` i `profiles_rls.test.sql` dla grantów z fazy 1.

### Manual Testing Steps:

1. Każda faza: celowe zepsucie opisane w Manual Verification → oczekiwany czerwony test → cofnięcie.
2. Po fazie 1: dodanie dziecka w UI (`npm run dev`).

## Migration Notes

Migracja z fazy 1 zmienia tylko granty; brak zmian danych. Rollback: odwrotne `grant insert on
public.children to authenticated` i `grant select on public.profiles to anon`.

## References

- Research: `context/changes/testing-rls-isolation-matrix/research.md`
- Plan testów: `context/foundation/test-plan.md:56,71,100,175-177`
- Wzorzec grantów kolumnowych: `supabase/migrations/20261113120000_create_child_attendance.sql:63-69`
- Wzorce testów: `supabase/tests/children_rls.test.sql:153-163`, `supabase/tests/groups_rls.test.sql:117-118,248-251`
- F9: `context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:7-10`
- Issue: https://github.com/pstawik/carpooling/issues/65

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja hartująca granty

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie: `npx supabase db reset` — 4a8d3f7
- [x] 1.2 `npx supabase test db` przechodzi (w tym zaktualizowane `children_rls` i `profiles_rls`) — 4a8d3f7
- [x] 1.3 `npm run lint`, `npx astro check`, `npm test` przechodzą — 4a8d3f7

#### Manual

- [x] 1.4 Celowe zepsucie: bez `revoke insert …` test `created_at` czerwony; przywrócone — 4a8d3f7
- [x] 1.5 `npm run dev`: zalogowany rodzic dodaje dziecko w grupie bez błędu — 4a8d3f7

### Phase 2: Strażnik katalogowy

#### Automated

- [x] 2.1 `npx supabase test db` przechodzi, w tym `rls_catalog_guard.test.sql` — 4273ac1
- [x] 2.2 Sonda w pliku potwierdza, że każda z 5 funkcji naruszeń wykrywa obiekt sondy — 4273ac1

#### Manual

- [x] 2.3 Celowe zepsucie: tabela bez RLS → czerwona asercja 1 z nazwą tabeli; cofnięte — 4273ac1
- [x] 2.4 Celowe zepsucie: polityka `to public` → czerwona asercja 3; cofnięte — 4273ac1

### Phase 3: Macierz — dane grupy

#### Automated

- [x] 3.1 `npx supabase test db` przechodzi, w tym `rls_isolation_matrix.test.sql` — 98093b4
- [x] 3.2 Każda z 4 tabel ma asercje dla wszystkich 7 ról i operacji S/I/U/D — 98093b4
- [x] 3.3 Plik nie zawiera `count(*)` bez filtra po identyfikatorach fixture'ów — 98093b4

#### Manual

- [x] 3.4 Celowe zepsucie: `children_update_own` przepuszcza admina grupy → czerwona asercja; cofnięte — 98093b4
- [x] 3.5 Celowe zepsucie: `event_drivers_delete_own` bez warunku właściciela → czerwona asercja; cofnięte — 98093b4

### Phase 4: Macierz — członkostwo, profile, linki, RPC, statystyki

#### Automated

- [x] 4.1 `npx supabase test db` przechodzi — 3b593dc
- [x] 4.2 Pozycje F9 1–3 mają odpowiadające asercje w pliku macierzy — 3b593dc

#### Manual

- [x] 4.3 Celowe zepsucie: `profiles_select_group_peers` na `using (true)` → czerwone asercje telefonu; cofnięte — 3b593dc
- [x] 4.4 Celowe zepsucie: `admin_list_groups` wykonywalne przez anon → czerwona asercja i strażnik; cofnięte — 3b593dc

### Phase 5: Domknięcie — cookbook, F9, bramka

#### Automated

- [x] 5.1 Pełna weryfikacja jak w CI: lint, astro check, npm test, build, supabase test db, smoke
- [x] 5.2 `context/foundation/test-plan.md` §6.3 nie zawiera już „TBD”

#### Manual

- [x] 5.3 Przegląd §6.3: nowa osoba dodająca tabelę wie, co dopisać do macierzy i strażnika
