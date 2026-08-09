// A seeded PRNG, so a run is a pure function of (seed, contacts per day).
// The whole point of this prototype is comparing two runs that differ in
// exactly one thing, which only works if everything else is reproducible ---
// same layout, same index case, same sequence of chance.
export type Rng = () => number;

// mulberry32: small, fast, good enough for this, and trivially portable
// between the browser and a test runner.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
