# Wizualizator podłóg — architektura techniczna

Uzupełnienie [KONCEPCJA.md](./KONCEPCJA.md). Opisuje prototyp (`examples/floor-visualizer/`) i docelową wersję z backendem.

## 1. Architektura

```
┌────────────────────────── Przeglądarka (PWA) ──────────────────────────┐
│ UI (moduły ES)  ──► Store + History ──► uniforms ──► Renderer WebGL2   │
│   katalog, kontrolki,   (migawki stanu      │           (1 przebieg:   │
│   warianty, kreator      + maski)           │            podłoga,      │
│        │                                    │            ściany, drzwi,│
│        ▼                                    ▼            światło)      │
│ Import/jakość ─► Analiza lokalna ─► Scene (maski RGBA, mapa cieni)     │
│        │            (heurystyki)         ▲                             │
│        └──── opcjonalnie ──► API analizy ┘ (maski ML, drzwi, głębia)   │
│ IndexedDB (projekty offline)            Web Share / pobieranie         │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ HTTPS (etap 2+)
┌──────────────────────────────▼─────────────────────────────────────────┐
│ API Gateway (auth, rate limit) ─► Projects API ─► PostgreSQL           │
│        │                     └──► Catalog API ─► PostgreSQL + CDN      │
│        └─► Analysis API ─► kolejka (Redis/SQS) ─► GPU workery (Python) │
│                                   Object storage (S3/R2): zdjęcia,     │
│                                   maski, eksporty, tekstury            │
└────────────────────────────────────────────────────────────────────────┘
```

Zasada: **render zawsze po stronie klienta**, serwer dostarcza tylko lepsze dane wejściowe (maski, głębię) i trwałość. Dzięki temu interakcja nie zależy od sieci, a koszt GPU w chmurze ponoszony jest raz na zdjęcie.

## 2. Stos technologiczny

| Warstwa | Prototyp | Wersja produkcyjna |
|---|---|---|
| Frontend | Vanilla ES modules, WebGL2, Canvas 2D, IndexedDB | TypeScript + React/Preact, Vite, Zustand (stan + historia), Workbox (PWA), te same moduły renderera |
| Przetwarzanie lokalne | Heurystyki w JS (wątek główny) | Web Worker + OffscreenCanvas; opcjonalnie ONNX Runtime Web (WebGPU) z lekkim modelem segmentacji |
| Backend | — | Node.js (Fastify) lub Python FastAPI dla API; workery Python (PyTorch) |
| Dane | IndexedDB | PostgreSQL (projekty, katalog), Redis (kolejka, cache), S3/R2 + CDN |
| Auth | — | OIDC (np. Auth0/Keycloak), sesje httpOnly |
| Obserwowalność | — | OpenTelemetry, Sentry (bez treści zdjęć w logach) |

## 3. Moduł analizy obrazu

### 3.1 Prototyp (lokalnie, bez ML) — `js/imageio.js`, `js/segmentation.js`, `js/scene.js`

1. **Import:** `createImageBitmap(file, {imageOrientation: 'from-image'})` (EXIF), skalowanie do 2048 px (1600 px przy ≤ 4 GB RAM).
2. **Jakość (384 px):** średnia i odchylenie jasności, odsetek prześwietleń, ostrość = 99. percentyl |Laplasjanu|, przechył = ważone odchylenie krawędzi prawie pionowych od pionu (Sobel).
3. **Segmentacja (480 px):** rozmycie 3×3 → CIELAB; mapa krawędzi Sobel na L*; rozrost regionu od punktów startowych (podłoga: dolny środek kadru + boki; ściany: pasy nad górną krawędzią podłogi). Piksel dołącza, gdy: ΔE do sąsiada < 5, odległość do koloru punktów startowych (z wagą 0,7 na L*, by objąć cienie) < 14–16, krawędź poniżej progu. Podłoga nie wchodzi w górne 30 % kadru. Następnie domknięcie morfologiczne i wypełnienie małych dziur — duże dziury zostają jako przeszkody (meble).
4. **Perspektywa:** regresja liniowa lewej i prawej krawędzi maski w paśmie podłogi → trapez; gdy krawędzie dotykają brzegów kadru, trapez domyślny (góra = 62 % dołu).
5. **Światło:** centroid 3 % najjaśniejszych pikseli → „z lewej/prawej/z przodu” (informacyjnie).
6. **Mapa cieniowania podłogi:** splot znormalizowany `blur(L·M)/blur(M)` (3× box blur ≈ Gauss, r ≈ 1,2 % boku). Usuwa fakturę starej podłogi, zachowuje cienie i plamy światła, nie „przecieka” kolorem mebli.

