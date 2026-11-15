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

// The first candidate whose claim is free, or null after `attempts` tries.
export async function allocate(
  candidates: Iterator<string>,
  tryClaim: (noun: string) => Promise<ClaimResult>,
  attempts = 20,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const next = candidates.next();
    if (next.done) return null;
    if ((await tryClaim(next.value)) === 'free') return next.value;
  }
  return null;
}
