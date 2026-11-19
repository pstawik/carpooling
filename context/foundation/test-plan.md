# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-19

## 1. Strategy

Testy w tym projekcie podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie promuj testu do e2e, bo e2e „wydaje się
   bezpieczniejsze”. Nie nakładaj modelu wizyjnego na deterministyczny diff,
   który już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyka zakotwiczone w
   „zespół boi się X, a awaria ujawniłaby się gdzieś w <obszarze>” ważą tyle
   samo co linie PRD czy dane o churnie.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje *co może
   się zepsuć* i *dlaczego uważamy to za prawdopodobne* — na podstawie
   dokumentów, wywiadu i *sygnału* z kodu (churn, struktura, baza testów).
   NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę wytwarza
   `/10x-research` w każdej fazie wdrożenia. Jeśli plan i research nie zgadzają
   się co do miejsca awarii, prawdą jest research.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `src/`,
`supabase/migrations/`, `supabase/tests/`, `scripts/` (67 commitów / 30 dni).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według ryzyka = wpływ ×
prawdopodobieństwo. Kolumna Source cytuje *dowód, który wyniósł ryzyko na
listę* — nigdy konkretny plik jako „miejsce awarii” (patrz §1, zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Plan terminu pokazuje „miejsc wystarcza”, choć dzieci „jedzie” jest więcej niż miejsc — przy kilku kierowcach, kierowcy usuniętym z grupy lub dzieciach „bez deklaracji” — i dziecko zostaje bez transportu | High | High | interview Q1, Q4; PRD §Business Logic „Bilans miejsc”, US-01; `archive/2026-11-13-driver-declaration-seat-balance` impl-review F1; hot-spot dir `src/lib/services/` (28 commits/30d) |
| 2 | Usunięcie dziecka, terminu lub członka kasuje deklaracje zakończonych terminów, więc statystyki zmieniają się wstecz | High | High | interview Q2; PRD §Business Logic „Zakończenie terminu”, §Access Control „Usunięcie z grupy”; `archive/2026-11-13-child-attendance-declaration` impl-review F1; `archive/2026-11-12-group-admin-manages-events` plan-review F1, impl-review F4; roadmap S-09 Unknowns |
| 3 | Nowa lub zmieniona polityka RLS poluzowuje izolację: osoba spoza grupy czyta dzieci, telefony lub deklaracje, członek zapisuje cudzą deklarację (IDOR), a stary link zaproszeniowy nadal wpuszcza | High | Medium | interview Q3; PRD §Guardrails „Izolacja danych grup”, §Access Control „Zasady”; AGENTS.md Hard Rules; `archive/2026-11-13-child-attendance-declaration` impl-review F3; `archive/2026-11-10-app-admin-creates-group` impl-review F9; `archive/2026-11-16-group-engagement-stats` impl-review F2, F4; roadmap S-03 Risk |
| 4 | Deklarację da się zmienić po rozpoczęciu terminu albo blokada włącza się o złej godzinie (strefa czasowa, zmiana czasu, sama granica startu) | High | Medium | PRD §Business Logic „Zakończenie terminu”, FR-014, FR-015; roadmap Open Question #14; `archive/2026-11-13-weekly-event-generator` impl-review F4; `archive/2026-11-12-group-admin-manages-events` impl-review F3; `archive/2026-11-16-group-engagement-stats` impl-review F1 |
| 5 | Błąd backendu lub złośliwe/brzegowe wejście kończy się 500 albo pozornym sukcesem — rodzic myśli, że deklaracja lub dołączenie się zapisało | Medium | High | `archive/2026-11-12-join-group-by-invite-link` impl-review F2; `archive/2026-11-13-child-attendance-declaration` impl-review F6; `archive/2026-11-12-group-admin-manages-events` impl-review F1; `archive/2026-11-13-weekly-event-generator` impl-review F1; `archive/2026-11-09-signup-with-profile` impl-review F6; hot-spot dirs `src/pages/api/` (31 commits/30d), `src/lib/validation/` (14 commits/30d) |
| 6 | Statystyki liczą źle: nieobecność ≠ jawne „nie jedzie” + brak deklaracji, wchodzą terminy niezakończone albo przejazdy kierowców są liczone błędnie | Medium | Medium | interview Q4; PRD FR-017, §Business Logic „Zaangażowanie”; `archive/2026-11-16-group-engagement-stats` impl-review F1, F2 |

Awarie wysokiego wpływu i niskiego prawdopodobieństwa (awaria Supabase lub
Cloudflare) należą do obserwowalności, nie do testów — poza tą mapą.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Przy liczbie dzieci „jedzie” większej niż suma miejsc plan zawsze pokazuje ostrzeżenie o niedoborze; dzieci bez deklaracji nie zwiększają zapotrzebowania, ale są oznaczone; kierowca usunięty z grupy nie dokłada miejsc | „Bilans = suma po wszystkich wierszach” — wiersze byłych członków i wycofane deklaracje nie mogą się liczyć | Gdzie liczony jest bilans (SQL czy TS), jakie wiersze wchodzą do sumy, jak traktowane są deklaracje byłych członków | pgTAP lub unit (zależnie od miejsca logiki) | Oczekiwana wartość przepisana ze wzoru w kodzie (problem wyroczni) — liczby mają pochodzić z ręcznie policzonych przykładów wg PRD |
| #2 | Po usunięciu dziecka, terminu lub członka deklaracje i statystyki zakończonych terminów pozostają bez zmian; znikają tylko deklaracje przyszłych terminów | „Kaskada jest w porządku, bo przyszłe deklaracje i tak trzeba usunąć” — PRD wymaga zachowania zakończonych | Reguły usuwania (kaskady, ograniczenia) dla dzieci, terminów, członkostwa; czy obecne zachowanie to świadomy kompromis do rozstrzygnięcia | pgTAP integration | Test zatwierdzający obecne zachowanie zamiast wymagania PRD; liczniki zakładające pustą bazę |
| #3 | Dla każdej tabeli × operacji × roli (spoza grupy, członek innej grupy, członek tej grupy nie-właściciel, właściciel, admin grupy, admin aplikacji) dostęp jest dokładnie taki, jak w PRD; każda tabela ma włączony RLS; po regeneracji stary link nie działa | „Zalogowany = uprawniony”; „przetestowany SELECT = UPDATE/DELETE też szczelne” | Lista tabel i polityk per operacja, funkcje `security definer`, granty, istniejące pokrycie w `supabase/tests/` | pgTAP + strażnik katalogowy RLS | Tylko ścieżka szczęśliwa; liczenie wszystkich wierszy przy niepustej bazie; kopiowanie warunku polityki do asercji |
| #4 | Zapis deklaracji dziecka i kierowcy przechodzi sekundę przed startem i jest odrzucany od chwili startu, także w dniach zmiany czasu i dla godzin w czasie lokalnym grupy | „Zegar serwera w UTC = czas terminu”; „zablokowany przycisk w UI = blokada” | Jak przechowywany jest start (typ, strefa), który zegar egzekwuje blokadę (baza czy Worker), gdzie odbywa się konwersja strefy (pytanie #14 z roadmapy rozstrzygnięte: Europe/Warsaw) | granica startu: pgTAP ze stałym `now()` w transakcji (`starts_at = now()` vs `now() + 1 s`); strefa i zmiana czasu: unit (Vitest) na czystych funkcjach konwersji | Testy zależne od zegara ściennego (`Date.now()`, przesunięcia względem bieżącej godziny); sprawdzanie wyłącznie stanu UI |
| #5 | Gdy zapytanie lub RPC zwróci błąd, a wejście jest złośliwe lub brzegowe (zły format, rok poza zakresem, puste ciało), użytkownik dostaje jawny komunikat błędu (4xx lub przekierowanie z błędem), nigdy 500 ani komunikat sukcesu | „Końcowe 302 = sukces” | Mapowanie błędów RPC na komunikaty, schematy zod na granicy API, zachowanie stron przy błędzie zapytania | unit (mapowanie, zod) + kroki smoke | Mockowanie wnętrza klienta Supabase; asercja tylko na kod statusu bez sprawdzenia celu przekierowania i stanu danych |
| #6 | Dla zestawu zakończonych i niezakończonych terminów statystyki zwracają liczby zgodne z ręcznie policzonym przykładem: nieobecność = jawne „nie jedzie” + brak deklaracji, przejazdy kierowcy tylko z zakończonych terminów | „Zakończony = data w przeszłości wg zegara Workera” | Gdzie liczone są statystyki, która definicja „zakończony” obowiązuje, jak traktowani są byli członkowie | pgTAP | Lustrzane odbicie implementacji; fixture bez dzieci bez deklaracji i bez terminów na granicy |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia z własnym folderem zmiany otwieranym
przez `/10x-new`. Status przesuwa się od lewej do prawej; orkiestrator
aktualizuje go, gdy na dysku pojawiają się artefakty.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bilans i statystyki na danych granicznych | Udowodnić, że ostrzeżenie o niedoborze i statystyki są zgodne z ręcznie policzonymi przykładami z PRD | #1, #6 | pgTAP lub unit (bootstrap Vitest, jeśli logika jest w TS) | complete | context/archive/2026-11-18-testing-seat-balance-stats/ |
| 2 | Trwałość historii i granica startu terminu | Udowodnić, że usunięcia nie zmieniają zakończonych terminów, a blokada działa dokładnie od chwili startu | #2, #4 | pgTAP z kontrolowanym czasem | complete | context/archive/2026-11-18-testing-history-durability-start-boundary/ |
| 3 | Macierz izolacji RLS | Udowodnić izolację grup i własności deklaracji dla każdej tabeli, operacji i roli oraz wymusić RLS na nowych tabelach | #3 | pgTAP + strażnik katalogowy | complete | context/archive/2026-11-18-testing-rls-isolation-matrix/ |
| 4 | Ścieżki błędów i walidacja wejścia w API | Udowodnić, że błędy backendu i złe wejście dają jawny błąd, nie 500 ani pozorny sukces; w smoke także F9: zwykły zalogowany użytkownik POST `/api/admin/groups` → 404 (`archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10`) | #5 | unit + smoke | planned | context/changes/testing-api-error-paths/ |
| 5 | Bramki jakości | Wpiąć nowe testy w CI i hook po edycji, żeby podłoga nie spadła | cross-cutting | gates, post-edit hook | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| DB integration (RLS, reguły, statystyki) | pgTAP przez `supabase test db` | Supabase CLI (lokalny stack) | 14 plików w `supabase/tests/`; uruchamiane w CI |
| HTTP smoke | `scripts/smoke.mjs` (Node) | n/a | przepływy auth i zapisów na działającym serwerze; uruchamiany w CI |
| unit (TS) | Vitest przez `npm test` (`vitest run`) | 5.1.0 | czyste funkcje z `src/lib/`; `src/**/*.test.ts`, środowisko `node`, `vitest.config.ts` niezależny od `astro.config.mjs` (bez workerd); uruchamiany w CI (job `ci`) |
| e2e | none — świadomie | — | żadne ryzyko z §2 nie wymaga przeglądarki |
| accessibility / visual | kitchen sinki `/dev/ui-*` + `check-ui-literals` | n/a | poza zakresem testów (patrz §7) |

**Stack grounding tools (current session):**
- Docs: none — Context7 / docs MCP not available in current session; checked: 2026-11-18
- Search: none — Exa.ai / search MCP not available in current session; checked: 2026-11-18
- Runtime/browser: Claude in Chrome (skill) — not used; e2e not planned; checked: 2026-11-18
- Provider/platform: GitHub via `gh` CLI — CI status for PR gates; Supabase local CLI for pgTAP; checked: 2026-11-18

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`npm run lint`, `astro check`) | local + CI | required | dryf składni i typów, literały UI |
| pgTAP (`supabase test db`) | local + CI | required | regresje RLS, reguł i statystyk w bazie |
| build | CI | required | błędy budowania Workera |
| smoke (`npm run smoke`) | CI | required | zepsute przepływy HTTP |
| unit (TS, `npm test`) | local + CI | required (aktywna od §3 Phase 1) | regresje logiki i mapowania błędów |
| strażnik RLS na każdej tabeli | CI (w pgTAP) | required (aktywna od §3 Phase 3) | tabela bez RLS lub bez polityk |
| post-edit hook | local (agent loop) | recommended after §3 Phase 5 | regresje w chwili edycji |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każdy podrozdział wypełnia się, gdy
odpowiednia faza zostanie wdrożona; wcześniej brzmi „TBD — see §3 Phase N”.

