---
change_id: testing-rls-isolation-matrix
title: RLS isolation matrix tests (test-plan rollout Phase 3)
status: archived
created: 2026-11-18
updated: 2026-11-19
archived_at: 2026-11-19T05:41:35Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Macierz izolacji RLS".
Risks covered: #3 (nowa lub zmieniona polityka RLS poluzowuje izolację: osoba spoza grupy czyta dzieci, telefony lub deklaracje, członek zapisuje cudzą deklarację (IDOR), a stary link zaproszeniowy nadal wpuszcza). Test types planned: pgTAP + strażnik katalogowy.
Risk response intent:
- #3: dla każdej tabeli × operacji × roli (spoza grupy, członek innej grupy, członek tej grupy nie-właściciel, właściciel, admin grupy, admin aplikacji) dostęp jest dokładnie taki, jak w PRD; każda tabela ma włączony RLS; po regeneracji stary link nie działa. Nie zakładać „zalogowany = uprawniony” ani „przetestowany SELECT = UPDATE/DELETE też szczelne”; unikać samej ścieżki szczęśliwej, liczenia wszystkich wierszy przy niepustej bazie i kopiowania warunku polityki do asercji.
After creating the folder, follow the downstream continuation rule.
Please create git issues for this change.

Issue: https://github.com/pstawik/carpooling/issues/65

F9 z `archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md`: pozycje 1–3 (linie 7–9) są pokryte przez `supabase/tests/rls_isolation_matrix.test.sql` (asercje oznaczone „F9”), a pozycja 4 (smoke: zwykły użytkownik POST `/api/admin/groups` → 404) przeszła do fazy 4 planu testów (`context/foundation/test-plan.md` §3). Plik w archiwum świadomie zostaje nietknięty (AGENTS.md).
