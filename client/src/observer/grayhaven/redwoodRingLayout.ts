import { distanceToRoad, elevation, landmarks } from './layout';

const [x, z] = landmarks.find(place => place.id === 'SCN_redwood_ring')!.position;
export const REDWOOD_RING = { x, z, reserveRadius: 42, propsZoom: 2.4, fineZoom: 4.5, hysteresis: .15 };
export const REDWOOD_VIEW = { x, y: elevation(x, z) + 15, z, zoom: 5.8 };

// Leave three real breaks in the circle where the authored trails cross it.
export const REDWOOD_TREES = Array.from({ length: 18 }, (_, i) => {
  const angle = i / 18 * Math.PI * 2;
  return { x: x + Math.cos(angle) * 28, z: z + Math.sin(angle) * 25,
    height: 47 + (i * 7 % 19), radius: 2.2 + (i % 4) * .23, seed: i };
}).filter(tree => distanceToRoad([tree.x, tree.z]) >= 6);

export function redwoodDetailLevel(zoom: number, previous = 0) {
  const at = (level: number, threshold: number) => zoom >= threshold - (previous >= level ? REDWOOD_RING.hysteresis : 0);
  return at(2, REDWOOD_RING.fineZoom) ? 2 : at(1, REDWOOD_RING.propsZoom) ? 1 : 0;
}
