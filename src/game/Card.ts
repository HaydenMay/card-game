export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

// Rank value used for comparisons: 2..10, J=11, Q=12, K=13, A=14 (Ace high).
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: number;
  readonly label: string;
}

const RANK_LABELS: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function makeCard(suit: Suit, rank: number): Card {
  return { id: `${suit}-${rank}`, suit, rank, label: rankLabel(rank) };
}
