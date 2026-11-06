---
project: CarPooling
context_type: greenfield
created: 2026-11-06
updated: 2026-11-06
source: idea-notes.md
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 2            # cel: 10 dni roboczych × ~6 h; dostępne do 15 dni (bufor 5 dni)
  hard_deadline: null
  after_hours_only: false # praca w ramach czasu zawodowego
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 15   # FR-001..FR-017, z czego FR-003 i FR-008 usunięte
  quality_check_status: accepted
---

# CarPooling — Shape Notes

## Vision & Problem Statement

Rodzice dzieci uczęszczających na te same zajęcia dodatkowe organizują wspólne dojazdy samochodami. Ustalenia dotyczące obecności dzieci, kierowców i dostępnych miejsc prowadzone są w komunikatorach, przez co informacje są rozproszone i trudno ustalić aktualny plan transportu.

- **Moment:** dzień przed zajęciami właściwie nie wiadomo, kto jedzie, kogo zabiera i które dzieci jadą.
- **Koszt dziś:** dzieci zostają bez transportu albo jadą samochody z wolnymi miejscami. Potem pełno wiadomości na czacie, kto kogo zabiera, następują zmiany miejsc i dopiero w ostatniej chwili widać rozłożenie dzieci i kierowców.
- **Kategoria bólu:** koszt koordynacji; dane uwięzione w czacie; brak widoczności bilansu (miejsca vs. dzieci jadące).
- **Insight:** czat jest do rozmowy, nie do stanu — komunikator przekazuje wiadomości, ale nie pokazuje jednego aktualnego planu ani bilansu miejsc.

**Wizja:** jedno, proste miejsce, w którym członkowie grupy sprawdzają terminy zajęć, deklarują obecność dziecka oraz prowadzenie samochodu z liczbą miejsc i widzą deklaracje pozostałych. Podstawowa wartość: szybkie ustalenie, które dzieci jadą, kto zapewnia transport i czy liczba miejsc jest wystarczająca.

## User & Persona

**Główna persona:** rodzic dziecka uczęszczającego na zajęcia dodatkowe, współorganizujący dojazdy z innymi rodzicami z tej samej grupy zajęć. W MVP: autor projektu i rodzice z jego własnych grup zajęć (znani osobiście, prawdziwi użytkownicy testowi).

Model organizacyjny (z notatek):
- Jedna grupa = jeden rodzaj zajęć (np. „Judo – wtorki”).
- Użytkownik ma jedno konto i może należeć do wielu grup.
- Rodzic może mieć jedno lub więcej dzieci w grupie.
- Dane i deklaracje grup są od siebie odseparowane.

## Access Control

**Model:** logowanie kontem (e-mail + hasło). Rejestracja: imię, nick, e-mail, hasło, opcjonalnie numer telefonu. Logowanie i wylogowanie; długa sesja (rodzic pozostaje zalogowany na urządzeniu do wylogowania). Hasła przechowywane bezpiecznie. Edycja profilu poza MVP.

- **Telefon:** pole opcjonalne; służy do kontaktu między rodzicami — widoczny dla członków grupy, jeśli podany (np. żeby zadzwonić do kierowcy).

**Role:**
- **Administrator aplikacji** — tworzy grupy i wskazuje ich administratorów. Rola nadawana technicznie przez właściciela (poza interfejsem); brak UI do zarządzania adminami aplikacji w MVP. Widzi wszystkie grupy.
- **Administrator grupy** — grupa może mieć jednego lub więcej. Zarządza jednym stałym linkiem zaproszeniowym grupy; może wygenerować nowy link, a stary przestaje wtedy działać (bez dat ważności — przesunięte do v2). Usuwa członków, zarządza terminami. Zarządza wyłącznie swoją grupą.
- **Członek grupy** — dołącza przez zaproszenie (zalogowany użytkownik akceptuje link), zarządza swoimi dziećmi i deklaracjami, widzi plan grupy. Należy do wielu grup. Samodzielne opuszczenie grupy poza MVP (odchodzący rodzic prosi administratora o usunięcie).

