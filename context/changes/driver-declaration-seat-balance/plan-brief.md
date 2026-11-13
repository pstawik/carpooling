# Deklaracja kierowcy i bilans miejsc — Plan Brief

> Full plan: `context/changes/driver-declaration-seat-balance/plan.md`

## What & Why

Członek grupy deklaruje się na stronie planu terminu jako kierowca z liczbą miejsc dla dzieci, może ją zmienić albo wycofać do rozpoczęcia terminu, a wszyscy widzą kierowców i bilans miejsc z ostrzeżeniem o niedoborze. To S-08, gwiazda przewodnia roadmapy (FR-015, FR-016, US-01). Po tym wycinku rodzic dzień przed zajęciami widzi w jednym miejscu, czy transport jest zapewniony.

## Starting Point

S-07 dał stronę `/groups/[id]/terminy/[eventId]` z deklaracjami dzieci i listami „Jadą / Nie jadą” oraz wzorzec tabeli z RLS, blokadą `starts_at > now()` i zapisem przez RPC `security invoker`. Kierowców i bilansu nie ma. Telefon członków jest już czytelny w obrębie wspólnej grupy (`shares_group_with`).

## Desired End State

Na górze planu terminu jest karta „Bilans miejsc”: np. „Jadą 3 dzieci · 2 miejsca” i „Brakuje 1 miejsca” (czerwone), „Miejsc wystarcza” (zielone) albo „Żadne dziecko jeszcze nie jedzie”. Każdy członek ma sekcję „Twój przejazd” z polem miejsc 1–8, przyciskami zapisu i „Wycofaj”. Lista „Kierowcy” pokazuje nick, miejsca i telefon jako link `tel:`. Po rozpoczęciu terminu wszystko jest tylko do odczytu, co egzekwuje baza.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Zakres liczby miejsc | 1–8 (CHECK w bazie + zod) | Obejmuje osobówki i vany, a literówka nie zawyży bilansu. |
| Wycofanie deklaracji | Usunięcie wiersza (polityka DELETE z blokadą czasową) | Brak wiersza = nie jest kierowcą; S-09 liczy po prostu wiersze. |
| Warunek ostrzeżenia | Suma miejsc < liczba dzieci „jedzie”; 0 jadących = brak ostrzeżenia | Dokładnie reguła z PRD; dzieci „bez deklaracji” nie zwiększają zapotrzebowania. |
| Prezentacja bilansu | Karta na górze planu | Odpowiedź na US-01 widoczna bez przewijania na 360 px. |
| Uwaga o niezadeklarowanych przy bilansie | Nie | PRD uznał etykietę przy dziecku za wystarczającą. |
| Zapis / zmiana | RPC `set_event_driver`, `user_id` z `auth.uid()` | Jak w S-07: klucze niezmienne, upsert PostgREST wymagałby UPDATE na kluczach. |
| Zła liczba miejsc | Komunikat `invalid_driver_seats`, nie 404 | Pole wpisuje użytkownik; 404 tylko dla zmanipulowanych pól ukrytych. |

## Scope

**In scope:**
- Tabela `event_drivers` z RLS (select / insert / update / delete), RPC i pgTAP
- Serwis, zod, kody `driver_locked` / `invalid_driver_seats`, endpoint `POST /api/groups/events/driver` (`set` / `withdraw`)
- Karta bilansu, sekcja „Twój przejazd”, lista kierowców z telefonem, polska odmiana liczebników
- Kroki smoke dla przepływu kierowcy

**Out of scope:**
- Przypisywanie dzieci do aut, trasy (PRD Non-Goals)
- Kierowca z 0 miejsc, auta powyżej 8 miejsc dla dzieci
- Deklaracje członka usuniętego z grupy (FR-007, parked)
- Statystyki (S-09), odświeżanie na żywo, deklarowanie ze strony grupy

## Architecture / Approach

`event_drivers (event_id, user_id, group_id, seats)` z PK `(event_id, user_id)`, złożonym FK `(event_id, group_id) → events` z kaskadą i FK `user_id → profiles`, dzięki któremu jedno zapytanie dociąga nick i telefon. Zapis idzie przez RPC pod RLS wywołującego, a wycofanie przez DELETE z `.select()`. Przy 0 usuniętych wierszach endpoint rozstrzyga przez `getGroupEvent` + `hasStarted`: brak terminu → 404, rozpoczęty → `driver_locked`, nierozpoczęty → zwykły powrót. Czysta funkcja `buildSeatBalance(drivers, plan.going.length)` daje `none_going | enough | shortage` i liczbę brakujących miejsc. Strona to czyste Astro z formularzami POST.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tabela kierowców i RLS | Migracja `event_drivers`, RPC, pgTAP | Niekwalifikowane kolumny w `exists` dają zawsze prawdziwą politykę |
| 2. Serwis i endpoint | Typy, zod, serwis, bilans, `POST /api/groups/events/driver` | DELETE pod RLS nie rzuca błędu: trzeba poprawnie rozróżnić 0 wierszy |
| 3. Plan terminu z kierowcami i bilansem | Karta bilansu, „Twój przejazd”, lista kierowców, smoke | Układ na 360 px i poprawna odmiana „miejsce / miejsca / miejsc” |

**Prerequisites:** S-07 zmergowane (jest), lokalny Supabase (`npx supabase start`), `.dev.vars`.
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Kierowca usunięty z grupy zostaje w planie i w bilansie, dopóki nie zostanie rozstrzygnięte FR-007 (roadmapa, Parked).
- Strefa czasowa terminu (roadmapa, Open Question #2): blokada porównuje chwile `timestamptz`, tak jak w S-07.

## Success Criteria (Summary)

- Członek deklaruje się jako kierowca, zmienia miejsca i wycofuje deklarację z telefonu, bez powiększania.
- Każdy członek po odświeżeniu widzi kierowców z telefonem, sumę miejsc i ostrzeżenie „Brakuje K miejsc”, gdy miejsc jest mniej niż jadących dzieci.
- Baza odrzuca zmiany po rozpoczęciu terminu, cudze deklaracje i dostęp spoza grupy (pgTAP + smoke).
