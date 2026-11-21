import { cashText, type StoryHudModel } from './needsView';

const ICONS = {
  food: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7C9.5 4.5 5 6 5 11.5 5 16.5 8.5 21 12 21s7-4.5 7-9.5C19 6 14.500 4.500 12 7zM12 6c0-2 1.500-3.500 3.500-3.500 0 2-1.500 3.500-3.500 3.500z"/></svg>`,
  happiness: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.500 9a1.500 1.500 0 1 1 0 3 1.500 1.500 0 0 1 0-3zm7 0a1.500 1.500 0 1 1 0 3 1.500 1.500 0 0 1 0-3zM7 14h10a5 5 0 0 1-10 0z"/></svg>`,
  tiredness: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.500A8.500 8.500 0 1 1 9.500 4 7 7 0 0 0 20 14.500z"/></svg>`,
  caffeine: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm13 1h2a2.500 2.500 0 0 1 0 5h-2z"/></svg>`,
  angry: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM6.500 7.500l4 2-1 1.500-4-2zM17.500 7.500l-4 2 1 1.500 4-2zM8 11.500h2.500v2H8zm5.500 0H16v2h-2.500zM8 17.500a4 4 0 0 1 8 0z"/></svg>`,
} as const;

const STYLE = `
#story-hud { position: fixed; inset: 0; z-index: 6; box-sizing: border-box; pointer-events: none; user-select: none; -webkit-user-select: none; color: var(--on-glass); text-shadow: var(--glass-text-shadow); font: 600 13px/1.3 var(--font-text); font-variant-numeric: tabular-nums; }
#story-hud[hidden], #story-hud [hidden] { display: none !important; }
#story-hud .glass { background: var(--glass); border: 1px solid var(--glass-line); border-radius: 12px; }
#story-hud svg.ico { width: 14px; height: 14px; display: block; flex: none; }
#story-hud #story-needs { position: absolute; left: calc(166px + var(--safe-left)); bottom: calc(8px + var(--safe-bottom)); box-sizing: border-box; height: 28px; padding: 0 10px; display: flex; gap: 10px; align-items: center; }
#story-needs .need { display: flex; align-items: center; gap: 5px; }
#story-needs .bar { width: 54px; height: 6px; background: var(--glass-track); border-radius: 3px; overflow: hidden; }
#story-needs .bar > i { display: block; height: 100%; width: 100%; background: var(--glass-good); transform-origin: left; }
#story-needs .need.warn .bar > i { background: var(--glass-bad); }
#story-needs .need.food svg.ico { color: var(--glass-accent); }
#story-needs .need.happiness svg.ico { color: var(--glass-good); }
#story-needs .need.tiredness svg.ico { color: var(--glass-info); }
#story-needs .need.caffeine svg.ico { color: var(--item-tajine); }
#story-needs .need.caffeine.slow .bar > i { background: var(--glass-bad); }
#story-needs .need.angry svg.ico { width: 18px; height: 18px; color: var(--glass-bad); }
#story-hud #story-panel { position: absolute; right: calc(8px + var(--safe-right)); top: calc(112px + var(--safe-top)); box-sizing: border-box; width: 200px; padding: 8px 10px; display: grid; gap: 6px; }
#story-hud.villa #story-panel { top: calc(8px + var(--safe-top)); }
#story-panel .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
#story-panel .clock { font: 700 22px/1 var(--font-display); }
#story-panel .cash { font-size: 13px; }
#story-panel .sub { font-size: 11px; color: var(--on-glass); opacity: 0.8; }
#story-panel ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: 12px; }
#story-panel li.done { opacity: 0.6; text-decoration: line-through; }
#story-panel li.missed { color: var(--glass-bad); }
#story-panel li.skipped { opacity: 0.5; }
#story-panel .keys { font-size: 11px; opacity: 0.8; }
#story-hud #story-clock { position: absolute; top: calc(8px + var(--safe-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; height: 28px; padding: 0 12px; display: flex; gap: 10px; align-items: center; white-space: nowrap; }
#story-clock .clock { font: 700 16px/1 var(--font-display); }
#story-hud #story-buttons { position: absolute; top: calc(44px + var(--safe-top)); left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
#story-buttons button { pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; box-sizing: border-box; width: 44px; height: 44px; padding: 0; color: var(--on-glass); background: var(--glass); border: 2px solid var(--glass-line-strong); border-radius: 12px; font: 600 11px/1 var(--font-text); text-shadow: var(--glass-text-shadow); }
#story-buttons button:active { background: var(--glass-press); }
#story-hud.touch #story-needs { left: calc(8px + var(--safe-left)); bottom: auto; top: calc(122px + var(--safe-top)); height: 26px; padding: 0 6px; gap: 5px; }
#story-hud.touch #story-needs .bar { width: 16px; }
#story-hud.touch #story-needs .need { gap: 3px; }
#story-hud.touch #story-needs svg.ico { width: 12px; height: 12px; }
#story-hud.outing #story-clock, #story-hud.outing #story-buttons { display: none; }
#hud.story-villa #hud-compass, #hud.story-villa #hud-vehicle, #hud.story-villa #hud-dashboard { display: none; }
#hud.story-foot #hud-vehicle, #hud.story-foot #hud-dashboard { display: none; }
`;

