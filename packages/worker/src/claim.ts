export const CLAIM_SECONDS = 15;

export type ClaimResult = 'free' | 'taken';

export interface Claim {
  // `roomExists`: the Object holds a connection or a room. A free answer reserves the noun for CLAIM_SECONDS.
  tryClaim(roomExists: boolean): ClaimResult;
  release(): void;
}

export function createClaim(now: () => number): Claim {
  let until = -Infinity;
  return {
    tryClaim(roomExists) {
      if (roomExists || now() < until) return 'taken';
      until = now() + CLAIM_SECONDS;
      return 'free';
    },
    release() {
      until = -Infinity;
    },
  };
}

// Tries `attempts` nouns, each from a fresh random draw so that a run of live nouns cannot use up every attempt.
export async function allocate(
  pick: () => string,
  tryClaim: (noun: string) => Promise<ClaimResult>,
  attempts = 20,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const noun = pick();
    if ((await tryClaim(noun)) === 'free') return noun;
  }
  return null;
}
