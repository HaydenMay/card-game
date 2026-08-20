const TAU = Math.PI * 2;

export type RunningStyle = "front-runner" | "stalker" | "closer";

export interface HorseSpec {
  id: number;
  name: string;
  style: RunningStyle;
  /** Public measure of class, roughly 0.965 - 1.035. Prices the market. */
  rating: number;
  /** How well the horse holds its speed late, 0 - 1. */
  stamina: number;
  coat: number;
  mane: number;
  silks: number;
  cap: number;
}

export interface Runner {
  spec: HorseSpec;
  lane: number;
  distance: number;
  speed: number;
  finished: boolean;
  finishTime: number | null;
  place: number | null;
  /**
   * How well the horse runs on the day. Drawn fresh each race and never shown
   * to the punter — without it the market's favourite simply always wins.
   */
  form: number;
  /** Randomised wave parameters that give each horse its own rhythm. */
  noise: { a: number; b: number; c: number };
}

export interface RaceResult {
  runner: Runner;
  place: number;
  time: number;
  margin: number;
}

const NAMES = [
  "Thunderhoof",
  "Midnight Dancer",
  "Copper Comet",
  "Silver Lining",
  "Blaze Runner",
  "Iron Duke",
];

const COATS = [0x6b3f22, 0x2e2724, 0x9c5a2a, 0x9a9a9e, 0x7a4526, 0x4a3327];
const MANES = [0x3a2213, 0x17130f, 0x5c2f14, 0xd6d6da, 0x2b1a10, 0x241a12];
const SILKS = [0xd83b3b, 0x2f6fd0, 0x2fa055, 0xe4b526, 0x8a4fd0, 0xe07b2a];
const CAPS = [0xffffff, 0xf2d84a, 0x1c1c1c, 0x2f6fd0, 0xffffff, 0x1c1c1c];
const STYLES: RunningStyle[] = ["front-runner", "stalker", "closer"];

export const RACE_DISTANCE = 612;
/** Chosen so the field breaks on the back straight and finishes mid-stretch. */
export const START_DISTANCE = 205.66;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function buildField(): HorseSpec[] {
  // Deal out a balanced spread of running styles rather than rolling each
  // independently — six closers makes for a processional race.
  const styles = [...STYLES, ...STYLES];
  for (let i = styles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [styles[i], styles[j]] = [styles[j], styles[i]];
  }

  return NAMES.map((name, i) => ({
    id: i,
    name,
    style: styles[i],
    rating: rand(0.965, 1.035),
    stamina: rand(0.35, 1),
    coat: COATS[i],
    mane: MANES[i],
    silks: SILKS[i],
    cap: CAPS[i],
  }));
}

/** Rough win chances from ratings, used to price the board. */
export function computeOdds(field: HorseSpec[]): number[] {
  // The multiplier sets how sharply class separates the market. Too steep and
  // the board collapses into one odds-on favourite with everything else
  // pinned at the display ceiling.
  const weights = field.map((h) => Math.exp((h.rating - 1) * 22 + h.stamina * 0.5));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => {
    const probability = w / total;
    // 12% take-out, then clamp to a sane display range.
    return Math.max(1.5, Math.min(30, (1 / probability) * 0.88));
  });
}

/**
 * Speed multiplier over the course of the race for each running style. These
 * curves are what produce lead changes: front-runners bolt and tire, closers
 * come from off the pace in the stretch.
 */
function styleCurve(progress: number, style: RunningStyle): number {
  switch (style) {
    case "front-runner":
      return 1.055 - 0.11 * progress;
    case "closer":
      return 0.937 + 0.152 * Math.pow(progress, 1.4);
    case "stalker":
    default:
      return 0.985 + 0.03 * progress;
  }
}

export class RaceSim {
  readonly runners: Runner[];
  readonly distance = RACE_DISTANCE;
  elapsed = 0;
  finishedCount = 0;

  constructor(field: HorseSpec[], laneOffsets: number[]) {
    this.runners = field.map((spec, i) => ({
      spec,
      lane: laneOffsets[i],
      distance: 0,
      speed: 0,
      finished: false,
      finishTime: null,
      place: null,
      form: rand(0.95, 1.05),
      noise: { a: rand(0.5, 1.1), b: rand(1.3, 2.2), c: rand(0, TAU) },
    }));
  }

  get isComplete(): boolean {
    return this.finishedCount >= this.runners.length;
  }

  update(dt: number): void {
    this.elapsed += dt;

    for (const runner of this.runners) {
      if (runner.finished) {
        // Let finishers gallop out rather than stopping dead on the wire.
        runner.speed += (16 - runner.speed) * Math.min(1, dt * 0.7);
        runner.distance += runner.speed * dt;
        continue;
      }

      const progress = Math.min(1, runner.distance / this.distance);
      const { noise } = runner;
      const wobble =
        0.014 * Math.sin(this.elapsed * noise.a + noise.c) +
        0.009 * Math.sin(this.elapsed * noise.b + noise.c * 1.7);

      // Stamina only bites in the last 45% of the trip.
      const fade = 1 - (1 - runner.spec.stamina) * Math.max(0, progress - 0.55) * 0.42;

      const target =
        19.4 *
        runner.spec.rating *
        runner.form *
        styleCurve(progress, runner.spec.style) *
        fade *
        (1 + wobble);

      // Ease toward the target so the break out of the gate looks like
      // acceleration rather than a teleport to top speed.
      const responsiveness = runner.speed < target ? 2.6 : 1.4;
      runner.speed += (target - runner.speed) * Math.min(1, dt * responsiveness);
      runner.distance += runner.speed * dt;

      if (runner.distance >= this.distance) {
        runner.finished = true;
        this.finishedCount++;
        runner.place = this.finishedCount;
        // Interpolate the exact crossing so photo finishes are honest rather
        // than quantised to whichever frame happened to land first.
        const overshoot = runner.distance - this.distance;
        runner.finishTime = this.elapsed - (runner.speed > 0 ? overshoot / runner.speed : 0);
      }
    }
  }

  /** Live running order, leader first. */
  order(): Runner[] {
    return [...this.runners].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      return b.distance - a.distance;
    });
  }

  results(): RaceResult[] {
    const sorted = [...this.runners].sort((a, b) => (a.finishTime ?? 0) - (b.finishTime ?? 0));
    const winnerTime = sorted[0]?.finishTime ?? 0;
    return sorted.map((runner, i) => ({
      runner,
      place: i + 1,
      time: runner.finishTime ?? 0,
      margin: (runner.finishTime ?? 0) - winnerTime,
    }));
  }
}
