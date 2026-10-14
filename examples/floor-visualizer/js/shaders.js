// Shadery WebGL2. Cały kompozyt (podłoga, ściany, drzwi, ościeżnice, światło)
// liczony jest w jednym przebiegu fragment shadera w rozdzielczości obrazu roboczego.

export const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImage;
uniform sampler2D uShade;
uniform sampler2D uMask;
uniform sampler2D uLeft;
uniform vec2 uSize;

uniform int uFloorOn;
uniform mat3 uFloorInv;
uniform int uPattern;
uniform float uAngle;
uniform vec2 uPlank;
uniform float uScale;
uniform vec3 uWoodLight;
uniform vec3 uWoodDark;
uniform float uVariation;
uniform float uGrain;
uniform float uKnots;
uniform float uBevel;
uniform float uGloss;
uniform float uIntensity;
uniform float uShadow;
uniform float uFloorLum;
uniform int uRealistic;

uniform int uWallOn;  uniform vec3 uWallColor;  uniform float uWallLum;  uniform float uWallFlat; uniform float uWallSheen;
uniform int uDoorOn;  uniform vec3 uDoorColor;  uniform float uDoorLum;  uniform int uDoorStyle; uniform int uDoorWood;
uniform int uFrameOn; uniform vec3 uFrameColor; uniform float uFrameLum; uniform int uFrameWood;
uniform mat3 uDoorInv[4];
uniform int uDoorCount;

uniform float uBrightness;
uniform float uTemperature;
uniform float uContrast;
uniform int uShowOriginal;
uniform float uSplit;
uniform int uHasLeft;

vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// --- Wzory ułożenia: zwracają id deski, pozycję lokalną (wzdłuż, w poprzek) i rozmiar [m] ---
void patternStraight(vec2 p, float L, float W, bool brick, out vec2 id, out vec2 loc, out vec2 sz) {
  float row = floor(p.y / W);
  float off = brick ? mod(row, 2.0) * 0.5 * L : (0.25 + 0.5 * hash12(vec2(row, 7.0))) * L;
  float x = p.x + off;
  float col = floor(x / L);
  id = vec2(col, row);
  loc = vec2(x - col * L, p.y - row * W);
  sz = vec2(L, W);
}

// Jodełka: kratownica a=(1,1), b=(n,-n) w jednostkach szerokości deski.
void patternHerringbone(vec2 p, float L, float W, out vec2 id, out vec2 loc, out vec2 sz) {
  float n = clamp(floor(L / W + 0.5), 2.0, 8.0);
  vec2 q = p / W;
  float S = floor((q.x + q.y) * 0.5);
  float T = floor((q.x - q.y) / (2.0 * n));
  id = vec2(0.0); loc = vec2(0.0); sz = vec2(n * W, W);
  for (int dj = -1; dj <= 1; dj++) {
    for (int di = -7; di <= 1; di++) {
      float i = S + float(di), j = T + float(dj);
      vec2 r = q - vec2(i + n * j, i - n * j);
      if (r.x >= 0.0 && r.x < n && r.y >= 0.0 && r.y < 1.0) { id = vec2(i, j * 2.0); loc = r * W; return; }
      if (r.x >= 0.0 && r.x < 1.0 && r.y >= 1.0 && r.y < 1.0 + n) { id = vec2(i, j * 2.0 + 1.0); loc = vec2(r.y - 1.0, r.x) * W; return; }
    }
  }
}

// Jodełka francuska: kolumny desek ciętych pod kątem 45°.
void patternChevron(vec2 p, float L, float W, out vec2 id, out vec2 loc, out vec2 sz) {
  float cA = 0.70710678;
  float cw = L * cA;
  float col = floor(p.x / cw);
  float lx = p.x - col * cw;
  bool even = mod(col, 2.0) < 0.5;
  float yy = p.y - (even ? lx : cw - lx);
  float band = W / cA;
  float row = floor(yy / band);
  id = vec2(col, row);
  loc = vec2(lx / cA, (yy - row * band) * cA);
  sz = vec2(L, W);
}

