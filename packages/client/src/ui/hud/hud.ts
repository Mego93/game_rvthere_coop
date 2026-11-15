import { clamp } from '@lodgy/shared';
import { LOW_FRACTION, MAP_MARGIN, MAP_SIZE_DESKTOP, MAP_SIZE_TOUCH } from './constants';
import { ICON_COIN, ICON_FUEL, ICON_HEALTHKIT, ICON_HEART, ICON_HULL, ICON_JERRYCAN, ICON_TOOLBOX } from './icons';
import { splitPrompt } from './splitPrompt';
import { ownHealthFraction, type HudModel } from './hudModel';
import { clampToCircle, mapViewFor, routePath, toMap } from './minimap';

export interface HudMarker { id: string; name: string; seconds: number; x: number; y: number; behind: boolean }

export interface Hud {
  update(model: HudModel, markers: HudMarker[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const SLOT_ICONS: Record<string, string> = { jerrycan: ICON_JERRYCAN, toolbox: ICON_TOOLBOX, healthKit: ICON_HEALTHKIT };
const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE = `
#hud { --hud-glass: rgba(12, 16, 24, 0.38); --hud-border: rgba(255, 255, 255, 0.14); --hud-accent: #ffd34e; --hud-fuel: #ffb23e; --hud-good: #6ee07a; --hud-bad: #ff4e4e; --hud-info: #4ec3ff; position: fixed; inset: 0; z-index: 5; box-sizing: border-box; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); pointer-events: none; user-select: none; -webkit-user-select: none; color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55); font: 600 13px/1.3 system-ui, sans-serif; font-variant-numeric: tabular-nums; }
#hud[hidden], #hud [hidden] { display: none; }
#hud .glass { background: var(--hud-glass); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid var(--hud-border); border-radius: 12px; }
#hud.touch .glass { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(12, 16, 24, 0.55); }
#hud .marker.glass { backdrop-filter: none; -webkit-backdrop-filter: none; }
#hud svg.ico { width: 14px; height: 14px; display: block; }
#hud .panel { padding: 6px 10px; }
#hud #hud-compass { position: absolute; top: calc(8px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: min(320px, 40vw); height: 22px; overflow: hidden; border-radius: 11px; }
#hud-compass-marker { position: absolute; top: 4px; width: 0; height: 0; }
#hud-compass-marker::before { content: ''; position: absolute; left: -5px; top: 0; width: 10px; height: 7px; background: var(--hud-accent); clip-path: polygon(0 0, 50% 100%, 100% 0, 50% 45%); }
#hud-compass-label { position: absolute; top: 4px; white-space: nowrap; font-size: 10px; line-height: 14px; opacity: 0.7; }
#hud-compass-left, #hud-compass-right { position: absolute; top: 3px; color: var(--hud-accent); font-size: 13px; line-height: 1; }
#hud-compass-left { left: 8px; }
#hud-compass-right { right: 8px; }
#hud-compass-centre { display: none; }
#hud #hud-minimap { position: absolute; top: calc(8px + env(safe-area-inset-top)); left: calc(8px + env(safe-area-inset-left)); border-radius: 50%; overflow: hidden; box-sizing: border-box; border-color: rgba(255, 255, 255, 0.2); }
#hud.touch #hud-vehicle { top: calc(56px + env(safe-area-inset-top)); }
#hud-minimap .route { fill: none; stroke: rgba(255, 255, 255, 0.55); stroke-width: 2; stroke-linejoin: round; }
#hud-minimap .vehicle { fill: var(--hud-accent); }
#hud-minimap .self { fill: var(--hud-info); }
#hud-minimap .player { fill: #fff; }
#hud-minimap .stop-fuel { fill: #ff8a3d; }
#hud-minimap .stop-garage { fill: var(--hud-good); }
#hud-minimap .checkpoint { fill: none; stroke: #fff; stroke-width: 2; }
#hud-minimap .checkpoint.reached { opacity: 0.3; }
#hud-minimap .tick { stroke: var(--hud-info); stroke-width: 2; }
#hud-vehicle { position: absolute; top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right)); display: grid; gap: 5px; min-width: 112px; }
#hud-vehicle .row { display: grid; grid-template-columns: 14px 1fr; gap: 6px; align-items: center; }
#hud .bar { height: 6px; background: rgba(255, 255, 255, 0.2); border-radius: 3px; overflow: hidden; }
#hud .bar > i { display: block; height: 100%; width: 100%; background: var(--hud-good); transform-origin: left; }
#hud .bar.fuel > i { background: var(--hud-fuel); }
#hud .bar.low > i { background: var(--hud-bad); animation: hud-pulse 1.2s ease-in-out infinite; }
@keyframes hud-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
#hud-meta { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; }
#hud-meta .wallet { display: inline-flex; align-items: center; gap: 4px; }
#hud-meta .wallet svg.ico { color: var(--hud-accent); width: 9px; height: 9px; }
#hud #hud-health { backdrop-filter: none; -webkit-backdrop-filter: none; position: absolute; left: calc(8px + env(safe-area-inset-left)); bottom: calc(8px + env(safe-area-inset-bottom)); width: 120px; display: grid; grid-template-columns: 14px 1fr; gap: 6px; align-items: center; height: 14px; background: none; border: 0; padding: 0; transition: opacity 0.3s; }
#hud-health.full { opacity: 0.4; }
#hud-health svg.ico { color: var(--hud-bad); }
#hud-slots { position: absolute; right: calc(8px + env(safe-area-inset-right)); bottom: calc(8px + env(safe-area-inset-bottom)); display: flex; gap: 6px; }
#hud-slots .slot { position: relative; width: 52px; height: 52px; display: grid; grid-template-rows: 1fr auto; justify-items: center; align-items: center; padding: 6px 2px 4px; box-sizing: border-box; transition: transform 0.12s; }
#hud-slots .slot .icon { width: 22px; height: 22px; }
#hud-slots .slot .icon svg.ico { width: 22px; height: 22px; }
#hud-slots .slot .label { font-size: 10px; line-height: 1; white-space: nowrap; }
#hud-slots .slot .badge { position: absolute; top: 3px; left: 5px; font-size: 10px; line-height: 1; opacity: 0.8; }
#hud-slots .slot.selected { border: 2px solid var(--hud-accent); transform: scale(1.08); }
#hud-slots .slot.empty .icon, #hud-slots .slot.empty .label { display: none; }
#hud-slots .slot.empty { opacity: 0.4; }
#hud-prompt { position: absolute; left: 50%; bottom: calc(72px + env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: 70vw; text-align: center; white-space: pre; }
#hud-prompt-text { display: inline-flex; align-items: center; gap: 14px; padding: 6px 12px; }
#hud-prompt-text:empty { display: none; }
#hud-prompt-text .part { display: inline-flex; align-items: center; gap: 6px; }
#hud-prompt-text .keycap { display: inline-grid; place-items: center; min-width: 22px; height: 22px; box-sizing: border-box; border-radius: 6px; background: rgba(255, 255, 255, 0.9); color: #10151d; text-shadow: none; font-size: 12px; font-weight: 700; }
#hud-prompt-text .keycap.pill { padding: 0 8px; border-radius: 11px; }
#hud-prompt-text .keycap.hold { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25), 0 0 0 3px var(--hud-accent); margin: 3px; }
#hud-prompt-hold { width: 160px; height: 6px; margin: 4px auto 0; }
#hud #hud-downed { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); padding: 8px 20px; font-size: 22px; border-radius: 999px; border-color: var(--hud-bad); }
#hud .marker { position: absolute; transform: translate(-50%, -100%); display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; font-size: 12px; white-space: nowrap; border-radius: 999px; }
#hud .marker::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--hud-bad); }
@media (prefers-reduced-motion: reduce) { #hud .bar.low > i { animation: none; } #hud-slots .slot { transition: none; } #hud-health { transition: none; } }
`;

// Icons come from the constants in icons.ts, never from player-controlled text.
const icon = (parent: HTMLElement, markup: string) => { const holder = document.createElement('span'); holder.innerHTML = markup; const node = holder.firstElementChild; if (node) { node.classList.add('ico'); parent.append(node); } };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, id?: string, className?: string) => {
  const node = document.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  parent.append(node);
  return node;
};
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, parent: SVGElement, attrs: Record<string, string | number> = {}, className?: string) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (className) node.setAttribute('class', className);
  parent.append(node);
  return node;
};

