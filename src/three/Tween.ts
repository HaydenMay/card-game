export type Easing = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
};

interface ActiveTween {
  elapsed: number;
  duration: number;
  onUpdate: (t: number) => void;
  easing: Easing;
  resolve: () => void;
}

class TweenManager {
  private active: ActiveTween[] = [];

  tween(durationMs: number, onUpdate: (t: number) => void, easing: Easing = Easing.linear): Promise<void> {
    return new Promise((resolve) => {
      if (durationMs <= 0) {
        onUpdate(1);
        resolve();
        return;
      }
      this.active.push({ elapsed: 0, duration: durationMs, onUpdate, easing, resolve });
    });
  }

  update(deltaMs: number): void {
    if (this.active.length === 0) return;
    const stillActive: ActiveTween[] = [];
    for (const t of this.active) {
      t.elapsed += deltaMs;
      const rawT = Math.min(1, t.elapsed / t.duration);
      t.onUpdate(t.easing(rawT));
      if (rawT < 1) {
        stillActive.push(t);
      } else {
        t.resolve();
      }
    }
    this.active = stillActive;
  }
}

export const tweenManager = new TweenManager();

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
