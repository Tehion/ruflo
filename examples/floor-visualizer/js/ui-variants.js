// Warianty aranżacji: zapis, zastosowanie, porównanie obok siebie i suwakiem.
import { MAX_VARIANTS, clone } from './store.js';
import { getProduct, getVariant, PATTERNS } from './catalog-data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function describe(settings) {
  const p = getProduct(settings.productId);
  if (!p) return 'Bez zmiany podłogi';
  const v = getVariant(p, settings.variantId);
  const pat = PATTERNS.find((x) => x.id === settings.pattern)?.name ?? '';
  return `${p.name} · ${v.name} · ${pat}`;
}

function thumbOf(canvas, width = 360) {
  const c = Object.assign(document.createElement('canvas'), { width, height: Math.round((canvas.height / canvas.width) * width) });
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export function initVariants(app) {
  const letter = (i) => String.fromCharCode(65 + i);

  function render() {
    const list = $('variantList');
    list.innerHTML = app.variants.length
      ? app.variants.map((v, i) => `
        <li>
          <img src="${v.thumb}" alt="Miniatura wariantu ${esc(v.name)}">
          <div>
            <strong>${esc(v.name)}</strong>
            <div class="muted small">${esc(describe(v.settings))}</div>
            <div class="acts">
              <button class="btn small" data-act="apply" data-i="${i}">Zastosuj</button>
              <button class="btn small" data-act="split" data-i="${i}">Suwak z bieżącym</button>
              <button class="btn small ghost" data-act="del" data-i="${i}" aria-label="Usuń wariant ${esc(v.name)}">Usuń</button>
            </div>
          </div>
        </li>`).join('')
      : '<li class="muted small" style="display:block">Brak wariantów. Ustaw podłogę i kolory, a potem zapisz je jako wariant.</li>';
    $('btnAddVariant').disabled = app.variants.length >= MAX_VARIANTS;
    $('btnCompareGrid').disabled = app.variants.length < 1;
    const sel = $('splitLeft');
    const cur = sel.value;
    sel.innerHTML = '<option value="original">Lewa: oryginał</option>' +
      app.variants.map((v, i) => `<option value="${i}">Lewa: ${esc(v.name)}</option>`).join('');
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'original';
  }

  function add() {
    if (app.variants.length >= MAX_VARIANTS) return app.toast(`Można zapisać maks. ${MAX_VARIANTS} warianty.`, true);
    const used = new Set(app.variants.map((v) => v.name));
    let i = 0;
    while (used.has(`Wariant ${letter(i)}`)) i++;
    const settings = clone(app.settings);
    app.variants.push({ id: crypto.randomUUID(), name: `Wariant ${letter(i)}`, settings, thumb: thumbOf(app.renderToCanvas(settings)) });
    render();
    app.toast(`Zapisano wariant ${letter(i)}.`);
  }

  async function grid() {
    const box = $('compareGrid');
    const items = [{ name: 'Oryginał', img: thumbOf(app.work, 900), desc: 'Zdjęcie bez zmian' },
      ...app.variants.map((v) => ({ name: v.name, img: thumbOf(app.renderToCanvas(app.withGeometry(v.settings)), 900), desc: describe(v.settings) })),
      { name: 'Bieżący', img: thumbOf(app.renderToCanvas(app.settings), 900), desc: describe(app.settings) }];
    box.innerHTML = items.map((x) => `<figure><img src="${x.img}" alt="${esc(x.name)}"><figcaption><strong>${esc(x.name)}</strong> — ${esc(x.desc)}</figcaption></figure>`).join('');
    $('compareDialog').showModal();
  }

  $('btnAddVariant').addEventListener('click', add);
  $('btnCompareGrid').addEventListener('click', grid);
  $('compareDialog').querySelector('[data-close]').addEventListener('click', () => $('compareDialog').close());
  $('variantList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i;
    const v = app.variants[i];
    if (b.dataset.act === 'apply') {
      app.replaceSettings(app.withGeometry(v.settings));
      app.toast(`Zastosowano: ${v.name}`);
    } else if (b.dataset.act === 'split') {
      $('splitLeft').value = String(i);
      app.setSplit(true);
    } else if (b.dataset.act === 'del') {
      app.variants.splice(i, 1);
      $('splitLeft').value = 'original';
      render();
      app.refreshSplitLeft();
    }
  });
  render();
  return { render };
}