### 6.1 Test reguły liczenia (bilans, statystyki)

- **Wyrocznia**: ręcznie policzony przykład według PRD, z rachunkiem w
  komentarzu przy asercji (np. `-- 3 jedzie, 2 + 1 miejsc → wystarcza`).
  Nigdy nie przepisuj wzoru z kodu ani nie licz oczekiwanej wartości tą samą
  funkcją.
- **Reguły wyroczni** (potwierdzone):
  - przejazd kierowcy liczy się tylko na zakończonym terminie, na którym co
    najmniej jedno dziecko ma `going = true`;
  - zakres dziecka zaczyna się od `children.created_at` (włącznie);
  - „zakończony” = `starts_at <= now()` na zegarze bazy, nie Workera;
  - dziecko bez deklaracji = „nie jedzie”: nie zwiększa zapotrzebowania na
    miejsca, ale jest oznaczone i wchodzi do nieobecności.
- **Przypadki graniczne do pokrycia**: równość miejsc i dzieci (→ wystarcza),
  brak kierowców, nikt nie jedzie, dziecko bez deklaracji, `starts_at = now()`
  (zakończony) vs `now() + 1 s`, `created_at = starts_at` (w zakresie) vs
  `+ 1 s`, kierowca na terminie bez jadących dzieci (0 przejazdów), były
  członek grupy.
