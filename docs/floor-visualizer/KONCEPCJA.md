# Wizualizator podłóg — koncepcja produktu

Prototyp: `examples/floor-visualizer/` (działa w przeglądarce, bez backendu).
Architektura techniczna, API i model danych: [ARCHITEKTURA.md](./ARCHITEKTURA.md).

```bash
npx http-server examples/floor-visualizer -p 8080   # następnie http://localhost:8080
node --test examples/floor-visualizer/tests/*.test.mjs
```

## 1. Opis produktu

Aplikacja webowa (PWA-ready), w której użytkownik wgrywa zdjęcie swojego pomieszczenia i sprawdza, jak wyglądają w nim konkretne panele podłogowe, kolory ścian, drzwi i framug. System wykrywa podłogę i ściany, dopasowuje perspektywę i nakłada proceduralną (docelowo: skanowaną) teksturę paneli, zachowując meble, cienie i oświetlenie.

**Pozycjonowanie:** narzędzie do inspiracji i porównań, nie projektowania technicznego. Każdy eksport ma podpis „Wizualizacja poglądowa — kolory i skala mogą odbiegać od rzeczywistości”. Aplikacja nie liczy metrażu, nie wycenia, nie gwarantuje odwzorowania barw.

**Odbiorcy:** osoby remontujące mieszkanie (telefon, szybka decyzja), doradcy w salonach sprzedaży (tablet, porównania przy kliencie), sklepy internetowe (osadzenie na karcie produktu — etap 3).

**Kluczowe decyzje projektowe**

| Decyzja | Uzasadnienie |
|---|---|
| Płaszczyzna podłogi + homografia zamiast pełnego 3D | Rekonstrukcja 3D z jednego zdjęcia jest niestabilna; homografia daje poprawną perspektywę, skalę i kierunek desek, a użytkownik może ją skorygować 4 uchwytami. |
| Segmentacja = propozycja + korekta ręczna | Żadna automatyczna metoda nie jest bezbłędna (dywany, odbicia, podobne kolory). Krok „Zatwierdź podłogę” jest obowiązkowy. |
| Render w shaderze WebGL2 po stronie klienta | Zmiana panelu/koloru < 16 ms, działa offline, zdjęcie nie musi opuszczać urządzenia. |
| Zachowanie światła przez mapę cieniowania | Nowa podłoga dziedziczy cienie mebli, plamy słońca i spadki jasności — to decyduje o realizmie bardziej niż sama tekstura. |

## 2. Zakres MVP (zrealizowany w prototypie)

1. **Import:** plik (JPG/PNG/WebP/AVIF; HEIC tam, gdzie przeglądarka go dekoduje), przeciągnij-upuść, wklejenie ze schowka, aparat telefonu (`capture`), kamera komputera (getUserMedia), przykładowy pokój.
2. **Kontrola jakości:** orientacja EXIF, limit 30 MB, min. 480×360 px, ostrzeżenia: ciemne / prześwietlone / rozmyte / przechylone / pionowe zdjęcie, zbyt mało podłogi (niska pewność ⇒ tryb ręczny).
3. **Analiza lokalna:** podłoga, ściany, przeszkody (dziury w masce podłogi), trapez perspektywy, mapa cieniowania, przybliżony kierunek światła.
4. **Korekta obszarów:** pędzel/gumka dla podłogi i ścian, wielokąt dodaj/wytnij, „Wyczyść”, „Wykryj ponownie”, podgląd masek.
5. **Perspektywa:** 4 uchwyty + siatka 0,5 m, wymiary prostokąta referencyjnego.
6. **Katalog:** 12 produktów demonstracyjnych, wyszukiwarka, filtry (kolor, styl, producent, format), sortowanie (popularność, nazwa, jasność, długość), ulubione, karta produktu ze specyfikacją i podglądem tekstury renderowanym tym samym shaderem.
7. **Ułożenie:** równoległy, cegiełka, jodełka, jodełka francuska; kąt (w poprzek / w głąb / ukośnie / dowolny), skala, intensywność koloru, zachowanie cieni, tryb realistyczny/uproszczony, widok z góry.
8. **Wnętrze:** ściany (kolor, mat/satyna/połysk), drzwi (kolor, styl: oryginalny/gładkie/płycinowe/frezowane/przeszklone, lakier/okleina), framugi (kolor, materiał, szerokość), jasność, temperatura, kontrast — niezależnie od podłogi.
9. **Porównania:** Przed/Po, suwak (oryginał lub dowolny wariant vs bieżący), do 4 wariantów, siatka „obok siebie”.
10. **Historia i zapis:** Cofnij/Ponów (25 kroków, także maski), Reset aranżacji, projekty w IndexedDB, eksport JPG/PNG/przed-po, Web Share API.

