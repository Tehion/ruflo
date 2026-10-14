// Stan aranżacji + historia (Cofnij/Ponów) oparta na niezmiennych migawkach.

export const MAX_HISTORY = 25;
export const MAX_VARIANTS = 4;

export function defaultSettings() {
  return {
    productId: null,
    variantId: null,
    pattern: 'straight', // straight | brick | herringbone | chevron
    angle: 0, // stopnie, 0 = deski w poprzek kadru, 90 = w głąb pomieszczenia
    scale: 1,
    intensity: 1,
    shadow: 0.85,
    realistic: true,
    refSize: { w: 3, d: 4 }, // wymiary prostokąta referencyjnego (m)
    quad: null, // [[x,y] x4] w pikselach obrazu roboczego
    wall: { enabled: false, color: '#e9e4da', finish: 'mat' },
    door: { enabled: false, color: '#f4f2ee', style: 'original', material: 'paint' },
    frame: { enabled: false, color: '#f4f2ee', material: 'paint', width: 0.08 },
    doors: [], // [[x,y] x4]: lewy-górny, prawy-górny, prawy-dolny, lewy-dolny
    light: { brightness: 1, temperature: 0, contrast: 1 },
  };
}

export const clone = (o) => structuredClone(o);

/** Ustawia wartość pod ścieżką 'a.b.c' w kopii obiektu. */
export function setPath(obj, path, value) {
  const out = clone(obj);
  const keys = path.split('.');
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return out;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/**
 * Historia migawek { settings, layers }. `layers` to referencja do niezmiennych
 * buforów masek — współdzielona między wpisami, dopóki maska się nie zmieni.
 */
export class History {
  constructor(limit = MAX_HISTORY) {
    this.limit = limit;
    this.stack = [];
    this.index = -1;
  }
  reset(snapshot) {
    this.stack = [snapshot];
    this.index = 0;
  }
  push(snapshot) {
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }
  current() {
    return this.stack[this.index] ?? null;
  }
  canUndo() {
    return this.index > 0;
  }
  canRedo() {
    return this.index < this.stack.length - 1;
  }
  undo() {
    return this.canUndo() ? this.stack[--this.index] : null;
  }
  redo() {
    return this.canRedo() ? this.stack[++this.index] : null;
  }
}