- **Warstwa**: czysta funkcja TS → Vitest, plik `*.test.ts` obok modułu w
  `src/lib/services/` (`npm test`); reguła w SQL (funkcja, trigger,
  statystyki) → pgTAP w `supabase/tests/*.test.sql` (`npx supabase test db`).
  Test pgTAP działa w jednej transakcji, więc `now()` jest stałe — termin
  „dokładnie teraz” to `starts_at = now()` w fixturze.
- **Znana luka**: oznacz ją pgTAP `todo` z odwołaniem do PRD zamiast
  zatwierdzać obecne zachowanie.
- **Dowód**: celowo zepsuj operator graniczny (`<` ↔ `<=`, `>` ↔ `>=`) i
  potwierdź, że test robi się czerwony; potem cofnij.
- **Wzorce**: `src/lib/services/drivers.test.ts` (bilans miejsc),
  `src/lib/services/attendance.test.ts` (plan dzieci + bilans),
  `supabase/tests/engagement_stats_boundaries.test.sql` (granice statystyk).

### 6.2 Test trwałości danych i granicy czasu

- **Wyrocznia**: PRD („Zakończenie terminu”, FR-014, FR-015, §Access
  Control „Usunięcie z grupy”) i kalendarz zmian czasu — nigdy wartość
  odczytana z kodu. Rachunek (offset, statystyki przed/po) w komentarzu
  przy asercji.
