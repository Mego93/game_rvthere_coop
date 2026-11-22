import { RACE_RESULT_SECONDS, type RaceHudView, type RaceResultView } from './raceView';

// The race HUD (a big timer and the target) and the result panel. Colours are theme tokens: gold is the accent, silver the koke grey, bronze the tajine brown.
const STYLE = `
#race-hud { position: fixed; inset: 0; z-index: 6; box-sizing: border-box; pointer-events: none; user-select: none; -webkit-user-select: none; color: var(--on-glass); text-shadow: var(--glass-text-shadow); font: 600 13px/1.3 var(--font-text); font-variant-numeric: tabular-nums; }
#race-hud[hidden] { display: none !important; }
#race-hud #race-box { position: absolute; top: calc(80px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; padding: 6px 20px 7px; display: grid; justify-items: center; gap: 2px; background: var(--glass); border: 1px solid var(--glass-line); border-radius: 14px; }
#race-hud #race-timer { font: 700 36px/1 var(--font-display); letter-spacing: 0.01em; }
#race-hud #race-target { font-size: 13px; white-space: nowrap; opacity: 0.9; }
#race-hud #race-box.gold #race-timer { color: var(--glass-accent); }
#race-hud #race-box.silver #race-timer { color: var(--item-koke); }
#race-hud #race-box.bronze #race-timer { color: var(--item-tajine); }
#race-hud.touch #race-box { top: calc(122px + var(--safe-top)); left: calc(8px + var(--safe-left)); transform: none; height: 26px; padding: 0 10px; display: flex; align-items: center; gap: 8px; border-radius: 12px; }
#race-hud.touch #race-timer { font-size: 17px; }
#race-hud.touch #race-target { font-size: 11px; }
`;

export interface RaceHud {
  update(view: RaceHudView): void;
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

export function createRaceHud(doc: Document, opts: { touch: boolean }): RaceHud {
  const root = doc.createElement('div');
  root.id = 'race-hud';
  root.classList.toggle('touch', opts.touch);
  const style = doc.createElement('style');
  style.textContent = STYLE;
  root.append(style);
  const box = el(doc, 'div', root, 'race-box');
  const timer = el(doc, 'div', box, 'race-timer');
  const target = el(doc, 'div', box, 'race-target');
  doc.body.append(root);

  const cache = new Map<string, string>();
  const changed = (slot: string, value: string) => {
    if (cache.get(slot) === value) return false;
    cache.set(slot, value);
    return true;
  };
  return {
    update(view) {
      if (changed('timer', view.timer)) timer.textContent = view.timer;
      if (changed('target', view.target)) target.textContent = view.target;
      if (changed('pace', view.pace)) box.className = view.pace;
    },
    setVisible: (visible) => void (root.hidden = !visible),
    dispose: () => root.remove(),
  };
}

const RESULT_STYLE = `
#race-results { position: fixed; left: 50%; top: calc(50% - var(--safe-bottom) / 2); transform: translate(-50%, -50%); z-index: 25; box-sizing: border-box; width: min(340px, calc(100vw - 2 * (var(--safe-left) + 12px))); max-height: calc(100vh - 2 * (var(--safe-top) + 12px) - var(--safe-bottom)); overflow: auto; padding: 14px 16px; display: grid; gap: 6px; justify-items: center; text-align: center; color: var(--on-glass); background: var(--glass-strong); border: 2px solid var(--glass-line-strong); border-radius: 16px; text-shadow: var(--glass-text-shadow); font: 600 14px/1.35 var(--font-text); font-variant-numeric: tabular-nums; animation: race-results-in 260ms var(--ease) both; }
#race-results[hidden] { display: none; }
#race-results.gold { border-color: var(--glass-accent); }
#race-results.silver { border-color: var(--item-koke); }
#race-results.bronze { border-color: var(--item-tajine); }
#race-results .medal { width: 46px; height: 46px; box-sizing: border-box; border-radius: 50%; border: 4px solid var(--glass-line-strong); display: grid; place-items: center; font: 700 22px/1 var(--font-display); background: var(--glass); }
#race-results.gold .medal { color: var(--glass-accent); border-color: var(--glass-accent); }
#race-results.silver .medal { color: var(--item-koke); border-color: var(--item-koke); }
#race-results.bronze .medal { color: var(--item-tajine); border-color: var(--item-tajine); }
#race-results h2 { margin: 0; font: 700 22px/1.1 var(--font-display); }
#race-results .time { font: 700 26px/1.1 var(--font-display); }
#race-results .target { font-size: 13px; opacity: 0.85; }
#race-results .happiness { font-size: 15px; color: var(--glass-good); }
#race-results .happiness.down { color: var(--glass-bad); }
#race-results button { justify-self: end; min-height: 32px; padding: 4px 14px; font: 600 13px/1 var(--font-text); color: var(--on-glass); background: var(--glass); border: 2px solid var(--glass-line-strong); border-radius: 10px; cursor: pointer; }
@keyframes race-results-in { from { opacity: 0; transform: translate(-50%, -46%); } to { opacity: 1; transform: translate(-50%, -50%); } }
@media (max-height: 420px) { #race-results { padding: 8px 12px; gap: 3px; } #race-results .medal { width: 34px; height: 34px; font-size: 16px; border-width: 3px; } #race-results h2 { font-size: 17px; } #race-results .time { font-size: 20px; } #race-results button { min-height: 28px; } }
@media (prefers-reduced-motion: reduce) { #race-results { animation: none; } }
`;

export interface RaceResultsPanel {
  show(view: RaceResultView): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

// The medal, the time and the happiness change after the finish. It lives on the page, so it stays over the camp the group is taken to.
export function createRaceResults(doc: Document, setTimer: (callback: () => void, ms: number) => unknown = (callback, ms) => setTimeout(callback, ms), clearTimer: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)): RaceResultsPanel {
  const root = doc.createElement('div');
  root.id = 'race-results';
  root.hidden = true;
  root.setAttribute('role', 'status');
  const style = doc.createElement('style');
  style.textContent = RESULT_STYLE;
  const medal = el(doc, 'div', root, undefined, 'medal');
  const title = el(doc, 'h2', root);
  const time = el(doc, 'div', root, undefined, 'time');
  const target = el(doc, 'div', root, undefined, 'target');
  const happiness = el(doc, 'div', root, undefined, 'happiness');
  const close = el(doc, 'button', root, 'race-results-close');
  close.type = 'button';
  close.textContent = 'Close';
  root.prepend(style);
  doc.body.append(root);

  let timer: unknown = null;
  const hide = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    root.hidden = true;
  };
  close.addEventListener('click', hide);
  return {
    show(view) {
      root.className = view.medal;
      medal.textContent = view.medal === 'gold' ? '1' : view.medal === 'silver' ? '2' : '3';
      title.textContent = view.title;
      time.textContent = view.time;
      target.textContent = view.target;
      happiness.textContent = view.happiness;
      happiness.classList.toggle('down', view.happiness.startsWith('Happiness -'));
      root.hidden = false;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(hide, RACE_RESULT_SECONDS * 1000);
    },
    hide,
    isOpen: () => !root.hidden,
    dispose() {
      hide();
      root.remove();
    },
  };
}
