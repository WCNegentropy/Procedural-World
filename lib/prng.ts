
// xfnv1a variant to 64-bit (BigInt)
export function hashStringTo64BitBigInt(str: string): bigint {
  let h = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * fnvPrime) & 0xffffffffffffffffn;
  }
  return h & 0xffffffffffffffffn;
}

export class PCG32 {
  private state: bigint;
  private inc: bigint;

  constructor(seed64: bigint = 0x853c49e6748fea9bn, seq64: bigint = 0xda3e39cb94b95bdbn) {
    // PCG XSH RR 32 — 64-bit state, 64-bit stream selector
    this.state = 0n;
    this.inc = (seq64 << 1n) | 1n;
    this.nextUint32(); // advance once to mix
    this.state = (this.state + (seed64 & 0xffffffffffffffffn)) & 0xffffffffffffffffn;
    this.nextUint32();
  }

  nextUint32(): number {
    const oldstate = this.state;
    // 64-bit linear congruential step
    this.state = (oldstate * 6364136223846793005n + this.inc) & 0xffffffffffffffffn;
    // xorshift high (XSH RR)
    let xorshifted = Number(((oldstate >> 18n) ^ oldstate) >> 27n) >>> 0;
    const rot = Number(oldstate >> 59n) & 31;
    // rotate right
    return (xorshifted >>> rot) | (xorshifted << ((-rot) & 31));
  }

  nextFloat(): number {
    return (this.nextUint32() >>> 0) / 4294967296; // [0,1)
  }
}

export function deriveSeed(root: bigint, label: string): bigint {
  // Deterministic sub-seed derivation: splitmix-like one-way hash
  const a = 0x9e3779b97f4a7c15n;
  let x = root ^ hashStringTo64BitBigInt(label);
  x = (x + a) & 0xffffffffffffffffn;
  x = (x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n & 0xffffffffffffffffn;
  x = (x ^ (x >> 27n)) * 0x94d049bb133111ebn & 0xffffffffffffffffn;
  x = x ^ (x >> 31n);
  return x & 0xffffffffffffffffn;
}