- **Granica blokady (pgTAP)**: w jednej transakcji `now()` jest stałe, więc
  termin `starts_at = now()` jest już rozpoczęty (zablokowany), a
  `now() + interval '1 second'` jeszcze otwarty. Sprawdź każdą ścieżkę
  zapisu osobno: INSERT, UPDATE, DELETE i ścieżkę konfliktu RPC
  (`insert … on conflict do update` na zablokowanym wierszu daje 42501, a
  bezpośredni UPDATE/DELETE — 0 wierszy, `is_empty(… returning …)`). Na
  koniec, jako postgres, potwierdź, że wiersz sprzed startu jest bez zmian.
- **Strefa i zmiana czasu (Vitest)**: baza nie zna stref — konwersja
  Europe/Warsaw jest w `src/lib/time.ts`, więc testuj czyste funkcje.
  Przypadki: zima (CET +1) i lato (CEST +2), luka wiosenna → `null`,
  godzina dwuznaczna jesienią → wcześniejsza chwila (CEST), granica doby,
  seria tygodniowa przez obie zmiany czasu. Daty 2026: 29 marca i 25
  października.
- **Usunięcie nie zmienia historii (pgTAP, migawka)**: jako członek grupy
  zapisz `group_child_stats` / `group_driver_stats` do tabel tymczasowych
  (`on commit drop`, `grant select, insert … to authenticated`), raz
  porównaj migawkę z ręcznie policzonymi wartościami (żeby nie była pusta),
  potem po każdym usunięciu porównuj wynik funkcji z migawką. Zakończone
  terminy muszą wnosić nietrywialne wartości (jadące dziecko, kierowca), bo
  inaczej zniknięcie terminu nie zmieni statystyk i test nic nie złapie.
  Usuwane dziecko bez historii: najpierw asercja 0 / 0, potem porównanie
  pozostałych dzieci.
