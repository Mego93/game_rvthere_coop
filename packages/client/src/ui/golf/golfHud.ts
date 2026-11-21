import type { GolfHudView } from './golfHudView';
import { golfStandings, type BoardRow, type Standings } from './golfView';
import type { GolfSnapshot } from '@lodgy/shared';

// The golf HUD (turn, balls left, the power and curve meter, the landing popup and the scoreboard) and the results panel. Colours are theme tokens.
const STYLE = `
#golf-hud { position: fixed; inset: 0; z-index: 6; box-sizing: border-box; pointer-events: none; user-select: none; -webkit-user-select: none; color: var(--on-glass); text-shadow: var(--glass-text-shadow); font: 600 13px/1.3 var(--font-text); font-variant-numeric: tabular-nums; }
#golf-hud[hidden], #golf-hud [hidden] { display: none !important; }
#golf-hud .glass { background: var(--glass); border: 1px solid var(--glass-line); border-radius: 12px; }
#golf-hud #golf-turn { position: absolute; top: calc(8px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; height: 28px; padding: 0 14px; display: flex; align-items: center; white-space: nowrap; font: 700 16px/1 var(--font-display); }
#golf-hud #golf-turn.mine { border-color: var(--glass-accent); color: var(--glass-accent); }
#golf-hud #golf-balls { position: absolute; top: calc(40px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; height: 24px; padding: 0 12px; display: flex; align-items: center; white-space: nowrap; font-size: 12px; }
#golf-hud #golf-meter { position: absolute; left: 50%; bottom: calc(12px + var(--safe-bottom)); transform: translateX(-50%); box-sizing: border-box; width: min(250px, calc(100vw - 2 * (var(--safe-left) + 180px))); padding: 8px 10px; display: grid; gap: 6px; }
#golf-meter .row { display: grid; grid-template-columns: 42px 1fr; align-items: center; gap: 8px; font-size: 11px; }
#golf-meter .track { position: relative; height: 12px; background: var(--glass-track); border-radius: 6px; overflow: hidden; }
#golf-power > i { display: block; height: 100%; width: 100%; background: var(--glass-good); transform-origin: left; transform: scaleX(0); }
#golf-power.high > i { background: var(--glass-accent); }
#golf-curve .mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--glass-line-strong); }
#golf-curve .marker { position: absolute; top: 1px; bottom: 1px; left: 50%; width: 8px; margin-left: -4px; border-radius: 4px; background: var(--glass-info); }
#golf-meter #golf-hint { text-align: center; font-size: 11px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#golf-hud #golf-pop { position: absolute; top: calc(76px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; height: 40px; padding: 0 18px; display: flex; align-items: center; white-space: nowrap; font: 700 22px/1 var(--font-display); animation: golf-pop 220ms var(--ease) both; }
#golf-pop.bull, #golf-pop.jackpot { border-color: var(--glass-accent); color: var(--glass-accent); }
#golf-pop.miss { color: var(--glass-bad); }
#golf-hud #golf-board { position: absolute; top: calc(122px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; padding: 8px 10px; display: grid; gap: 3px; max-width: calc(100vw - 2 * (var(--safe-left) + 8px)); }
#golf-board .line { display: grid; grid-template-columns: 78px auto 44px; align-items: center; gap: 8px; height: 22px; }
#golf-board .line.head { font-size: 11px; opacity: 0.8; height: 16px; }
#golf-board .line.mine .name, #golf-board .line.turn .name { color: var(--glass-accent); }
#golf-board .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#golf-board .balls { display: flex; gap: 3px; }
#golf-board .ball { box-sizing: border-box; width: 26px; height: 18px; display: grid; place-items: center; font-size: 11px; border-radius: 9px; background: var(--glass-faint); }
#golf-board .ball.hit { background: var(--glass-track); }
#golf-board .ball.zero { opacity: 0.5; }
#golf-board .total { text-align: right; font-weight: 700; }
#golf-hud.touch #golf-board { left: auto; right: calc(12px + var(--safe-right)); transform: none; top: calc(118px + var(--safe-top)); padding: 6px 8px; gap: 2px; }
#golf-hud.touch #golf-board .line { height: 18px; grid-template-columns: 64px auto 36px; gap: 5px; }
#golf-hud.touch #golf-board .ball { width: 22px; height: 15px; font-size: 10px; }
#hud.golf-world #hud-compass, #hud.golf-world #hud-minimap, #hud.golf-world #hud-vehicle, #hud.golf-world #hud-health, #hud.golf-world #hud-dashboard, #hud.golf-world #hud-slots, #hud.golf-world #hud-prompt, #hud.golf-world #hud-combat, #hud.golf-world #hud-seat-toast { display: none !important; }
body.golf-world #touch-slots, body.golf-world #touch-view { display: none !important; }
@keyframes golf-pop { from { opacity: 0; transform: translateX(-50%) scale(0.8); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
@media (prefers-reduced-motion: reduce) { #golf-hud #golf-pop { animation: none; } }
`;

