// Katalog demonstracyjny. Producenci i produkty są fikcyjne — w wersji produkcyjnej
// dane pochodzą z API katalogu (patrz docs/floor-visualizer/ARCHITEKTURA.md).
// Kolory to tony jasny/ciemny w sRGB; parametry render* sterują teksturą proceduralną.

const v = (id, name, family, light, dark) => ({ id, name, family, light, dark });

export const PRODUCTS = [
  {
    id: 'lum-natura-dab', name: 'Dąb Naturalny Classic', manufacturer: 'Lumera Floors', collection: 'Natura',
    style: 'klasyczny', formatType: 'standard', size: { l: 1380, w: 193, t: 8 }, wearClass: 'AC4',
    finish: 'mat', surface: 'synchroniczna', bevel: 1, grain: 0.75, variation: 0.55, knots: 0.25, popularity: 98,
    defaultPattern: 'straight',
    variants: [v('nat', 'Naturalny', 'naturalny', '#c99a63', '#93663a'), v('mio', 'Miodowy', 'naturalny', '#d4a05a', '#9c6a2e'), v('jas', 'Jasny', 'jasny', '#dcc29b', '#b49468')],
  },
  {
    id: 'nor-hygge-dab', name: 'Dąb Skandynawski', manufacturer: 'Nordic Plank Co.', collection: 'Hygge',
    style: 'skandynawski', formatType: 'standard', size: { l: 1285, w: 192, t: 8 }, wearClass: 'AC4',
    finish: 'mat', surface: 'szczotkowana', bevel: 1, grain: 0.55, variation: 0.35, knots: 0.15, popularity: 95,
    defaultPattern: 'straight',
    variants: [v('bia', 'Biały', 'biały', '#ebe2d3', '#c9bca5'), v('pia', 'Piaskowy', 'jasny', '#ddcdb0', '#b6a17d'), v('mle', 'Mleczny', 'biały', '#efe8dc', '#d3c6b1')],
  },
  {
    id: 'urb-loft-xl', name: 'Dąb Dymiony XL', manufacturer: 'Urbana', collection: 'Loft',
    style: 'industrialny', formatType: 'XL', size: { l: 2050, w: 240, t: 10 }, wearClass: 'AC5',
    finish: 'półmat', surface: 'szczotkowana', bevel: 1, grain: 0.8, variation: 0.5, knots: 0.35, popularity: 81,
    defaultPattern: 'straight',
    variants: [v('gra', 'Grafit', 'ciemny', '#6c625a', '#433b35'), v('dym', 'Dymiony', 'ciemny', '#8d7560', '#5a4434'), v('pop', 'Popielaty', 'szary', '#9e968c', '#6d655c')],
  },
  {
    id: 'ddw-palac-jodelka', name: 'Jodełka Królewska', manufacturer: 'Dębowy Dwór', collection: 'Pałac',
    style: 'klasyczny', formatType: 'jodełka', size: { l: 600, w: 100, t: 8 }, wearClass: 'AC4',
    finish: 'półmat', surface: 'gładka', bevel: 0, grain: 0.7, variation: 0.6, knots: 0.1, popularity: 90,
    defaultPattern: 'herringbone',
    variants: [v('nat', 'Naturalny', 'naturalny', '#c49058', '#8d5f33'), v('bur', 'Bursztyn', 'naturalny', '#b9824a', '#7a4c24'), v('bie', 'Bielony', 'jasny', '#e3d6c0', '#bfab8b')],
  },
  {
    id: 'ddw-elegance-chevron', name: 'Jodełka Francuska Elegance', manufacturer: 'Dębowy Dwór', collection: 'Elegance',
    style: 'nowoczesny', formatType: 'jodełka', size: { l: 630, w: 126, t: 10 }, wearClass: 'AC4',
    finish: 'mat', surface: 'synchroniczna', bevel: 1, grain: 0.6, variation: 0.4, knots: 0.05, popularity: 76,
    defaultPattern: 'chevron',
    variants: [v('kre', 'Kremowy', 'jasny', '#dfcfb2', '#b9a27e'), v('tab', 'Tabaka', 'naturalny', '#a77a52', '#6f4c2e'), v('sza', 'Szary', 'szary', '#aaa29a', '#7b736a')],
  },
  {
    id: 'lum-orzech', name: 'Orzech Amerykański', manufacturer: 'Lumera Floors', collection: 'Natura',
    style: 'klasyczny', formatType: 'standard', size: { l: 1380, w: 193, t: 10 }, wearClass: 'AC4',
    finish: 'półmat', surface: 'synchroniczna', bevel: 1, grain: 0.85, variation: 0.6, knots: 0.1, popularity: 72,
    defaultPattern: 'straight',
    variants: [v('cie', 'Ciemny', 'ciemny', '#6a4430', '#3c2417'), v('kar', 'Karmel', 'naturalny', '#8c5a3a', '#57331e')],
  },
  {
    id: 'nor-rustic-sosna', name: 'Sosna Rustykalna', manufacturer: 'Nordic Plank Co.', collection: 'Cabin',
    style: 'rustykalny', formatType: 'standard', size: { l: 1380, w: 159, t: 8 }, wearClass: 'AC3',
    finish: 'mat', surface: 'postarzana', bevel: 1, grain: 0.95, variation: 0.85, knots: 0.85, popularity: 64,
    defaultPattern: 'straight',
    variants: [v('mio', 'Miodowa', 'naturalny', '#d2a066', '#996632'), v('sza', 'Szara', 'szary', '#a69d90', '#73695d')],
  },
  {
    id: 'lum-premium-xl', name: 'Dąb Biały Premium', manufacturer: 'Lumera Floors', collection: 'Premium',
    style: 'nowoczesny', formatType: 'XL', size: { l: 1845, w: 244, t: 10 }, wearClass: 'AC5',
    finish: 'mat', surface: 'synchroniczna', bevel: 1, grain: 0.55, variation: 0.3, knots: 0.2, popularity: 88,
    defaultPattern: 'straight',
    variants: [v('kre', 'Kremowy', 'jasny', '#e6d7bd', '#c3ab87'), v('per', 'Perłowy', 'biały', '#ddd9d1', '#b5ada0')],
  },
  {
    id: 'urb-terra-akacja', name: 'Akacja Egzotyczna', manufacturer: 'Urbana', collection: 'Terra',
    style: 'nowoczesny', formatType: 'standard', size: { l: 1200, w: 190, t: 8 }, wearClass: 'AC4',
    finish: 'połysk', surface: 'gładka', bevel: 0, grain: 0.9, variation: 0.8, knots: 0.2, popularity: 58,
    defaultPattern: 'straight',
    variants: [v('aka', 'Akacja', 'naturalny', '#a8683e', '#68391c'), v('kaw', 'Kawowa', 'ciemny', '#7a4a2e', '#452614')],
  },
  {
    id: 'urb-loft-szary', name: 'Dąb Szary Urban', manufacturer: 'Urbana', collection: 'Loft',
    style: 'industrialny', formatType: 'standard', size: { l: 1288, w: 195, t: 8 }, wearClass: 'AC4',
    finish: 'mat', surface: 'szczotkowana', bevel: 1, grain: 0.65, variation: 0.45, knots: 0.25, popularity: 79,
    defaultPattern: 'straight',
    variants: [v('sza', 'Szary', 'szary', '#a59d95', '#776d64'), v('ant', 'Antracyt', 'ciemny', '#55514d', '#32302e')],
  },
  {
    id: 'ddw-vintage-wiaz', name: 'Wiąz Vintage', manufacturer: 'Dębowy Dwór', collection: 'Heritage',
    style: 'rustykalny', formatType: 'XL', size: { l: 1380, w: 244, t: 10 }, wearClass: 'AC4',
    finish: 'mat', surface: 'postarzana', bevel: 1, grain: 0.9, variation: 0.75, knots: 0.6, popularity: 61,
    defaultPattern: 'brick',
    variants: [v('vin', 'Vintage', 'naturalny', '#b08a64', '#735438'), v('bie', 'Bielony', 'jasny', '#d8cbb6', '#a8967b')],
  },
  {
    id: 'nor-buk', name: 'Buk Parowany', manufacturer: 'Nordic Plank Co.', collection: 'Classic',
    style: 'klasyczny', formatType: 'standard', size: { l: 1285, w: 192, t: 7 }, wearClass: 'AC3',
    finish: 'półmat', surface: 'gładka', bevel: 0, grain: 0.45, variation: 0.35, knots: 0, popularity: 55,
    defaultPattern: 'straight',
    variants: [v('buk', 'Buk', 'naturalny', '#d49b74', '#a56b46')],
  },
];

export const FILTERS = {
  family: ['biały', 'jasny', 'naturalny', 'szary', 'ciemny'],
  style: ['klasyczny', 'skandynawski', 'nowoczesny', 'industrialny', 'rustykalny'],
  formatType: ['standard', 'XL', 'jodełka'],
};

export const PATTERNS = [
  { id: 'straight', name: 'Równoległy' },
  { id: 'brick', name: 'Cegiełka (½)' },
  { id: 'herringbone', name: 'Jodełka' },
  { id: 'chevron', name: 'Jodełka francuska' },
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) ?? null;
}

export function getVariant(product, variantId) {
  if (!product) return null;
  return product.variants.find((x) => x.id === variantId) ?? product.variants[0];
}

export function manufacturers() {
  return [...new Set(PRODUCTS.map((p) => p.manufacturer))].sort();
}

/** Jasność wariantu (0–1) do sortowania. */
export function variantLightness(variant) {
  const n = parseInt(variant.light.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
