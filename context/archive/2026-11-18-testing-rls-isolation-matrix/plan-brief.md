# Macierz izolacji RLS — Plan Brief

> Full plan: `context/changes/testing-rls-isolation-matrix/plan.md`
> Research: `context/changes/testing-rls-isolation-matrix/research.md`

## What & Why

Faza 3 planu testów, ryzyko #3: nowa lub zmieniona polityka RLS może poluzować izolację — osoba spoza
grupy czyta dzieci, telefony lub deklaracje, członek zapisuje cudzą deklarację, stary link wpuszcza.
Dziś izolacja jest szczelna, więc celem jest zablokowanie **regresji**: pełna macierz rola × operacja
i strażnik katalogowy, który da czerwony CI przy tabeli bez RLS.

## Starting Point

9 tabel z RLS, polityki tylko dla `authenticated`, granty kolumnowe chronią grupę i właściciela.
Testy per tabela istnieją, ale nie pokrywają: admina grupy na cudzych wierszach, admina aplikacji
(F9 — odroczone i niezrobione), bezpośrednich zapisów outsidera i innej grupy, telefonów byłego członka.
Strażnika katalogowego brak. Dwie luki grantów: `children.created_at` ustawiane przez klienta (G1)
i SELECT na `profiles` dla anon.

## Desired End State

Migracja zamyka obie luki grantów. `rls_catalog_guard.test.sql` sprawdza katalog bez listy tabel na
sztywno (z sondą dowodzącą, że nie jest pusty z definicji). `rls_isolation_matrix.test.sql` pokazuje
w jednym miejscu dostęp każdej z 7 ról do każdej tabeli, RPC i statystyk. §6.3 planu testów opisuje wzorzec.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| G1 `children.created_at` | Naprawić w tej fazie: grant insert `(id, group_id, parent_id, name)` | Mała poprawka z gotowym wzorcem (M7:63-69); `id` zostaje, bo testy go używają | Research / Plan |
| `profiles` SELECT dla anon | Revoke w tej samej migracji; test `:163` → 42501 | Spójność z resztą tabel, dwie warstwy obrony telefonów | Plan |
| Organizacja testów | Nowy plik macierzy z własnymi fixture'ami 7 ról | Cała macierz w jednym miejscu, bez ruszania `plan(N)` 7 plików | Plan |
| Zakres strażnika | Rozszerzony: RLS + polityki, brak `public`/`anon`, `search_path` definerów, anon EXECUTE z listy | Łapie też dziury przez funkcje i polityki, nie tylko brak RLS | Plan |
| Komórki, w których PRD milczy | Asertować decyzję z archiwum z cytatem w opisie | Zmiana decyzji wymaga świadomej edycji testu | Plan |
| F9 punkt smoke | Do fazy 4 planu testów; archiwum nietknięte | Warstwa HTTP; AGENTS.md zakazuje edycji `context/archive/` | Plan |

## Scope

**In scope:**
- migracja grantów (G1 + anon `profiles`) z testami;
- strażnik katalogowy z sondą;
- macierz dla 9 tabel, RPC `security definer`, statystyk, byłego członka;
- §6.3 i §5 planu testów.

**Out of scope:**
- zmiany polityk RLS;
- `events.id`/`created_at` po stronie klienta;
- deduplikacja istniejących testów;
- smoke F9;
- FR-007 i inne pytania produktowe.

## Architecture / Approach

Najpierw granty (zmieniają oczekiwania macierzy), potem strażnik (najtańszy sygnał), potem macierz
w dwóch fazach w jednym pliku. Wyrocznia to PRD, a nie predykat polityki. Każda operacja jest
sprawdzana osobno, a odmowę UPDATE/DELETE potwierdza `is_empty(... returning id)` plus kontrola stanu
jako postgres. Zapytania zawężamy do identyfikatorów fixture'ów, bez liczenia tabel. Każda faza ma
celowe zepsucie, które musi dać czerwony test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja hartująca granty | `children` INSERT bez `created_at`, anon bez `profiles` | Nieznany przepływ anon czytający `profiles` (sprawdzono: brak) |
| 2. Strażnik katalogowy | `rls_catalog_guard.test.sql` + sonda | Lista wyjątków wymaga utrzymania |
| 3. Macierz — dane grupy | `children`, `events`, deklaracje × 7 ról × S/I/U/D | Duży plik, łatwo o asercję pustą z definicji — stąd celowe zepsucia |
| 4. Macierz — członkostwo, profile, linki, RPC, statystyki | Komórki F9, telefony byłego członka, stats per rola | Komórki „?” utrwalają decyzje, nie PRD |
| 5. Domknięcie | §6.3, §5, wiersz fazy 4 | — |

**Prerequisites:** lokalny `npx supabase start`; zielony `supabase test db` na `main`.
**Estimated effort:** ~2–3 sesje w 5 fazach (najwięcej pracy w fazach 3–4).

## Open Risks & Assumptions

- Zakładamy, że domyślne przywileje Supabase są takie, jak opisano w researchu (nie weryfikowano na żywej bazie); strażnik i macierz to wykażą.
- Nie sprawdzano, czy kod aplikacji używa `service_role` (to ominęłoby RLS); poza zakresem tej fazy.
- Komórki „?” mogą wymagać zmiany testu przy przyszłej decyzji produktowej (np. FR-007).

## Success Criteria (Summary)

- Nowa tabela bez RLS, polityka `to public` albo funkcja definer bez `search_path` daje czerwony CI.
- Dla każdej tabeli, operacji i roli dostęp jest asertowany zgodnie z PRD lub udokumentowaną decyzją.
- Rodzic nie może przesunąć zakresu statystyk swojego dziecka, a anon nie ma przywileju na `profiles`.