Ograniczenia: heurystyka myli obiekty o kolorze podłogi (np. szary dywan na szarej podłodze), nie wykrywa drzwi (zaznaczane ręcznie) i nie odróżnia sufitu od ściany o podobnym kolorze. Dlatego krok zatwierdzenia i narzędzia korekty są częścią MVP.

### 3.2 Docelowo (serwer, etap 2)

| Model | Rola | Zalety | Ograniczenia | Koszt orientacyjny |
|---|---|---|---|---|
| **OneFormer / Mask2Former (ADE20K)** | Klasy: floor, wall, ceiling, door, rug, furniture, window | Semantyka zamiast koloru; wykrywa drzwi i dywany | Krawędzie ~4–8 px; framugi często jako „wall”/„door” | GPU T4/L4: ~0,15–0,4 s/zdjęcie ⇒ ok. 0,0002–0,0005 USD/zdjęcie (self-hosted) |
| **SAM 2** | Doprecyzowanie maski po kliknięciu użytkownika, ostre krawędzie mebli | Świetne krawędzie, interaktywność | Brak semantyki — wymaga punktu/pudełka | ~0,05 s/zapytanie na GPU; enkoder można uruchomić raz na zdjęcie |
| **Depth Anything V2** (+ dopasowanie płaszczyzny RANSAC) | Automatyczny trapez, horyzont, normalna podłogi; podstawa „uproszczonego 3D” | Lepsza perspektywa przy zasłoniętych krawędziach | Głębia względna — skala nadal z wymiaru referencyjnego | ~0,1 s/zdjęcie GPU |
| Detektor linii (LSD/DeepLSD) + punkty zbiegu | Korekta perspektywy i przechyłu | Szybki, deterministyczny | Zawodzi w pokojach bez prostych krawędzi | CPU, pomijalny |

Zewnętrzne API (np. Replicate/HF Inference Endpoints) — szybki start bez infrastruktury, koszt ok. 0,002–0,01 USD/zdjęcie i opóźnienia „zimnego startu”; przy > ~50 tys. zdjęć/mies. tańszy jest własny worker GPU. Generatywne modele (inpainting/diffusion) **nie** są używane do nakładania paneli: zmieniają geometrię i wzór produktu, czyli fałszują to, co użytkownik chce ocenić.

Kontrakt jest wspólny dla analizy lokalnej i serwerowej: maski (PNG 8-bit), trapez, lista drzwi (czworokąty), pewność — klient może wymienić źródło bez zmian w rendererze.

## 4. Nakładanie tekstur (`js/shaders.js`, `js/uniforms.js`)

Jeden fragment shader WebGL2 w rozdzielczości obrazu roboczego:

1. **Piksel → podłoga:** `p = H⁻¹·[x, y, 1]`, gdzie `H` to homografia prostokąta referencyjnego (W×D m) na trapez. Piksele za horyzontem (`w ≤ 0`) są pomijane.
2. **Układ:** obrót o kąt kierunku, skala; wzory: równoległy (losowe przesunięcie 25–75 % długości), cegiełka (½), jodełka (kratownica `a=(1,1)`, `b=(n,−n)` w jednostkach szerokości deski, n = L/W ∈ [2, 8], obrót 45°), jodełka francuska (kolumny desek ciętych pod 45°). Wynik: id deski i współrzędne lokalne w metrach.
3. **Materiał:** ton deski = hash(id) × zmienność produktu między tonem jasnym i ciemnym (w przestrzeni liniowej); słoje = fbm wydłużony wzdłuż deski; sęki; fugi/fazy 4V z antyaliasingiem `fwidth`; szczegóły wygaszane, gdy metry/piksel rosną (brak migotania w oddali).
4. **Światło:** `kolor × mix(1, cień/średnia_podłogi, siła)`; podbicie odblasku zależne od wykończenia (mat/półmat/połysk).
5. **Ściany, drzwi, framugi:** recolor zachowujący luminancję `cel × (L_piksela / L_średnia_obszaru)^spłaszczenie`; połysk ścian dodaje odblask. Drzwi mają własną homografię (do 4 drzwi) — style (płyciny, frezy, szyba) i okleina rysowane we współrzędnych skrzydła; styl inny niż „oryginalny” używa rozmytego (mipmapa) obrazu, by usunąć stare przetłoczenia.
6. **Global:** jasność, temperatura (balans R/B), kontrast; tryb Przed i suwak (lewa strona = oryginał lub render wariantu).

Maska RGBA (r = podłoga, g = ściany, b = drzwi, a = framugi) jest przesyłana jako surowy bufor (bez premultiplikacji canvas), obszary wzajemnie się wykluczają. Miękkie krawędzie masek dają naturalne przejścia.

