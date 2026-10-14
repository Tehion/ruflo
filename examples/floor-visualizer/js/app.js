// Orkiestracja aplikacji: stan, historia, render, import, zapis i eksport.
import { Renderer, WebGLUnavailableError } from './renderer.js';
import { SwatchRenderer } from './swatch.js';
import { buildUniforms } from './uniforms.js';
import { Scene } from './scene.js';
import { Editor, defaultDoor } from './editor.js';
import { analyzeRoom } from './segmentation.js';
import { loadImageFile, toCanvas, workingMaxSide, assessQuality, UserError } from './imageio.js';
import { History, defaultSettings, clone, setPath } from './store.js';
import { PRODUCTS, getProduct, getVariant } from './catalog-data.js';
import { initCatalog } from './ui-catalog.js';
import { initControls } from './ui-controls.js';
import { initVariants, describe } from './ui-variants.js';
import { goStep, showProcessing, hideProcessing, nextFrame } from './flow.js';
import { demoRoom } from './demo.js';
import { captureFromCamera } from './camera.js';
import * as projects from './projects.js';

const $ = (id) => document.getElementById(id);
const CAPTION = 'Wizualizacja poglądowa — kolory i skala mogą odbiegać od rzeczywistości';

class App {
  constructor() {
    this.settings = defaultSettings();
    this.history = new History();
    this.variants = [];
    this.view = { showOriginal: false, split: -1 };
    this.step = 'photo';
    this.scene = null;
    this.renderer = new Renderer($('gl'));
    this.swatch = new SwatchRenderer();
    this.editor = new Editor($('overlay'), {
      settings: () => this.settings,
      scene: () => this.scene,
      setQuad: (q, commit) => this.set('quad', q, commit),
      setDoors: (d, commit) => this.setDoors(d, commit),
      maskEdited: () => this.maskEdited(),
      brush: () => {
        const r = $('overlay').getBoundingClientRect();
        return +$('brushSize').value * ($('overlay').width / (r.width || 1));
      },
    });
    this.catalog = initCatalog(this);
    this.controls = initControls(this);
    this.variantsUi = initVariants(this);
    this.#bindUi();
    new ResizeObserver(() => this.#fit()).observe($('stage'));
    this.#listProjects();
  }

  // ---------- Stan ----------
  set(path, value, commit = false) {
    this.settings = setPath(this.settings, path, value);
    if (commit && (path === 'frame.width' || path === 'doors')) this.recompose();
    if (commit) this.commit();
    else this.requestRender();
  }

  setDoors(doors, commit) {
    this.settings = { ...this.settings, doors };
    if (commit) {
      this.recompose();
      this.commit();
    } else this.requestRender();
  }

  /** Ustawienia z wariantu z zachowaniem geometrii bieżącego zdjęcia. */
  withGeometry(s) {
    return { ...clone(s), quad: this.settings.quad, doors: this.settings.doors, refSize: this.settings.refSize };
  }

  replaceSettings(s) {
    const doorsChanged = JSON.stringify([s.doors, s.frame.width]) !== JSON.stringify([this.settings.doors, this.settings.frame.width]);
    this.settings = clone(s);
    if (doorsChanged) this.recompose();
    this.commit();
  }

  commit() {
    this.history.push({ settings: clone(this.settings), layers: this.layersRef });
    this.#afterChange();
  }

  #afterChange() {
    $('btnUndo').disabled = !this.history.canUndo();
    $('btnRedo').disabled = !this.history.canRedo();
    this.controls.sync();
    this.requestRender();
  }

