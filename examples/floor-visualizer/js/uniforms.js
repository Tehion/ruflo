// Tłumaczy ustawienia aranżacji + metadane sceny na wartości uniformów shadera.
import { floorHomography, doorHomography, invert3, toGLMat3 } from './geometry.js';
import { getProduct, getVariant } from './catalog-data.js';

const PATTERN_INDEX = { straight: 0, brick: 1, herringbone: 2, chevron: 3 };
const DOOR_STYLE_INDEX = { original: 0, smooth: 1, panel: 2, grooved: 3, glass: 4 };
const GLOSS = { mat: 0.05, 'półmat': 0.18, 'połysk': 0.4 };
const WALL_FINISH = { mat: { flat: 0.85, sheen: 0 }, satyna: { flat: 1, sheen: 0.5 }, 'połysk': { flat: 1.08, sheen: 1.1 } };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (c / 255) ** 2.2);
}

/** Macierz obraz→podłoga (m) lub null, gdy czworokąt jest zdegenerowany. */
export function floorInverse(settings) {
  if (!settings.quad) return null;
  const H = floorHomography(settings.quad, settings.refSize.w, settings.refSize.d);
  return H ? invert3(H) : null;
}

/**
 * @param settings  stan aranżacji (store.defaultSettings)
 * @param scene     { lums: {floor,wall,door,frame}, floorInv?: number[9] }
 * @param view      { showOriginal, split }
 */
export function buildUniforms(settings, scene, view = {}) {
  const product = getProduct(settings.productId);
  const variant = getVariant(product, settings.variantId);
  const floorInv = scene.floorInv ?? floorInverse(settings);
  const doors = settings.doors.slice(0, 4);
  const doorInv = new Float32Array(36);
  doors.forEach((q, i) => {
    const H = doorHomography(q);
    const inv = H && invert3(H);
    doorInv.set(toGLMat3(inv ?? IDENTITY), i * 9);
  });
  const wf = WALL_FINISH[settings.wall.finish] ?? WALL_FINISH.mat;
  return {
    uFloorOn: product && floorInv ? 1 : 0,
    uFloorInv: toGLMat3(floorInv ?? IDENTITY),
    uPattern: PATTERN_INDEX[settings.pattern] ?? 0,
    uAngle: (settings.angle * Math.PI) / 180,
    uPlank: product ? [product.size.l / 1000, product.size.w / 1000] : [1.2, 0.2],
    uScale: settings.scale,
    uWoodLight: hexToLinear(variant?.light ?? '#c8a070'),
    uWoodDark: hexToLinear(variant?.dark ?? '#8a6038'),
    uVariation: product?.variation ?? 0.5,
    uGrain: product?.grain ?? 0.6,
    uKnots: product?.knots ?? 0,
    uBevel: product?.bevel ?? 0,
    uGloss: GLOSS[product?.finish] ?? 0.1,
    uIntensity: settings.intensity,
    uShadow: settings.shadow,
    uFloorLum: scene.lums.floor,
    uRealistic: settings.realistic ? 1 : 0,
    uWallOn: settings.wall.enabled ? 1 : 0,
    uWallColor: hexToLinear(settings.wall.color),
    uWallLum: scene.lums.wall,
    uWallFlat: wf.flat,
    uWallSheen: wf.sheen,
    uDoorOn: settings.door.enabled && doors.length ? 1 : 0,
    uDoorColor: hexToLinear(settings.door.color),
    uDoorLum: scene.lums.door,
    uDoorStyle: DOOR_STYLE_INDEX[settings.door.style] ?? 0,
    uDoorWood: settings.door.material === 'wood' ? 1 : 0,
    uFrameOn: settings.frame.enabled && doors.length ? 1 : 0,
    uFrameColor: hexToLinear(settings.frame.color),
    uFrameLum: scene.lums.frame,
    uFrameWood: settings.frame.material === 'wood' ? 1 : 0,
    uDoorInv: doorInv,
    uDoorCount: doors.length,
    uBrightness: settings.light.brightness,
    uTemperature: settings.light.temperature,
    uContrast: settings.light.contrast,
    uShowOriginal: view.showOriginal ? 1 : 0,
    uSplit: view.split ?? -1,
  };
}