float woodGrain(vec2 loc, vec2 seed, float lod) {
  float warp = fbm(vec2(loc.x * 0.9, loc.y * 7.0) + seed * 20.0);
  float rings = 0.5 + 0.5 * sin(loc.y * 85.0 + warp * 7.0 + seed.x * 10.0);
  float fine = fbm(vec2(loc.x * 2.5, loc.y * 140.0) + seed.y * 30.0);
  float detail = 1.0 - smoothstep(0.003, 0.015, lod);
  return mix(rings * 0.6 + fine * 0.4, 0.5, 1.0 - detail);
}

vec3 floorColor(vec2 pf, float lod) {
  vec2 p = rot(pf, uAngle) / uScale;
  float L = uPlank.x, W = uPlank.y;
  vec2 id, loc, sz;
  if (uPattern == 2) patternHerringbone(rot(p, 0.78539816), L, W, id, loc, sz);
  else if (uPattern == 3) patternChevron(p, L, W, id, loc, sz);
  else patternStraight(p, L, W, uPattern == 1, id, loc, sz);
  lod /= uScale;

  float h1 = hash12(id + 0.37), h2 = hash12(id * 1.37 + 11.0);
  float tone = clamp(0.5 + (h1 - 0.5) * uVariation * 1.4, 0.0, 1.0);
  vec3 base = mix(uWoodLight, uWoodDark, tone);
  vec3 c;
  if (uRealistic == 1) {
    float g = woodGrain(loc, vec2(h1, h2), lod);
    c = mix(base * 1.06, base * 0.74, g * uGrain);
    if (uKnots > 0.0) {
      float kn = noise(vec2(loc.x * 2.2, loc.y * 18.0) + h2 * 40.0);
      float k = smoothstep(0.88, 0.97, kn) * uKnots * (1.0 - smoothstep(0.003, 0.012, lod));
      c = mix(c, uWoodDark * 0.45, k);
    }
  } else {
    c = mix(mix(uWoodLight, uWoodDark, 0.5), base, 0.5);
  }
  // Fugi / fazy z antyaliasingiem zależnym od odległości.
  float e = min(min(loc.x, sz.x - loc.x), min(loc.y, sz.y - loc.y));
  float jw = 0.0007 + uBevel * 0.0022;
  float aa = max(lod, 1e-5);
  float joint = 1.0 - smoothstep(jw - aa * 0.5, jw + aa, e);
  joint *= 1.0 - smoothstep(0.25, 0.6, lod / W);
  c *= 1.0 - joint * (0.35 + 0.25 * uBevel);
  return c;
}

vec3 recolor(vec3 origLin, vec3 target, float meanSrgb, float flatten, float sheen) {
  float mean = pow(max(meanSrgb, 0.02), 2.2);
  float ratio = mix(1.0, luma(origLin) / mean, flatten);
  return target * ratio + sheen * max(ratio - 1.0, 0.0) * 0.25;
}

vec3 doorDetail(vec3 c, vec2 uv) {
  vec2 fw = fwidth(uv) + 1e-4;
  if (uDoorStyle == 2) { // płyciny
    for (int k = 0; k < 2; k++) {
      vec4 r = k == 0 ? vec4(0.18, 0.08, 0.82, 0.44) : vec4(0.18, 0.52, 0.82, 0.92);
      vec2 d = min(uv - r.xy, r.zw - uv);
      float inside = smoothstep(0.0, fw.x, d.x) * smoothstep(0.0, fw.y, d.y);
      float bev = 0.035;
      float edge = inside * (1.0 - smoothstep(bev - fw.x, bev, min(d.x, d.y * 0.5)));
      bool lit = (uv.x - r.x) < bev || (uv.y - r.y) < bev * 2.0;
      c *= mix(1.0, lit ? 1.12 : 0.8, edge);
      c *= mix(1.0, 0.95, inside);
    }
  } else if (uDoorStyle == 3) { // frezy poziome
    float inX = step(0.12, uv.x) * step(uv.x, 0.88);
    float g = abs(fract(uv.y * 9.0) - 0.5) / 9.0;
    float line = 1.0 - smoothstep(0.003, 0.003 + fw.y, g);
    c *= 1.0 - line * inX * step(0.06, uv.y) * step(uv.y, 0.94) * 0.4;
  } else if (uDoorStyle == 4) { // przeszklone
    vec2 d = min(uv - vec2(0.2, 0.1), vec2(0.8, 0.62) - uv);
    float glass = smoothstep(0.0, fw.x, d.x) * smoothstep(0.0, fw.y, d.y);
    vec3 frost = vec3(0.62, 0.68, 0.7) * (0.85 + 0.3 * (1.0 - uv.y));
    c = mix(c, frost, glass * 0.9);
  }
  return c;
}