  undo() { this.#restore(this.history.undo()); }
  redo() { this.#restore(this.history.redo()); }

  #restore(snap) {
    if (!snap) return;
    const geom = (s) => JSON.stringify([s.doors, s.frame.width]);
    const doorsChanged = geom(snap.settings) !== geom(this.settings);
    this.settings = clone(snap.settings);
    if (snap.layers !== this.layersRef) {
      this.scene.restoreLayers(snap.layers);
      this.layersRef = snap.layers;
      this.recompose();
    } else if (doorsChanged) this.recompose();
    this.editor.invalidateMasks();
    this.#afterChange();
    this.catalog.refresh();
  }

  maskEdited() {
    this.layersRef = this.scene.snapshotLayers();
    this.recompose();
    this.commit();
  }

  recompose() {
    const { mask, shade, w, h } = this.scene.compose(this.settings.doors, this.settings.frame.width);
    this.renderer.setMask(mask, w, h);
    this.renderer.setShade(shade, w, h);
    this.requestRender();
  }

  applyProduct(productId, variantId) {
    const p = getProduct(productId) ?? [...PRODUCTS].sort((a, b) => b.popularity - a.popularity)[0];
    const prev = getProduct(this.settings.productId);
    let s = { ...this.settings, productId: p.id, variantId: getVariant(p, variantId).id };
    // Wzór dopasowany do formatu (np. jodełka) przy zmianie typu produktu.
    if (!prev || prev.defaultPattern !== p.defaultPattern) s.pattern = p.defaultPattern;
    this.settings = s;
    this.commit();
    this.catalog.refresh();
    this.toast(`${p.name} — ${getVariant(p, s.variantId).name}`);
  }

  resetArrangement() {
    const d = defaultSettings();
    this.replaceSettings({ ...d, quad: this.settings.quad, doors: this.settings.doors, refSize: this.settings.refSize, frame: { ...d.frame, width: this.settings.frame.width } });
    this.catalog.refresh();
    this.toast('Przywrócono zdjęcie bez zmian. Obszary i perspektywa zostały zachowane.');
  }

  // ---------- Render ----------
  requestRender() {
    if (this.raf || !this.scene) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.#renderNow();
    });
  }

  #renderNow() {
    const view = { showOriginal: this.view.showOriginal, split: this.view.split };
    this.renderer.render(buildUniforms(this.settings, this.scene, view));
    this.controls.drawTopView();
    const extra = this.view.showOriginal ? ' · widok: PRZED' : this.view.split >= 0 ? ' · porównanie suwakiem' : '';
    $('status').textContent = `${describe(this.settings)}${this.settings.productId ? ` · skala ${Math.round(this.settings.scale * 100)}%` : ''}${extra}`;
    $('cornerTag').hidden = !this.view.showOriginal;
  }

  /** Render dowolnych ustawień do nowego canvasu (warianty, eksport). */
  renderToCanvas(settings) {
    this.renderer.render(buildUniforms(settings, this.scene, {}));
    const c = Object.assign(document.createElement('canvas'), { width: this.work.width, height: this.work.height });
    c.getContext('2d').drawImage($('gl'), 0, 0);
    this.requestRender();
    return c;
  }

  setView(original) {
    this.view.showOriginal = original;
    $('viewBefore').setAttribute('aria-pressed', original);
    $('viewAfter').setAttribute('aria-pressed', !original);
    this.requestRender();
  }

  setSplit(on) {
    this.view.split = on ? +$('splitRange').value : -1;
    $('btnSplit').setAttribute('aria-pressed', on);
    $('splitRange').hidden = !on;
    $('splitLeft').hidden = !on;
    if (on) {
      this.setView(false);
      this.setTool('view');
      this.refreshSplitLeft();
    }
    this.requestRender();
  }

  refreshSplitLeft() {
    const v = this.variants[+$('splitLeft').value];
    this.renderer.setLeft(v ? this.renderToCanvas(this.withGeometry(v.settings)) : null);
    this.requestRender();
  }

  #fit() {
    if (!this.work) return;
    const r = $('stage').getBoundingClientRect();
    const k = Math.min((r.width - 16) / this.work.width, (r.height - 16) / this.work.height);
    $('stageInner').style.width = `${Math.max(50, Math.floor(this.work.width * k))}px`;
    $('stageInner').style.height = `${Math.max(50, Math.floor(this.work.height * k))}px`;
    this.editor.draw();
  }

  // ---------- Narzędzia i nawigacja ----------
  setTool(tool) {
    if (tool !== 'view' && this.view.split >= 0) this.setSplit(false);
    this.editor.setTool(tool);
    this.controls.syncTool(tool);
  }

  selectTab(name) {
    document.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (name !== 'areas' && this.step === 'design' && this.editor.tool !== 'view') this.setTool('view');
  }

  manualFloor() {
    const ctx = this.scene.ctx('floor');
    ctx.clearRect(0, 0, this.scene.mw, this.scene.mh);
    this.maskEdited();
    this.selectTab('areas');
    this.setTool('poly-add');
    this.editor.invalidateMasks();
  }

  toast(msg, error = false) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('error', error);
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), error ? 5000 : 2600);
  }

  // ---------- Import ----------
  async loadFile(file) {
    try {
      showProcessing('Analizuję zdjęcie…', 0);
      await nextFrame();
      const bmp = await loadImageFile(file);
      await this.start(bmp);
    } catch (e) {
      hideProcessing();
      this.toast(e instanceof UserError ? e.message : 'Wystąpił błąd podczas przetwarzania zdjęcia. Spróbuj innego pliku.', true);
      if (!(e instanceof UserError)) console.error(e);
    }
  }

  /** Startuje studio dla źródła obrazu; `project` przywraca zapisany stan bez analizy. */
  async start(source, { project = null, doors = [] } = {}) {
    this.work = toCanvas(source, workingMaxSide());
    showProcessing(project ? 'Otwieram projekt…' : 'Analizuję zdjęcie…', 1);
    await nextFrame();
    this.quality = assessQuality(this.work);
    showProcessing(project ? 'Otwieram projekt…' : 'Analizuję zdjęcie…', 2);
    await nextFrame();
    this.scene = new Scene(this.work);
    let settings = defaultSettings();
    if (project) {
      const k = this.work.width / project.workW;
      const sc = (q) => q && q.map(([x, y]) => [x * k, y * k]);
      const fix = (s) => ({ ...s, quad: sc(s.quad), doors: s.doors.map(sc) });
      settings = fix(project.settings);
      this.scene.restoreLayers({
        floor: await projects.blobToMask(project.floor, this.scene.mw, this.scene.mh),
        wall: await projects.blobToMask(project.wall, this.scene.mw, this.scene.mh),
      });
      this.variants = project.variants.map((v) => ({ ...v, settings: fix(v.settings) }));
      this.analysis = null;
    } else {
      this.analysis = analyzeRoom(this.work);
      this.scene.setFromAnalysis(this.analysis);
      const k = this.work.width / this.analysis.w;
      settings.quad = this.analysis.quad.map(([x, y]) => [x * k, y * k]);
      settings.doors = doors.map((q) => q.map(([x, y]) => [x * this.work.width, y * this.work.height]));
      this.variants = [];
    }
    showProcessing('Przygotowuję podgląd…', 4);
    await nextFrame();
    this.settings = settings;
    this.renderer.setImage(this.work);
    this.renderer.setLeft(null);
    this.editor.resize(this.work.width, this.work.height);
    this.layersRef = this.scene.snapshotLayers();
    this.recompose();
    this.history.reset({ settings: clone(settings), layers: this.layersRef });
    $('welcome').hidden = true;
    $('studio').hidden = false;
    $('btnNew').hidden = false;
    this.#fit();
    this.setView(false);
    this.setSplit(false);
    this.variantsUi.render();
    this.#renderAnalysis();
    this.#afterChange();
    hideProcessing();
    goStep(this, project ? 'design' : 'floor');
    this.catalog.refresh();
  }

  #renderAnalysis() {
    const a = this.analysis;
    const items = [];
    if (a) {
      items.push(`Podłoga: ${Math.round(a.stats.floorRatio * 100)}% kadru (pewność: ${a.stats.confidence})`);
      items.push(`Ściany: ${Math.round(a.stats.wallRatio * 100)}% kadru`);
      items.push(`Dominujące światło: ${a.light.side} (szacunkowo)`);
    } else items.push('Projekt wczytany z zapisu.');
    items.push(`Rozdzielczość robocza: ${this.work.width}×${this.work.height} px`);
    const issues = this.quality.issues.map((x) => `<li class="warn">${x.text}</li>`).join('');
    $('analysis').innerHTML = items.map((x) => `<li>${x}</li>`).join('') + (issues || '<li>Jakość zdjęcia: bez zastrzeżeń.</li>');
  }

  // ---------- Zapis / eksport ----------
  async saveProject() {
    const dlg = $('saveDialog');
    $('projectName').value = this.projectName || `Pokój ${new Date().toLocaleDateString('pl-PL')}`;
    dlg.showModal();
    const ok = await new Promise((r) => dlg.addEventListener('close', () => r(dlg.returnValue === 'ok'), { once: true }));
    if (!ok) return;
    try {
      this.projectName = $('projectName').value.trim().slice(0, 80) || 'Projekt';
      this.projectId ??= crypto.randomUUID();
      const layers = this.scene.snapshotLayers();
      const thumb = this.renderToCanvas(this.settings);
      await projects.saveProject({
        id: this.projectId,
        name: this.projectName,
        workW: this.work.width,
        image: await projects.canvasToBlob(this.work, 'image/jpeg', 0.92),
        floor: await projects.maskToBlob(layers.floor, this.scene.mw, this.scene.mh),
        wall: await projects.maskToBlob(layers.wall, this.scene.mw, this.scene.mh),
        settings: clone(this.settings),
        variants: this.variants.map((v) => ({ ...v, settings: clone(v.settings) })),
        thumb: toCanvas(thumb, 480).toDataURL('image/jpeg', 0.8),
      });
      this.toast('Projekt zapisany w tej przeglądarce.');
    } catch (e) {
      console.error(e);
      this.toast('Nie udało się zapisać projektu (brak miejsca lub tryb prywatny).', true);
    }
  }

  async exportImage(kind) {
    $('exportMenu').open = false;
    const after = this.renderToCanvas(this.settings);
    let out = after;
    if (kind === 'beforeafter') out = projects.composeBeforeAfter(this.work, after);
    const captioned = projects.withCaption(out, CAPTION);
    const png = kind === 'png';
    const blob = await projects.canvasToBlob(captioned, png ? 'image/png' : 'image/jpeg', 0.92);
    const name = `wizualizacja-podlogi${kind === 'beforeafter' ? '-przed-po' : ''}.${png ? 'png' : 'jpg'}`;
    if (kind === 'share') {
      if (!(await projects.shareImage(blob, 'Wizualizacja podłogi'))) {
        projects.download(blob, name);
        this.toast('Udostępnianie niedostępne w tej przeglądarce — pobrano plik.');
      }
      return;
    }
    projects.download(blob, name);
    this.toast('Pobrano wizualizację.');
  }

  async #listProjects() {
    let list = [];
    try { list = await projects.listProjects(); } catch { /* IndexedDB niedostępne */ }
    $('projectsSection').hidden = !list.length;
    $('projectList').innerHTML = list.map((p) => `
      <li><img src="${p.thumb}" alt=""><div class="meta"><div><strong>${p.name.replace(/[<>&"]/g, '')}</strong><div class="muted small">${new Date(p.updatedAt).toLocaleString('pl-PL')}</div></div>
      <div class="row"><button class="btn small" data-open="${p.id}">Otwórz</button><button class="btn small ghost" data-del="${p.id}" aria-label="Usuń projekt">✕</button></div></div></li>`).join('');
  }

  async openProject(id) {
    try {
      showProcessing('Otwieram projekt…', 0);
      const p = await projects.loadProject(id);
      const bmp = await createImageBitmap(p.image);
      this.projectId = p.id;
      this.projectName = p.name;
      await this.start(bmp, { project: p });
    } catch (e) {
      console.error(e);
      hideProcessing();
      this.toast('Nie udało się otworzyć projektu.', true);
    }
  }

  // ---------- Zdarzenia UI ----------
  #bindUi() {
    const pick = (input) => input.addEventListener('change', () => { if (input.files[0]) this.loadFile(input.files[0]); input.value = ''; });
    pick($('fileInput'));
    pick($('cameraInput'));
    const dz = $('dropzone');
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); } });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('drag')));
    dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) this.loadFile(e.dataTransfer.files[0]); });
    window.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f && !$('welcome').hidden) this.loadFile(f);
    });
    $('btnDemo').addEventListener('click', async () => {
      showProcessing('Przygotowuję przykładowy pokój…', 0);
      await nextFrame();
      this.projectId = null;
      this.projectName = null;
      await this.start(demoRoom(), { doors: [[[0.597, 0.27], [0.693, 0.27], [0.693, 0.6], [0.597, 0.6]]] });
    });
    $('btnWebcam').addEventListener('click', async () => {
      try {
        const f = await captureFromCamera($('camDialog'));
        if (f) this.loadFile(f);
      } catch (e) {
        this.toast(e.name === 'NotAllowedError' ? 'Brak zgody na użycie kamery.' : 'Kamera jest niedostępna.', true);
      }
    });
    $('projectList').addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.open) this.openProject(b.dataset.open);
      if (b?.dataset.del && confirm('Usunąć ten projekt?')) { await projects.deleteProject(b.dataset.del); this.#listProjects(); }
    });
    $('btnNew').addEventListener('click', () => {
      if (!confirm('Rozpocząć od nowego zdjęcia? Niezapisane zmiany zostaną utracone.')) return;
      $('studio').hidden = true;
      $('welcome').hidden = false;
      $('btnNew').hidden = true;
      this.projectId = null;
      this.projectName = null;
      this.step = 'photo';
      document.querySelectorAll('#steps li').forEach((li) => { li.className = li.dataset.step === 'photo' ? 'active' : ''; });
      this.#listProjects();
    });
    $('btnUndo').addEventListener('click', () => this.undo());
    $('btnRedo').addEventListener('click', () => this.redo());
    $('btnReset').addEventListener('click', () => this.resetArrangement());
    $('viewAfter').addEventListener('click', () => this.setView(false));
    $('viewBefore').addEventListener('click', () => { this.setSplit(false); this.setView(true); });
    $('btnSplit').addEventListener('click', () => this.setSplit(this.view.split < 0));
    $('splitRange').addEventListener('input', () => { this.view.split = +$('splitRange').value; this.requestRender(); });
    $('splitLeft').addEventListener('change', () => this.refreshSplitLeft());
    $('btnSave').addEventListener('click', () => this.saveProject());
    document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => this.exportImage(b.dataset.export)));
    document.querySelectorAll('[role="tab"]').forEach((t) => t.addEventListener('click', () => this.selectTab(t.dataset.tab)));
    $('btnAddDoor').addEventListener('click', () => {
      if (this.settings.doors.length >= 4) return this.toast('Można zaznaczyć maks. 4 drzwi.', true);
      this.setTool('doors');
      this.setDoors([...this.settings.doors, defaultDoor(this.work.width, this.work.height, this.settings.doors.length)], true);
      this.editor.selectedDoor = this.settings.doors.length - 1;
      this.editor.draw();
      this.toast('Dopasuj narożniki do skrzydła drzwi. Kolor i styl zmienisz w zakładce „Wnętrze”.');
    });
    $('btnDelDoor').addEventListener('click', () => {
      const i = this.editor.selectedDoor;
      if (i < 0) return this.toast('Najpierw kliknij drzwi na zdjęciu (narzędzie „Drzwi i framugi”).', true);
      this.setDoors(this.settings.doors.filter((_, k) => k !== i), true);
      this.editor.selectedDoor = -1;
      this.editor.draw();
    });
    $('btnClearFloor').addEventListener('click', () => this.manualFloor());
    $('btnRedetect').addEventListener('click', () => {
      this.analysis = analyzeRoom(this.work);
      this.scene.setFromAnalysis(this.analysis);
      this.editor.invalidateMasks();
      this.maskEdited();
      this.#renderAnalysis();
      this.toast('Obszary wykryte ponownie.');
    });
    window.addEventListener('keydown', (e) => {
      if ($('studio').hidden || e.target.closest('input, select, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      else if (e.key === 'Enter') this.editor.closePolygon();
      else if (e.key === 'Escape') { this.editor.cancelPolygon(); $('exportMenu').open = false; }
    });
  }
}

try {
  window.floorApp = new App();
} catch (e) {
  const msg = e instanceof WebGLUnavailableError
    ? 'Ta przeglądarka lub urządzenie nie obsługuje WebGL2, który jest potrzebny do wizualizacji. Zaktualizuj przeglądarkę (Chrome, Edge, Firefox, Safari 15+).'
    : `Nie udało się uruchomić aplikacji: ${e.message}`;
  document.body.innerHTML = `<main class="welcome"><section class="hero"><h1>Nie można uruchomić wizualizatora</h1><p>${msg}</p></section></main>`;
  console.error(e);
}

