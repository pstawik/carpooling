# CarPooling - MVP ideas

## 1. Główny problem

Rodzice dzieci uczęszczających na te same zajęcia dodatkowe często organizują wspólne dojazdy samochodami. 
Ustalenia dotyczące obecności dzieci, kierowców i dostępnych miejsc są zwykle prowadzone w komunikatorach lub wiadomościach, przez co informacje są rozproszone i trudno ustalić aktualny plan transportu.

CarPooling ma zapewnić jedno, proste miejsce, w którym członkowie grupy mogą:
- sprawdzić terminy zajęć,
- zadeklarować, czy ich dziecko jedzie na konkretne zajęcia,
- zadeklarować, kto będzie kierowcą i ile miejsc oferuje,
- zobaczyć deklaracje pozostałych członków grupy.

**Podstawowa wartość aplikacji:** szybkie ustalenie, które dzieci jadą na zajęcia, kto zapewnia transport i czy 
liczba dostępnych miejsc jest wystarczająca.

Model organizacyjny:
- Jedna grupa odpowiada jednemu rodzajowi zajęć, np. „Judo – wtorki”.
- Użytkownik ma jedno konto i może należeć do wielu grup.
- Rodzic może mieć jedno lub więcej dzieci przypisanych do grupy.
- Dane i deklaracje jednej grupy są odseparowane od danych pozostałych grup.

## 2. Najmniejszy zestaw funkcjonalności

MVP ma umożliwić przejście pełnego, podstawowego scenariusza: użytkownik zakłada konto, dołącza do grupy, widzi terminy, 
zgłasza obecność dziecka lub deklaruje prowadzenie samochodu, a pozostali członkowie widzą aktualny plan.

### 2.1. Konta i logowanie
- Rejestracja za pomocą imienia, nicku, adresu e-mail, numeru telefonu i hasła.
- Logowanie i wylogowanie.
- Edycja podstawowych danych profilu.
- Bezpieczne przechowywanie haseł i obsługa sesji.

### 2.2. Grupy i członkostwo
- Administrator aplikacji może utworzyć grupę i wskazać jej administratora.
- Administrator grupy może wygenerować link zaproszeniowy.
- Zalogowany użytkownik może zaakceptować zaproszenie i dołączyć do grupy.
- Link zaproszeniowy powinien być możliwy do unieważnienia i mieć termin ważności.
- Użytkownik może należeć do wielu grup.
- Administrator grupy może usuwać członków ze swojej grupy.
- Użytkownik może opuścić grupę.
- Role i uprawnienia są sprawdzane po stronie backendu.

### 2.3. Dzieci
- Użytkownik może dodać, edytować i usunąć swoje dziecko.
- W MVP dziecko jest przypisane do jednej grupy.
- Dane dziecka ograniczają się do imienia lub nicku.
- Rodzic może deklarować obecność wyłącznie swoich dzieci.

### 2.4. Kalendarz i terminy
- Każda grupa ma własny kalendarz.
- Członkowie mogą przeglądać terminy w kalendarzu lub na liście.
- Administrator grupy może tworzyć, edytować i usuwać pojedyncze terminy.
- Administrator może wygenerować terminy cotygodniowe w wybrany dzień tygodnia, w podanym zakresie dat i o wskazanej godzinie.
- Każdy wygenerowany termin jest osobnym wydarzeniem i może być niezależnie edytowany lub usunięty.
- System zapobiega przypadkowemu tworzeniu duplikatów terminów.

### 2.5. Obecność i transport
Dla każdego terminu rodzic może ustawić status każdego swojego dziecka:
- „Jedzie”,
- „Nie jedzie”,
- „Brak deklaracji” – stan domyślny.

Członek grupy może również:
- zadeklarować, że będzie kierowcą,
- podać liczbę dostępnych miejsc dla dzieci,
- zmienić lub wycofać własną deklarację.

W jednym terminie może być kilku kierowców. W MVP nie przypisuje się dzieci do konkretnych samochodów.

