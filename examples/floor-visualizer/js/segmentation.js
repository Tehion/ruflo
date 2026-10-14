// Lokalna (przeglądarkowa) analiza pomieszczenia — heurystyki bez modelu ML:
// rozrost regionów w przestrzeni Lab od punktów startowych, morfologia,
// estymacja trapezu perspektywy i dominującego kierunku światła.
// Wynik jest propozycją do zatwierdzenia/korekty przez użytkownika.
// Interfejs jest zgodny z analizą serwerową (patrz ARCHITEKTURA.md, POST /analyses).

import { toCanvas } from './imageio.js';

export const ANALYSIS_SIZE = 480;
// Podłoga na zdjęciach z wysokości oczu praktycznie nie sięga górnej części kadru.
const FLOOR_TOP_LIMIT = 0.3;

export function analyzeRoom(canvas) {
  const s = toCanvas(canvas, ANALYSIS_SIZE);
  const w = s.width;
  const h = s.height;
  const rgba = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const lab = toLab(boxBlur(rgba, w, h, 1), w * h);
  const edges = edgeMap(toLab(boxBlur(rgba, w, h, 0), w * h), w, h);

  const floor = growFloor(lab, w, h, edges);
  close(floor, w, h, 3);
  fillHoles(floor, w, h, 0.012);
  const wall = growWalls(lab, w, h, floor, edges);
  close(wall, w, h, 3);
  fillHoles(wall, w, h, 0.006);
  for (let i = 0; i < floor.length; i++) if (floor[i]) wall[i] = 0;

  const area = w * h;
  const floorRatio = count(floor) / area;
  const wallRatio = count(wall) / area;
  const confidence = floorRatio < 0.06 || floorRatio > 0.85 ? 'niska' : floorRatio < 0.12 ? 'średnia' : 'wysoka';
  return {
    w, h, floor, wall,
    quad: estimateQuad(floor, w, h),
    light: estimateLight(rgba, w, h),
    stats: { floorRatio, wallRatio, confidence },
  };
}

function count(m) {
  let c = 0;
  for (const v of m) c += v ? 1 : 0;
  return c;
}

function boxBlur(rgba, w, h, r) {
  const out = new Float32Array(w * h * 3);
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const i = (y * w + xx) * 4;
        a += rgba[i]; b += rgba[i + 1]; c += rgba[i + 2]; n++;
      }
      const o = (y * w + x) * 3;
      tmp[o] = a / n; tmp[o + 1] = b / n; tmp[o + 2] = c / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const i = (yy * w + x) * 3;
        a += tmp[i]; b += tmp[i + 1]; c += tmp[i + 2]; n++;
      }
      const o = (y * w + x) * 3;
      out[o] = a / n; out[o + 1] = b / n; out[o + 2] = c / n;
    }
  }
  return out;
}

