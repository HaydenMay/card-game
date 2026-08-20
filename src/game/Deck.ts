import { type Card, makeCard, SUITS } from "./Card";

export function buildStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push(makeCard(suit, rank));
    }
  }
  return deck;
}

// Fisher-Yates shuffle, returns a new array.
export function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