export interface StoryHud {
  update(model: StoryHudModel | null, bank: number, cash: number, canComplain: boolean): void;
  setVisible(visible: boolean): void;
  // The villa has no race gauges, so they hide and the clock takes the top; an outing keeps them; the arrival is on foot, so only the vehicle's gauges hide.
  setVenue(venue: 'villa' | 'outing' | 'foot'): void;
  dispose(): void;
}

export interface StoryHudHandlers {
  onPhone(): void;
  onGoals(): void;
  onComplain(): void;
}

export function createStoryHud(doc: Document, opts: { touch: boolean }, handlers: StoryHudHandlers): StoryHud {
  const root = doc.createElement('div');
  root.id = 'story-hud';
  root.classList.toggle('touch', opts.touch);
  root.classList.add('villa');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  root.append(style);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, id?: string, className?: string) => {
    const node = doc.createElement(tag);
    if (id) node.id = id;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  const icon = (parent: HTMLElement, markup: string) => {
    const holder = doc.createElement('span');
    holder.innerHTML = markup;
    const node = holder.firstElementChild;
    if (node) {
      node.classList.add('ico');
      parent.append(node);
    }
  };

  const needs = el('div', root, 'story-needs', 'glass');
  const needNodes = new Map<string, { node: HTMLElement; fill: HTMLElement; text: HTMLElement }>();
  const addNeed = (key: string, markup: string, title: string) => {
    const node = el('div', needs, undefined, `need ${key}`);
    node.title = title;
    icon(node, markup);
    const track = el('div', node, undefined, 'bar');
    const fill = el('i', track);
    needNodes.set(key, { node, fill, text: track });
  };
  addNeed('food', ICONS.food, 'Food');
  addNeed('happiness', ICONS.happiness, 'Happiness');
  addNeed('tiredness', ICONS.tiredness, 'Tiredness');
  addNeed('caffeine', ICONS.caffeine, 'Caffeine');
  const angry = el('div', needs, undefined, 'need angry');
  angry.title = 'Angry';
  icon(angry, ICONS.angry);
  needNodes.get('caffeine')!.node.hidden = true;
  angry.hidden = true;

  let clockText: HTMLElement;
  let cashNode: HTMLElement;
  let goalsList: HTMLElement | null = null;
  let subNode: HTMLElement | null = null;
  let complainButton: HTMLButtonElement | null = null;
  if (opts.touch) {
    const chip = el('div', root, 'story-clock', 'glass');
    clockText = el('span', chip, undefined, 'clock');
    cashNode = el('span', chip, undefined, 'cash');
    const buttons = el('div', root, 'story-buttons');
    const tap = (button: HTMLButtonElement, handler: () => void) => {
      button.addEventListener('touchstart', (event) => { event.preventDefault(); event.stopPropagation(); }, { passive: false });
      button.addEventListener('touchend', (event) => { event.preventDefault(); event.stopPropagation(); handler(); }, { passive: false });
      button.addEventListener('click', handler);
    };
    const make = (id: string, label: string, handler: () => void) => {
      const button = el('button', buttons, id);
      button.type = 'button';
      button.textContent = label;
      tap(button, handler);
      return button;
    };
    make('story-goals-btn', 'Goals', handlers.onGoals);
    make('story-phone-btn', 'Phone', handlers.onPhone);
    complainButton = make('story-complain-btn', 'Moan', handlers.onComplain);
    complainButton.hidden = true;
  } else {
    const panel = el('div', root, 'story-panel', 'glass');
    const top = el('div', panel, undefined, 'row');
    clockText = el('span', top, undefined, 'clock');
    subNode = el('span', top, undefined, 'sub');
    cashNode = el('div', panel, undefined, 'row cash');
    goalsList = el('ul', panel);
    el('div', panel, undefined, 'keys').textContent = 'P phone   Z complain (Luiz)';
  }

  doc.body.append(root);

  const cache = new Map<string, unknown>();
  const changed = (slot: string, value: unknown) => {
    if (cache.get(slot) === value) return false;
    cache.set(slot, value);
    return true;
  };
  const text = (slot: string, node: HTMLElement, value: string) => {
    if (changed(slot, value)) node.textContent = value;
  };

  return {
    update(model, bank, cash, canComplain) {
      needs.hidden = model === null || model.needs === null;
      if (!model) return;
      const view = model.needs;
      if (view) {
        for (const bar of view.bars) {
          const node = needNodes.get(bar.key)!;
          if (changed(`f:${bar.key}`, bar.fraction)) node.fill.style.transform = `scaleX(${bar.fraction})`;
          if (changed(`w:${bar.key}`, bar.warn)) node.node.classList.toggle('warn', bar.warn);
          if (changed(`t:${bar.key}`, bar.text)) node.node.title = `${bar.label} ${bar.text}`;
        }
        const caffeine = needNodes.get('caffeine')!;
        if (changed('c:hidden', view.caffeine === null)) caffeine.node.hidden = view.caffeine === null;
        if (view.caffeine) {
          if (changed('c:fraction', view.caffeine.fraction)) caffeine.fill.style.transform = `scaleX(${view.caffeine.fraction})`;
          if (changed('c:phase', view.caffeine.phase)) caffeine.node.classList.toggle('slow', view.caffeine.phase === 'slow');
        }
        if (changed('angry', view.angry)) angry.hidden = !view.angry;
      }
      text('clock', clockText, model.clock);
      if (opts.touch) text('cash', cashNode, cashText(cash));
      else {
        text('cash', cashNode, `Cash ${cashText(cash)}   Bank ${cashText(bank)}`);
        if (subNode) text('sub', subNode, model.night ? 'Night: go to bed' : model.day === 0 ? 'Test day' : `Day ${model.day}`);
        const key = JSON.stringify(model.goals);
        if (goalsList && changed('goals', key)) {
          goalsList.replaceChildren(
            ...model.goals.map((goal) => {
              const item = doc.createElement('li');
              item.className = goal.status;
              item.textContent = `${goal.mark} ${goal.label}`;
              return item;
            }),
          );
        }
      }
      if (complainButton && changed('complain', canComplain)) complainButton.hidden = !canComplain;
    },
    setVisible: (visible) => void (root.hidden = !visible),
    setVenue(venue) {
      root.classList.toggle('villa', venue === 'villa');
      root.classList.toggle('outing', venue !== 'villa');
      doc.getElementById('hud')?.classList.toggle('story-villa', venue === 'villa');
      doc.getElementById('hud')?.classList.toggle('story-foot', venue === 'foot');
    },
    dispose() {
      doc.getElementById('hud')?.classList.remove('story-villa', 'story-foot');
      root.remove();
    },
  };
}
