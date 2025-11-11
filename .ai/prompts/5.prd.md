# Dokument wymagań produktu (PRD) - Personalized Recipe Assistant
## 1. Przegląd produktu
Nazwa: Personalized Recipe Assistant (MVP)
Cel: Umożliwić użytkownikom z przewlekłymi schorzeniami przechowywanie własnych przepisów tekstowych i otrzymywanie spersonalizowanych modyfikacji przepisów za pomocą AI, uwzględniających zdiagnozowane schorzenie i ilość składników prozdrowotne z nim związanych, które są zawarte w składnikach przepisu.
Zakres wersji MVP: zapisywanie/odczytywanie/przeglądanie/usuwanie przepisów tekstowych; prosty system kont użytkowników (OAuth via Supabase Auth); profil użytkownika z schorzeniem; integracja AI do mapowania składników przepisu na wartości odżywcze zdefinowane w podanym przez użytkownika schorzeniu dla celów promptowania AI.

## 2. Problem użytkownika
Użytkownicy z przewlekłymi schorzeniami (np. cukrzyca typu 1, celiakia, nietolerancja laktozy) mają trudność w dostosowywaniu dostępnych przepisów do swoich potrzeb zdrowotnych. Potrzebują szybkiego sposobu na modyfikację składników, skalowanie porcji i otrzymanie informacji o prozdrowotnych mikroskładnikach (np. białko, węglowodany, tłuszcze, błonnik, żelazo, wapń, witamina D, B12, omega-3), uwzględniających ich schorzenie, wiek i płeć.

## 3. Wymagania funkcjonalne
F1. Recipe CRUD
- Tworzenie, odczyt, lista, usuwanie przepisów tekstowych.
- Struktura wymagana: title, ingredients[] (name, quantity, unit), steps[] (każdy krok 10–500 znaków).
- Przechowywać surowy tekst oraz zserializowaną strukturę JSONB w PostgreSQL.

F2. Uwierzytelnianie i konto użytkownika
- OAuth poprzez Supabase Auth (MVP)
- Profil użytkownika zawiera: disease (enum: type1_diabetes, celiac, lactose_intolerance), age, sex, allergies/intolerances.

F3. Profile-driven AI adjustments
- Synchronous (SLO <5s) operacje: recipe ingredient→nutrients mapping (per recipe), substitution proposals, portion scaling, formatting of recipe output.
- Heavy operations (detailed nutrition estimation) za pomocą asynchronicznych zadań z powiadomieniem/progressem.
- AI prompt: zawiera agregowane wartości odżywcze składników (precomputed or cached), procent w stosunku do dziennego celu dla danej choroby/konkretnej grupy wiek/płeć.

F4. Persistencja i wydajność
- Używać PostgreSQL z JSONB dla strukturalnych reprezentacji przepisów.
- Precompute/cache ingredient→nutrient mappings (local DB or cached dataset) by default to spełnić SLO <5s.

## 4. Granice produktu
W MVP nie wchodzą w zakres:
- Import przepisów z URL
- Obsługa multimediów (zdjęcia, wideo)
- Udostępnianie przepisów publicznie lub funkcje społecznościowe
- Zaawansowane dopasowywanie smaków (treat as advanced feature)

Ograniczenia techniczne i regulacyjne:
- Zewnętrzne API AI musi być używane zgodnie z politykami prywatności i ograniczeniami danych (anonymize before sending).
- Dokładność mapowania wartości odżywczych zależy od źródła danych o składnikach (należy wybrać i zweryfikować dataset).

## 5. Historyjki użytkowników
Wszystkie historyjki zawierają testowalne kryteria akceptacji. ID są unikalne.

US-001
- Tytuł: Rejestracja/Logowanie przez OAuth
- Opis: Jako nowy użytkownik chcę zalogować się do aplikacji używając OAuth via Supabase Auth, aby powiązać konto i zapisywać przepisy.
- Kryteria akceptacji:
  - Użytkownik może zalogować się za pomocą co najmniej jednego dostawcy OAuth skonfigurowanego w Supabase.
  - Po pierwszym logowaniu tworzony jest profil użytkownika w DB z unikalnym internal id.
  - Authentication errors są obsłużone i zwracane z czytelnym komunikatem.

US-002
- Tytuł: Podstawowe tworzenie profilu
- Opis: Jako użytkownik chcę wypełnić profil (schorzenie, wiek, płeć) aby AI mogło dostosować przepisy do moich potrzeb.
- Kryteria akceptacji:
  - Pola disease, age, sex są wymagane podczas wypełniania profilu (można je uzupełnić w późniejszym etapie jeśli użytkownik pominie onboarding).
  - Dane są zapisywane w DB i dostępne dla serwisu AI w postaci pseudonimizowanego ID.