function toLab(rgb, n) {
  const lab = new Float32Array(n * 3);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < n; i++) {
    const r = lin(rgb[i * 3] / 255), g = lin(rgb[i * 3 + 1] / 255), b = lin(rgb[i * 3 + 2] / 255);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const fx = f(X), fy = f(Y), fz = f(Z);
    lab[i * 3] = 116 * fy - 16;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

const dE = (lab, i, L, a, b) => Math.hypot(lab[i * 3] - L, lab[i * 3 + 1] - a, lab[i * 3 + 2] - b);
// Odległość globalna tolerancyjna na jasność — cienie i plamy światła zostają w obszarze.
const dEshade = (lab, i, L, a, b) => Math.hypot(0.7 * (lab[i * 3] - L), lab[i * 3 + 1] - a, lab[i * 3 + 2] - b);

function median(values) {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/**
 * Rozrost regionu: piksel dołącza, gdy jest bliski sąsiadowi (lokalnie), kolorowi
 * punktów startowych (globalnie, bez dryfu średniej) i nie leży na silnej krawędzi.
 */
function grow(lab, w, h, seeds, { local, global, exclude, edges, edgeMax = 14 }) {
  const mask = new Uint8Array(w * h);
  if (!seeds.length) return mask;
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  let L0 = 0, a0 = 0, b0 = 0;
  for (const i of seeds) { L0 += lab[i * 3]; a0 += lab[i * 3 + 1]; b0 += lab[i * 3 + 2]; }
  L0 /= seeds.length; a0 /= seeds.length; b0 /= seeds.length;
  let sL = 0, sa = 0, sb = 0, n = 0;
  for (const i of seeds) {
    if (mask[i] || exclude?.[i]) continue;
    mask[i] = 1; queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    sL += lab[i * 3]; sa += lab[i * 3 + 1]; sb += lab[i * 3 + 2]; n++;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of nb) {
      if (j < 0 || j >= w * h || mask[j] || exclude?.[j]) continue;
      if (edges && edges[j] > edgeMax) continue;
      if (dE(lab, j, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]) > local) continue;
      if (dEshade(lab, j, L0, a0, b0) > global) continue;
      mask[j] = 1; queue[tail++] = j;
    }
  }
  mask.mean = n ? [sL / n, sa / n, sb / n] : null;
  return mask;
}

/** Siła krawędzi (Sobel na L*) — bariera dla rozrostu regionów. */
function edgeMap(lab, w, h) {
  const e = new Float32Array(w * h);
  const L = (x, y) => lab[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1);
    const gy = L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1);
    e[y * w + x] = Math.hypot(gx, gy) / 4;
  }
  return e;
}

function pickSeeds(lab, w, points, maxDist) {
  const idx = points.map(([x, y]) => Math.round(y) * w + Math.round(x));
  const L = median(idx.map((i) => lab[i * 3]));
  const a = median(idx.map((i) => lab[i * 3 + 1]));
  const b = median(idx.map((i) => lab[i * 3 + 2]));
  const near = idx.filter((i) => dE(lab, i, L, a, b) < maxDist);
  return near.length >= 3 ? near : idx;
}

function growFloor(lab, w, h, edges) {
  const top = new Uint8Array(w * h);
  top.fill(1, 0, Math.floor(h * FLOOR_TOP_LIMIT) * w);
  const pts = [];
  for (let y = h * 0.8; y < h * 0.97; y += h * 0.04) for (let x = w * 0.3; x <= w * 0.7; x += w * 0.05) pts.push([x, y]);
  const main = grow(lab, w, h, pickSeeds(lab, w, pts, 15), { local: 5, global: 15, edges, edgeMax: 10, exclude: top });
  // Boczne fragmenty podłogi (np. przedzielone meblem) — dołączane, gdy kolor zgodny.
  for (const fx of [0.1, 0.9]) {
    const side = [];
    for (let y = h * 0.82; y < h * 0.97; y += h * 0.05) side.push([w * fx, y]);
    const seeds = pickSeeds(lab, w, side, 12).filter((i) => !main[i]);
    if (!seeds.length || !main.mean) continue;
    const excl = Uint8Array.from(main, (v, i) => v | top[i]);
    const extra = grow(lab, w, h, seeds, { local: 5, global: 14, exclude: excl, edges, edgeMax: 10 });
    if (extra.mean && Math.hypot(...extra.mean.map((v, k) => v - main.mean[k])) < 16) {
      for (let i = 0; i < main.length; i++) main[i] |= extra[i];
    }
  }
  return main;
}

function growWalls(lab, w, h, floor, edges) {
  const pts = [];
  for (let k = 1; k < 10; k++) {
    const x = Math.round((w * k) / 10);
    let top = h;
    for (let y = 0; y < h; y++) if (floor[y * w + x]) { top = y; break; }
    if (top === h) top = Math.round(h * 0.65);
    for (const d of [0.08, 0.18, 0.3]) {
      const y = top - h * d;
      if (y > h * 0.05) pts.push([x, y]);
    }
  }
  if (!pts.length) return new Uint8Array(w * h);
  return grow(lab, w, h, pickSeeds(lab, w, pts, 18), { local: 5, global: 16, exclude: floor, edges, edgeMax: 7 });
}

