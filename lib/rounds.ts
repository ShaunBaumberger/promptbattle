import type { PlayerCount, Round } from "@/lib/types/database";

export interface RoundSpec {
  round: Round;
  label: string;
  matches: number;
}

export function getRoundsForPlayerCount(playerCount: PlayerCount): RoundSpec[] {
  switch (playerCount) {
    case 2:
      return [{ round: "FINAL", label: "Finale", matches: 1 }];
    case 4:
      return [
        { round: "SF", label: "Halbfinale", matches: 2 },
        { round: "FINAL", label: "Finale", matches: 1 },
      ];
    case 8:
      return [
        { round: "QF", label: "Viertelfinale", matches: 4 },
        { round: "SF", label: "Halbfinale", matches: 2 },
        { round: "FINAL", label: "Finale", matches: 1 },
      ];
    case 16:
      return [
        { round: "R16", label: "Achtelfinale", matches: 8 },
        { round: "QF", label: "Viertelfinale", matches: 4 },
        { round: "SF", label: "Halbfinale", matches: 2 },
        { round: "FINAL", label: "Finale", matches: 1 },
      ];
    case 32:
      return [
        { round: "R32", label: "Sechzehntelfinale", matches: 16 },
        { round: "R16", label: "Achtelfinale", matches: 8 },
        { round: "QF", label: "Viertelfinale", matches: 4 },
        { round: "SF", label: "Halbfinale", matches: 2 },
        { round: "FINAL", label: "Finale", matches: 1 },
      ];
  }
}

export const ROUND_LABELS: Record<Round, string> = {
  R32: "Sechzehntelfinale",
  R16: "Achtelfinale",
  QF: "Viertelfinale",
  SF: "Halbfinale",
  FINAL: "Finale",
};