export function createHud(root: HTMLElement, opts: { touch: boolean; route: readonly [number, number][] }): Hud {
  root.id = 'hud';
  root.classList.toggle('touch', opts.touch);
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.append(style);

  // Each setter writes to the DOM only when the value differs from the last one written for that node and slot (H17).
  const cache = new WeakMap<object, Map<string, unknown>>();
  const changed = (node: object, slot: string, value: unknown) => {
    let slots = cache.get(node);
    if (!slots) cache.set(node, (slots = new Map()));
    if (slots.get(slot) === value) return false;
    slots.set(slot, value);
    return true;
  };
  const text = (node: Node, value: string) => { if (changed(node, 'text', value)) node.textContent = value; };
  const toggle = (node: HTMLElement, on: boolean) => { if (changed(node, 'hidden', on)) node.hidden = on; };
  const flag = (node: HTMLElement, cls: string, on: boolean) => { if (changed(node, `class:${cls}`, on)) node.classList.toggle(cls, on); };
  const scale = (node: HTMLElement, value: number) => { if (changed(node, 'scale', value)) node.style.transform = `scaleX(${value})`; };

  const compass = el('div', root, 'hud-compass', 'glass');
  el('div', compass, 'hud-compass-centre');
  const compassLeft = el('div', compass, 'hud-compass-left');
  compassLeft.textContent = '◀';
  const compassRight = el('div', compass, 'hud-compass-right');
  compassRight.textContent = '▶';
  const compassMarker = el('div', compass, 'hud-compass-marker');
  const compassLabel = el('div', compass, 'hud-compass-label');

  const size = opts.touch ? MAP_SIZE_TOUCH : MAP_SIZE_DESKTOP;
  const view = mapViewFor(opts.route, size, MAP_MARGIN + size * (1 - Math.SQRT1_2) / 2);
  const minimap = document.createElementNS(SVG_NS, 'svg');
  minimap.id = 'hud-minimap';
  minimap.setAttribute('width', String(size));
  minimap.setAttribute('height', String(size));
  minimap.setAttribute('class', 'glass');
  minimap.setAttribute('viewBox', `0 0 ${size} ${size}`);
  root.append(minimap);
  svg('path', minimap, { d: routePath(view, opts.route) }, 'route');
  const dots = svg('g', minimap);

  const vehiclePanel = el('div', root, 'hud-vehicle', 'panel glass');
  const bar = (iconMarkup: string, extra: string) => {
    const row = el('div', vehiclePanel, undefined, 'row');
    icon(el('span', row), iconMarkup);
    const track = el('div', row, undefined, `bar ${extra}`);
    return { track, fill: el('i', track) };
  };
  const fuelBar = bar(ICON_FUEL, 'fuel');
  const vehicleHealthBar = bar(ICON_HULL, 'health');
  const meta = el('div', vehiclePanel, 'hud-meta');
  const timer = el('span', meta);
  const wallet = el('span', meta, undefined, 'wallet');
  icon(wallet, ICON_COIN);
  const walletText = el('span', wallet);

  const health = el('div', root, 'hud-health', 'glass');
  icon(el('span', health), ICON_HEART);
  const ownHealth = el('div', health, undefined, 'bar health');
  const ownFill = el('i', ownHealth);

  const slots = el('div', root, 'hud-slots');
  const slotNodes: { tile: HTMLElement; icon: HTMLElement; label: HTMLElement }[] = [];
  if (!opts.touch) {
    for (let i = 0; i < 3; i++) {
      const tile = el('div', slots, undefined, 'slot glass empty');
      el('span', tile, undefined, 'badge').textContent = String(i + 1);
      slotNodes.push({ tile, icon: el('span', tile, undefined, 'icon'), label: el('span', tile, undefined, 'label') });
    }
  }
  else slots.hidden = true;

  const prompt = el('div', root, 'hud-prompt');
  const promptText = el('div', prompt, 'hud-prompt-text', 'glass');
  const hold = el('div', prompt, 'hud-prompt-hold', 'bar');
  const holdFill = el('i', hold);
  hold.hidden = true;

  const downed = el('div', root, 'hud-downed', 'glass');
  downed.hidden = true;

  const markerNodes = new Map<string, HTMLElement>();

  const dotNodes = new Map<string, { node: SVGElement; kind: string }>();
  const setAttr = (node: SVGElement, name: string, value: number | string) => {
    if (changed(node, name, value)) node.setAttribute(name, String(value));
  };
  const renderPrompt = (value: string) => {
    if (!changed(promptText, 'prompt', value)) return;
    promptText.replaceChildren();
    if (value.trim() === '') return;
    for (const part of splitPrompt(value)) {
      const wrap = el('span', promptText, undefined, 'part');
      if (part.key !== null) {
        const pill = part.key === 'Act' || part.key === 'Use';
        const cap = el('span', wrap, undefined, `keycap${pill ? ' pill' : ''}${part.hold ? ' hold' : ''}`);
        cap.textContent = part.key;
      }
      el('span', wrap).textContent = part.text;
    }
  };
  const renderMap = (entities: HudModel['mapEntities']) => {
    const seen = new Set<string>();
    for (const e of entities) {
      seen.add(e.id);
      const p = clampToCircle(view, toMap(view, e.x, e.z));
      const shape = e.kind === 'checkpoint' || e.kind === 'self' || e.kind === 'player' ? 'circle' : 'rect';
      let entry = dotNodes.get(e.id);
      if (entry && entry.kind !== e.kind) {
        entry.node.remove();
        dotNodes.delete(e.id);
        entry = undefined;
      }
      if (!entry) {
        entry = { node: svg(shape, dots), kind: e.kind };
        dotNodes.set(e.id, entry);
      }
      const { node } = entry;
      if (e.kind === 'checkpoint') {
        setAttr(node, 'class', e.reached ? 'checkpoint reached' : 'checkpoint');
        setAttr(node, 'r', 5);
      } else if (e.kind === 'stop') {
        setAttr(node, 'class', e.stopKind === 'garage' ? 'stop-garage' : 'stop-fuel');
        setAttr(node, 'width', 8);
        setAttr(node, 'height', 8);
      } else if (e.kind === 'vehicle') {
        setAttr(node, 'class', 'vehicle');
        setAttr(node, 'width', 10);
        setAttr(node, 'height', 10);
        setAttr(node, 'rx', 2);
      } else {
        setAttr(node, 'class', e.kind);
        setAttr(node, 'r', e.kind === 'self' ? 4 : 3);
      }
      if (shape === 'circle') {
        setAttr(node, 'cx', p.x.toFixed(1));
        setAttr(node, 'cy', p.y.toFixed(1));
      } else {
        const half = e.kind === 'vehicle' ? 5 : 4;
        setAttr(node, 'x', (p.x - half).toFixed(1));
        setAttr(node, 'y', (p.y - half).toFixed(1));
      }
      // The facing tick is a second node for the local player, keyed by a suffixed id.
      const tickId = `${e.id}:tick`;
      if (e.kind === 'self' && e.yaw !== undefined) {
        seen.add(tickId);
        let tick = dotNodes.get(tickId);
        if (!tick) {
          tick = { node: svg('line', dots, {}, 'tick'), kind: 'tick' };
          dotNodes.set(tickId, tick);
        }
        // Yaw 0 faces -z, which is up on a north-up map; positive yaw turns left.
        setAttr(tick.node, 'x1', p.x.toFixed(1));
        setAttr(tick.node, 'y1', p.y.toFixed(1));
        setAttr(tick.node, 'x2', (p.x - Math.sin(e.yaw) * 9).toFixed(1));
        setAttr(tick.node, 'y2', (p.y - Math.cos(e.yaw) * 9).toFixed(1));
      }
    }
    for (const [id, entry] of dotNodes) {
      if (seen.has(id)) continue;
      entry.node.remove();
      dotNodes.delete(id);
    }
  };

  return {
    update(model, markers) {
      toggle(compassMarker, model.compass.marker === null);
      if (model.compass.marker !== null && changed(compassMarker, 'left', model.compass.marker)) compassMarker.style.left = `${(model.compass.marker * 100).toFixed(1)}%`;
      toggle(compassLeft, model.compass.side !== -1);
      toggle(compassRight, model.compass.side !== 1);
      text(compassLabel, model.compass.label);
      toggle(compassLabel, model.compass.label === '');
      const m = model.compass.marker;
      const labelPos = m !== null ? (m <= 0.7 ? `${(m * 100).toFixed(1)}%|` : `|${((1 - m) * 100).toFixed(1)}%`) : model.compass.side === 1 ? '|24px' : '24px|';
      if (changed(compassLabel, 'pos', labelPos)) {
        const [l, rt] = labelPos.split('|') as [string, string];
        compassLabel.style.left = l === '' ? 'auto' : m !== null ? `calc(${l} + 8px)` : l;
        compassLabel.style.right = rt === '' ? 'auto' : m !== null ? `calc(${rt} + 8px)` : rt;
      }

      renderMap(model.mapEntities);

      const v = model.vehicle;
      const fuel = v ? clamp(v.fuel, 0, 1) : 0;
      const hull = v ? clamp(v.health, 0, 1) : 0;
      scale(fuelBar.fill, fuel);
      scale(vehicleHealthBar.fill, hull);
      flag(fuelBar.track, 'low', !!v?.fuelLow);
      flag(vehicleHealthBar.track, 'low', !!v?.healthLow);
      text(timer, model.timer);
      text(walletText, `$${model.wallet}`);

      const own = ownHealthFraction(model.ownHealth);
      scale(ownFill, own);
      flag(ownHealth, 'low', own < LOW_FRACTION);
      flag(health, 'full', own >= 1);

      model.slots.forEach((slot, i) => {
        const node = slotNodes[i];
        if (!node) return;
        if (changed(node.icon, 'kind', slot.kind)) {
          node.icon.replaceChildren();
          const markup = slot.kind ? SLOT_ICONS[slot.kind] : undefined;
          if (markup) icon(node.icon, markup);
        }
        text(node.label, slot.label ?? '');
        flag(node.tile, 'empty', slot.kind === null);
        flag(node.tile, 'selected', slot.selected);
      });

      renderPrompt(model.prompt ?? '');
      toggle(hold, model.hold === null);
      if (model.hold !== null) scale(holdFill, clamp(model.hold, 0, 1));

      toggle(downed, model.downedSelf === null);
      if (model.downedSelf !== null) text(downed, `DOWNED ${model.downedSelf}s`);

      const seen = new Set<string>();
      for (const marker of markers) {
        seen.add(marker.id);
        let node = markerNodes.get(marker.id);
        if (!node) {
          node = el('div', root, undefined, 'marker glass');
          markerNodes.set(marker.id, node);
        }
        toggle(node, marker.behind);
        text(node, `${marker.name} ${marker.seconds}s`);
        const position = `${marker.x.toFixed(0)}px,${marker.y.toFixed(0)}px`;
        if (changed(node, 'pos', position)) {
          node.style.left = `${marker.x.toFixed(0)}px`;
          node.style.top = `${marker.y.toFixed(0)}px`;
        }
      }
      for (const [id, node] of markerNodes) {
        if (seen.has(id)) continue;
        node.remove();
        markerNodes.delete(id);
      }
    },
    setVisible(visible) {
      toggle(root, !visible);
    },
    dispose() {
      root.remove();
      markerNodes.clear();
      dotNodes.clear();
    },
  };
}
