/**
 * One-Euro filter (Casiez et al. 2012): low jitter when still, low lag when moving.
 * https://gery.casiez.net/1euro/
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.xPrev = null;
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

/** Filters an N-component vector with independent One-Euro filters. */
export class VectorFilter {
  private filters: OneEuroFilter[];
  constructor(n: number, minCutoff = 1.0, beta = 0.02) {
    this.filters = Array.from({ length: n }, () => new OneEuroFilter(minCutoff, beta));
  }
  filter(v: ArrayLike<number>, tMs: number, out: number[] = []): number[] {
    for (let i = 0; i < this.filters.length; i++) out[i] = this.filters[i].filter(v[i], tMs);
    return out;
  }
  reset(): void {
    this.filters.forEach((f) => f.reset());
  }
  setParams(minCutoff: number, beta: number): void {
    this.filters.forEach((f) => {
      f.minCutoff = minCutoff;
      f.beta = beta;
    });
  }
}