function morph(m, w, h, r, dilate) {
  const tmp = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let k = -r; k <= r; k++) {
      const xx = Math.min(w - 1, Math.max(0, x + k));
      v = dilate ? v | m[y * w + xx] : v & m[y * w + xx];
    }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let k = -r; k <= r; k++) {
      const yy = Math.min(h - 1, Math.max(0, y + k));
      v = dilate ? v | tmp[yy * w + x] : v & tmp[yy * w + x];
    }
    m[y * w + x] = v;
  }
}

function close(m, w, h, r) {
  morph(m, w, h, r, true);
  morph(m, w, h, r, false);
}

/** Wypełnia małe dziury (szum tekstury); duże zostają — to przeszkody, np. meble. */
function fillHoles(m, w, h, maxFrac) {
  const seen = new Uint8Array(m.length);
  const stack = [];
  const limit = maxFrac * w * h;
  for (let s = 0; s < m.length; s++) {
    if (m[s] || seen[s]) continue;
    const comp = [];
    let border = false;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !m[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!border && comp.length < limit) for (const i of comp) m[i] = 1;
  }
}

/** Trapez perspektywy z krawędzi maski podłogi (kolejność: LD, PD, PG, LG). */
export function estimateQuad(floor, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (floor[y * w + x]) { if (l < 0) l = x; r = x; }
    if (l >= 0 && r - l > w * 0.08) rows.push({ y, l, r });
  }
  if (rows.length < h * 0.08) {
    return [[w * 0.05, h * 0.95], [w * 0.95, h * 0.95], [w * 0.72, h * 0.6], [w * 0.28, h * 0.6]];
  }
  const yb = rows[rows.length - 1].y;
  const maxW = Math.max(...rows.map((r) => r.r - r.l));
  const yt = rows.find((r) => r.r - r.l > maxW * 0.35)?.y ?? rows[0].y;
  const fit = (pts) => {
    if (pts.length < 8) return null;
    const n = pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
    const a = den ? num / den : 0;
    return (y) => mx + a * (y - my);
  };
  const band = rows.filter((r) => r.y >= yt);
  const left = fit(band.filter((r) => r.l > 2).map((r) => [r.l, r.y]));
  const right = fit(band.filter((r) => r.r < w - 3).map((r) => [r.r, r.y]));
  const bl = band[band.length - 1].l, br = band[band.length - 1].r;
  const cx = (bl + br) / 2;
  const half = (br - bl) / 2;
  let lb = left ? left(yb) : bl, lt = left ? left(yt) : cx - half * 0.62;
  let rb = right ? right(yb) : br, rt = right ? right(yt) : cx + half * 0.62;
  if (!(lt > lb) || !(rt < rb) || rt - lt < (rb - lb) * 0.2) {
    lt = cx - half * 0.62; rt = cx + half * 0.62; lb = bl; rb = br;
  }
  const clampX = (x) => Math.min(w, Math.max(0, x));
  return [[clampX(lb), yb], [clampX(rb), yb], [clampX(rt), yt], [clampX(lt), yt]];
}

/** Przybliżony kierunek dominującego źródła światła (centroid najjaśniejszych pikseli). */
function estimateLight(rgba, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  const thr = [...lum].sort((a, b) => b - a)[Math.floor(lum.length * 0.03)];
  let sx = 0, n = 0;
  for (let i = 0; i < lum.length; i++) if (lum[i] >= thr) { sx += i % w; n++; }
  const cx = n ? sx / n / w : 0.5;
  return { side: cx < 0.38 ? 'z lewej' : cx > 0.62 ? 'z prawej' : 'z przodu/góry', x: cx };
}
