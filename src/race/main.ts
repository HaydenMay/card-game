import "./style.css";
import { RaceScene, type CameraMode } from "./RaceScene";
import { RaceSim, buildField, computeOdds, type HorseSpec } from "./RaceSim";

type Phase = "paddock" | "countdown" | "racing" | "finished";

const STAKE = 10;
const BANKROLL_KEY = "silks-bankroll";
/** Metres per horse length, used to express gaps the way a race caller would. */
const HORSE_LENGTH = 2.4;

const container = document.getElementById("scene-container")!;
const scene = new RaceScene(container);

const el = {
  status: document.getElementById("race-status")!,
  leaderboard: document.getElementById("leaderboard")!,
  leaderboardList: document.getElementById("leaderboard-list")!,
  clock: document.getElementById("race-clock")!,
  cameraControls: document.getElementById("camera-controls")!,
  speedControls: document.getElementById("speed-controls")!,
  countdown: document.getElementById("countdown")!,
  paddock: document.getElementById("paddock")!,
  fieldList: document.getElementById("field-list")!,
  bankroll: document.getElementById("bankroll")!,
  btnStart: document.getElementById("btn-start") as HTMLButtonElement,
  results: document.getElementById("results")!,
  resultsHeading: document.getElementById("results-heading")!,
  resultsList: document.getElementById("results-list")!,
  photoFinish: document.getElementById("photo-finish")!,
  payout: document.getElementById("payout")!,
  btnAgain: document.getElementById("btn-again") as HTMLButtonElement,
};

const laneOffsets = [-6, -3.6, -1.2, 1.2, 3.6, 6];

let phase: Phase = "paddock";
let field: HorseSpec[] = [];
let odds: number[] = [];
let sim: RaceSim;
let pickedId: number | null = null;
let simSpeed = 1.5;
let countdownRemaining = 0;
let sinceStart = 0;
let bankroll = loadBankroll();