Wszyscy członkowie grupy mogą zobaczyć:
- listę dzieci jadących,
- listę dzieci nieobecnych,
- listę dzieci bez deklaracji,
- listę kierowców i liczbę oferowanych miejsc,
- łączną liczbę dzieci zadeklarowanych jako jadące,
- informację, czy liczba miejsc jest wystarczająca.

System powinien ostrzegać o niedoborze miejsc. Brak deklaracji nie może być automatycznie interpretowany jako nieobecność.

### 2.6. Podstawowe statystyki
- Liczba zadeklarowanych przejazdów w roli kierowcy dla każdego członka grupy.
- Liczba obecności i nieobecności dla każdego dziecka.
- Statystyki dotyczą wyłącznie zakończonych terminów.
- Dane są obliczane na podstawie zapisanych deklaracji; nie są ręcznie wprowadzane.

## 3. Co nie wchodzi w zakres MVP
Poniższe funkcjonalności nie powinny być implementowane w ramach pierwszej wersji, nawet jeśli wydają się przydatne:
- Powiadomienia SMS, e-mail, push i integracje z komunikatorami.
- Integracja z Google Calendar lub innymi kalendarzami.
- Eksport kalendarza lub statystyk.
- Aplikacja mobilna.
- Automatyczne przydzielanie kierowców lub sugerowanie, kto powinien prowadzić.
- Przypisywanie konkretnych dzieci do konkretnych samochodów.
- Zarządzanie trasami, punktami odbioru i kolejnością odbierania dzieci.
- Płatności i rozliczanie kosztów paliwa.
- Czat i wiadomości między członkami grupy.
- Wiele rodzajów zajęć w jednej grupie.
- Zaawansowane reguły cykliczności, np. skomplikowane wyjątki i edycja całej serii wydarzeń.
- Zaawansowane wykresy, raporty i analizy.
- Rozbudowany system zaproszeń e-mail i automatycznej wysyłki zaproszeń.
- Dodatkowe pola profilu i dane dzieci, które nie są konieczne do działania MVP.

**Zasada ograniczania zakresu:** jeżeli funkcjonalność nie jest niezbędna do realizacji głównego scenariusza użytkownika, 
należy ją odłożyć na później.

## 4. Kryteria sukcesu

MVP można uznać za ukończone, jeżeli spełnione są wszystkie poniższe kryteria:

### 4.1. Główny scenariusz działa end-to-end
- Użytkownik może zarejestrować konto i zalogować się.
- Administrator aplikacji może utworzyć grupę i wskazać jej administratora.
- Administrator grupy może wygenerować zaproszenie.
- Nowy lub istniejący użytkownik może dołączyć do grupy za pomocą zaproszenia.
- Użytkownik może dodać dziecko i przypisać je do grupy.
- Administrator może utworzyć pojedynczy termin oraz wygenerować terminy cotygodniowe.
- Rodzic może zadeklarować obecność lub nieobecność dziecka.
- Członek może zadeklarować kierowanie samochodem i liczbę miejsc.
- Członkowie grupy widzą aktualne deklaracje i informację o dostępności miejsc.
- Użytkownicy widzą podstawowe statystyki grupy.

### 4.2. Kontrola dostępu jest poprawna
- Użytkownik widzi wyłącznie grupy, których jest członkiem, z uwzględnieniem roli administratora aplikacji.
- Użytkownik nie może odczytywać ani modyfikować deklaracji innych rodziców.
- Administrator grupy zarządza wyłącznie swoją grupą.
- Próba dostępu do zasobu obcej grupy przez URL lub API kończy się odmową dostępu.
- Uprawnienia są egzekwowane po stronie backendu, a nie wyłącznie w interfejsie.

### 4.3. Logika biznesowa działa poprawnie
- Generator tworzy wszystkie terminy cotygodniowe mieszczące się w podanym zakresie dat.
- Generator nie tworzy duplikatów.
- Brak deklaracji jest odróżniany od nieobecności.
- Liczba dostępnych miejsc jest poprawnie porównywana z liczbą dzieci jadących.
- Statystyki są liczone na podstawie właściwych deklaracji i zakończonych wydarzeń.