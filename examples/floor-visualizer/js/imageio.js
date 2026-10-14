// Import zdjęcia: walidacja, orientacja EXIF, skalowanie, ocena jakości.

export const MAX_FILE_MB = 30;
export const MIN_SIDE = { w: 480, h: 360 };

export class UserError extends Error {}

export async function loadImageFile(file) {
  if (!file) throw new UserError('Nie wybrano pliku.');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new UserError(`Plik jest za duży (maks. ${MAX_FILE_MB} MB).`);
  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
  if (file.type && !file.type.startsWith('image/')) throw new UserError('Wybrany plik nie jest zdjęciem. Obsługiwane formaty: JPG, PNG, WebP, AVIF, HEIC*.');
  let bmp;
  try {
    // Orientacja EXIF jest stosowana przez przeglądarkę (imageOrientation: 'from-image').
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UserError(isHeic
      ? 'Ta przeglądarka nie odczytuje formatu HEIC. Zmień w aparacie format na „Najbardziej zgodny” (JPG) lub wyeksportuj zdjęcie jako JPG.'
      : 'Nie udało się odczytać zdjęcia. Plik może być uszkodzony.');
  }
  const [a, b] = bmp.width >= bmp.height ? [bmp.width, bmp.height] : [bmp.height, bmp.width];
  if (a < MIN_SIDE.w || b < MIN_SIDE.h) throw new UserError(`Zdjęcie ma zbyt niską rozdzielczość (min. ${MIN_SIDE.w}×${MIN_SIDE.h} px).`);
  return bmp;
}

/** Maksymalny bok obrazu roboczego — mniejszy na urządzeniach z małą ilością pamięci. */
export function workingMaxSide() {
  const mem = navigator.deviceMemory || 8;
  const small = Math.min(screen.width, screen.height) < 500;
  return mem <= 4 || small ? 1600 : 2048;
}

export function toCanvas(source, maxSide) {
  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const c = document.createElement('canvas');
  c.width = Math.round(source.width * k);
  c.height = Math.round(source.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

export function grayscale(canvas, maxSide) {
  const s = toCanvas(canvas, maxSide);
  const { data } = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height);
  const g = new Float32Array(s.width * s.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  return { g, w: s.width, h: s.height };
}

/** Szacowanie jasności, ostrości i przechyłu. Zwraca listę problemów do pokazania użytkownikowi. */
export function assessQuality(canvas) {
  const { g, w, h } = grayscale(canvas, 384);
  const n = g.length;
  let sum = 0;
  let sq = 0;
  let clipped = 0;
  for (const v of g) {
    sum += v;
    sq += v * v;
    if (v > 250) clipped++;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sq / n - mean * mean));

  // Ostrość: 99. percentyl |Laplasjanu| — rozmyte zdjęcie nie ma ostrych krawędzi.
  const lap = [];
  // Przechył: średnie odchylenie krawędzi prawie pionowych od pionu.
  let rollSum = 0;
  let rollW = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap.push(Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]));
      const gx = g[i + 1] - g[i - 1];
      const gy = g[i + w] - g[i - w];
      const mag = Math.hypot(gx, gy);
      if (mag > 40) {
        const ang = Math.atan2(gy, gx); // kierunek gradientu; krawędź pionowa ⇒ gradient poziomy
        let dev = ang;
        if (dev > Math.PI / 2) dev -= Math.PI;
        if (dev < -Math.PI / 2) dev += Math.PI;
        if (Math.abs(dev) < (12 * Math.PI) / 180) {
          rollSum += dev * mag;
          rollW += mag;
        }
      }
    }
  }
  lap.sort((a, b) => a - b);
  const sharp = lap[Math.floor(lap.length * 0.99)] ?? 0;
  const roll = rollW > 2000 ? (rollSum / rollW) * (180 / Math.PI) : 0;

  const issues = [];
  if (mean < 55) issues.push({ level: 'warn', text: 'Zdjęcie jest ciemne — włącz światło lub zrób zdjęcie w ciągu dnia. Wizualizacja może być mniej czytelna.' });
  if (mean > 215 || clipped / n > 0.25) issues.push({ level: 'warn', text: 'Zdjęcie jest prześwietlone — jasne obszary mogą stracić szczegóły.' });
  if (std > 12 && sharp < 14) issues.push({ level: 'warn', text: 'Zdjęcie wygląda na rozmyte. Oprzyj telefon i zrób je ponownie, jeśli efekt będzie nieczytelny.' });
  if (Math.abs(roll) > 3) issues.push({ level: 'warn', text: `Zdjęcie jest przechylone o ok. ${Math.abs(roll).toFixed(0)}°. Najlepiej trzymać aparat poziomo.` });
  if (h > w * 1.15) issues.push({ level: 'info', text: 'Zdjęcie pionowe — w poziomie zmieści się więcej podłogi.' });
  return { mean, std, sharp, roll, issues };
}