void main() {
  vec3 orig = texture(uImage, vUv).rgb;
  if (uShowOriginal == 1) { outColor = vec4(orig, 1.0); return; }
  if (uSplit >= 0.0 && vUv.x < uSplit) {
    vec3 left = uHasLeft == 1 ? texture(uLeft, vUv).rgb : orig;
    float edge = (uSplit - vUv.x) * uSize.x;
    outColor = vec4(edge < 2.0 ? vec3(1.0) : left, 1.0);
    return;
  }
  if (uSplit >= 0.0 && (vUv.x - uSplit) * uSize.x < 2.0) { outColor = vec4(1.0); return; }

  vec2 px = vUv * uSize;
  vec4 m = texture(uMask, vUv);
  vec3 lin = toLin(orig);
  vec3 res = lin;
  // Pochodne liczone poza gałęziami (jednolity przepływ sterowania).
  vec3 hf = uFloorInv * vec3(px, 1.0);
  vec2 pf = hf.xy / (abs(hf.z) < 1e-6 ? 1e-6 : hf.z);
  float lod = max(length(dFdx(pf)), length(dFdy(pf)));

  if (uWallOn == 1 && m.g > 0.0) {
    res = mix(res, recolor(lin, uWallColor, uWallLum, uWallFlat, uWallSheen), m.g);
  }

  if ((uDoorOn == 1 && m.b > 0.0) || (uFrameOn == 1 && m.a > 0.0)) {
    vec2 duv = vec2(-1.0);
    for (int i = 0; i < 4; i++) {
      if (i >= uDoorCount) break;
      vec3 h = uDoorInv[i] * vec3(px, 1.0);
      vec2 uv = h.xy / h.z;
      if (uv.x > -0.4 && uv.x < 1.4 && uv.y > -0.4 && uv.y < 1.05) { duv = uv; break; }
    }
    vec3 blurred = toLin(textureLod(uImage, vUv, 4.0).rgb);
    if (uFrameOn == 1 && m.a > 0.0) {
      vec3 target = uFrameColor;
      if (uFrameWood == 1) target = mix(target * 1.15, target * 0.7, woodGrain(duv.yx * vec2(2.0, 0.08), vec2(3.1), 0.0));
      res = mix(res, recolor(lin, target, uFrameLum, 0.9, 0.2), m.a);
    }
    if (uDoorOn == 1 && m.b > 0.0) {
      vec3 target = uDoorColor;
      if (uDoorWood == 1) target = mix(target * 1.15, target * 0.7, woodGrain(duv.yx * vec2(2.0, 0.8), vec2(1.7), 0.0));
      vec3 src = uDoorStyle == 0 ? lin : blurred;
      vec3 c = recolor(src, target, uDoorLum, uDoorStyle == 0 ? 1.0 : 0.8, 0.3);
      res = mix(res, doorDetail(c, clamp(duv, 0.0, 1.0)), m.b);
    }
  }

  if (uFloorOn == 1 && m.r > 0.0) {
    if (hf.z > 0.0) {
      vec3 c = floorColor(pf, lod);
      float s = pow(texture(uShade, vUv).r, 2.2) / pow(max(uFloorLum, 0.02), 2.2);
      float ratio = clamp(s, 0.12, 2.6);
      c *= mix(1.0, ratio, uShadow);
      c += uGloss * pow(max(ratio - 1.0, 0.0), 1.4) * 0.35;
      c = mix(vec3(luma(c)), c, uIntensity);
      res = mix(res, c, m.r);
    }
  }

  vec3 outc = toSrgb(res) * uBrightness;
  outc *= vec3(1.0 + 0.09 * uTemperature, 1.0 + 0.015 * uTemperature, 1.0 - 0.09 * uTemperature);
  outc = (outc - 0.5) * uContrast + 0.5;
  outColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;
