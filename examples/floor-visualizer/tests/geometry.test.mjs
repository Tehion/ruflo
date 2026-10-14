// Testy jednostkowe czystej logiki (bez DOM): node --test examples/floor-visualizer/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveHomography, invert3, applyH, floorHomography, isConvexQuad, frameQuad, pointInPolygon } from '../js/geometry.js';
import { History, defaultSettings, setPath, getPath } from '../js/store.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('homografia odwzorowuje 4 punkty i jest odwracalna', () => {
  const src = [[0, 0], [3, 0], [3, 4], [0, 4]];
  const dst = [[100, 900], [1500, 900], [1100, 500], [500, 500]];
  const H = solveHomography(src, dst);
  src.forEach((p, i) => {
    const [x, y] = applyH(H, ...p);
    close(x, dst[i][0]); close(y, dst[i][1]);
  });
  const inv = invert3(H);
  const [u, v] = applyH(inv, ...applyH(H, 1.2, 2.7));
  close(u, 1.2); close(v, 2.7);
});

test('perspektywa: środek prostokąta podłogi leży bliżej dalszej krawędzi', () => {
  const quad = [[0, 1000], [1600, 1000], [1200, 600], [400, 600]];
  const H = floorHomography(quad, 3, 4);
  const [, y] = applyH(H, 1.5, 2);
  assert.ok(y < 800, 'połowa głębokości powinna być powyżej połowy wysokości trapezu');
});

test('zdegenerowany układ zwraca null', () => {
  assert.equal(solveHomography([[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]), null);
});

test('wypukłość czworokąta i punkt w wielokącie', () => {
  assert.ok(isConvexQuad([[0, 0], [10, 0], [10, 10], [0, 10]]));
  assert.ok(!isConvexQuad([[0, 0], [10, 0], [2, 2], [0, 10]]));
  assert.ok(pointInPolygon(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]));
  assert.ok(!pointInPolygon(15, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]));
});

test('framuga obejmuje drzwi z boków i od góry, nie od dołu', () => {
  const door = [[100, 100], [200, 100], [200, 400], [100, 400]];
  const f = frameQuad(door, 0.1);
  close(f[0][0], 90); close(f[1][0], 210);
  close(f[0][1], 90); close(f[2][1], 400);
});

test('historia: cofnij/ponów i obcinanie gałęzi', () => {
  const h = new History(3);
  h.reset('a'); h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b');
  h.push('d');
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), 'b');
  assert.equal(h.redo(), 'd');
  h.push('e'); h.push('f');
  assert.equal(h.stack.length, 3);
});

test('setPath nie modyfikuje oryginału', () => {
  const s = defaultSettings();
  const t = setPath(s, 'wall.color', '#000000');
  assert.equal(getPath(t, 'wall.color'), '#000000');
  assert.notEqual(s.wall.color, '#000000');
});