- **Dowód**: celowo zepsuj predykat (`>` → `>=` w polityce, odwrotne
  sortowanie kandydatów, polityka usuwania bez `starts_at > now()`),
  `npx supabase db reset`, potwierdź czerwień, cofnij.
- **Wzorce**: `supabase/tests/declaration_lock_boundary.test.sql`,
  `supabase/tests/deletion_history_stats.test.sql`,
  `src/lib/time.test.ts`, `src/lib/weekly-events.test.ts`,
  `src/lib/services/events.test.ts`.

### 6.3 Test polityki RLS dla nowej tabeli

- **Wyrocznia**: PRD (§Guardrails „Izolacja danych grup”, §Access Control
  „Zasady”) — nigdy warunek polityki przepisany do asercji. Oczekiwanie to
  dosłowne id z fixture'a plus „widzi / nie widzi nic / 42501”. Komórka, w
  której PRD milczy („?”), asertuje decyzję z archiwum z cytatem w opisie.
  Format opisu asercji:
  `'<rola> <operacja> <tabela>: <oczekiwanie> (PRD :NN | decyzja: <plik>)'`
  (ścieżki względem `context/`).
- **Tabela ról na fixture'ach**: `anon` (niezalogowany), O (zalogowany, bez
  grupy), C (admin innej grupy), X (admin aplikacji, nie członek), M (członek
  bez praw do cudzych wierszy), A (admin grupy działający na wierszach B),
  B (właściciel: rodzic, kierowca, deklarujący), F (były członek). Każda rola
  to użytkownik z fixture'a; plik ma własne prefiksy UUID (`5a` użytkownicy,
  `5b` grupy, `5c` dzieci, `5e` terminy) i e-maile `rlsm-<rola>@example.test`.
  Nagłówek pliku zawiera tabelę pokrycia tabela/operacja × rola.
- **Każda operacja osobno**: S, I, U i D asertowane oddzielnie dla każdej
  roli — odmowa SELECT nic nie mówi o UPDATE ani DELETE.
- **Odmowa + stan**: UPDATE/DELETE odfiltrowany przez RLS →
  `is_empty(… returning …)`, potem po `reset role`, jako postgres, sprawdź,
  że wiersz z fixture'a jest bez zmian. Brak uprawnienia lub nieudany
  `WITH CHECK` → `throws_ok(…, '42501')`. Gdy funkcja ma własne wewnętrzne
  sprawdzenie zwracające 42501, przypnij warstwę grantów komunikatem błędu
  (np. `'permission denied for function admin_list_groups'`) — celowe
  zepsucie grantu pokazało, że bez komunikatu macierz zostaje zielona.
- **Brak liczenia tabel**: każde zapytanie zawężone do id z fixture'a;
  żadna tabela nie jest liczona w całości, więc test nie zależy od
  zawartości bazy.
- **Strażnik katalogowy**: `rls_catalog_guard.test.sql` czyta katalogi
  systemowe, nie listę tabel. Pięć sprawdzeń (funkcje naruszeń w
  `pg_temp`): RLS na każdej tabeli `public`; co najmniej jedna polityka
  (allow-lista: `app_admins`); żadnej polityki dla `public`/`anon`; każda
  funkcja `security definer` przypina `search_path`; `anon` ma EXECUTE tylko
  na allow-liście (`invite_group_name(text)`). Na końcu sonda tworzy w
  wycofywanej transakcji celowo zepsute obiekty i dowodzi, że każde
  sprawdzenie je wykrywa.
- **Nowa tabela → wiersz w macierzy + strażnik musi przejść**:
  1. migracja z włączonym RLS i politykami per operacja i rola (AGENTS.md);
  2. strażnik musi przejść — tabela celowo bez polityk trafia na allow-listę
     z uzasadnieniem; nowa funkcja wywoływalna przez `anon` trafia na
     allow-listę `anon` z uzasadnieniem;
  3. w macierzy nowa sekcja: wszystkie role × S/I/U/D, aktualizacja tabeli
     pokrycia w nagłówku i `plan(N)`;
  4. dowód celowym zepsuciem: poluzuj politykę w tymczasowej migracji,
     `npx supabase db reset`, potwierdź czerwień oczekiwanej asercji, usuń
     migrację i ponów `db reset`.
