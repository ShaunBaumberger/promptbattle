import type { PlayerCount, Round } from "@/lib/types/database";
import { getRoundsForPlayerCount } from "@/lib/rounds";

export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface NextSlot {
  round: Round;
  position: number;
  slot: "A" | "B";
}

export function getNextSlot(
  round: Round,
  position: number,
  playerCount: PlayerCount,
): NextSlot | null {
  const order = getRoundsForPlayerCount(playerCount).map((r) => r.round);
  const idx = order.indexOf(round);
  if (idx === -1 || idx === order.length - 1) return null;
  return {
    round: order[idx + 1],
    position: Math.floor(position / 2),
    slot: position % 2 === 0 ? "A" : "B",
  };
}
