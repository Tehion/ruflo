// Wiązanie kontrolek paneli „Ułożenie”, „Wnętrze” i „Obszary” ze stanem aplikacji.
import { PATTERNS, getProduct, getVariant } from './catalog-data.js';
import { getPath } from './store.js';

const $ = (id) => document.getElementById(id);
const WALL_COLORS = ['#f4f1ec', '#e9e4da', '#dcd6cb', '#cfd4cc', '#b9c6cb', '#a8b59f', '#d9c3a3', '#c7a99a', '#8e9aa6', '#5d6872', '#3d4a58', '#2f3a33'];
const WOOD_COLORS = ['#ffffff', '#f1eee8', '#d8d3cb', '#9b958c', '#4a4744', '#1f1f1f', '#d1ad82', '#a57a50', '#6b4a30', '#46301f'];

const FORMAT = {
  angle: (v) => `${Math.round(v)}°`,
  scale: (v) => `${Math.round(v * 100)}%`,
  intensity: (v) => `${Math.round(v * 100)}%`,
  shadow: (v) => `${Math.round(v * 100)}%`,
  'frame.width': (v) => `${Math.round(v * 100)}% szer. drzwi`,
  'light.brightness': (v) => `${Math.round(v * 100)}%`,
  'light.temperature': (v) => (Math.abs(v) < 0.02 ? 'neutralna' : v > 0 ? `cieplej ${Math.round(v * 100)}%` : `chłodniej ${Math.round(-v * 100)}%`),
  'light.contrast': (v) => `${Math.round(v * 100)}%`,
};

const TOOL_HINTS = {
  masks: 'Podgląd wykrytych obszarów — wybierz narzędzie, aby je poprawić.',
  'floor-add': 'Maluj po obszarach, które są podłogą, a nie zostały wykryte.',
  'floor-erase': 'Zamaluj meble, dywany i inne przedmioty — zostaną nad nową podłogą.',
  'poly-add': 'Klikaj kolejne narożniki podłogi. Zamknij klikając pierwszy punkt, dwuklikiem lub Enter. Esc anuluje.',
  'poly-sub': 'Obrysuj przedmiot (np. szafkę), aby wyciąć go z podłogi.',
  'wall-add': 'Dopnij fragmenty ścian do zmiany koloru.',
  'wall-erase': 'Usuń z obszaru ścian obrazy, okna, meble.',
  quad: 'Przeciągnij narożniki tak, by siatka biegła równolegle do ścian i listew. Przeciągnij środek, aby przesunąć całość.',
  doors: 'Przeciągnij narożniki niebieskiego prostokąta do krawędzi skrzydła drzwi. Przerywana linia to framuga.',
  view: '',
};

export function initControls(app) {
  // Wzory ułożenia
  $('patternChips').innerHTML = PATTERNS.map((p) => `<button class="chip" data-pattern="${p.id}">${p.name}</button>`).join('');
  $('patternChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pattern]');
    if (b) app.set('pattern', b.dataset.pattern, true);
  });
  document.querySelectorAll('[data-angle]').forEach((b) => b.addEventListener('click', () => app.set('angle', +b.dataset.angle, true)));

  // Palety kolorów
  document.querySelectorAll('[data-colors]').forEach((box) => {
    const path = box.dataset.colors;
    const colors = path.startsWith('wall') ? WALL_COLORS : WOOD_COLORS;
    box.innerHTML = colors.map((c) => `<button style="background:${c}" data-color="${c}" aria-label="Kolor ${c}"></button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      const section = path.split('.')[0];
      app.set(`${section}.enabled`, true);
      app.set(path, b.dataset.color, true);
    });
  });

  // Wybory segmentowe
  document.querySelectorAll('[data-choice]').forEach((box) => {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      const section = box.dataset.choice.split('.')[0];
      app.set(`${section}.enabled`, true);
      app.set(box.dataset.choice, b.dataset.value, true);
    });
  });

  // Ogólne pola formularza
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const path = el.dataset.bind;
    const read = () => {
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'range' || el.type === 'number') return Number(el.value);
      return el.value;
    };
    const valid = (v) => typeof v !== 'number' || (Number.isFinite(v) && (el.min === '' || v >= +el.min) && (el.max === '' || v <= +el.max));
    if (el.type === 'range' || el.type === 'color') el.addEventListener('input', () => app.set(path, read(), false));
    el.addEventListener('change', () => {
      const v = read();
      if (!valid(v)) {
        app.toast(`Wartość poza zakresem (${el.min}–${el.max}).`, true);
        el.value = getPath(app.settings, path);
        return;
      }
      const section = path.split('.')[0];
      if (path.endsWith('.color') || path.endsWith('.style')) app.set(`${section}.enabled`, true);
      app.set(path, v, true);
    });
  });

  // Narzędzia edycji
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    if (b.closest('[data-panel="layout"]')) app.selectTab('areas');
    app.setTool(b.dataset.tool);
  }));
  document.querySelector('[data-goto="areas-doors"]').addEventListener('click', (e) => {
    e.preventDefault();
    app.selectTab('areas');
    app.setTool('doors');
  });
  $('brushSize').addEventListener('input', () => { $('brushOut').textContent = `${$('brushSize').value} px`; app.editor.draw(); });
  $('brushOut').textContent = `${$('brushSize').value} px`;

  $('currentProduct').addEventListener('click', (e) => {
    const b = e.target.closest('[data-variant]');
    if (b) app.set('variantId', b.dataset.variant, true);
  });

  return {
    sync() {
      const s = app.settings;
      document.querySelectorAll('[data-bind]').forEach((el) => {
        const v = getPath(s, el.dataset.bind);
        if (el.type === 'checkbox') el.checked = !!v;
        else if (document.activeElement !== el) el.value = v;
      });
      document.querySelectorAll('output[data-for]').forEach((o) => {
        const f = FORMAT[o.dataset.for];
        o.textContent = f ? f(getPath(s, o.dataset.for)) : getPath(s, o.dataset.for);
      });
      document.querySelectorAll('[data-pattern]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pattern === s.pattern));
      document.querySelectorAll('[data-angle]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.angle === s.angle));
      document.querySelectorAll('[data-choice]').forEach((box) => {
        const v = getPath(s, box.dataset.choice);
        box.querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === v));
      });
      document.querySelectorAll('[data-colors]').forEach((box) => {
        const v = getPath(s, box.dataset.colors);
        box.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === v));
      });
      document.querySelectorAll('[data-needs-doors]').forEach((p) => { p.hidden = s.doors.length > 0; });
      const p = getProduct(s.productId);
      const v = getVariant(p, s.variantId);
      $('currentProduct').innerHTML = p
        ? `<img alt="" src="${app.swatch.thumb(p.id, v.id, p.defaultPattern, 112)}"><div><strong>${p.name}</strong><div class="muted small">${p.manufacturer} · ${p.size.l}×${p.size.w} mm</div>
           <div class="chips" style="margin-top:6px">${p.variants.map((x) => `<button class="chip variant-chip" data-variant="${x.id}" aria-pressed="${x.id === v.id}"><i style="background:linear-gradient(135deg, ${x.light}, ${x.dark})"></i>${x.name}</button>`).join('')}</div></div>`
        : '<p class="muted small">Wybierz panel w zakładce „Panele”.</p>';
    },
    syncTool(tool) {
      document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
      $('toolHint').textContent = TOOL_HINTS[tool] ?? '';
    },
    drawTopView() {
      if (!app.settings.productId) return;
      app.swatch.draw($('topView'), { ...app.settings, light: { brightness: 1, temperature: 0, contrast: 1 } }, 4);
    },
  };
}