US-003
- Tytuł: Opcjonalny krok preferencji podczas onboardingu
- Opis: Jako nowy użytkownik chcę opcjonalnie odpowiedzieć na 2–3 pytań preferencji, aby szybciej uzyskać lepsze propozycje przepisów z prozdrowotymi sładnikami dostosowanymi do mojego schorzenia.
- Kryteria akceptacji:
  - Onboarding oferuje do 3 pytań (allergies, pain in parts of the body, duration of treatment itp.).
  - Użytkownik może pominąć krok i wypełnić później.

US-004
- Tytuł: Utworzenie przepisu (stworzenie struktury)
- Opis: Jako użytkownik chcę zapisać przepis z tytułem, składnikami i krokami (10–500 znaków) aby mieć go w aplikacji.
- Kryteria akceptacji:
  - API i UI akceptują przepis zawierający title (non-empty), ingredients[] (każdy element name + quantity + unit), steps[] (każdy krok 10–500 znaków).
  - Dane są zapisane jako surowy tekst oraz jako JSONB struktura w DB.
  - Próba zapisu nieprawidłowego kroku (np. 5 znaków) zwraca walidacyjny błąd 400 z opisem.

US-005
- Tytuł: Wyświetlenie listy przepisów
- Opis: Jako użytkownik chcę przeglądać listę moich przepisów i otworzyć pojedynczy przepis.
- Kryteria akceptacji:
  - Endpoint listujący zwraca wszystkie przepisy przypisane do zalogowanego użytkownika (pseudonimizowany user id).
  - Endpoint show zwraca surowy tekst i zserializowaną strukturę JSONB.

US-006
- Tytuł: Usunięcie przepisu
- Opis: Jako użytkownik chcę usunąć przepis, którego już nie potrzebuję.
- Kryteria akceptacji:
  - Użytkownik może trwale usunąć przepis przypisany do jego konta.
  
US-007
- Tytuł: Modyfikacja przepisu przez AI — substytucje i skalowanie (synchronous)
- Opis: Jako użytkownik chcę poprosić AI o podmianę składników lub skalowanie porcji i otrzymać wynik w czasie <5s dla prostych operacji.
- Kryteria akceptacji:
  - Po przesłaniu requestu z recipe id i type (substitution|scaling) backend zwraca zmodyfikowaną wersję przepisu w formacie strukturalnym w <5s (powyżej SLO zwraca status indicative of async processing).
  - Wynik zawiera listę proponowanych substytutów składników oraz powód dopasowania względem nazwy schorzenia.
  - Operacja logowana z anonymized user id.

US-008
- Tytuł: Mapowanie składnika na wartości odżywcze (ingredient→nutrient)
- Opis: Jako użytkownik chcę, aby aplikacja dla każdego składnika podała podstawowe wartości odżywcze (makroskładniki, wybrane witaminy/minerały) dla danego przepisu.
- Kryteria akceptacji:
  - System wykorzystuje AI do mapowania składników przepisu na wektor wartości odżywczych.
  - Dla każdego przepisu zwracane są zagregowane wartości odżywcze na porcję oraz procent dziennego celu dla diagnozy użytkownika (wg age/sex).
  - Operacja prostego mapowania musi być realizowana w <5s.

US-009
- Tytuł: UI feedback przy długotrwałych operacjach AI
- Opis: Jako użytkownik chcę widzieć progres lub powiadomienie, gdy żądana operacja AI trwa dłużej niż SLO.
- Kryteria akceptacji:
  - UI pokazuje spinner/progress i estymowany czas, gdy operacja przekracza 3s; jeśli przekroczy 10s, proponuje opcję otrzymania powiadomienia po ukończeniu.

---
Kontrola jakości PRD:
- Każda historyjka jest testowalna i posiada jasne kryteria akceptacji.
- Zawartość uwzględnia uwierzytelnianie (US-001) i autoryzację (US-009).
- Zawiera scenariusze podstawowe, alternatywne (np. brak alternatywnego sładnika w odpowiedzi AI) i skrajne (asynchroniczne obliczenia, usuwanie danych).

Pliki referencyjne i dalsze kroki:
- Wybór datasetu składników (food composition) i jego licencji — wymaga decyzji przed implementacją mapowania nutrient.
- Wybór dostawcy AI/LLM i decyzje dotyczące prywatności/dozwolonych transmisji.
- Szczegółowy backlog techniczny i testy wydajności przed wdrożeniem.