**Zasady:**
- Użytkownik widzi wyłącznie grupy, których jest członkiem (poza adminem aplikacji).
- Rodzic deklaruje i modyfikuje wyłącznie deklaracje swoich dzieci i własne deklaracje kierowcy.
- Uprawnienia obowiązują niezależnie od interfejsu: żadna próba odczytu lub zmiany danych obcej grupy ani cudzych deklaracji — także z pominięciem ekranów aplikacji (np. przez ręcznie wpisany adres) — nie powiedzie się.
- **Usunięcie z grupy:** deklaracje na przyszłe terminy są usuwane; deklaracje z zakończonych terminów zostają w statystykach.

## Success Criteria

### Primary

Główny scenariusz działa end-to-end:
1. Administrator aplikacji tworzy grupę i wskazuje jej administratora.
2. Administrator grupy generuje link zaproszeniowy.
3. Nowy lub istniejący użytkownik rejestruje się / loguje i dołącza do grupy przez link.
4. Rodzic dodaje dziecko i przypisuje je do grupy.
5. Administrator grupy tworzy pojedynczy termin oraz generuje terminy cotygodniowe.
6. Rodzic deklaruje obecność lub nieobecność dziecka.
7. Członek deklaruje kierowanie samochodem i liczbę miejsc.
8. Członkowie widzą aktualne deklaracje i informację o wystarczalności miejsc (z ostrzeżeniem o niedoborze).
9. Użytkownicy widzą podstawowe statystyki grupy.

Terminy prezentowane jako lista (widok kalendarza przesunięty do v2).

### Secondary

- Własna grupa autora przez kilka kolejnych terminów ustala transport w aplikacji, a nie na czacie.

### Guardrails

- **Izolacja danych grup:** nikt spoza grupy nie widzi jej dzieci, numerów telefonów ani deklaracji.
- **Milczenie = „nie jedzie”:** jeśli rodzic nie zadeklarował obecności dziecka, system traktuje to jako „nie jedzie”. *Uwaga: świadoma zmiana względem idea-notes.md (2.5, 4.3), gdzie brak deklaracji miał być odróżniany od nieobecności.* Dziecko bez deklaracji jest liczone jako niejadące, ale w planie terminu oznaczone etykietą „bez deklaracji”, żeby można było dopytać rodzica przed zajęciami.

### Timeline

Cel: 10 dni roboczych (~6 h/dzień, ~60 h), z dostępnym buforem do 15 dni. Zakres przycięty, by zmieścić się w celu: widok kalendarza → v2; ważność i unieważnianie linków zaproszeniowych → v2 (zastąpione regeneracją jednego linku).

## Functional Requirements

### Konta
- FR-001: Użytkownik może się zarejestrować, podając imię, nick, e-mail, hasło oraz opcjonalnie numer telefonu. Priority: must-have
  > Socrates: Counter-argument considered: "wymagany telefon odstrasza rodziców, którzy nie chcą podawać numeru aplikacji". Resolution: telefon opcjonalny; widoczny w grupie tylko, gdy podany.
- FR-002: Użytkownik może się zalogować i wylogować; pozostaje zalogowany na urządzeniu przez długi czas, dopóki się nie wyloguje. Priority: must-have
  > Socrates: Counter-argument considered: "rodzic zagląda raz w tygodniu; logowanie za każdym razem zniechęca". Resolution: długa sesja.
- ~~FR-003: Użytkownik może edytować podstawowe dane profilu.~~ Priority: dropped (→ Non-Goals)
  > Socrates: Counter-argument considered: "można całkiem wyciąć". Resolution: usunięte z MVP; poprawki danych ręcznie przez administratora.

