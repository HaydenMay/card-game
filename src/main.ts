import "./style.css";
import { WarGame } from "./game/WarGame";
import { TableScene } from "./three/TableScene";
import { BattleController } from "./three/BattleController";
import { wait } from "./three/Tween";

const container = document.getElementById("scene-container")!;
const scene = new TableScene(container);
scene.start();

const game = new WarGame();
const controller = new BattleController(scene);

const el = {
  countA: document.getElementById("count-a")!,
  countB: document.getElementById("count-b")!,
  roundNumber: document.getElementById("round-number")!,
  logList: document.getElementById("log-list")!,
  btnDeal: document.getElementById("btn-deal") as HTMLButtonElement,
  btnStep: document.getElementById("btn-step") as HTMLButtonElement,
  btnAuto: document.getElementById("btn-auto") as HTMLButtonElement,
  speedSlider: document.getElementById("speed-slider") as HTMLInputElement,
  winnerBanner: document.getElementById("winner-banner")!,
  winnerText: document.getElementById("winner-text")!,
  btnPlayAgain: document.getElementById("btn-play-again") as HTMLButtonElement,
};

const MAX_LOG_LINES = 40;
let isAnimating = false;
let autoPlaying = false;

function addLog(msg: string): void {
  const line = document.createElement("div");
  line.textContent = msg;
  el.logList.appendChild(line);
  while (el.logList.children.length > MAX_LOG_LINES) {
    el.logList.removeChild(el.logList.firstChild!);
  }
  el.logList.scrollTop = el.logList.scrollHeight;
}

function updateCounts(): void {
  const counts = game.counts();
  el.countA.textContent = String(counts.A);
  el.countB.textContent = String(counts.B);
  el.roundNumber.textContent = String(game.roundNumber);
}

function setControlsEnabled(enabled: boolean): void {
  el.btnDeal.disabled = !enabled;
  el.btnStep.disabled = !enabled || game.isGameOver;
  el.btnAuto.disabled = !enabled || game.isGameOver;
}

function showWinnerBanner(): void {
  if (game.isStalemate) {
    el.winnerText.textContent = "Stalemate — declared a draw after 5000 rounds";
  } else {
    el.winnerText.textContent = `Player ${game.winner} wins the game!`;
  }
  el.winnerBanner.classList.remove("hidden");
}

function hideWinnerBanner(): void {
  el.winnerBanner.classList.add("hidden");
}

async function playOneRound(): Promise<void> {
  if (game.isGameOver || isAnimating) return;
  isAnimating = true;
  setControlsEnabled(false);

  const result = game.playRound();
  if (result) {
    await controller.playRound(result, addLog);
    updateCounts();
    scene.setPileCount("A", game.counts().A);
    scene.setPileCount("B", game.counts().B);
    if (result.gameOver) {
      addLog(`Game over — Player ${game.winner} wins with all 52 cards!`);
      autoPlaying = false;
      el.btnAuto.classList.remove("active");
      el.btnAuto.textContent = "Auto Play";
      showWinnerBanner();
    }
  } else if (game.isGameOver) {
    addLog("Game stopped — stalemate after 5000 rounds.");
    autoPlaying = false;
    el.btnAuto.classList.remove("active");
    el.btnAuto.textContent = "Auto Play";
    showWinnerBanner();
  }

  isAnimating = false;
  setControlsEnabled(true);
}

async function autoLoop(): Promise<void> {
  while (autoPlaying && !game.isGameOver) {
    await playOneRound();
    if (!autoPlaying || game.isGameOver) break;
    const speed = parseFloat(el.speedSlider.value);
    await wait(550 / speed);
  }
}

function resetGame(): void {
  autoPlaying = false;
  el.btnAuto.classList.remove("active");
  el.btnAuto.textContent = "Auto Play";
  hideWinnerBanner();

  for (const child of [...scene.battleGroup.children]) {
    scene.battleGroup.remove(child);
  }

  game.deal();
  el.logList.innerHTML = "";
  scene.setPileCount("A", game.counts().A);
  scene.setPileCount("B", game.counts().B);
  updateCounts();
  addLog("New game dealt — 26 cards each.");
  setControlsEnabled(true);
}

el.btnDeal.addEventListener("click", () => {
  if (isAnimating) return;
  resetGame();
});

el.btnStep.addEventListener("click", () => {
  if (isAnimating || game.isGameOver) return;
  void playOneRound();
});

el.btnAuto.addEventListener("click", () => {
  autoPlaying = !autoPlaying;
  el.btnAuto.classList.toggle("active", autoPlaying);
  el.btnAuto.textContent = autoPlaying ? "Stop" : "Auto Play";
  if (autoPlaying) void autoLoop();
});

el.btnPlayAgain.addEventListener("click", () => {
  resetGame();
});

scene.setPileCount("A", game.counts().A);
scene.setPileCount("B", game.counts().B);
updateCounts();
addLog("New game dealt — 26 cards each.");
