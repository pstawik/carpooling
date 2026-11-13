# Deklaracja obecności dziecka i plan dzieci terminu — skrót planu

> Full plan: `context/changes/child-attendance-declaration/plan.md`

## What & Why

Rodzic ustawia dla terminu każdemu swojemu dziecku „jedzie” albo „nie jedzie”, a cała grupa widzi, które dzieci jadą. To pierwsza połowa US-01 (S-07 z roadmapy, FR-014 i FR-016 bez kierowców). Na tej samej stronie S-08 dołoży kierowców i bilans miejsc.

## Starting Point

Są grupy, dzieci (S-04) i terminy z `starts_at timestamptz` (S-05, S-06). Blokada „po rozpoczęciu” działa już w RLS terminów (`starts_at > now()`). Nie ma tabeli deklaracji ani strony planu terminu: S-05 odłożył ścieżkę `/groups/[id]/terminy/[eventId]` właśnie do tego wycinka.

## Desired End State

Z listy terminów (nadchodzących i minionych) członek otwiera plan terminu. Widzi listy „Jadą (N)” i „Nie jadą (M)”, przy czym dzieci bez deklaracji są na drugiej liście z etykietą „bez deklaracji”. Rodzic ma przy swoich dzieciach przyciski „Jedzie” / „Nie jedzie”, które znikają z chwilą rozpoczęcia terminu. Baza odrzuca zapis za cudze dziecko, w obcej grupie i po starcie terminu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Gdzie deklarować | Tylko na stronie planu terminu | Deklaracja i plan w jednym miejscu (US-01), strona grupy nie puchnie przy 360 px. |
| Przełącznik | Dwa przyciski na dziecko, jedno stuknięcie zapisuje | Bez JS i bez kroku „Zapisz”, jak istniejące formularze. |
| Cofanie do „bez deklaracji” | Niemożliwe, tylko przełączanie | Oba stany liczą się jako „nie jedzie”, a brak DELETE upraszcza polityki. |
| Usunięcie dziecka | Deklaracje usuwane kaskadowo | Usuwanie dziecka z S-04 działa dalej; statystyki tracą to dziecko (kompromis z S-04). |
| Plan minionego terminu | Dostępny tylko do odczytu | Ta sama strona obsługuje stan zablokowany po starcie. |
| Dzieci rodzica usuniętego z grupy | Poza zakresem, decyzja przy FR-007 | Scenariusza nie da się dziś wywołać z aplikacji. |
| Zgodność grup | Złożone klucze obce `(event_id, group_id)` i `(child_id, group_id)` | Baza nie pozwoli przypiąć dziecka do terminu innej grupy. |
| Ścieżka zapisu | Funkcja `set_child_attendance` (`security invoker`) zamiast upsertu PostgREST | Upsert wymagałby UPDATE na kluczach; funkcja zmienia tylko `going` i działa pod RLS. |

## Scope

**In scope:**
- tabela `child_attendance` z RLS, funkcja zapisu i testy pgTAP;
- serwis, walidacja zod i endpoint `POST /api/groups/events/attendance`;
- strona `/groups/[id]/terminy/[eventId]`, linki z listy terminów, kroki smoke.

**Out of scope:**
- kierowcy i bilans miejsc (S-08), statystyki (S-09);
- cofanie deklaracji, deklarowanie ze strony grupy;
- dzieci usuniętego rodzica (FR-007), odświeżanie na żywo.

## Architecture / Approach

Baza → API → UI. Wiersz `child_attendance (event_id, child_id, group_id, going)` istnieje tylko po deklaracji; jego brak to „bez deklaracji”. Polityki INSERT/UPDATE wymagają, żeby dziecko było wywołującego, a termin się nie rozpoczął; SELECT ma każdy członek grupy; DELETE nie ma nikt poza kaskadą. Endpoint zapisuje przez RPC i wraca na stronę planu. Odrzucenie 42501 rozróżnia, pobierając termin: rozpoczęty termin daje komunikat, wszystko inne 404. Strona planu jest czystym Astro (formularze POST), bez wyspy React.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tabela deklaracji i RLS | Migracja, funkcja zapisu, pgTAP | Funkcja po cichu nic nie zapisze dla niewidocznego dziecka, jeśli nie rzuci 42501 |
| 2. Serwis i endpoint zapisu | zod, `getGroupEvent`, serwis, POST z mapowaniem błędów | Pomylenie „termin rozpoczęty” z „brak dostępu” przy 42501 |
| 3. Strona planu terminu | Widok planu, linki z listy, smoke | Układ przy 360 px przy długich imionach i wielu dzieciach |

**Prerequisites:** S-04 i S-05 zrobione (są); lokalny Supabase (`npx supabase start`) i `.dev.vars`.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Smoke nie sprawdzi blokady po starcie (RLS nie pozwala utworzyć minionego terminu); pokrywa ją pgTAP i krok ręczny.
- Dodanie `unique (id, group_id)` na `events` i `children` zakłada, że nic nie zależy od ich dokładnego zestawu ograniczeń (testy pgTAP S-04/S-05 sprawdzają polityki, nie ograniczenia).

## Success Criteria (Summary)

- Rodzic deklaruje dziecko jednym stuknięciem z telefonu, a inni członkowie widzą to po odświeżeniu.
- Dziecko bez deklaracji jest widoczne jako niejadące z etykietą „bez deklaracji”.
- Po rozpoczęciu terminu nikt nie zmieni deklaracji, także z pominięciem UI.
