// Nakładka edycji: uchwyty perspektywy, pędzel/gumka masek, wielokąt, drzwi.
import { floorHomography, applyH, pointInPolygon, isConvexQuad, frameQuad } from './geometry.js';

export const TOOLS = {
  view: 'Podgląd',
  masks: 'Podgląd obszarów',
  quad: 'Perspektywa',
  'floor-add': 'Pędzel: podłoga',
  'floor-erase': 'Gumka: podłoga',
  'wall-add': 'Pędzel: ściany',
  'wall-erase': 'Gumka: ściany',
  'poly-add': 'Wielokąt: dodaj podłogę',
  'poly-sub': 'Wielokąt: wytnij z podłogi',
  doors: 'Drzwi i framugi',
};

const TINT = { floor: 'rgba(37, 117, 252, 0.42)', wall: 'rgba(245, 150, 40, 0.38)' };

export class Editor {
  /**
   * @param canvas nakładka o rozmiarze obrazu roboczego
   * @param host   { settings(), scene(), setQuad(q, commit), setDoors(d, commit), maskEdited(), brush() }
   */
  constructor(canvas, host) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.host = host;
    this.tool = 'view';
    this.poly = [];
    this.drag = null;
    this.hover = null;
    this.selectedDoor = -1;
    this.tints = {};
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    canvas.addEventListener('pointerup', (e) => this.#up(e));
    canvas.addEventListener('pointercancel', (e) => this.#up(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('dblclick', () => this.closePolygon());
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.draw();
  }

  setTool(tool) {
    this.tool = tool;
    this.poly = [];
    const passive = tool === 'view' || tool === 'masks';
    this.canvas.style.touchAction = passive ? 'auto' : 'none';
    this.canvas.style.pointerEvents = passive ? 'none' : 'auto';
    this.canvas.dataset.tool = tool;
    this.invalidateMasks();
  }

  invalidateMasks() {
    this.tints = {};
    this.draw();
  }

  get #px() {
    const r = this.canvas.getBoundingClientRect();
    return r.width ? this.canvas.width / r.width : 1;
  }

