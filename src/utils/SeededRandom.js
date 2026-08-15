// ==========================
// Seeded pseudo-random number generator (mulberry32)
// ==========================
// Course concept: Procedural Modeling requires reproducibility.
// A plain Math.random() call cannot be seeded, so the entire city
// generation pipeline is driven through this class instead. Given the
// same integer seed, it always produces the same sequence of numbers,
// which means the same seed always regenerates the same city.

export class SeededRandom {
  constructor(seed = 1) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    // Force a 32-bit unsigned integer state, never allow 0.
    this._state = (seed >>> 0) || 0x9e3779b9;
  }

  // Returns a float in [0, 1)
  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max)
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(array) {
    return array[this.int(0, array.length - 1)];
  }

  bool(probability = 0.5) {
    return this.next() < probability;
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 100000);
}