## 3. Kolejne etapy

| Etap | Funkcje |
|---|---|
| **2 — jakość AI** | Segmentacja serwerowa (Mask2Former/OneFormer ADE20K) z automatycznym wykrywaniem drzwi, framug, dywanów; doprecyzowanie krawędzi SAM 2 po kliknięciu; estymacja głębi (Depth Anything V2) → automatyczny trapez i horyzont; konta użytkowników i synchronizacja projektów; link do udostępnienia. |
| **3 — katalog i sprzedaż** | Panel administracyjny katalogu, import feedów producentów, skanowane tekstury PBR (albedo + normal + roughness), próbki do zamówienia, widżet do osadzenia w sklepie. |
| **4 — realizm** | Odbicia na podłogach z połyskiem (screen-space), korekcja balansu bieli na podstawie wzornika, wiele płaszczyzn (dwa pomieszczenia w kadrze), kilka zdjęć tego samego pokoju. |

Poza zakresem: wyceny, kalkulacja zużycia, meble, projekty instalacji.

## 4. Struktura ekranów i nawigacja

```
[Start] ──wgraj/aparat/demo──► [Przetwarzanie] ──► [Studio: krok Podłoga]
   ▲  └─ zapisany projekt ───────────────────────► [Studio: Aranżacja]
   │                                                  │
   └──────────── „Nowe zdjęcie” ◄─────────────────────┤
                                                      │
Studio: Podłoga ─Zatwierdź─► Perspektywa ─Zatwierdź─► Aranżacja
          │ „Popraw”/„Zaznacz ręcznie” → zakładka Obszary

Aranżacja — zakładki panelu bocznego:
  Panele (lista ⇄ karta produktu) │ Ułożenie │ Wnętrze │ Obszary │ Warianty
Pasek narzędzi: Cofnij · Ponów · Resetuj │ Po/Przed │ Suwak (+ wybór lewej strony) │ Zapisz │ Eksport ▾
Dialogi: Aparat · Zapis projektu · Porównanie wariantów
```

| Ekran | Zawartość |
|---|---|
| **Start** | Nagłówek z obietnicą, strefa upuszczania, „Zrób zdjęcie telefonem”, „Użyj kamery”, „Przykładowy pokój”, 3 wskazówki fotografowania, zastrzeżenie, lista zapisanych projektów (miniatura, data, otwórz/usuń). |
| **Przetwarzanie** | Modal z listą 5 etapów (✓ ukończone, pogrubiony bieżący), spinner z obsługą `prefers-reduced-motion`. |
| **Studio** | Duży podgląd (canvas WebGL + nakładka edycji), pasek narzędzi, baner kroku kreatora, pasek statusu (produkt · odcień · wzór · skala · tryb), panel boczny z zakładkami. |

## 5. Interfejs

- **Układ:** desktop — podgląd + panel 380 px; tablet (<1100 px) — panel 330 px, bez kroków w nagłówku; telefon (<760 px) — podgląd przyklejony u góry (46 % wysokości), panel pod spodem, pasek narzędzi przewijany poziomo, cele dotykowe ≥ 34–44 px.
- **Kreator zamiast pustego płótna:** po analizie użytkownik widzi tylko jedną decyzję naraz (baner z akcją główną). Przy niskiej pewności akcją główną staje się „Zaznacz ręcznie”.
- **Natychmiastowy efekt:** po zatwierdzeniu perspektywy od razu nakładany jest najpopularniejszy panel — użytkownik widzi wynik zanim zacznie przeglądać katalog.
- **Kolory obszarów:** niebieski = podłoga, pomarańczowy = ściany, przerywana linia = framuga.
- **Dostępność:** kontrast WCAG AA w obu motywach (jasny/ciemny), widoczny focus, role ARIA (tablist, toolbar, aria-pressed), komunikaty `aria-live`, skróty Ctrl+Z / Ctrl+Shift+Z / Enter / Esc.
- **Komunikaty błędów:** po polsku, z przyczyną i wskazówką (np. HEIC → „zmień format w aparacie na Najbardziej zgodny”), toasty błędów 5 s.

## 6. Scenariusz użytkownika