export interface GolfHud {
  update(view: GolfHudView, localId: string | null): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, parent: HTMLElement, id?: string, className?: string): HTMLElementTagNameMap[K] => {
  const node = doc.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  parent.append(node);
  return node;
};

function boardLines(doc: Document, rows: readonly BoardRow[], localId: string | null): HTMLElement[] {
  const head = doc.createElement('div');
  head.className = 'line head';
  for (const text of ['Player', 'Balls', 'Total']) {
    const cell = doc.createElement('span');
    cell.textContent = text;
    if (text === 'Total') cell.style.textAlign = 'right';
    head.append(cell);
  }
  return [
    head,
    ...rows.map((row) => {
      const line = doc.createElement('div');
      line.className = `line${row.id === localId ? ' mine' : ''}${row.onTurn ? ' turn' : ''}`;
      const name = doc.createElement('span');
      name.className = 'name';
      name.textContent = row.name;
      const balls = doc.createElement('span');
      balls.className = 'balls';
      for (const points of row.balls) {
        const ball = doc.createElement('span');
        ball.className = `ball${points === null ? '' : points === 0 ? ' zero' : ' hit'}`;
        ball.textContent = points === null ? '' : String(points);
        balls.append(ball);
      }
      const total = doc.createElement('span');
      total.className = 'total';
      total.textContent = String(row.total);
      line.append(name, balls, total);
      return line;
    }),
  ];
}

// `localCharacter` marks the local friend's row in the board.
export function createGolfHud(doc: Document, opts: { touch: boolean }): GolfHud {
  const root = doc.createElement('div');
  root.id = 'golf-hud';
  root.classList.toggle('touch', opts.touch);
  const style = doc.createElement('style');
  style.textContent = STYLE;
  root.append(style);

  const turn = el(doc, 'div', root, 'golf-turn', 'glass');
  const balls = el(doc, 'div', root, 'golf-balls', 'glass');
  const meter = el(doc, 'div', root, 'golf-meter', 'glass');
  const powerRow = el(doc, 'div', meter, undefined, 'row');
  el(doc, 'span', powerRow).textContent = 'Power';
  const power = el(doc, 'div', powerRow, 'golf-power', 'track');
  const powerFill = el(doc, 'i', power);
  const curveRow = el(doc, 'div', meter, undefined, 'row');
  el(doc, 'span', curveRow).textContent = 'Curve';
  const curve = el(doc, 'div', curveRow, 'golf-curve', 'track');
  el(doc, 'i', curve, undefined, 'mid');
  const marker = el(doc, 'i', curve, undefined, 'marker');
  const hint = el(doc, 'div', meter, 'golf-hint');
  const pop = el(doc, 'div', root, 'golf-pop', 'glass');
  const board = el(doc, 'div', root, 'golf-board', 'glass');
  for (const node of [turn, balls, meter, pop, board]) node.hidden = true;

  doc.body.append(root);
  doc.getElementById('hud')?.classList.add('golf-world');
  doc.body.classList.add('golf-world');

  const cache = new Map<string, unknown>();
  const changed = (slot: string, value: unknown) => {
    if (cache.get(slot) === value) return false;
    cache.set(slot, value);
    return true;
  };

  return {
    update(view, localId) {
      if (changed('turn', view.turn)) {
        turn.textContent = view.turn;
        turn.hidden = view.turn === '';
      }
      if (changed('mine', view.yourTurn)) turn.classList.toggle('mine', view.yourTurn);
      if (changed('balls', view.balls)) {
        balls.textContent = view.balls;
        balls.hidden = view.balls === '';
      }
      if (changed('meter', view.meter.shown)) meter.hidden = !view.meter.shown;
      if (view.meter.shown) {
        if (changed('power', view.meter.power)) {
          powerFill.style.transform = `scaleX(${view.meter.power})`;
          power.classList.toggle('high', view.meter.power > 0.85);
        }
        if (changed('marker', view.meter.marker)) {
          marker.hidden = view.meter.marker === null;
          if (view.meter.marker !== null) marker.style.left = `calc(50% + ${view.meter.marker * 45}%)`;
        }
        if (changed('hint', view.meter.hint)) hint.textContent = view.meter.hint;
      }
      const popKey = view.pop ? `${view.pop.tone}|${view.pop.text}` : '';
      if (changed('pop', popKey)) {
        pop.hidden = view.pop === null;
        pop.className = `glass ${view.pop?.tone ?? ''}`;
        pop.textContent = view.pop?.text ?? '';
      }
      const boardKey = view.board ? `${localId}|${JSON.stringify(view.board)}` : '';
      if (changed('board', boardKey)) {
        board.hidden = view.board === null;
        if (view.board) board.replaceChildren(...boardLines(doc, view.board, localId));
      }
    },
    setVisible: (visible) => void (root.hidden = !visible),
    dispose() {
      doc.getElementById('hud')?.classList.remove('golf-world');
      doc.body.classList.remove('golf-world');
      root.remove();
    },
  };
}