  #pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (this.canvas.width / r.width), (e.clientY - r.top) * (this.canvas.height / r.height)];
  }

  #nearest(points, p, radius) {
    let best = -1;
    let bd = radius;
    points.forEach(([x, y], i) => {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  #down(e) {
    if (this.tool === 'view') return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.#pos(e);
    const hit = 24 * this.#px;
    const s = this.host.settings();
    if (this.tool === 'quad' && s.quad) {
      const i = this.#nearest(s.quad, p, hit);
      if (i >= 0) this.drag = { kind: 'quad-pt', i };
      else if (pointInPolygon(p[0], p[1], s.quad)) this.drag = { kind: 'quad-all', last: p };
    } else if (this.tool === 'doors') {
      this.drag = null;
      s.doors.forEach((q, d) => {
        if (this.drag) return;
        const i = this.#nearest(q, p, hit);
        if (i >= 0) this.drag = { kind: 'door-pt', d, i };
      });
      if (!this.drag) {
        const d = s.doors.findIndex((q) => pointInPolygon(p[0], p[1], q));
        if (d >= 0) this.drag = { kind: 'door-all', d, last: p };
      }
      this.selectedDoor = this.drag ? this.drag.d : -1;
    } else if (this.tool.startsWith('poly')) {
      if (this.poly.length >= 3 && Math.hypot(p[0] - this.poly[0][0], p[1] - this.poly[0][1]) < hit) this.closePolygon();
      else this.poly.push(p);
    } else {
      this.drag = { kind: 'brush', last: p };
      this.#paint(p, p);
    }
    this.draw();
  }

  #move(e) {
    const p = this.#pos(e);
    this.hover = p;
    const dr = this.drag;
    if (!dr) return this.draw();
    const s = this.host.settings();
    if (dr.kind === 'quad-pt' || dr.kind === 'quad-all') {
      const q = s.quad.map((pt) => [...pt]);
      if (dr.kind === 'quad-pt') q[dr.i] = p;
      else { q.forEach((pt) => { pt[0] += p[0] - dr.last[0]; pt[1] += p[1] - dr.last[1]; }); dr.last = p; }
      if (isConvexQuad(q)) this.host.setQuad(q, false);
    } else if (dr.kind === 'door-pt' || dr.kind === 'door-all') {
      const doors = s.doors.map((q) => q.map((pt) => [...pt]));
      const q = doors[dr.d];
      if (dr.kind === 'door-pt') q[dr.i] = p;
      else { q.forEach((pt) => { pt[0] += p[0] - dr.last[0]; pt[1] += p[1] - dr.last[1]; }); dr.last = p; }
      if (isConvexQuad(q)) this.host.setDoors(doors, false);
    } else if (dr.kind === 'brush') {
      this.#paint(dr.last, p);
      dr.last = p;
    }
    this.draw();
  }

  #up() {
    const dr = this.drag;
    this.drag = null;
    if (!dr) return;
    const s = this.host.settings();
    if (dr.kind.startsWith('quad')) this.host.setQuad(s.quad, true);
    else if (dr.kind.startsWith('door')) this.host.setDoors(s.doors, true);
    else if (dr.kind === 'brush') this.host.maskEdited();
    this.draw();
  }

  #paint(a, b) {
    const scene = this.host.scene();
    const layer = this.tool.startsWith('floor') ? 'floor' : 'wall';
    const ctx = scene.ctx(layer);
    ctx.save();
    ctx.globalCompositeOperation = this.tool.endsWith('erase') ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = this.host.brush() * scene.k;
    ctx.beginPath();
    ctx.moveTo(a[0] * scene.k, a[1] * scene.k);
    ctx.lineTo(b[0] * scene.k + 0.01, b[1] * scene.k);
    ctx.stroke();
    ctx.restore();
    delete this.tints[layer];
  }

  closePolygon() {
    if (!this.tool.startsWith('poly') || this.poly.length < 3) return;
    const scene = this.host.scene();
    const ctx = scene.ctx('floor');
    ctx.save();
    ctx.globalCompositeOperation = this.tool === 'poly-sub' ? 'destination-out' : 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    this.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * scene.k, y * scene.k) : ctx.moveTo(x * scene.k, y * scene.k)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.poly = [];
    delete this.tints.floor;
    this.host.maskEdited();
    this.draw();
  }

  cancelPolygon() {
    this.poly = [];
    this.draw();
  }

  #tint(layer) {
    if (!this.tints[layer]) {
      const src = this.host.scene().layers[layer];
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = TINT[layer];
      ctx.fillRect(0, 0, c.width, c.height);
      this.tints[layer] = c;
    }
    return this.tints[layer];
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.tool === 'view' || !this.host.scene()) return;
    const s = this.host.settings();
    const px = this.#px;
    const t = this.tool;
    if (t === 'masks' || t.startsWith('floor') || t.startsWith('wall') || t.startsWith('poly')) {
      ctx.drawImage(this.#tint('wall'), 0, 0, canvas.width, canvas.height);
      ctx.drawImage(this.#tint('floor'), 0, 0, canvas.width, canvas.height);
    }
    if (t === 'quad' && s.quad) this.#drawQuad(s, px);
    if (t === 'doors') this.#drawDoors(s, px);
    if (t.startsWith('poly') && this.poly.length) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.beginPath();
      [...this.poly, this.hover ?? this.poly[this.poly.length - 1]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
      this.poly.forEach((p, i) => this.#handle(p, px, i === 0 ? '#2575fc' : '#fff'));
    }
    if ((t.startsWith('floor') || t.startsWith('wall')) && this.hover) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.arc(this.hover[0], this.hover[1], this.host.brush() / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #handle([x, y], px, fill = '#fff') {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(x, y, 9 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  #drawQuad(s, px) {
    const { ctx } = this;
    const { w, d } = s.refSize;
    const H = floorHomography(s.quad, w, d);
    if (H) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1 * px;
      const line = (a, b) => {
        const p = applyH(H, ...a);
        const q = applyH(H, ...b);
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      };
      for (let u = 0.5; u < w; u += 0.5) line([u, 0], [u, d]);
      for (let v = 0.5; v < d; v += 0.5) line([0, v], [w, v]);
    }
    ctx.strokeStyle = '#2575fc';
    ctx.lineWidth = 3 * px;
    ctx.beginPath();
    s.quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    s.quad.forEach((p) => this.#handle(p, px));
  }

  #drawDoors(s, px) {
    const { ctx } = this;
    s.doors.forEach((q, d) => {
      const sel = d === this.selectedDoor;
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.beginPath();
      frameQuad(q, s.frame.width).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = sel ? 'rgba(37,117,252,0.25)' : 'rgba(37,117,252,0.12)';
      ctx.strokeStyle = '#2575fc';
      ctx.lineWidth = (sel ? 3 : 2) * px;
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      q.forEach((p) => this.#handle(p, px, sel ? '#2575fc' : '#fff'));
    });
  }
}

/** Domyślne drzwi na środku kadru (LG, PG, PD, LD). */
export function defaultDoor(w, h, index = 0) {
  const cx = w * (0.5 + 0.12 * (index % 3 - 1));
  const dw = w * 0.11;
  return [[cx - dw / 2, h * 0.28], [cx + dw / 2, h * 0.28], [cx + dw / 2, h * 0.7], [cx - dw / 2, h * 0.7]];
}
