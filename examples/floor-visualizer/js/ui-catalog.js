// Katalog paneli: wyszukiwarka, filtry, sortowanie, ulubione, karta produktu.
import { PRODUCTS, FILTERS, PATTERNS, manufacturers, getProduct, getVariant, variantLightness } from './catalog-data.js';

const FAV_KEY = 'floorvis:favorites';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveFavorites(set) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
  } catch { /* tryb prywatny — ulubione działają do końca sesji */ }
}

function fillSelect(sel, label, values) {
  sel.innerHTML = `<option value="">${label}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v[0].toUpperCase() + v.slice(1))}</option>`).join('');
}

export function initCatalog(app) {
  const favorites = loadFavorites();
  fillSelect($('fFamily'), 'Każdy kolor', FILTERS.family);
  fillSelect($('fStyle'), 'Każdy styl', FILTERS.style);
  fillSelect($('fMaker'), 'Każdy producent', manufacturers());
  fillSelect($('fFormat'), 'Każdy format', FILTERS.formatType);

  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      img.src = app.swatch.thumb(img.dataset.p, img.dataset.v, img.dataset.pat);
      observer.unobserve(img);
    }
  }, { rootMargin: '200px' });

  function query() {
    const q = $('q').value.trim().toLowerCase();
    const family = $('fFamily').value;
    const style = $('fStyle').value;
    const maker = $('fMaker').value;
    const format = $('fFormat').value;
    const favOnly = $('fFav').checked;
    let list = PRODUCTS.filter((p) =>
      (!q || `${p.name} ${p.manufacturer} ${p.collection} ${p.variants.map((v) => v.name).join(' ')}`.toLowerCase().includes(q)) &&
      (!family || p.variants.some((v) => v.family === family)) &&
      (!style || p.style === style) &&
      (!maker || p.manufacturer === maker) &&
      (!format || p.formatType === format) &&
      (!favOnly || favorites.has(p.id)));
    const light = (p) => Math.max(...p.variants.map(variantLightness));
    const sorters = {
      pop: (a, b) => b.popularity - a.popularity,
      name: (a, b) => a.name.localeCompare(b.name, 'pl'),
      light: (a, b) => light(b) - light(a),
      dark: (a, b) => light(a) - light(b),
      len: (a, b) => b.size.l - a.size.l,
    };
    list = [...list].sort(sorters[$('fSort').value]);
    return list.map((p) => ({ p, v: p.variants.find((x) => !family || x.family === family) ?? p.variants[0] }));
  }

  function renderList() {
    const items = query();
    $('resultCount').textContent = items.length ? `Znaleziono: ${items.length}` : 'Brak paneli spełniających kryteria — zmień filtry.';
    const cards = $('cards');
    cards.innerHTML = items.map(({ p, v }) => `
      <div class="card ${app.settings.productId === p.id ? 'active' : ''}" role="button" tabindex="0" data-id="${p.id}" data-v="${v.id}">
        <img alt="" data-p="${p.id}" data-v="${v.id}" data-pat="${p.defaultPattern}">
        <button class="fav" data-fav="${p.id}" aria-label="${favorites.has(p.id) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id) ? '♥' : '♡'}</button>
        <div class="body">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${esc(p.manufacturer)} · ${esc(p.collection)}</div>
          <div class="sub">${p.size.l}×${p.size.w} mm · ${p.variants.length} odc.</div>
        </div>
      </div>`).join('');
    cards.querySelectorAll('img').forEach((img) => observer.observe(img));
  }

  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites(favorites);
  }

  function showDetail(id, variantId) {
    const p = getProduct(id);
    const v = getVariant(p, variantId);
    const box = $('productDetail');
    const rows = [
      ['Producent', p.manufacturer], ['Kolekcja', p.collection],
      ['Wymiary', `${p.size.l} × ${p.size.w} × ${p.size.t} mm`], ['Format', p.formatType],
      ['Wykończenie', p.finish], ['Struktura powierzchni', p.surface],
      ['Fazowanie', p.bevel ? '4V' : 'brak'], ['Klasa ścieralności', p.wearClass], ['Styl', p.style],
      ['Zalecany wzór', PATTERNS.find((x) => x.id === p.defaultPattern)?.name],
    ];
    box.innerHTML = `
      <button class="btn small ghost" data-back>← Wróć do katalogu</button>
      <h2 style="margin-top:10px">${esc(p.name)}</h2>
      <p class="muted small">${esc(p.manufacturer)} · kolekcja ${esc(p.collection)}</p>
      <img class="detail-hero" alt="Podgląd tekstury ${esc(p.name)} – ${esc(v.name)}" src="${app.swatch.thumb(p.id, v.id, p.defaultPattern, 480)}">
      <h3>Odcień</h3>
      <div class="chips">${p.variants.map((x) => `<button class="chip variant-chip" data-variant="${x.id}" aria-pressed="${x.id === v.id}"><i style="background:linear-gradient(135deg, ${x.light}, ${x.dark})"></i>${esc(x.name)}</button>`).join('')}</div>
      <table class="specs">${rows.map(([k, val]) => `<tr><th>${k}</th><td>${esc(val)}</td></tr>`).join('')}</table>
      <div class="row wrap">
        <button class="btn primary" data-apply>Zastosuj w pomieszczeniu</button>
        <button class="btn" data-fav-detail aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id) ? '♥ W ulubionych' : '♡ Do ulubionych'}</button>
      </div>`;
    $('catalogList').hidden = true;
    box.hidden = false;
    box.onclick = (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.back !== undefined) { box.hidden = true; $('catalogList').hidden = false; renderList(); }
      else if (t.dataset.variant) showDetail(id, t.dataset.variant);
      else if (t.dataset.apply !== undefined) app.applyProduct(id, v.id);
      else if (t.dataset.favDetail !== undefined) { toggleFavorite(id); showDetail(id, v.id); }
    };
  }

  $('cards').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      toggleFavorite(fav.dataset.fav);
      renderList();
      return;
    }
    const card = e.target.closest('.card');
    if (card) showDetail(card.dataset.id, card.dataset.v);
  });
  $('cards').addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
      e.preventDefault();
      showDetail(card.dataset.id, card.dataset.v);
    }
  });
  ['q', 'fFamily', 'fStyle', 'fMaker', 'fFormat', 'fSort', 'fFav'].forEach((id) => $(id).addEventListener('input', renderList));
  renderList();
  return { refresh: renderList };
}
