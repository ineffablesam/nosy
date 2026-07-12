export type GateDecision = "ignore" | "refuse" | "cave" | "deflect";

const MOVIE_INTENT = /\b(movie|trailer|teaser|nosy\s*productions?|nosy\s*pictures?)\b/i;
const BEG = /\b(please|pls|plz|come\s*on|c'?mon|just|pretty\s*please|teaser|one\s*more)\b/i;

export interface MovieGateOptions {
  primedWindowMs?: number;
  now?: () => number;
}

export class MovieGate {
  private primed = new Map<string, number>();
  private rendering = new Set<string>();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: MovieGateOptions = {}) {
    this.windowMs = opts.primedWindowMs ?? 10 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  decide(userId: string, text: string): GateDecision {
    const isMovie = MOVIE_INTENT.test(text);
    const isBeg = BEG.test(text);
    const primedAt = this.primed.get(userId);
    const hasPrime = primedAt !== undefined;
    const isPrimed = hasPrime && this.now() - primedAt! <= this.windowMs;

    if (this.rendering.has(userId)) {
      return isMovie || (isPrimed && isBeg) ? "deflect" : "ignore";
    }
    if (isPrimed && (isMovie || isBeg)) {
      this.primed.delete(userId);
      return "cave";
    }
    if (isMovie || (hasPrime && isBeg)) {
      this.primed.set(userId, this.now());
      return "refuse";
    }
    return "ignore";
  }

  markRendering(userId: string): void { this.rendering.add(userId); }
  clearRendering(userId: string): void { this.rendering.delete(userId); }
}