### Grupy i członkostwo
- FR-004: Administrator aplikacji może utworzyć grupę i wskazać jej administratora (jednego lub więcej). Priority: must-have
  > Socrates: Counter-arguments offered ("wąskie gardło na autorze przy nowych grupach"; "przy kilku grupach wystarczy skrypt zamiast UI"). Resolution: brak kontrargumentu; FR stoi jak jest.
- FR-005: Administrator grupy może wygenerować link zaproszeniowy grupy oraz wygenerować go na nowo (poprzedni przestaje działać). Priority: must-have
  > Socrates: Counter-argument considered: "link przesłany dalej wpuści obcego do danych dzieci". Resolution: zostaje; ryzyko akceptowalne, bo admin może wygenerować nowy link i usunąć obcego.
- FR-006: Zalogowany użytkownik może dołączyć do grupy przez link zaproszeniowy; użytkownik bez konta, który kliknie link, przechodzi do rejestracji, a po niej automatycznie dołącza do grupy. Priority: must-have
  > Socrates: Counter-argument considered: "nowy rodzic gubi link po drodze przez rejestrację". Resolution: po rejestracji automatyczny powrót i dołączenie do grupy.
- FR-007: Administrator grupy może usunąć członka ze swojej grupy. Priority: nice-to-have
  > Socrates: Counter-argument considered: "bez tego wyciek linku jest nieodwracalny". Resolution: zostaje nice-to-have — operacja rzadka; w znajomej grupie usunięcie może zrobić administrator technicznie.
- ~~FR-008: Członek może opuścić grupę.~~ Priority: dropped (→ Non-Goals)
  > Socrates: Counter-argument considered: "dubluje FR-007". Resolution: usunięte; odchodzący rodzic prosi administratora o usunięcie.
- FR-009: Członek widzi listę członków grupy wraz z ich numerami telefonów (jeśli podane). Priority: nice-to-have
  > Socrates: Counter-argument considered: "telefon jest potrzebny przede wszystkim przy kierowcy, nie na liście członków". Resolution: lista zostaje nice-to-have; telefon kierowcy (jeśli podany) widoczny w planie terminu (FR-016).

### Dzieci
- FR-010: Rodzic może dodać, edytować i usunąć swoje dziecko (imię lub nick) przypisane do jednej grupy. Priority: must-have
  > Socrates: Counter-argument considered: "dziecko chodzące na dwa rodzaje zajęć trzeba dodać dwa razy". Resolution: zostaje; akceptowalne w MVP.

### Terminy
- FR-011: Członek może przeglądać terminy grupy jako listę, domyślnie zaczynającą się od najbliższego nadchodzącego terminu. Priority: must-have
  > Socrates: Counter-argument considered: "seria na pół roku daje dziesiątki pozycji". Resolution: lista domyślnie pokazuje od najbliższego terminu.
- FR-012: Administrator grupy może tworzyć, edytować i usuwać pojedyncze terminy. Priority: must-have
  > Socrates: Counter-argument considered: "usunięcie terminu kasuje jego deklaracje". Resolution: zostaje; akceptowalne w MVP.
- FR-013: Administrator grupy może wygenerować terminy cotygodniowe w wybrany dzień tygodnia, w zakresie dat i o wskazanej godzinie, bez tworzenia duplikatów; każdy wygenerowany termin jest osobnym wydarzeniem edytowalnym i usuwalnym niezależnie. Priority: must-have
  > Socrates: Counter-argument considered: "pojęcie »duplikatu« jest niejasne (ta sama data? data i godzina?)". Resolution: FR zostaje; definicja duplikatu do doprecyzowania w Business Logic (faza 5).

### Obecność i transport
- FR-014: Rodzic może ustawić dla terminu status każdego swojego dziecka: „jedzie” lub „nie jedzie”; brak deklaracji jest traktowany jako „nie jedzie” i oznaczany etykietą „bez deklaracji”. Priority: must-have
  > Socrates: Counter-argument considered: "milczące dzieci nie liczą się do zapotrzebowania na miejsca, więc »miejsc wystarcza« może być fałszywe". Resolution: zostaje; etykieta „bez deklaracji” w planie wystarcza.
