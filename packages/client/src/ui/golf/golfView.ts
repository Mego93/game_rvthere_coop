import { CHARACTER_IDS, CHARACTER_NAMES, GOLF_BALLS_EACH, GOLF_BEST_HAPPINESS, GOLF_RINGS, GOLF_TEAM_DIVISOR, GOLF_TEAM_HAPPINESS_MAX, STORY_PRICES, type CharacterId, type GolfSnapshot } from '@lodgy/shared';

type Scores = GolfSnapshot['scores'];

export const turnText = (turn: CharacterId | null, local: CharacterId | null): string => (turn === null ? '' : turn === local ? 'Your turn!' : `${CHARACTER_NAMES[turn]}'s turn`);

// The local player's balls left; nothing for a friend who is not playing.
export function ballsLeftText(scores: Scores, local: CharacterId | null): string {
  const played = local === null ? undefined : scores[local];
  return played === undefined ? '' : `Balls left: ${Math.max(0, GOLF_BALLS_EACH - played.length)}`;
}

export interface BoardRow {
  id: CharacterId;
  name: string;
  // One slot per ball: its points, or null for a ball not yet hit.
  balls: (number | null)[];
  total: number;
  left: number;
  // 1 for the highest total; friends with the same total share a rank.
  rank: number;
  onTurn: boolean;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// The friends in the game in character order.
const playing = (scores: Scores): CharacterId[] => CHARACTER_IDS.filter((id) => scores[id] !== undefined);

export function scoreboard(scores: Scores, turn: CharacterId | null): BoardRow[] {
  const totals = new Map(playing(scores).map((id) => [id, sum(scores[id] ?? [])]));
  return playing(scores).map((id) => {
    const balls = scores[id] ?? [];
    const total = totals.get(id)!;
    return {
      id,
      name: CHARACTER_NAMES[id],
      balls: Array.from({ length: GOLF_BALLS_EACH }, (_, i) => balls[i] ?? null),
      total,
      left: Math.max(0, GOLF_BALLS_EACH - balls.length),
      rank: 1 + [...totals.values()].filter((other) => other > total).length,
      onTurn: id === turn,
    };
  });
}

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export interface LandText {
  text: string;
  tone: 'hit' | 'bull' | 'jackpot' | 'miss';
}

// What a landing says: the ring, the points, and whether it was a bullseye (the doubled centre).
export function landText(ring: string | null, points: number): LandText {
  if (ring === null) return { text: 'Missed', tone: 'miss' };
  const base = GOLF_RINGS.find((entry) => entry.id === ring)?.points ?? points;
  const bull = points > base;
  if (ring === 'jackpot') return { text: bull ? `JACKPOT bullseye! +${points}` : `JACKPOT! +${points}`, tone: 'jackpot' };
  return { text: `${bull ? 'Bullseye! ' : ''}${capital(ring)} ring +${points}`, tone: bull ? 'bull' : 'hit' };
}

export interface Standings {
  rows: BoardRow[];
  // The friends tied at the top, none when there is no spread.
  best: CharacterId[];
  worst: CharacterId | null;
  // What the worst friend pays: a coffee for everyone playing, in dirhams.
  coffeeTotal: number;
  // Happiness every friend gets from the team total.
  team: number;
  lines: string[];
}

const names = (ids: readonly CharacterId[]): string => (ids.length === 1 ? CHARACTER_NAMES[ids[0]!] : `${ids.slice(0, -1).map((id) => CHARACTER_NAMES[id]).join(', ')} and ${CHARACTER_NAMES[ids[ids.length - 1]!]}`);

// The end of the game as the server applies it (golfResults): the best gain happiness, the lowest pays the coffee, everyone gets the team bonus. With one friend or a tie for the top, there is no best and no worst.
export function golfStandings(scores: Scores): Standings {
  const rows = scoreboard(scores, null);
  const totals = rows.map((row) => row.total);
  const top = Math.max(...totals);
  const bottom = Math.min(...totals);
  const spread = rows.length > 1 && top > bottom;
  const best = spread ? rows.filter((row) => row.total === top).map((row) => row.id) : [];
  const worst = spread ? rows[totals.indexOf(bottom)]!.id : null;
  const coffeeTotal = STORY_PRICES.coffee * rows.length;
  const average = rows.length === 0 ? 0 : sum(totals) / rows.length;
  const team = Math.min(GOLF_TEAM_HAPPINESS_MAX, Math.round(average / GOLF_TEAM_DIVISOR));
  const lines: string[] = [];
  if (best.length > 0) lines.push(`Best: ${names(best)} with ${top}, +${GOLF_BEST_HAPPINESS} happiness`);
  if (worst !== null) lines.push(`Worst: ${CHARACTER_NAMES[worst]} with ${bottom} pays coffee for everyone (${coffeeTotal} dh)`);
  lines.push(`Team bonus: +${team} happiness for everyone`);
  return { rows, best, worst, coffeeTotal, team, lines };
}