Docelowo tekstury proceduralne zastępuje atlas skanów PBR (albedo/normal/roughness, kafel 2–4 deski, kilka wariantów desek wybieranych hashem id), ładowany z CDN jako KTX2/Basis.

## 5. Model danych

```ts
interface Product {
  id: string; name: string; manufacturerId: string; collection: string;
  style: 'klasyczny' | 'skandynawski' | 'nowoczesny' | 'industrialny' | 'rustykalny';
  formatType: 'standard' | 'XL' | 'jodełka';
  size: { l: number; w: number; t: number };          // mm
  finish: 'mat' | 'półmat' | 'połysk';
  surface: 'synchroniczna' | 'szczotkowana' | 'gładka' | 'postarzana';
  wearClass: 'AC3' | 'AC4' | 'AC5'; bevel: 0 | 1;
  defaultPattern: Pattern; popularity: number; active: boolean;
  variants: ProductVariant[];
}
interface ProductVariant {
  id: string; name: string; family: 'biały' | 'jasny' | 'naturalny' | 'szary' | 'ciemny';
  light: string; dark: string;                         // #rrggbb (fallback proceduralny)
  textures?: { albedo: string; normal?: string; roughness?: string; tileMm: [number, number] };
  sku?: string;
}
type Pattern = 'straight' | 'brick' | 'herringbone' | 'chevron';

interface Project {
  id: string; ownerId: string; name: string; createdAt: string; updatedAt: string;
  photo: { key: string; width: number; height: number; sha256: string };
  analysis: Analysis; arrangement: Arrangement; variants: Variant[];
}
interface Analysis {
  source: 'local' | 'server'; modelVersion: string; confidence: 'niska' | 'średnia' | 'wysoka';
  masks: { floor: string; wall: string };              // klucze PNG w storage
  floorQuad: Point[4]; doors: Point[4][]; light?: { side: string };
  quality: { mean: number; sharp: number; roll: number; issues: string[] };
}
interface Arrangement {                                // = defaultSettings() w js/store.js
  productId: string | null; variantId: string | null; pattern: Pattern;
  angle: number; scale: number; intensity: number; shadow: number; realistic: boolean;
  refSize: { w: number; d: number }; quad: Point[4];
  wall: { enabled: boolean; color: string; finish: 'mat' | 'satyna' | 'połysk' };
  door: { enabled: boolean; color: string; style: 'original' | 'smooth' | 'panel' | 'grooved' | 'glass'; material: 'paint' | 'wood' };
  frame: { enabled: boolean; color: string; material: 'paint' | 'wood'; width: number };
  doors: Point[4][]; light: { brightness: number; temperature: number; contrast: number };
}
interface Variant { id: string; name: string; arrangement: Arrangement; thumbKey: string }
type Point = [number, number];                         // px obrazu roboczego
```

Tabele: `manufacturers`, `products`, `product_variants`, `textures`, `users`, `projects`, `project_variants`, `analyses`, `exports`, `share_links`, `favorites`. Katalog rozszerza się przez dodawanie wierszy i tekstur — renderer potrzebuje tylko wymiarów, tonów/tekstur i wykończenia.

## 6. Przykładowe endpointy API (REST, JSON, `/api/v1`)