- FR-015: Członek może zadeklarować się jako kierowca na termin z liczbą miejsc dla dzieci oraz zmienić lub wycofać tę deklarację; w terminie może być kilku kierowców. Priority: must-have
  > Socrates: Counter-argument considered: "niejasne, czy liczba miejsc obejmuje własne dziecko kierowcy". Resolution: FR zostaje; reguła liczenia do doprecyzowania w Business Logic (faza 5).
- FR-016: Członek widzi plan terminu: dzieci jadące, dzieci niejadące (z etykietą „bez deklaracji” tam, gdzie dotyczy), kierowców z liczbą miejsc i telefonem (jeśli podany), łączną liczbę dzieci jadących i ostrzeżenie o niedoborze miejsc. Priority: must-have
  > Socrates: Counter-arguments offered ("»kto kogo zabiera« z fazy 1 zostaje bez odpowiedzi, bo MVP nie przypisuje dzieci do aut"). Resolution: brak kontrargumentu; FR stoi jak jest.

### Statystyki
- FR-017: Członek widzi statystyki zakończonych terminów: liczbę przejazdów w roli kierowcy dla każdego członka oraz liczbę obecności i nieobecności dla każdego dziecka, liczone z zapisanych deklaracji. Priority: must-have
  > Socrates: Counter-argument considered: "przy regule »milczenie = nie jedzie« każde przegapienie deklaracji zawyża nieobecności". Resolution: zostaje; nieobecność = jawne „nie jedzie” + brak deklaracji, zgodnie z guardrailem.

## User Stories

### US-01: Rodzic sprawdza, czy transport na jutrzejsze zajęcia jest zapewniony

- **Given** jestem członkiem grupy „Judo – wtorki”, mam w niej dziecko, a na jutro jest termin
- **When** ustawiam dziecku „jedzie” i otwieram plan terminu
- **Then** widzę listę dzieci jadących (z moim), niejadących (z etykietą „bez deklaracji” u tych, za które nikt się nie odezwał), kierowców z miejscami oraz czy miejsc wystarcza, a jeśli nie — ostrzeżenie o niedoborze

## Business Logic

Dla każdego terminu system porównuje sumę miejsc zadeklarowanych przez kierowców z liczbą dzieci oznaczonych „jedzie” i ostrzega o niedoborze, a po zakończonych terminach pokazuje, jak każdy rodzic angażuje się w wożenie dzieci.

**Bilans miejsc (walidacja/obliczenie).** Wejścia: deklaracje kierowców (łączna liczba miejsc dla dzieci w aucie) oraz statusy dzieci w terminie. Kierowca podaje wszystkie miejsca dla dzieci w swoim aucie; jego własne dziecko jest deklarowane jako „jedzie” tak samo jak każde inne i zajmuje miejsce z puli. Bilans = suma miejsc wszystkich kierowców vs. liczba wszystkich dzieci ze statusem „jedzie”. Brak deklaracji liczy się jako „nie jedzie” (nie zwiększa zapotrzebowania), ale dziecko jest oznaczone etykietą „bez deklaracji”. Rodzic widzi wynik w planie terminu: liczbę jadących, liczbę miejsc i ostrzeżenie, gdy miejsc jest mniej niż dzieci.

**Zaangażowanie (statystyki).** Cel: żeby było widać sytuację „wozimy 4 dzieci, a jeździ tylko 2 rodziców”. Dla zakończonych terminów system pokazuje surowe liczby: liczbę przejazdów w roli kierowcy dla każdego członka oraz liczbę obecności i nieobecności dla każdego dziecka (nieobecność = jawne „nie jedzie” + brak deklaracji). Grupa sama ocenia proporcje; system nie wylicza wskaźnika sprawiedliwości. Wartości są obliczane z zapisanych deklaracji, nie wprowadzane ręcznie.