- **Granty**: RLS nie zastępuje grantów kolumn — np.
  `20261118140000_harden_children_insert_and_anon_profiles.sql` zawęża
  INSERT na `children` do `id, group_id, parent_id, name` i odbiera `anon`
  SELECT na `profiles`. Skutek: nowa kolumna, którą klient ma ustawiać
  (w `children`, `child_attendance`, `event_drivers` — wszystkie mają INSERT
  per kolumna), wymaga w tej samej migracji jawnego `grant insert (<kolumna>)`
  oraz asercji `has_column_privilege` w teście tabeli.
- **Wzorce**: `supabase/tests/rls_isolation_matrix.test.sql` (macierz),
  `supabase/tests/rls_catalog_guard.test.sql` (strażnik).

### 6.4 Test endpointu API (błędy i wejście)

- TBD — see §3 Phase 4 (wzorzec: błąd RPC i złe wejście → jawny błąd, nie 500 ani sukces).

### 6.5 Per-rollout-phase notes

(Uzupełniane po każdej fazie.)

- **Faza 1** (`testing-seat-balance-stats`): Vitest wprowadzony do projektu
  i CI. Faza wykazała, że usunięcie członka zostawiało jego deklaracje
  na przyszłych terminach — naprawione triggerem
  `group_members_delete_future_declarations` (usuwa tylko deklaracje terminów
  z `starts_at > now()`; zakończone zostają; test
  `supabase/tests/member_removal_declarations.test.sql`). Widoczność
  przejazdów byłego członka w statystykach zakończonych terminów (PRD
  §Access Control „Usunięcie z grupy”) jest oznaczona `todo` w
  `engagement_stats_boundaries.test.sql` i przekazana fazie 2 (ryzyko #2).
  Znany wyścig: deklaracja zapisana równolegle z usunięciem członka może
  ominąć trigger. Dziś to nieosiągalne dla klientów; blokada `for share`
  jest wymaganiem FR-007 w roadmapie.
  Otwarta decyzja dla fazy 2: dzieci usuniętego rodzica zostają w grupie,
  a `group_child_stats` liczy ich zakres od `created_at` bez końca, więc
  przybywa im nieobecności i w planach widnieją jako „bez deklaracji”.
  Do wyboru: koniec zakresu w chwili usunięcia rodzica albo ukrywanie
  dzieci osób spoza grupy (powiązane z roadmap S-07 Unknowns).
- **Faza 2** (`testing-history-durability-start-boundary`): blokada
  deklaracji była poprawna — brakowało testów na samej granicy startu i
  testów konwersji czasu (dodane). Faza naprawiła lukę względem PRD:
  `group_driver_stats` pomijało byłych członków, więc ich przejazdy z
  zakończonych terminów znikały; migracja
  `20261118130000_keep_former_member_drives_in_stats.sql` listuje obecnych
  członków oraz byłych z co najmniej jednym zaliczonym przejazdem (nick
  byłego członka zwykle `null` → „Członek grupy”); `todo` z fazy 1 jest
  teraz asercją. Świadome kompromisy bez testów: dziecko bez żadnej
  deklaracji na zakończonych terminach można usunąć, a jego nieobecności
  znikają; usunięcie grupy lub profilu kasuje całą historię (kaskada omija
  RLS, brak ścieżki w aplikacji). Los dzieci usuniętego rodzica przeniesiony
  do FR-007 w roadmapie (bez zapisanej chwili usunięcia nie ma wyroczni).
  Do backportu w `/10x-test-plan`: dla ryzyka #4 warstwa strefy/DST to
  Vitest, a „kontrolowany czas” w pgTAP to stałe `now()` w transakcji
  (§2 Risk Response Guidance) — wprowadzone 2026-11-18.

## 7. What We Deliberately Don't Test

- **Wygląd widoków i tokeny design-systemu** — pilnują ich kitchen sinki `/dev/ui-*` i lint `check-ui-literals`. Re-evaluate if pojawi się regresja wizualna, której te narzędzia nie złapały. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-18
- Stack versions last verified: 2026-11-18
- AI-native tool references last verified: 2026-11-18

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
