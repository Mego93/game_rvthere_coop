import type { CharacterId, GolfSnapshot } from '@lodgy/shared';
import { ballsLeftText, scoreboard, turnText, type BoardRow, type LandText } from './golfView';
import type { ShotState } from './shot';

export interface GolfHudView {
  turn: string;
  balls: string;
  yourTurn: boolean;
  // `marker` is the curve marker while it sweeps, else null.
  meter: { shown: boolean; power: number; marker: number | null; hint: string };
  board: BoardRow[] | null;
  pop: LandText | null;
}

// The player on turn may shoot while no ball is in play.
export const canShoot = (golf: GolfSnapshot, local: CharacterId | null): boolean => local !== null && golf.turn === local && golf.ball === null;

const hintFor = (phase: ShotState['phase'], touch: boolean): string => {
  if (phase === 'idle') return touch ? 'Drag to aim, hold Shoot' : 'Mouse to aim, hold the left button';
  if (phase === 'charging') return 'Release to set the power';
  if (phase === 'curve') return touch ? 'Tap Shoot to curve' : 'Tap to curve';
  return '';
};

// What the golf HUD shows, from the snapshot's golf, the local friend and the state of the shot.
export function golfHudView(args: { golf: GolfSnapshot; local: CharacterId | null; shot: ShotState; boardShown: boolean; pop: LandText | null; touch: boolean }): GolfHudView {
  const { golf, local, shot } = args;
  const shown = canShoot(golf, local);
  return {
    turn: turnText(golf.turn, local),
    balls: ballsLeftText(golf.scores, local),
    yourTurn: local !== null && golf.turn === local,
    meter: { shown, power: shot.power, marker: shot.phase === 'curve' ? shot.marker : null, hint: shown ? hintFor(shot.phase, args.touch) : '' },
    board: args.boardShown ? scoreboard(golf.scores, golf.turn) : null,
    pop: args.pop,
  };
}
