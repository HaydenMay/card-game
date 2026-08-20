import type { Card } from "./Card";
import { buildStandardDeck, shuffle } from "./Deck";

export type PlayerId = "A" | "B";

export interface WarStage {
  faceDown: { A: Card[]; B: Card[] };
  flipUp: { A: Card | null; B: Card | null };
  /** Set when a player ran out of cards and could not produce a flip-up card for this stage. */
  ranOutOf: PlayerId | null;
}

export interface RoundResult {
  initial: { A: Card; B: Card };
  warStages: WarStage[];
  winner: PlayerId;
  cardsWon: Card[];
  gameOver: boolean;
  loser: PlayerId | null;
}

export interface GameOptions {
  rng?: () => number;
}

// Safety net: captured cards are reshuffled back into the winner's deck (see
// playRound), which in practice ends every game in well under a thousand
// rounds. This cap just guarantees the UI can never spin forever.
const MAX_ROUNDS = 5000;

export class WarGame {
  private decks: Record<PlayerId, Card[]> = { A: [], B: [] };
  private rng: () => number;
  private _roundNumber = 0;
  private _gameOver = false;
  private _winner: PlayerId | null = null;
  private _stalemate = false;

  constructor(options: GameOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.deal();
  }

  deal(): void {
    const deck = shuffle(buildStandardDeck(), this.rng);
    this.decks.A = deck.slice(0, 26);
    this.decks.B = deck.slice(26);
    this._roundNumber = 0;
    this._gameOver = false;
    this._winner = null;
    this._stalemate = false;
  }

  get roundNumber(): number {
    return this._roundNumber;
  }

  get isGameOver(): boolean {
    return this._gameOver;
  }

  get winner(): PlayerId | null {
    return this._winner;
  }

  get isStalemate(): boolean {
    return this._stalemate;
  }

  counts(): { A: number; B: number } {
    return { A: this.decks.A.length, B: this.decks.B.length };
  }

  /** Draws up to `count` cards for a war stage: all but the last go face down, the last flips up.
   * Returns null if the player has no cards at all. */
  private drawWarStage(player: PlayerId): { faceDown: Card[]; flipUp: Card | null } {
    const deck = this.decks[player];
    if (deck.length === 0) {
      return { faceDown: [], flipUp: null };
    }
    const burnCount = Math.min(3, deck.length - 1);
    const faceDown = deck.splice(0, burnCount);
    const flipUp = deck.shift() ?? null;
    return { faceDown, flipUp };
  }

  playRound(): RoundResult | null {
    if (this._gameOver) return null;
    if (this.decks.A.length === 0 || this.decks.B.length === 0) {
      this._gameOver = true;
      this._winner = this.decks.A.length > 0 ? "A" : "B";
      return null;
    }

    if (this._roundNumber >= MAX_ROUNDS) {
      this._gameOver = true;
      this._stalemate = true;
      this._winner = null;
      return null;
    }

    this._roundNumber++;

    const cardA0 = this.decks.A.shift()!;
    const cardB0 = this.decks.B.shift()!;
    const pot: Card[] = [cardA0, cardB0];
    const warStages: WarStage[] = [];

    let cardA = cardA0;
    let cardB = cardB0;
    let winner: PlayerId | null = null;
    let loser: PlayerId | null = null;

    while (cardA.rank === cardB.rank) {
      const drawA = this.drawWarStage("A");
      const drawB = this.drawWarStage("B");
      pot.push(...drawA.faceDown);
      if (drawA.flipUp) pot.push(drawA.flipUp);
      pot.push(...drawB.faceDown);
      if (drawB.flipUp) pot.push(drawB.flipUp);

      const ranOutOf: PlayerId | null =
        drawA.flipUp === null ? "A" : drawB.flipUp === null ? "B" : null;

      warStages.push({
        faceDown: { A: drawA.faceDown, B: drawB.faceDown },
        flipUp: { A: drawA.flipUp, B: drawB.flipUp },
        ranOutOf,
      });

      if (ranOutOf) {
        winner = ranOutOf === "A" ? "B" : "A";
        loser = ranOutOf;
        break;
      }

      cardA = drawA.flipUp!;
      cardB = drawB.flipUp!;
    }

    if (!winner) {
      winner = cardA.rank > cardB.rank ? "A" : "B";
      loser = winner === "A" ? "B" : "A";
    }

    // Shuffling captured cards before they rejoin the winner's deck avoids the
    // deterministic repeating cycles that can make an unshuffled game of War
    // run forever.
    this.decks[winner].push(...shuffle(pot, this.rng));

    const gameOver = this.decks.A.length === 0 || this.decks.B.length === 0;
    if (gameOver) {
      this._gameOver = true;
      this._winner = this.decks.A.length > 0 ? "A" : "B";
    }

    return {
      initial: { A: cardA0, B: cardB0 },
      warStages,
      winner,
      cardsWon: pot,
      gameOver,
      loser: gameOver ? loser : null,
    };
  }
}
