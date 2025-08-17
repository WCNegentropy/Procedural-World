
export type HashFn = (ix: number, iy: number) => number;

export function makeGradientHash(seed64: bigint): HashFn {
  // Returns a deterministic pseudo-random in [0,1) for integer grid points
  return function noiseHash(ix: number, iy: number): number {
    // mix integers into 64-bit key
    let key = (BigInt(ix) * 0x165667b19e3779f9n) ^ (BigInt(iy) * 0x9e3779b185ebca87n) ^ seed64;
    // finalize like splitmix
    key = (key + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    key = (key ^ (key >> 30n)) * 0xbf58476d1ce4e5b9n & 0xffffffffffffffffn;
    key = (key ^ (key >> 27n)) * 0x94d049bb133111ebn & 0xffffffffffffffffn;
    key = key ^ (key >> 31n);
    // Turn key into a float via xorshift
    const x = Number(key & 0xffffffffn) >>> 0;
    return x / 4294967296; // [0,1)
  };
}

function fade(t: number): number {
  // 6t^5 - 15t^4 + 10t^3
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad2(hashVal: number): [number, number] {
  // map [0,1) -> unit gradient via angle
  const angle = hashVal * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

export function gradientNoise2D(x: number, y: number, hashFn: HashFn): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = x - x0;
  const sy = y - y0;

  const g00 = grad2(hashFn(x0, y0));
  const g10 = grad2(hashFn(x1, y0));
  const g01 = grad2(hashFn(x0, y1));
  const g11 = grad2(hashFn(x1, y1));

  const n00 = g00[0] * (x - x0) + g00[1] * (y - y0);
  const n10 = g10[0] * (x - x1) + g10[1] * (y - y0);
  const n01 = g01[0] * (x - x0) + g01[1] * (y - y1);
  const n11 = g11[0] * (x - x1) + g11[1] * (y - y1);

  const u = fade(sx);
  const v = fade(sy);

  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  const nxy = nx0 + v * (nx1 - nx0);

  // Normalize approx to [0,1]
  return 0.5 * (nxy + 1);
}

export function fbm2D(x: number, y: number, octaves: number, lacunarity: number, gain: number, hashFn: HashFn): number {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradientNoise2D(x * freq, y * freq, hashFn);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}