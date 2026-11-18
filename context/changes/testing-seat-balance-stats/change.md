---
change_id: testing-seat-balance-stats
title: Testy bilansu miejsc i statystyk na danych granicznych (rollout Phase 1)
status: implementing
created: 2026-11-18
updated: 2026-11-18
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Bilans i statystyki na danych granicznych".
Risks covered: #1 (plan pokazuje "miejsc wystarcza", choć dzieci "jedzie" jest więcej niż miejsc), #6 (statystyki liczą źle). Test types planned: pgTAP lub unit (bootstrap Vitest, jeśli logika jest w TS).
Risk response intent:
- #1: przy liczbie dzieci "jedzie" większej niż suma miejsc plan zawsze pokazuje ostrzeżenie; dzieci bez deklaracji nie zwiększają zapotrzebowania, ale są oznaczone; kierowca usunięty z grupy nie dokłada miejsc. Oczekiwane wartości z ręcznie policzonych przykładów wg PRD, nie ze wzoru w kodzie.
- #6: statystyki zgodne z ręcznie policzonym przykładem: nieobecność = jawne "nie jedzie" + brak deklaracji, przejazdy kierowcy tylko z zakończonych terminów.

**GitHub issue:** https://github.com/pstawik/carpooling/issues/59
