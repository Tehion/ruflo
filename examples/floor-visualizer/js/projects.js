// Projekty zapisywane lokalnie (IndexedDB) + eksport i udostępnianie wizualizacji.
// W wersji z backendem ten moduł zastępuje klient API (POST /projects, /exports).

const DB = 'floorvis';
const STORE = 'projects';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const canvasToBlob = (canvas, type = 'image/jpeg', q = 0.9) =>
  new Promise((res) => canvas.toBlob(res, type, q));

/** Maska (Uint8 alfa) → PNG w skali szarości, by zmniejszyć rozmiar zapisu. */
export async function maskToBlob(alpha, w, h) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const img = new ImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = alpha[i];
    img.data[i * 4 + 3] = 255;
  }
  c.getContext('2d').putImageData(img, 0, 0);
  return canvasToBlob(c, 'image/png');
}

export async function blobToMask(blob, w, h) {
  const bmp = await createImageBitmap(blob);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4];
  return a;
}

export async function saveProject(project) {
  await tx('readwrite', (s) => s.put({ ...project, updatedAt: Date.now() }));
}

export async function listProjects() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function deleteProject(id) {
  await tx('readwrite', (s) => s.delete(id));
}

/** Zestawienie „przed | po” w jednym obrazie z etykietami. */
export function composeBeforeAfter(before, after) {
  const gap = Math.round(before.width * 0.01);
  const out = Object.assign(document.createElement('canvas'), { width: before.width * 2 + gap, height: before.height });
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(before, 0, 0);
  ctx.drawImage(after, before.width + gap, 0);
  const fs = Math.round(before.width / 40);
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  for (const [label, x] of [['PRZED', fs * 0.6], ['PO', before.width + gap + fs * 0.6]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - fs * 0.3, fs * 0.4, ctx.measureText(label).width + fs * 0.6, fs * 1.4);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, fs * 1.45);
  }
  return out;
}

/** Kopia renderu z dyskretnym podpisem informującym o poglądowym charakterze. */
export function withCaption(source, text) {
  const c = Object.assign(document.createElement('canvas'), { width: source.width, height: source.height });
  const ctx = c.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const fs = Math.max(12, Math.round(c.width / 90));
  ctx.font = `${fs}px system-ui, sans-serif`;
  const pad = fs * 0.6;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(c.width - tw - pad * 3, c.height - fs - pad * 2.5, tw + pad * 2, fs + pad * 1.5);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, c.width - tw - pad * 2, c.height - pad * 1.6);
  return c;
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Web Share API z plikiem; zwraca false, gdy niedostępne (wtedy UI proponuje pobranie). */
export async function shareImage(blob, title) {
  const file = new File([blob], 'wizualizacja.jpg', { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: 'Wizualizacja podłogi (poglądowa)' });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return true;
    }
  }
  return false;
}