function loadBankroll(): number {
  const raw = Number(localStorage.getItem(BANKROLL_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

function saveBankroll(): void {
  localStorage.setItem(BANKROLL_KEY, String(bankroll));
  el.bankroll.textContent = String(Math.round(bankroll));
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function styleLabel(spec: HorseSpec): string {
  const stamina = spec.stamina > 0.7 ? "strong stayer" : spec.stamina > 0.4 ? "sound" : "may tire";
  return `${spec.style} · ${stamina}`;
}

function newRace(): void {
  field = buildField();
  odds = computeOdds(field);
  sim = new RaceSim(field, laneOffsets);
  pickedId = null;

  scene.addHorses(field);
  scene.setGateVisible(true);
  scene.syncHorses(sim, 0);
  scene.resetCamera(sim);

  renderField();
  el.btnStart.disabled = true;
  el.btnStart.textContent = "Pick a runner";
  setPhase("paddock");
}

function renderField(): void {
  el.fieldList.innerHTML = "";
  field.forEach((spec, i) => {
    const card = document.createElement("button");
    card.className = "horse-card";
    card.type = "button";

    const number = document.createElement("div");
    number.className = "card-number";
    number.style.background = hex(spec.silks);
    number.textContent = String(i + 1);

    const body = document.createElement("div");
    body.className = "card-body";
    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = spec.name;
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = styleLabel(spec);
    body.append(name, meta);

    const price = document.createElement("div");
    price.className = "card-odds";
    price.textContent = `×${odds[i].toFixed(1)}`;

    card.append(number, body, price);
    card.addEventListener("click", () => {
      pickedId = spec.id;
      for (const other of el.fieldList.children) other.classList.remove("selected");
      card.classList.add("selected");
      el.btnStart.disabled = false;
      el.btnStart.textContent = `Back ${spec.name} · ${STAKE}`;
    });

    el.fieldList.appendChild(card);
  });
  saveBankroll();
}

function setPhase(next: Phase): void {
  phase = next;
  el.paddock.classList.toggle("hidden", next !== "paddock");
  el.results.classList.toggle("hidden", next !== "finished");
  el.countdown.classList.toggle("hidden", next !== "countdown");

  const racingHud = next === "racing" || next === "countdown";
  el.leaderboard.classList.toggle("hidden", !racingHud);
  el.clock.classList.toggle("hidden", !racingHud);
  el.cameraControls.classList.toggle("hidden", !racingHud);
  el.speedControls.classList.toggle("hidden", !racingHud);

  el.status.textContent =
    next === "paddock"
      ? "Paddock"
      : next === "countdown"
        ? "At the gate"
        : next === "racing"
          ? "And they're off"
          : "Result";
}

function startCountdown(): void {
  if (pickedId === null) return;
  bankroll -= STAKE;
  saveBankroll();
  countdownRemaining = 3;
  sinceStart = 0;
  el.countdown.textContent = "3";
  setPhase("countdown");
}

function updateLeaderboard(): void {
  const order = sim.order();
  const leader = order[0];
  el.leaderboardList.innerHTML = "";

  order.forEach((runner, i) => {
    const li = document.createElement("li");
    if (runner.spec.id === pickedId) li.classList.add("is-player");

    const pos = document.createElement("span");
    pos.className = "lb-pos";
    pos.textContent = String(i + 1);

    const chip = document.createElement("span");
    chip.className = "silk-chip";
    chip.style.background = hex(runner.spec.silks);

    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = runner.spec.name;

    const gap = document.createElement("span");
    gap.className = "lb-gap";
    if (i === 0) {
      gap.textContent = runner.finished ? "✓" : "—";
    } else {
      const lengths = (leader.distance - runner.distance) / HORSE_LENGTH;
      gap.textContent = `${lengths.toFixed(1)}L`;
    }

    li.append(pos, chip, name, gap);
    el.leaderboardList.appendChild(li);
  });
}

/** Tight margins are called, not measured — "+0.0L" reads like a bug. */
function marginLabel(marginSeconds: number): string {
  const lengths = marginSeconds / HORSE_LENGTH;
  if (lengths < 0.05) return "nose";
  if (lengths < 0.15) return "head";
  if (lengths < 0.3) return "neck";
  return `+${lengths.toFixed(1)}L`;
}

function showResults(): void {
  const results = sim.results();
  el.resultsList.innerHTML = "";

  results.forEach((result) => {
    const li = document.createElement("li");
    if (result.place === 1) li.classList.add("winner");

    const place = document.createElement("span");
    place.className = "res-place";
    place.textContent = `${result.place}`;

    const chip = document.createElement("span");
    chip.className = "silk-chip";
    chip.style.background = hex(result.runner.spec.silks);

    const name = document.createElement("span");
    name.className = "res-name";
    name.textContent = result.runner.spec.name;

    const time = document.createElement("span");
    time.className = "res-time";
    time.textContent =
      result.place === 1 ? `${result.time.toFixed(2)}s` : marginLabel(result.margin);

    li.append(place, chip, name, time);
    el.resultsList.appendChild(li);
  });

  const margin = results[1] ? results[1].margin : 1;
  const isPhoto = margin < 0.06;
  el.photoFinish.classList.toggle("hidden", !isPhoto);

  const winner = results[0];
  el.resultsHeading.textContent = `${winner.runner.spec.name} wins`;

  const won = winner.runner.spec.id === pickedId;
  if (won) {
    const index = field.findIndex((h) => h.id === pickedId);
    const payout = STAKE * odds[index];
    bankroll += payout;
    el.payout.className = "payout win";
    el.payout.textContent = `Your pick came home — collect ${payout.toFixed(0)}`;
  } else {
    el.payout.className = "payout lose";
    const picked = field.find((h) => h.id === pickedId);
    const placed = results.find((r) => r.runner.spec.id === pickedId);
    el.payout.textContent = picked
      ? `${picked.name} finished ${placed?.place ?? "—"}. Stake lost.`
      : "Stake lost.";
  }

  if (bankroll < STAKE) {
    bankroll = 100;
    el.payout.textContent += " · Bankroll topped back up to 100.";
  }
  saveBankroll();

  setPhase("finished");
}

el.btnStart.addEventListener("click", startCountdown);
el.btnAgain.addEventListener("click", newRace);

el.cameraControls.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".cam-btn");
  if (!button) return;
  scene.cameraMode = button.dataset.cam as CameraMode;
  for (const b of el.cameraControls.children) b.classList.remove("active");
  button.classList.add("active");
});

el.speedControls.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".speed-btn");
  if (!button) return;
  simSpeed = Number(button.dataset.speed);
  for (const b of el.speedControls.children) b.classList.remove("active");
  button.classList.add("active");
});

newRace();

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (phase === "countdown") {
    countdownRemaining -= dt;
    if (countdownRemaining <= 0) {
      setPhase("racing");
    } else {
      const shown = Math.ceil(countdownRemaining);
      el.countdown.textContent = shown > 0 ? String(shown) : "GO";
    }
  }

  if (phase === "racing") {
    const step = dt * simSpeed;
    sim.update(step);
    sinceStart += step;
    // The gate is wheeled away once the field has cleared it.
    if (sinceStart > 2.5) scene.setGateVisible(false);
    el.clock.textContent = `${sim.elapsed.toFixed(2)}s`;
    updateLeaderboard();
    if (sim.isComplete) showResults();
    scene.syncHorses(sim, step);
  } else if (phase === "finished") {
    // Keep the gallop-out running behind the results card.
    sim.update(dt * simSpeed);
    scene.syncHorses(sim, dt * simSpeed);
  } else {
    scene.syncHorses(sim, dt);
  }

  scene.updateCamera(sim, dt);
  scene.render();
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy for poking at the scene from the console while tuning the gait.
  (window as unknown as Record<string, unknown>).__race = { scene, getSim: () => sim };
}