| Metoda i ścieżka | Opis |
|---|---|
| `POST /uploads` | Zwraca podpisany URL (PUT, ważny 10 min, limit 30 MB, typy image/*) i `uploadId`. |
| `POST /analyses` `{uploadId}` | Kolejkuje analizę ML → `202 {analysisId}`. |
| `GET /analyses/{id}` | `{status: queued|running|done|failed, result?: Analysis}` (lub SSE `/analyses/{id}/events`). |
| `GET /products?q=&family=&style=&manufacturer=&format=&sort=pop|name|light|dark|len&cursor=` | Katalog z paginacją kursorową, `ETag`. |
| `GET /products/{id}` | Karta produktu z wariantami i URL-ami tekstur (CDN). |
| `PUT /me/favorites/{productId}` / `DELETE …` | Ulubione. |
| `POST /projects` / `GET /projects` / `GET /projects/{id}` | Tworzenie, lista, odczyt. |
| `PATCH /projects/{id}` `{arrangement, variants, If-Match}` | Zapis z kontrolą wersji (optimistic locking). |
| `DELETE /projects/{id}` | Usunięcie projektu wraz ze zdjęciem i maskami (twarde, z kosza po 30 dniach). |
| `POST /projects/{id}/exports` `{kind: image|beforeafter}` | Zapis wygenerowanego w kliencie pliku → podpisany URL. |
| `POST /projects/{id}/share` `{expiresInDays}` | Link tylko do odczytu (token 128-bit), odwoływalny `DELETE /share/{token}`. |
| `GET /share/{token}` | Publiczny podgląd eksportu (bez zdjęcia źródłowego i masek). |

Błędy: `application/problem+json` (RFC 9457) z polem `code` mapowanym na komunikaty PL w kliencie.

## 7. Wydajność i urządzenia mobilne

- Obraz roboczy ≤ 2048 px (1600 px przy `deviceMemory ≤ 4` lub małym ekranie); maski ≤ 1280 px; analiza 480 px. Eksport w rozdzielczości roboczej.
- Render: jeden pełnoekranowy trójkąt, brak alokacji na klatkę, `requestAnimationFrame` łączy zmiany; suwaki aktualizują uniformy na żywo, ciężkie operacje (kompozyt masek, mapa cieni ~30–60 ms) tylko po zakończeniu gestu.
- Historia przechowuje maski jako kanał alfa (1 B/px) współdzielony między wpisami, limit 25 kroków.
- Miniatury katalogu renderowane leniwie (IntersectionObserver) i cache’owane.
- Produkcyjnie: analiza w Web Workerze, Service Worker cache katalogu i tekstur, obsługa `webglcontextlost`.

## 8. Bezpieczeństwo i prywatność

- **Minimalizacja danych:** w trybie bez konta zdjęcie nie opuszcza urządzenia (analiza lokalna, IndexedDB). Wysyłka do analizy ML wymaga zgody, z informacją o celu i czasie przechowywania.
- **Metadane:** EXIF (w tym GPS) usuwany przed wysyłką — wysyłany jest re-enkodowany obraz roboczy.
- **Przechowywanie:** prywatny bucket, szyfrowanie at-rest (SSE-KMS), dostęp wyłącznie przez krótkotrwałe podpisane URL; zdjęcia bez projektu usuwane po 24 h, konta nieaktywne — po 24 mies.; RODO: eksport i usunięcie danych na żądanie.
- **Walidacja na granicach:** typ MIME + magic bytes, limity rozmiaru i wymiarów (ochrona przed „decompression bomb”), dekodowanie w izolowanym workerze (libvips), schematy JSON (Zod/Pydantic) dla wszystkich wejść API, limity długości nazw.
- **Aplikacja:** CSP bez `unsafe-inline` dla skryptów, escapowanie treści w UI (nazwy projektów, dane katalogu), HTTPS + HSTS, ciasteczka `httpOnly; Secure; SameSite=Lax`, CSRF dla mutacji, rate limiting uploadów i analiz per użytkownik/IP, autoryzacja na poziomie zasobu (właściciel projektu), linki udostępniania z wygaśnięciem i bez dostępu do oryginału.
- **Modele AI:** brak trenowania na zdjęciach użytkowników bez osobnej zgody; logi bez treści obrazów.

## 9. Ryzyka techniczne i rozwiązania

| Problem | Rozwiązanie |
|---|---|
| Błędna maska (dywan, podobny kolor ścian, odbicia) | Obowiązkowy krok zatwierdzenia, pędzel/gumka/wielokąt; etap 2 — segmentacja semantyczna + SAM. |
| Brak widocznych krawędzi podłogi (zastawiony pokój) | Trapez domyślny + siatka do ręcznego dopasowania; etap 2 — głębia/punkty zbiegu. |
| Nieznana skala | Wymiary prostokąta referencyjnego + suwak skali; wskazówka „ustaw szerokość pokoju”. |
| Szerokokątne obiektywy (dystorsja) | Wskazówka „bez 0,5×”; etap 4 — korekcja dystorsji z metadanych obiektywu. |
| Mory i migotanie desek w oddali | Antyaliasing fug przez `fwidth`, wygaszanie detali zależne od metrów/piksel, mipmapy. |
| Utrata cieni lub „brudna” podłoga | Splot znormalizowany maską; suwak siły cieni; etap 4 — rozdzielenie oświetlenia (intrinsic decomposition). |
| Niezgodność kolorów z produktem | Podpis „poglądowa”, temperatura/jasność, skany kalibrowane (ColorChecker) w etapie 3; próbki fizyczne. |
| HEIC / duże pliki / mało pamięci | Komunikat z instrukcją; skalowanie zależne od `deviceMemory`; serwerowe dekodowanie HEIC (etap 2). |
| Brak WebGL2 | Ekran z informacją o wymaganej przeglądarce (≈ 97 % urządzeń wspiera WebGL2). |
| Utrata kontekstu GPU na mobile | Obsługa `webglcontextlost/restored` z ponownym wgraniem tekstur (produkcyjnie). |