**Generator terminów.** Duplikat to termin w tej samej grupie z tą samą datą i godziną. Generator cotygodniowy tworzy wszystkie terminy w wybranym dniu tygodnia mieszczące się w zakresie dat i pomija kolizje; terminy tego samego dnia o różnych godzinach są dozwolone.

## Non-Functional Requirements

- **Obsługa na smartfonie:** rodzic może zadeklarować obecność dziecka, zadeklarować się jako kierowca i sprawdzić plan terminu z telefonu w przeglądarce; pełna funkcjonalność dostępna na ekranie o szerokości ~360 px.
- **Aktualność planu:** po zapisaniu deklaracji przez dowolnego członka pozostali widzą nowy stan najpóźniej po odświeżeniu widoku — bez opóźnień ani ręcznej synchronizacji.

## Non-Goals

Z idea-notes.md (sekcja 3):
- Powiadomienia SMS, e-mail, push i integracje z komunikatorami — MVP rozwiązuje stan planu, nie komunikację.
- Integracja z Google Calendar lub innymi kalendarzami — poza głównym scenariuszem.
- Eksport kalendarza lub statystyk — poza głównym scenariuszem.
- Aplikacja mobilna — obsługa przez przeglądarkę na telefonie wystarcza.
- Automatyczne przydzielanie kierowców lub sugerowanie, kto powinien prowadzić — decyzja należy do rodziców.
- Przypisywanie konkretnych dzieci do konkretnych samochodów — MVP pokazuje bilans, nie rozkład; „kto kogo zabiera” rodzice ustalają sami.
- Zarządzanie trasami, punktami odbioru i kolejnością odbierania dzieci — poza zakresem.
- Płatności i rozliczanie kosztów paliwa — poza zakresem.
- Czat i wiadomości między członkami grupy — czat już istnieje; aplikacja ma być źródłem stanu, nie rozmowy.
- Wiele rodzajów zajęć w jednej grupie — jedna grupa = jeden rodzaj zajęć.
- Zaawansowane reguły cykliczności (wyjątki, edycja całej serii) — generator tworzy niezależne terminy.
- Zaawansowane wykresy, raporty i analizy — wystarczą surowe liczby.
- Rozbudowany system zaproszeń e-mail i automatycznej wysyłki zaproszeń — wystarczy link.
- Dodatkowe pola profilu i dane dzieci niekonieczne do działania MVP — minimalizacja danych.

Cięcia z sesji kształtowania:
- Widok kalendarza — terminy jako lista; kalendarz w v2.
- Termin ważności i unieważnianie linków zaproszeniowych — zastąpione regeneracją jednego linku; w v2.
- Edycja profilu (dawny FR-003) — poprawki ręcznie przez administratora.
- Samodzielne opuszczanie grupy (dawny FR-008) — odchodzący rodzic prosi administratora o usunięcie.
- UI do zarządzania administratorami aplikacji — rola nadawana technicznie.
- Reset hasła — bez e-maili nie ma samoobsługowego resetu; reset ręcznie przez administratora.
- Wskaźnik sprawiedliwości / ocena, kto „powinien” jeździć — statystyki pokazują surowe liczby, ocena należy do grupy.

## Forward: tech-stack

Informacyjnie, poza schematem PRD (dla kroku wyboru stosu):
- Oryginalne sformułowania z idea-notes.md: „Role i uprawnienia są sprawdzane po stronie backendu”; „Próba dostępu do zasobu obcej grupy przez URL lub API kończy się odmową dostępu”; „Uprawnienia są egzekwowane po stronie backendu, a nie wyłącznie w interfejsie”.

## Open Questions

Rozstrzygnięte 2026-11-06 (po wygenerowaniu PRD):
- Termin jest „zakończony” od godziny rozpoczęcia — od tej chwili wchodzi do statystyk.
- Od rozpoczęcia terminu deklaracje (dziecko i kierowca) są tylko do odczytu.
- target_scale.qps: low; target_scale.data_volume: small.
