// Podglądy tekstur (karty katalogu, widok z góry) renderowane tym samym shaderem
// co wizualizacja — próbka w katalogu wygląda tak samo jak na podłodze.
import { Renderer } from './renderer.js';
import { buildUniforms } from './uniforms.js';
import { defaultSettings } from './store.js';

export class SwatchRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.r = new Renderer(this.canvas);
    const neutral = Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
    neutral.getContext('2d').fillStyle = '#808080';
    neutral.getContext('2d').fillRect(0, 0, 2, 2);
    this.r.setImage(neutral, { resize: false });
    this.r.setMask(new Uint8Array([255, 0, 0, 0]), 1, 1);
    this.cache = new Map();
  }

  /** Rysuje widok z góry: `meters` = szerokość kadru w metrach. */
  draw(target, settingsPatch, meters = 1.6) {
    const w = target.width;
    const h = target.height;
    this.r.resize(w, h);
    const s = { ...defaultSettings(), shadow: 0, ...settingsPatch, quad: null, doors: [] };
    const k = meters / w;
    const scene = { lums: { floor: 1, wall: 1, door: 1, frame: 1 }, floorInv: [k, 0, 0, 0, -k, h * k, 0, 0, 1] };
    this.r.render({ ...buildUniforms(s, scene), uBrightness: 1, uTemperature: 0, uContrast: 1 });
    target.getContext('2d').drawImage(this.canvas, 0, 0);
  }

  /** Miniatura produktu jako dataURL (z pamięcią podręczną). */
  thumb(productId, variantId, pattern, size = 240) {
    const key = `${productId}|${variantId}|${pattern}|${size}`;
    if (!this.cache.has(key)) {
      const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
      this.draw(c, { productId, variantId, pattern }, pattern === 'straight' || pattern === 'brick' ? 1.8 : 1.2);
      this.cache.set(key, c.toDataURL('image/jpeg', 0.85));
    }
    return this.cache.get(key);
  }
}
