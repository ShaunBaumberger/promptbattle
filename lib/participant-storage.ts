export function participantStorageKey(tournamentCode: string): string {
  return `pb:${tournamentCode}:participantId`;
}
