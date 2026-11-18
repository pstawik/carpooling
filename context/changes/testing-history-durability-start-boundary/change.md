---
change_id: testing-history-durability-start-boundary
title: Testy trwałości historii i granicy startu terminu (rollout Faza 2)
status: impl_reviewed
created: 2026-11-18
updated: 2026-11-18
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Trwałość historii i granica startu terminu".
Risks covered: #2 (usunięcie dziecka/terminu/członka kasuje deklaracje zakończonych terminów), #4 (deklarację da się zmienić po starcie albo blokada włącza się o złej godzinie). Test types planned: pgTAP z kontrolowanym czasem.
Risk response intent:
- #2: po usunięciu dziecka, terminu lub członka deklaracje i statystyki zakończonych terminów pozostają bez zmian; znikają tylko deklaracje przyszłych terminów (wymaganie PRD, nie obecne zachowanie).
- #4: zapis deklaracji dziecka i kierowcy przechodzi sekundę przed startem i jest odrzucany od chwili startu, także w dniach zmiany czasu i dla godzin w czasie lokalnym grupy; egzekwowane po stronie serwera, nie tylko w UI.
After creating the folder, follow the downstream continuation rule.
