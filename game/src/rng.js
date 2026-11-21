// Deterministic randomness: one seeded generator per world, so a shot
// scene with a fixed seed always builds the same city and the same
// traffic, and a replayed run looks identical.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// A probability roll: chance(rng, 0.15) is true about 15% of the time.
export function chance(rng, p) {
  return rng() < p;
}

// A whole number in [min, max], inclusive on both ends.
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
