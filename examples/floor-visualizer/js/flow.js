// Przebieg kreatora: Zdjęcie → Podłoga → Perspektywa → Aranżacja,
// baner z instrukcją kroku i nakładka postępu przetwarzania.

const $ = (id) => document.getElementById(id);
const ORDER = ['photo', 'floor', 'perspective', 'design'];

export const PROCESS_STEPS = [
  'Wczytywanie i korekta orientacji',
  'Ocena jakości zdjęcia',
  'Wykrywanie podłogi i ścian',
  'Dopasowanie perspektywy',
  'Przygotowanie podglądu',
];

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function showProcessing(title, active = 0) {
  $('procTitle').textContent = title;
  $('procSteps').innerHTML = PROCESS_STEPS.map((s, i) => `<li class="${i < active ? 'done' : i === active ? 'active' : ''}">${s}${i < active ? ' ✓' : ''}</li>`).join('');
  $('processing').hidden = false;
}

export function hideProcessing() {
  $('processing').hidden = true;
}

function banner(text, actions) {
  $('banner').hidden = !text;
  $('bannerText').innerHTML = text || '';
  const box = $('bannerActions');
  box.innerHTML = '';
  for (const [label, fn, primary] of actions || []) {
    const b = document.createElement('button');
    b.className = `btn small${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    box.append(b);
  }
}

export function goStep(app, step) {
  app.step = step;
  const idx = ORDER.indexOf(step);
  document.querySelectorAll('#steps li').forEach((li) => {
    const i = ORDER.indexOf(li.dataset.step);
    li.classList.toggle('done', i < idx);
    li.classList.toggle('active', i === idx);
  });
  if (step === 'floor') {
    const st = app.analysis?.stats;
    const low = st?.confidence === 'niska';
    const issues = (app.quality?.issues ?? []).filter((x) => x.level === 'warn').map((x) => `<br><small>⚠ ${x.text}</small>`).join('');
    app.setTool('masks');
    banner(low
      ? `<strong>Nie udało się pewnie wykryć podłogi.</strong> Zaznacz ją ręcznie — klikaj narożniki podłogi na zdjęciu.${issues}`
      : `<strong>Czy niebieski obszar to podłoga?</strong> (pewność: ${st?.confidence ?? '—'}). Meble i dywany powinny być poza nim — wtedy zostaną na wierzchu.${issues}`, [
      ['Popraw pędzlem', () => { app.selectTab('areas'); app.setTool('floor-erase'); }],
      ['Zaznacz ręcznie', () => app.manualFloor(), low],
      ['Zatwierdź podłogę', () => goStep(app, 'perspective'), !low],
    ]);
  } else if (step === 'perspective') {
    app.setTool('quad');
    banner('<strong>Dopasuj perspektywę.</strong> Przesuń narożniki tak, by linie siatki biegły równolegle do ścian, listew lub fug. Wymiary prostokąta ustawisz w „Ułożenie → Skala i perspektywa”.', [
      ['Wstecz', () => goStep(app, 'floor')],
      ['Zatwierdź perspektywę', () => goStep(app, 'design'), true],
    ]);
  } else {
    banner('');
    app.setTool('view');
    if (!app.settings.productId) app.applyProduct(null);
    app.selectTab('catalog');
  }
}
