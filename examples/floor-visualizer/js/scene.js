// Scena: obraz roboczy + warstwy masek (podłoga, ściany) w rozdzielczości maski,
// kompozyt RGBA dla shadera, mapa cieniowania podłogi i średnie luminancje obszarów.
import { frameQuad } from './geometry.js';

export const MASK_MAX_SIDE = 1280;

const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export class Scene {
  constructor(work) {
    this.work = work;
    this.k = Math.min(1, MASK_MAX_SIDE / Math.max(work.width, work.height));
    this.mw = Math.round(work.width * this.k);
    this.mh = Math.round(work.height * this.k);
    this.layers = { floor: makeCanvas(this.mw, this.mh), wall: makeCanvas(this.mw, this.mh) };
    this.mask = new Uint8Array(this.mw * this.mh * 4);
    this.shade = new Uint8Array(this.mw * this.mh);
    this.lums = { floor: 0.5, wall: 0.7, door: 0.7, frame: 0.7 };
    const small = makeCanvas(this.mw, this.mh);
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(work, 0, 0, this.mw, this.mh);
    const d = ctx.getImageData(0, 0, this.mw, this.mh).data;
    this.lum = new Float32Array(this.mw * this.mh);
    for (let i = 0; i < this.lum.length; i++) this.lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  }

  ctx(layer) {
    return this.layers[layer].getContext('2d', { willReadFrequently: true });
  }

  /** Wczytuje maski z analizy (niska rozdzielczość) — skalowanie daje miękkie krawędzie. */
  setFromAnalysis(result) {
    for (const name of ['floor', 'wall']) {
      const src = makeCanvas(result.w, result.h);
      const img = new ImageData(result.w, result.h);
      const m = result[name];
      for (let i = 0; i < m.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = m[i] ? 255 : 0;
      }
      src.getContext('2d').putImageData(img, 0, 0);
      const c = this.ctx(name);
      c.clearRect(0, 0, this.mw, this.mh);
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, this.mw, this.mh);
    }
  }

  /** Migawka warstw do historii (tylko kanał alfa). */
  snapshotLayers() {
    const out = {};
    for (const name of ['floor', 'wall']) {
      const d = this.ctx(name).getImageData(0, 0, this.mw, this.mh).data;
      const a = new Uint8Array(this.mw * this.mh);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      out[name] = a;
    }
    return out;
  }

  restoreLayers(snap) {
    for (const name of ['floor', 'wall']) {
      const img = new ImageData(this.mw, this.mh);
      const a = snap[name];
      for (let i = 0; i < a.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = a[i];
      }
      this.ctx(name).putImageData(img, 0, 0);
    }
  }

  #rasterQuads(quads) {
    const c = makeCanvas(this.mw, this.mh);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    for (const q of quads) {
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x * this.k, y * this.k) : ctx.moveTo(x * this.k, y * this.k)));
      ctx.closePath();
      ctx.fill();
    }
    return ctx.getImageData(0, 0, this.mw, this.mh).data;
  }

  /** Buduje maskę RGBA (wzajemnie wykluczające się obszary), cieniowanie i luminancje. */
  compose(doors, frameWidth) {
    const n = this.mw * this.mh;
    const F = this.ctx('floor').getImageData(0, 0, this.mw, this.mh).data;
    const W = this.ctx('wall').getImageData(0, 0, this.mw, this.mh).data;
    const D = this.#rasterQuads(doors);
    const Fr = this.#rasterQuads(doors.map((q) => frameQuad(q, frameWidth)));
    const floorW = new Float32Array(n);
    const sums = { floor: [0, 0], wall: [0, 0], door: [0, 0], frame: [0, 0] };
    for (let i = 0; i < n; i++) {
      const d = D[i * 4 + 3] / 255;
      const fr = (Fr[i * 4 + 3] / 255) * (1 - d);
      const fl = (F[i * 4 + 3] / 255) * (1 - d) * (1 - fr);
      const wl = (W[i * 4 + 3] / 255) * (1 - F[i * 4 + 3] / 255) * (1 - d) * (1 - fr);
      this.mask[i * 4] = fl * 255;
      this.mask[i * 4 + 1] = wl * 255;
      this.mask[i * 4 + 2] = d * 255;
      this.mask[i * 4 + 3] = fr * 255;
      floorW[i] = fl;
      const l = this.lum[i];
      sums.floor[0] += l * fl; sums.floor[1] += fl;
      sums.wall[0] += l * wl; sums.wall[1] += wl;
      sums.door[0] += l * d; sums.door[1] += d;
      sums.frame[0] += l * fr; sums.frame[1] += fr;
    }
    for (const [k, [s, c]] of Object.entries(sums)) this.lums[k] = c > 1 ? s / c : 0.6;
    this.#computeShade(floorW);
    return { mask: this.mask, shade: this.shade, w: this.mw, h: this.mh };
  }

  /**
   * Splot znormalizowany: blur(L·M)/blur(M). Usuwa fakturę starej podłogi,
   * zachowując niskoczęstotliwościowe światło i cienie, bez „przeciekania” mebli.
   */
  #computeShade(weights) {
    const n = weights.length;
    const r = Math.max(2, Math.round(Math.max(this.mw, this.mh) * 0.012));
    const num = new Float32Array(n);
    for (let i = 0; i < n; i++) num[i] = this.lum[i] * weights[i];
    const den = Float32Array.from(weights);
    for (let p = 0; p < 3; p++) {
      blur1D(num, this.mw, this.mh, r, true); blur1D(num, this.mw, this.mh, r, false);
      blur1D(den, this.mw, this.mh, r, true); blur1D(den, this.mw, this.mh, r, false);
    }
    for (let i = 0; i < n; i++) {
      const v = den[i] > 0.02 ? num[i] / den[i] : this.lum[i];
      this.shade[i] = Math.max(0, Math.min(255, v * 255));
    }
  }
}

/** Rozmycie pudełkowe w jednym kierunku (okno przesuwne, O(n)). */
function blur1D(a, w, h, r, horizontal) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const buf = new Float32Array(len);
  for (let l = 0; l < lines; l++) {
    const idx = (t) => (horizontal ? l * w + t : t * w + l);
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += a[idx(Math.min(len - 1, Math.max(0, t)))];
    for (let t = 0; t < len; t++) {
      buf[t] = acc / (2 * r + 1);
      acc += a[idx(Math.min(len - 1, t + r + 1))] - a[idx(Math.max(0, t - r))];
    }
    for (let t = 0; t < len; t++) a[idx(t)] = buf[t];
  }
}
