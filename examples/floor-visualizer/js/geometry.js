// Geometria płaszczyzn: homografia 4-punktowa, macierze 3x3, wielokąty.
// Macierze są w układzie wierszowym [a,b,c, d,e,f, g,h,i].

/** Rozwiązuje H tak, by dst ≈ H·src dla 4 par punktów. Zwraca null dla układu zdegenerowanego. */
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = gaussSolve(A, b);
  return h ? [...h, 1] : null;
}

function gaussSolve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

export function applyH(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** GLSL oczekuje macierzy kolumnowej. */
export function toGLMat3(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % 4];
    const [cx, cy] = q[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/**
 * Homografia podłogi: prostokąt referencyjny (metry) → czworokąt na zdjęciu.
 * Kolejność wierzchołków quad: lewy-dolny, prawy-dolny, prawy-górny, lewy-górny.
 */
export function floorHomography(quad, widthM, depthM) {
  const rect = [[0, 0], [widthM, 0], [widthM, depthM], [0, depthM]];
  return solveHomography(rect, quad);
}

/** Drzwi: kwadrat jednostkowy (0,0)=lewy-górny … (0,1)=lewy-dolny → czworokąt na zdjęciu. */
export function doorHomography(quad) {
  return solveHomography([[0, 0], [1, 0], [1, 1], [0, 1]], quad);
}

/** Obrys ościeżnicy: drzwi poszerzone o `t` (ułamek szerokości) po bokach i u góry. */
export function frameQuad(doorQuad, t) {
  const H = doorHomography(doorQuad);
  if (!H) return doorQuad;
  const [tl, tr, br, bl] = doorQuad;
  const wPx = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const hPx = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) || 1;
  const tv = (t * wPx) / hPx;
  return [[-t, -tv], [1 + t, -tv], [1 + t, 1], [-t, 1]].map(([u, v]) => applyH(H, u, v));
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(poly) {
  const n = poly.length;
  return poly.reduce(([sx, sy], [x, y]) => [sx + x / n, sy + y / n], [0, 0]);
}