const RESULTS_STYLE = `
#golf-results { position: fixed; left: 50%; top: calc(50% - var(--safe-bottom) / 2); transform: translate(-50%, -50%); z-index: 25; box-sizing: border-box; width: min(420px, calc(100vw - 2 * (var(--safe-left) + 12px))); max-height: calc(100vh - 2 * (var(--safe-top) + 12px) - var(--safe-bottom)); overflow: auto; padding: 14px 16px; display: grid; gap: 8px; color: var(--on-glass); background: var(--glass-strong); border: 2px solid var(--glass-line-strong); border-radius: 16px; text-shadow: var(--glass-text-shadow); font: 600 14px/1.35 var(--font-text); font-variant-numeric: tabular-nums; animation: golf-results-in 260ms var(--ease) both; }
#golf-results[hidden] { display: none; }
#golf-results h2 { margin: 0; font: 700 20px/1.1 var(--font-display); color: var(--glass-accent); }
#golf-results .rows { display: grid; gap: 2px; }
#golf-results .row { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: baseline; }
#golf-results .row.best { color: var(--glass-good); }
#golf-results .row.worst { color: var(--glass-bad); }
#golf-results .rank { opacity: 0.7; }
#golf-results .total { font-weight: 700; }
#golf-results .lines { display: grid; gap: 3px; font-size: 13px; }
#golf-results button { justify-self: end; min-height: 32px; padding: 4px 14px; font: 600 13px/1 var(--font-text); color: var(--on-glass); background: var(--glass); border: 2px solid var(--glass-line-strong); border-radius: 10px; cursor: pointer; }
@keyframes golf-results-in { from { opacity: 0; transform: translate(-50%, -46%); } to { opacity: 1; transform: translate(-50%, -50%); } }
@media (max-height: 420px) { #golf-results { padding: 8px 12px; gap: 4px; font-size: 12px; } #golf-results h2 { font-size: 16px; } #golf-results .lines { font-size: 12px; gap: 1px; } #golf-results button { min-height: 28px; } }
@media (prefers-reduced-motion: reduce) { #golf-results { animation: none; } }
`;

// How long the results stay over the villa when nobody closes them.
export const GOLF_RESULTS_SECONDS = 8;

export interface GolfResultsPanel {
  show(scores: GolfSnapshot['scores']): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function resultsRows(standings: Standings): { rank: number; name: string; total: number; mark: 'best' | 'worst' | '' }[] {
  return [...standings.rows]
    .sort((a, b) => a.rank - b.rank)
    .map((row) => ({ rank: row.rank, name: row.name, total: row.total, mark: standings.best.includes(row.id) ? 'best' : standings.worst === row.id ? 'worst' : '' }));
}

// The final results: ranked totals, the best, the worst who pays the coffee, and the team bonus. It lives on the page, so it stays over the villa when the group is taken back.
export function createGolfResults(doc: Document, setTimer: (callback: () => void, ms: number) => unknown = (callback, ms) => setTimeout(callback, ms), clearTimer: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)): GolfResultsPanel {
  const root = doc.createElement('div');
  root.id = 'golf-results';
  root.hidden = true;
  root.setAttribute('role', 'status');
  const style = doc.createElement('style');
  style.textContent = RESULTS_STYLE;
  const title = doc.createElement('h2');
  title.textContent = 'PrimeGolf results';
  const rows = doc.createElement('div');
  rows.className = 'rows';
  const lines = doc.createElement('div');
  lines.className = 'lines';
  const close = doc.createElement('button');
  close.type = 'button';
  close.id = 'golf-results-close';
  close.textContent = 'Close';
  root.append(style, title, rows, lines, close);
  doc.body.append(root);

  let timer: unknown = null;
  const hide = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    root.hidden = true;
  };
  close.addEventListener('click', hide);
  return {
    show(scores) {
      const standings = golfStandings(scores);
      rows.replaceChildren(
        ...resultsRows(standings).map((entry) => {
          const row = doc.createElement('div');
          row.className = `row ${entry.mark}`;
          const rank = doc.createElement('span');
          rank.className = 'rank';
          rank.textContent = `${entry.rank}.`;
          const name = doc.createElement('span');
          name.textContent = entry.name;
          const total = doc.createElement('span');
          total.className = 'total';
          total.textContent = String(entry.total);
          row.append(rank, name, total);
          return row;
        }),
      );
      lines.replaceChildren(
        ...standings.lines.map((text) => {
          const line = doc.createElement('div');
          line.textContent = text;
          return line;
        }),
      );
      root.hidden = false;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(hide, GOLF_RESULTS_SECONDS * 1000);
    },
    hide,
    isOpen: () => !root.hidden,
    dispose() {
      hide();
      root.remove();
    },
  };
}