1. **Otwiera aplikację** — ekran startowy; widzi wskazówki, jak zrobić dobre zdjęcie.
2. **Przesyła zdjęcie** — z galerii/aparatu/przeciągnięciem. Zbyt duże lub nieczytelne pliki są odrzucane z wyjaśnieniem.
3. **System analizuje** — modal pokazuje etapy; jakość jest oceniana, maski i perspektywa wyznaczane w < 1 s na typowym telefonie.
4. **Zatwierdza podłogę** — niebieska maska nałożona na zdjęcie; „Zatwierdź”, „Popraw pędzlem” (np. zamalowanie dywanu gumką) lub „Zaznacz ręcznie” (wielokąt). Ostrzeżenia jakości wyświetlane w banerze.
5. **Zatwierdza perspektywę** — przeciąga narożniki, aż siatka pokrywa się z listwami/fugami.
6. **Wybiera panel** — automatycznie nałożony najpopularniejszy; przegląda katalog, filtruje, otwiera kartę, zmienia odcień, „Zastosuj w pomieszczeniu”.
7. **Zmienia kierunek i skalę** — „W głąb pokoju”, suwak kąta i skali, wzór jodełki; widok z góry pokazuje układ.
8. **Zmienia ściany, drzwi, framugi** — paleta lub własny kolor, wykończenie, styl drzwi (drzwi zaznacza w „Obszary → Drzwi”).
9. **Porównuje** — zapisuje warianty A/B/C, przełącza Przed/Po, suwak „Wariant A ⇆ bieżący”, siatka obok siebie.
10. **Zapisuje/eksportuje** — projekt w przeglądarce, JPG/PNG, „Przed i po”, „Udostępnij…” (Web Share; fallback: pobranie).

## 7. Kryteria akceptacji (najważniejsze funkcje)

| # | Funkcja | Kryteria |
|---|---|---|
| A1 | Import | JPG/PNG/WebP do 30 MB wczytuje się z poprawną orientacją; plik nie-obrazowy, < 480×360 px lub nieobsługiwany HEIC daje czytelny komunikat i nie zmienia stanu aplikacji. |
| A2 | Jakość | Zdjęcie o średniej jasności < 55/255 lub przechyleniu > 3° wyświetla odpowiednie ostrzeżenie; ostrzeżenia nie blokują dalszej pracy. |
| A3 | Detekcja podłogi | Na przykładowym pokoju maska podłogi pokrywa podłogę, nie obejmuje ścian ani sofy; przy pokryciu < 6 % lub > 85 % kadru pewność = „niska” i akcja główna = tryb ręczny. |
| A4 | Korekta | Pędzel/gumka/wielokąt zmieniają maskę, efekt widoczny po zakończeniu pociągnięcia; każda zmiana maski jest cofalna. |
| A5 | Perspektywa | Uchwyty nie pozwalają utworzyć czworokąta niewypukłego; deski zbiegają się zgodnie z siatką; zmiana wymiarów referencyjnych zmienia wizualny rozmiar desek proporcjonalnie. |
| A6 | Tekstura | Wzór powtarza się bez szwów, deski mają losowe przesunięcia (min. 25 % długości), fugi nie migoczą w oddali (antyaliasing zależny od odległości), meble wycięte z maski pozostają nad podłogą, cienie z oryginału są widoczne (suwak 0–100 %). |
| A7 | Katalog | Wyszukiwanie i każdy filtr zawężają listę; brak wyników ⇒ komunikat; ulubione przetrwają przeładowanie strony; podgląd tekstury odpowiada renderowi w pokoju. |
| A8 | Wnętrze | Zmiana koloru ścian nie zmienia podłogi, drzwi ani framug i odwrotnie; recolor zachowuje światłocień oryginału. |
| A9 | Porównanie | Przed/Po przełącza się < 100 ms; suwak działa myszą i dotykiem; maks. 4 warianty, przy 5. komunikat. |
| A10 | Historia | Cofnij/Ponów obejmuje produkt, ustawienia, drzwi i maski; Reset przywraca zdjęcie bez zmian, zachowując obszary i perspektywę. |
| A11 | Zapis/eksport | Zapisany projekt po otwarciu odtwarza zdjęcie, maski, ustawienia i warianty; eksport zawiera podpis „poglądowa”; „Udostępnij” bez Web Share pobiera plik. |
| A12 | Responsywność | Na 390×844 px podgląd mieści się w górnej części ekranu, wszystkie funkcje dostępne bez poziomego przewijania strony. |
| A13 | Wydajność | Zmiana panelu/koloru renderuje się w następnej klatce na obrazie 2048 px (urządzenia ≤ 4 GB RAM: 1600 px). |
