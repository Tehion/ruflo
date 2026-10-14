// Generator przykładowego pokoju (proceduralny — bez zewnętrznych zdjęć),
// aby można było wypróbować aplikację bez własnej fotografii.

export function demoRoom(w = 1600, h = 1067) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  const P = (x, y) => [x * w, y * h];
  const poly = (pts, fill) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...P(...p)) : ctx.moveTo(...P(...p))));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const grad = (x0, y0, x1, y1, stops) => {
    const g = ctx.createLinearGradient(...P(x0, y0), ...P(x1, y1));
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  };
  // Sufit, ściany (tył, lewa w świetle okna, prawa w cieniu)
  poly([[0, 0], [1, 0], [0.78, 0.16], [0.22, 0.16]], '#f8f7f4');
  poly([[0.22, 0.16], [0.78, 0.16], [0.78, 0.6], [0.22, 0.6]], grad(0.22, 0, 0.78, 0, [[0, '#dcd2c3'], [1, '#cfc4b3']]));
  poly([[0, 0], [0.22, 0.16], [0.22, 0.6], [0, 0.98]], grad(0, 0, 0.22, 0, [[0, '#e4dacb'], [1, '#d8cdbd']]));
  poly([[1, 0], [0.78, 0.16], [0.78, 0.6], [1, 0.98]], grad(1, 0, 0.78, 0, [[0, '#c4b6a2'], [1, '#d0c4b0']]));
  // Stara podłoga: szare płytki z fugami
  poly([[0.22, 0.6], [0.78, 0.6], [1, 0.98], [1, 1], [0, 1], [0, 0.98]], grad(0, 0.6, 0, 1, [[0, '#7f7d7b'], [1, '#9b9894']]));
  ctx.strokeStyle = 'rgba(70,68,64,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ctx.beginPath(); ctx.moveTo(...P(0.22 + 0.56 * t, 0.6)); ctx.lineTo(...P(-0.0 + 1.0 * t, 1)); ctx.stroke();
  }
  for (const v of [0.63, 0.67, 0.72, 0.79, 0.88, 0.99]) {
    const t = (v - 0.6) / 0.4;
    ctx.beginPath(); ctx.moveTo(...P(0.22 - 0.22 * t, v)); ctx.lineTo(...P(0.78 + 0.22 * t, v)); ctx.stroke();
  }
  // Okno na lewej ścianie + plama światła na podłodze
  poly([[0.04, 0.17], [0.15, 0.24], [0.15, 0.5], [0.04, 0.56]], '#f7f9fb');
  ctx.save();
  ctx.globalAlpha = 0.18;
  poly([[0.18, 0.66], [0.42, 0.66], [0.5, 0.9], [0.12, 0.9]], '#fff6e0');
  ctx.restore();
  // Drzwi z ościeżnicą na tylnej ścianie
  poly([[0.585, 0.255], [0.705, 0.255], [0.705, 0.6], [0.585, 0.6]], '#e9e5df');
  poly([[0.597, 0.27], [0.693, 0.27], [0.693, 0.6], [0.597, 0.6]], '#8a6a4d');
  ctx.fillStyle = '#c8b28a';
  ctx.beginPath(); ctx.arc(...P(0.683, 0.44), w * 0.004, 0, Math.PI * 2); ctx.fill();
  // Sofa z cieniem kontaktowym
  ctx.save();
  ctx.filter = 'blur(18px)';
  poly([[0.27, 0.7], [0.58, 0.7], [0.6, 0.79], [0.25, 0.79]], 'rgba(0,0,0,0.35)');
  ctx.restore();
  poly([[0.28, 0.5], [0.56, 0.5], [0.57, 0.62], [0.27, 0.62]], '#4f5d3f');
  poly([[0.26, 0.6], [0.58, 0.6], [0.58, 0.76], [0.26, 0.76]], '#5c6b4a');
  poly([[0.26, 0.6], [0.58, 0.6], [0.56, 0.66], [0.28, 0.66]], '#6d7c58');
  // Listwy przypodłogowe
  ctx.strokeStyle = '#f2efe9';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(...P(0.22, 0.6)); ctx.lineTo(...P(0.585, 0.6)); ctx.moveTo(...P(0.705, 0.6)); ctx.lineTo(...P(0.78, 0.6)); ctx.stroke();
  // Delikatny szum, by zdjęcie nie było idealnie płaskie
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
