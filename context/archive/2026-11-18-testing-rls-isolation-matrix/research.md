---
date: 2026-11-18T14:25:31+01:00
researcher: Claude (Opus 5.5)
git_commit: 417db046acdee898aa5bbcbbf6b536b35ef94008
branch: main
repository: carpooling
topic: "Macierz izolacji RLS — co baza faktycznie egzekwuje, czego wymaga PRD i co już testujemy (ryzyko #3, rollout Phase 3)"
tags: [research, testing, rls, isolation, pgtap, catalog-guard, invite, app-admin]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (Opus 5.5)
---

# Research: macierz izolacji RLS

**Date**: 2026-11-18T14:25:31+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 417db046acdee898aa5bbcbbf6b536b35ef94008
**Branch**: main
**Repository**: carpooling

## Research Question

Dla fazy 3 planu testów (`context/foundation/test-plan.md:71`, ryzyko #3, guidance `:56`) ugruntować:

- listę tabel, polityk per operacja, funkcji `security definer` i grantów (stan po wszystkich migracjach);
- oczekiwany dostęp wg PRD dla ról: anon, zalogowany spoza grup, członek innej grupy, członek tej grupy
  nie-właściciel, właściciel wiersza, admin grupy, admin aplikacji (nie-członek);
- istniejące pokrycie w `supabase/tests/` i luki;
- jak wyrazić strażnika katalogowego (RLS na każdej tabeli, bramka z `test-plan.md:100`);
- czy po regeneracji stary link zaproszeniowy przestaje działać.

Zakres przejrzany: wszystkie 12 migracji w `supabase/migrations/` (pełne odczyty), wszystkie 12 plików
`supabase/tests/*.test.sql`, `supabase/seed.sql`, `.github/workflows/ci.yml`, `context/foundation/prd.md`
(całość), wybrane sekcje `roadmap.md`, impl-review i follow-upy w `context/archive/` wskazane w §2
planu testów. Nie uruchamiano `supabase test db`.

## Summary

- **Izolacja na poziomie wierszy jest dziś szczelna dla przejrzanych ścieżek.** 9 tabel w `public`
  (`profiles`, `app_admins`, `groups`, `group_members`, `group_invites`, `children`, `events`,
  `child_attendance`, `event_drivers`) ma `enable row level security`; żadna nie ma `force`. Wszystkie
  polityki są `to authenticated` — brak polityk dla `anon`/`public`. Każda polityka UPDATE ma
  `WITH CHECK`, a granty kolumnowe czynią `group_id` i kolumny właściciela niezmiennymi (szczegóły niżej).
  Nie znaleziono ścieżki, w której osoba spoza grupy czyta dzieci, telefony lub deklaracje, ani w której
  członek zapisuje cudzą deklarację.
- **Ryzyko #3 to regresja przyszła, nie obecna dziura** — więc najcenniejsze są: (a) strażnik katalogowy,
  który złapie nową tabelę bez RLS/polityk lub nową funkcję `security definer` bez `search_path`,
  i (b) domknięcie konkretnych pustych komórek macierzy, gdzie dzisiejsza szczelność nie jest asertowana.
- **Strażnik katalogowy nie istnieje.** Testy sprawdzają `relrowsecurity` + `policies_are` tylko per
  tabela, z twardo wpisaną listą (np. `groups_rls.test.sql:18-62`, `children_rls.test.sql:17-33`).
  Nic nie iteruje po wszystkich tabelach `public`, a §6.3 planu testów to wciąż „TBD”
  (`test-plan.md:175-177`).
- **Regeneracja linku jest już przetestowana:** stary token → `P0001 invalid_invite`
  (`group_invites_rls.test.sql:185-188`), `invite_group_name(stary)` → null dla anon (`:288-292`),
  nowy działa (`:197-202`). Mechanizm: jeden wiersz na grupę, upsert po `group_id` nadpisuje token
  (`20261112130000_create_group_invites.sql:11`, `:82-92`).
- **Największe luki w pokryciu** (komórki, gdzie zachowanie jest dziś poprawne, ale nieasertowane):
  1. **Admin grupy na cudzych wierszach** — każda próba „nie-właściciela” jest wykonywana przez członka B
     na wierszach admina A; nigdy admin A na dziecku/deklaracjach członka B (`children`, `child_attendance`,
     `event_drivers`). To dokładnie założenie „rola wyższa = uprawniony”, które guidance każe podważyć.
  2. **Admin aplikacji (nie-członek)** — prawie nietestowany poza `groups`/`group_members` SELECT i RPC;
     brak asercji dla `profiles` (telefony), `children`, `events`, deklaracji, `group_invites`.
     Pokrywa się to z **F9 z `app-admin-creates-group`, odroczonym do S-03 i niezrealizowanym** — wszystkie
     4 checkboxy otwarte (`context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:7-10`).
  3. **Zapisy bezpośrednie (UPDATE/DELETE) przez outsidera i członka innej grupy** — w `child_attendance_rls`
     i `event_drivers_rls` nie ma w ogóle użytkownika-outsidera; członek innej grupy C ma tam tylko SELECT
     i RPC, bez bezpośredniego UPDATE/DELETE. W `children` C nie ma UPDATE, D nie ma UPDATE/DELETE.
  4. **Telefony były-członka** — brak testu, że po usunięciu z grupy były członek traci wgląd w
     `profiles` (telefon) dawnych współczłonków (istnieje tylko dla `children`, `children_rls.test.sql:343`).
  5. **anon na RPC admina i helperach** (`add_group_admin`, `admin_list_groups`, `is_app_admin`,
     `is_group_member`, `shares_group_with`) — część F9.
- **Znaleziona luka integralności poza izolacją (G1, potwierdzona):** `children` INSERT nie jest
  ograniczony kolumnowo — dla `authenticated` odebrano tylko `truncate, update`
  (`20261112140000_create_children.sql:37-40`), więc rodzic może sam ustawić `created_at`.
  `group_child_stats` liczy terminy od `e.starts_at >= c.created_at`
  (`20261116130000_create_engagement_stats.sql:90`) — przyszłe `created_at` ukrywa nieobecności,
  przeszłe je zawyża. Dotyczy tylko statystyk własnego dziecka (nie czytania cudzych danych), więc to
  sprawa ryzyka #6/#5, nie #3 — decyzja do planu (patrz Open Questions).

## Detailed Findings

### Tabele, RLS i granty (stan po 12 migracjach)

Skróty: M1 `20261109120000_create_profiles.sql`, M2 `20261110120000_create_groups.sql`,
M3 `20261112120000_tune_group_policies.sql`, M4 `20261112130000_create_group_invites.sql`,
M5 `20261112140000_create_children.sql`, M6 `20261112150000_create_events.sql`,
M7 `20261113120000_create_child_attendance.sql`, M8 `20261113130000_create_event_drivers.sql`,
M9 `20261116120000_lock_child_delete_with_history.sql`, M10 `20261116130000_create_engagement_stats.sql`,
M11 `20261118120000_delete_future_declarations_on_member_removal.sql`,
M12 `20261118130000_keep_former_member_drives_in_stats.sql`.

| tabela | RLS | granty dla klientów | polityki (wszystkie `to authenticated`) |
|---|---|---|---|
| profiles | M1:18 | revoke I/U/D/T od anon i authenticated (M1:23); **SELECT dla anon pozostaje** (0 wierszy, brak polityki) | `select_own` (M1:25), `select_group_peers` = `shares_group_with(id)` (M2:130) |
| app_admins | M2:45 | revoke all od anon, authenticated (M2:50) | brak |
| groups | M2:46 | revoke I/U/D/T + SELECT od anon (M2:53-56) | SELECT: member OR app admin (M2:116, M3:6) |
| group_members | M2:47 | jw. | SELECT: member OR app admin (M2:122, M3:10) |
| group_invites | M4:24 | revoke all od anon; I/U/D/T od authenticated (M4:26-27) | SELECT: `is_group_admin` (M4:55) |
| children | M5:35 | revoke all od anon; T, U od authenticated; `grant update(name)` (M5:37-40); **INSERT i DELETE całotabelowe** | S member (M5:46); I/U own+member (M5:52,58); D own+member+brak historii na rozpoczętym terminie (M9:19) |
| events | M6:39 | revoke all od anon; T, U od authenticated; `grant update(starts_at, note)` (M6:41-44) | S member (M6:50); I/U/D admin grupy + `starts_at > now()` (+ `created_by = uid` przy I) (M6:56,67,74) |
| child_attendance | M7:61 | `grant insert(event_id, child_id, group_id, going)`, `update(going, updated_at)`, **brak DELETE** (M7:63-69) | S member (M7:79); I/U: dziecko należy do uid w tej grupie, termin tej grupy, przyszły (M7:85,107); D brak (celowo, M7:9) |
| event_drivers | M8:50 | `grant insert(event_id, user_id, group_id, seats)`, `update(seats, updated_at)`, `delete` (M8:52-59) | S member (M8:69); I/U/D `user_id = uid` + member + termin tej grupy, przyszły (M8:75,92,119) |

Widoków brak w żadnej migracji. Spójność „ta sama grupa” wymuszają też złożone FK
(`events_id_group_unique`, `children_id_group_unique`, M7:27-31, użyte M7:45-48, M8:36).

### Funkcje

- Helpery polityk — wszystkie `security definer`, `stable`, `set search_path = ''`, execute tylko
  dla `authenticated`; każdy sprawdza wyłącznie `auth.uid()` wołającego:
  `is_app_admin()` (M2:62), `is_group_member(gid)` (M2:75), `shares_group_with(uid)` (M2:89),
  `is_group_admin(gid)` (M4:33).
- RPC `security definer` (wszystkie z `search_path = ''`, execute odebrany `public`):
  `create_group`, `add_group_admin`, `admin_list_groups` — sprawdzają `is_app_admin` (M2:142,198,234);
  `regenerate_group_invite` — `is_group_admin(p_group_id)` (M4:68); `join_group_by_invite` — wymaga
  `auth.uid()` i istniejącego tokenu, nie zmienia istniejącej roli (M4:114); `invite_group_name` — bez
  sprawdzenia auth, dostępna dla anon, zwraca tylko nazwę grupy (M4:100; świadoma decyzja,
  `archive/2026-11-12-join-group-by-invite-link/reviews/impl-review.md:36`); funkcje triggerowe
  `handle_new_user` (M1:37) i `delete_future_declarations_of_member` (M11:27) — execute odebrany wszystkim.
- RPC `security invoker` (decyduje RLS): `set_child_attendance` (M7:151), `set_event_driver` (M8:144),
  `group_driver_stats` (M12:16, z jawnym `is_group_member`), `group_child_stats` (M10:72, bez jawnego
  guardu — dla nie-członka 0 wierszy przez RLS `children`).
- Na dziś każda funkcja `security definer` w przejrzanych migracjach ma `search_path = ''` — nie jest to
  jednak nigdzie asertowane katalogowo.

### Admin aplikacji

Wiersz w `public.app_admins` (seed: `supabase/seed.sql:77`, user `…ad01`); brak claimu JWT. Dodatkowe
uprawnienia w przejrzanych migracjach: SELECT wszystkich `groups`/`group_members`, `create_group`,
`add_group_admin`, `admin_list_groups` (z e-mailami adminów). Brak dostępu do `profiles` cudzych grup,
`children`, `events`, deklaracji, `group_invites`, statystyk — świadoma decyzja zawężająca PRD :139
(„Widzi wszystkie grupy”) wobec guardrail :58 (`archive/2026-11-10-app-admin-creates-group/plan.md:216`,
`archive/2026-11-12-group-admin-manages-events/plan.md:38`, `archive/2026-11-12-parent-adds-child/plan.md:40`,
`archive/2026-11-16-group-engagement-stats/reviews/impl-review.md:43-44`).

### Wyrocznia z PRD (oczekiwany dostęp)

Kotwice w `context/foundation/prd.md`: :58 (nikt spoza grupy nie widzi dzieci, telefonów, deklaracji),
:139 (admin aplikacji), :140 (admin grupy; regeneracja unieważnia stary link; bez dat ważności),
:141 (członek; nie może sam opuścić grupy), :144 (widzi tylko swoje grupy, poza adminem aplikacji),
:145 (rodzic zmienia tylko deklaracje swoich dzieci i swoje deklaracje kierowcy), :146 (niezależnie od UI),
:136 (telefon widoczny dla członków grupy), :134/:171 (edycja profilu poza MVP), FR-004 :80, FR-005 :82,
FR-010 :92, FR-012/013 :98-100, FR-014 :104, FR-015 :106.

Skrócona macierz oczekiwana (N = zabronione, Y = dozwolone, ? = PRD milczy — wybór implementacji w nawiasie):

| encja / operacja | anon | outsider | inna grupa | członek (nie-właściciel) | właściciel | admin grupy | admin aplikacji (nie-członek) |
|---|---|---|---|---|---|---|---|
| groups R | N | N | N | Y | – | Y | Y (:139) |
| group_members R | N | N | N | Y | Y | Y | ? (impl Y) |
| profiles R (telefon) | N | N | N | Y (:136) | Y | Y | N (:58; impl N) |
| profiles U | N | N | N | N | N (:134) | N | N w aplikacji |
| invite token R | ? (impl: tylko nazwa grupy) | N | N | ? (impl N) | – | Y | ? (impl N) |
| invite regeneracja | N | N | N (też admin innej grupy) | N | – | Y | ? (impl N) |
| stary token po regeneracji | N dla wszystkich (:82, :140) |||||||
| children R | N | N | N | Y | Y | Y | N |
| children C | N | N | N (do cudzej grupy) | – | Y | Y jako rodzic | N |
| children U/D | N | N | N | N | Y | ? (impl N) | N |
| events R | N | N | N | Y | – | Y | ? (impl N) |
| events C/U/D | N | N | N | N | – | Y przed startem | ? (impl N) |
| child_attendance R | N | N | N | Y | Y | Y | N |
| child_attendance C/U przed startem | N | N | N | N (:145) | Y | N dla cudzych (:145) | N |
| child_attendance po starcie | N dla wszystkich (:104, :130) |||||||
| event_drivers R | N | N | N | Y | Y | Y | N |
| event_drivers C/U/D przed startem | N | N | N | N (:145) | Y | N dla cudzych (:145) | N |
| event_drivers po starcie | N dla wszystkich (:106, :130) |||||||
| stats R | N | N | N | Y (:112) | Y | Y | N (impl N po stats F2) |

Porównanie macierzy implementacji z wyrocznią: **brak sprzeczności w komórkach, gdzie PRD wypowiada się
jednoznacznie.** Różnice dotyczą wyłącznie komórek „?”, rozstrzygniętych w planach archiwalnych (lista w
Open Questions).

### Istniejące pokrycie testami

Infrastruktura (wzorzec do reużycia, bez wspólnego helpera):

- każdy plik: `begin;` → `create extension if not exists pgtap with schema extensions;` → `select plan(N);`
  → … → `select * from finish(); rollback;` (np. `groups_rls.test.sql:4-8, 393-394`);
- impersonacja inline:
  `set local role authenticated; set local "request.jwt.claims" to '{"sub": "…", "role": "authenticated"}';`
  … `reset role;` (`groups_rls.test.sql:117-118`); anon: `profiles_rls.test.sql:160-161`;
- fixtures jako postgres, `insert into auth.users (...)` → trigger tworzy `profiles`
  (`profiles_rls.test.sql:33-41`); stałe UUID-y (`…a1/b1/c1/d1`, grupy `1000…01`/`2000…02`) i stałe e-maile
  `a@example.com` … (bezpieczne dzięki rollback, ale kolidują z lokalnie zarejestrowanym `a@example.com`);
- odmowa wykrywana dwojako: brak przywileju → `throws_ok(…, '42501')`; filtrowanie RLS na UPDATE/DELETE →
  `is_empty($$update … returning id$$)` (`events_rls.test.sql:185-195`, `children_rls.test.sql:153-163`);
  naruszenie `WITH CHECK` → `throws_ok 42501` (`events_rls.test.sql:249`). Nie znaleziono `throws_ok`
  na UPDATE/DELETE, które przechodziłoby pusto;
- obrona przed niepustą bazą: snapshot `preexisting_groups` (`groups_rls.test.sql:248-251`), zawężenie do
  grup fixture (`child_attendance_rls.test.sql:345-351`). Nie znaleziono liczenia całej tabeli jako
  postgres; odczyty bez filtra idą przez RLS jako świeży użytkownik fixture (np. `children_rls.test.sql:260`).
- CI: job `smoke` uruchamia `supabase start` i `supabase test db` (`.github/workflows/ci.yml:42-47`);
  `[db.seed]` włączony — seed wstawia admina aplikacji, jedyne dane gwarantowane przed testami.

Mapowanie ról w plikach: A = admin G1, B = członek G1, C = admin G2 („inna grupa”), D = w żadnej grupie,
X = admin aplikacji (`groups_rls`), C z rolą admina aplikacji (`engagement_stats`).

Komórki **nieasertowane** (zachowanie poprawne wg migracji, ale bez testu) — kandydaci do macierzy:

| tabela | brakujące komórki |
|---|---|
| children | admin grupy A → U/D dziecka członka B; C → U; D → U/D; app admin → S/I/U/D |
| child_attendance | outsider D → wszystkie (brak użytkownika D w pliku); C → bezpośredni U; admin grupy A → C/U dla dziecka B; app admin → S/I/U |
| event_drivers | outsider D → wszystkie (brak D w pliku); C → bezpośredni U/D; admin grupy A → U/D deklaracji B; app admin → S/I/U/D |
| events | outsider D → I/U/D (jest tylko S); app admin → S/I/U/D |
| profiles | były członek → S telefonu dawnych współczłonków; app admin (nie-członek) → S profili członków grupy (F9) |
| group_invites | app admin → S i `regenerate_group_invite` |
| groups / group_members / app_admins | app admin → bezpośrednie I/U/D (F9); anon → `add_group_admin`, `admin_list_groups`, helpery (F9) |
| stats | outsider, inna grupa, anon → `group_driver_stats`/`group_child_stats` (jest tylko A→G2 dla `group_child_stats` i app admin) |

Komórki odmów opartych o REVOKE (np. I/U/D na `profiles`, `groups`) są niezależne od roli — wystarcza
jedna asercja lub sprawdzenie katalogowe `has_table_privilege` (stosowane już np.
`group_invites_rls.test.sql:35`).

### Strażnik katalogowy — jak go wyrazić

Brak w przejrzanych plikach (patrz Summary). Na podstawie dzisiejszego stanu katalogu strażnik może
sprawdzać, bez listy tabel wpisanej na sztywno:

1. każda tabela `relkind in ('r','p')` w schemacie `public` ma `relrowsecurity = true`;
2. każda taka tabela ma co najmniej jedną politykę w `pg_policies` **albo** jest na jawnej liście wyjątków
   z uzasadnieniem — dziś jedyny przypadek to `app_admins` (zero polityk, wszystko revoke, dostęp przez
   helper; M2:50);
3. żadna polityka w `public` nie ma ról `{public}` ani `anon` (dziś wszystkie `{authenticated}`);
4. każda funkcja `prosecdef` w `public` ma `proconfig` zawierające `search_path=` (dziś spełnione);
5. opcjonalnie: każda funkcja w `public` nie ma `EXECUTE` dla `public` (porównanie z jawną listą
   anon-callable: `invite_group_name`).

Pułapka do unikania: strażnik nie może kopiować warunków polityk (anti-pattern z guidance) — sprawdza
tylko fakty strukturalne (RLS włączony, polityki istnieją, role, `search_path`). Semantykę dostępu
sprawdza macierz behawioralna. Strażnik musi działać na niepustej bazie (zapytania po katalogu są od
danych niezależne).

## Code References

- `supabase/migrations/20261110120000_create_groups.sql:45-56` — RLS i revoke dla `app_admins`, `groups`, `group_members`
- `supabase/migrations/20261110120000_create_groups.sql:62-110` — helpery `is_app_admin`, `is_group_member`, `shares_group_with` + granty
- `supabase/migrations/20261110120000_create_groups.sql:130` — `profiles_select_group_peers` (źródło widoczności telefonu)
- `supabase/migrations/20261112130000_create_group_invites.sql:11,68-92,100,114` — tabela linku, regeneracja (upsert), `invite_group_name`, `join_group_by_invite`
- `supabase/migrations/20261112140000_create_children.sql:37-40` — granty `children` (INSERT bez ograniczenia kolumn — G1)
- `supabase/migrations/20261116130000_create_engagement_stats.sql:90` — `e.starts_at >= c.created_at` (konsument `created_at`)
- `supabase/migrations/20261116120000_lock_child_delete_with_history.sql:19` — DELETE dziecka zablokowany przy historii
- `supabase/migrations/20261113120000_create_child_attendance.sql:9,63-69,85,107` — brak DELETE, granty kolumnowe, polityki I/U
- `supabase/migrations/20261113130000_create_event_drivers.sql:52-59,75,92,119` — granty i polityki I/U/D
- `supabase/tests/group_invites_rls.test.sql:100-112,185-202,288-292` — regeneracja i stary token
- `supabase/tests/groups_rls.test.sql:18-62,117-118,233-243,248-251` — per-tabelowe sprawdzenie RLS, impersonacja, blok anon, snapshot
- `supabase/tests/children_rls.test.sql:153-163,343` — wzorzec `is_empty(... returning id)`, były członek
- `.github/workflows/ci.yml:42-47` — `supabase test db` w CI
- `context/foundation/test-plan.md:100,175-177` — bramka strażnika, §6.3 TBD

## Architecture Insights

- Zapisy do `groups`, `group_members`, `group_invites` idą wyłącznie przez RPC `security definer`
  (tabele mają revoke I/U/D); zapisy do `children`, `events`, deklaracji — przez polityki per operacja
  (+ RPC `security invoker` dla deklaracji). Macierz musi testować obie ścieżki: dla tabel z RPC odmowa
  bezpośredniego zapisu to REVOKE (niezależny od roli), a autoryzacja siedzi w ciele RPC (zależna od roli).
- Niezmienność `group_id`/właściciela zapewniają granty kolumnowe, nie polityki — test „UPDATE group_id”
  łapie 42501 z przywileju, nie z `WITH CHECK`.
- Blokada po starcie to predykat `starts_at > now()` w politykach, nie trigger; `now()` stałe w transakcji
  (wzorce §6.1/§6.2 planu testów).
- Trigger `group_members_delete_future_declarations` (M11:55) i kaskady FK omijają RLS — usuwanie wierszy
  przez system nie jest ścieżką klienta i nie należy do macierzy ról.

## Historical Context (from prior changes)

- `context/archive/2026-11-10-app-admin-creates-group/reviews/impl-review.md:119-131` + `follow-ups/review-fixes.md:7-10` —
  F9 (luki testów grantów) odroczone do S-03; **sprzeczne z obecnym stanem: nie zrealizowano** — checkboxy
  otwarte, a blok anon w `groups_rls.test.sql:233-243` obejmuje tylko `groups`, `group_members`, `create_group`.
  F2 tamże (:36-44) wprowadził snapshot `preexisting_groups` — wspierane, wzorzec obecny.
- `context/archive/2026-11-13-child-attendance-declaration/reviews/impl-review.md:55-63` — F3 (polityki nie
  sprawdzały grupy terminu) **naprawione**: warunek `e.group_id = child_attendance.group_id`; test rodzica w
  dwóch grupach dodany w F5 (`child_attendance_rls.test.sql:364`) — wspierane. Ostrzeżenie z
  `plan.md:55` o niekwalifikowanym `group_id` w `exists` (polityka zawsze prawdziwa) — dobry kandydat na
  przypadek w macierzy (członek innej grupy z tym samym `group_id` w payloadzie).
  Twierdzenie z tego review (:26-43), że usunięcie dziecka kaskadowo kasuje zablokowane deklaracje —
  **nieaktualne**: M9:19 blokuje DELETE dziecka z historią na rozpoczętym terminie.
- `context/archive/2026-11-16-group-engagement-stats/reviews/impl-review.md:36-44,56-64` — F2 (statystyki
  kierowców dla app admina-nie-członka) naprawione guardem `is_group_member` (M12:16); F4 (izolacja G2 dla
  `group_child_stats`) naprawione jedną asercją. Częściowo: inne role (outsider, anon) wciąż nietestowane.
- `context/archive/2026-11-12-join-group-by-invite-link/plan.md:77-87,235` — kontrakt linku (admin-only
  SELECT, stary token → `invalid_invite`, anon nie wykonuje join/regenerate) — wspierane przez obecne testy.
- `context/foundation/roadmap.md:118` (S-03 Risk) — link otwiera dostęp do danych dzieci, regeneracja musi
  unieważniać natychmiast — spełnione.

## Related Research

- `context/archive/2026-11-18-testing-history-durability-start-boundary/research.md` — faza 2; wzorce stałego
  `now()` i usunięć członka (trigger M11), na których opiera się część komórek „po starcie” i „były członek”.
- `context/archive/2026-11-18-testing-seat-balance-stats/` — faza 1 (statystyki).

## Open Questions

1. **G1 — `children.created_at` ustawiane przez klienta.** Poza ryzykiem #3 (nie łamie izolacji), ale
   psuje statystyki własnego dziecka. Do decyzji w `/10x-plan`: naprawić w tej fazie (migracja: revoke
   insert + `grant insert(group_id, parent_id, name)` — wzorzec z M7:63-69) z testem, czy odłożyć jako
   follow-up do fazy 4 lub osobnej zmiany. Analogicznie `events.id`/`created_at` — bez konsumenta logiki.
2. **Komórki „?” w PRD** (wyrocznią jest decyzja z archiwum, nie kod — plan powinien je oznaczyć jako
   asercję decyzji): app admin czyta `group_members` (impl Y) i nie czyta `events`/profili (impl N);
   admin grupy nie edytuje cudzych dzieci (impl N, `parent-adds-child/plan.md:40`); token widzi tylko admin
   grupy; anon widzi nazwę grupy po tokenie; brak DELETE deklaracji obecności (powrót do „bez deklaracji”
   niemożliwy; kierowca wycofuje się usunięciem wiersza).
3. **`profiles` SELECT dla anon** nie jest odebrany (0 wierszy przez brak polityki; M1:23) — inaczej niż w
   pozostałych tabelach. Szczelne, ale strażnik/macierz powinny to ustalić jawnie (asercja `is_empty` jako
   anon, jak `profiles_rls.test.sql:163`) albo plan może zaproponować revoke.
4. **F9 punkt smoke** (POST `/api/admin/groups` przez zwykłego użytkownika → 404) to warstwa HTTP — pasuje
   do fazy 4 (smoke), nie do pgTAP; do przypisania w planie.
5. **Organizacja testów:** dopisać brakujące komórki do istniejących plików per tabela (spójne z
   fixture'ami A/B/C/D) czy nowy plik macierzowy z własnymi unikalnymi UUID/e-mailami. Istniejące pliki
   mają twardo wpisane `plan(N)` — każda dopisana asercja wymaga podbicia licznika.
