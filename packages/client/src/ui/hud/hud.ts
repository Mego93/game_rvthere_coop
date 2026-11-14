import { clamp } from '@lodgy/shared';
import { LOW_FRACTION, MAP_MARGIN, MAP_SIZE_DESKTOP, MAP_SIZE_TOUCH } from './constants';
import { ownHealthFraction, type HudModel } from './hudModel';
import { clampToMap, mapViewFor, routePath, toMap } from './minimap';

export interface HudMarker { id: string; name: string; seconds: number; x: number; y: number; behind: boolean }

export interface Hud {
  update(model: HudModel, markers: HudMarker[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE = `
#hud { position: fixed; inset: 0; z-index: 5; box-sizing: border-box; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); pointer-events: none; user-select: none; -webkit-user-select: none; color: #fff; font: 600 13px/1.3 system-ui, sans-serif; }
#hud[hidden], #hud [hidden] { display: none; }
#hud .panel { background: rgba(0, 0, 0, 0.55); border-radius: 8px; padding: 6px 10px; }
#hud-compass { position: absolute; top: calc(8px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: min(320px, 40vw); height: 26px; overflow: hidden; background: rgba(0, 0, 0, 0.55); border-radius: 13px; }
#hud-compass-marker { position: absolute; top: 3px; width: 0; height: 0; margin-left: -6px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 12px solid #ffd34e; }
#hud-compass-label { position: absolute; left: 0; right: 0; bottom: 2px; text-align: center; font-size: 11px; }
#hud-compass-left, #hud-compass-right { position: absolute; top: 2px; color: #ffd34e; font-size: 16px; }
#hud-compass-left { left: 8px; }
#hud-compass-right { right: 8px; }
#hud-compass-centre { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.35); }
#hud-minimap { position: absolute; top: calc(8px + env(safe-area-inset-top)); left: calc(8px + env(safe-area-inset-left)); background: rgba(0, 0, 0, 0.55); border-radius: 8px; }
#hud.touch #hud-vehicle { top: calc(56px + env(safe-area-inset-top)); }
#hud-minimap .route { fill: none; stroke: rgba(255, 255, 255, 0.5); stroke-width: 2; stroke-linejoin: round; }
#hud-minimap .vehicle { fill: #ffd34e; }
#hud-minimap .self { fill: #4ec3ff; }
#hud-minimap .player { fill: #fff; }
#hud-minimap .stop-fuel { fill: #ff8a3d; }
#hud-minimap .stop-garage { fill: #6ee07a; }
#hud-minimap .checkpoint { fill: none; stroke: #fff; stroke-width: 2; }
#hud-minimap .checkpoint.reached { opacity: 0.3; }
#hud-minimap .tick { stroke: #4ec3ff; stroke-width: 2; }
#hud-vehicle { position: absolute; top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right)); display: grid; gap: 4px; min-width: 130px; }
#hud-vehicle .row { display: grid; grid-template-columns: 38px 1fr; gap: 6px; align-items: center; font-size: 11px; }
#hud .bar { height: 8px; background: rgba(255, 255, 255, 0.2); border-radius: 4px; overflow: hidden; }
#hud .bar > i { display: block; height: 100%; width: 100%; background: #6ee07a; transform-origin: left; }
#hud .bar.fuel > i { background: #ffb23e; }
#hud .bar.low > i { background: #ff4e4e; }
#hud-meta { display: flex; justify-content: space-between; font: 600 12px/1.2 ui-monospace, Menlo, monospace; }
#hud-health { position: absolute; left: calc(8px + env(safe-area-inset-left)); bottom: calc(8px + env(safe-area-inset-bottom)); width: 130px; }
#hud-slots { position: absolute; right: calc(8px + env(safe-area-inset-right)); bottom: calc(8px + env(safe-area-inset-bottom)); display: flex; gap: 6px; }
#hud-slots .slot { width: 64px; height: 44px; display: grid; place-items: center; box-sizing: border-box; background: rgba(0, 0, 0, 0.55); border: 2px solid rgba(255, 255, 255, 0.4); border-radius: 8px; font-size: 12px; }
#hud-slots .slot.selected { border-color: #ffd34e; box-shadow: 0 0 0 2px #ffd34e; }
#hud-prompt { position: absolute; left: 50%; bottom: calc(72px + env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: 70vw; text-align: center; white-space: pre; }
#hud-prompt-text { display: inline-block; padding: 6px 12px; background: rgba(0, 0, 0, 0.6); border-radius: 8px; }
#hud-prompt-text:empty { display: none; }
#hud-prompt-hold { width: 160px; height: 6px; margin: 4px auto 0; }
#hud-downed { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); padding: 10px 20px; font-size: 28px; background: rgba(120, 0, 0, 0.6); border-radius: 10px; }
#hud .marker { position: absolute; transform: translate(-50%, -100%); padding: 2px 8px; font-size: 12px; white-space: nowrap; background: rgba(120, 0, 0, 0.7); border-radius: 6px; }
`;

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

  const compass = el('div', root, 'hud-compass');
  el('div', compass, 'hud-compass-centre');
  const compassLeft = el('div', compass, 'hud-compass-left');
  compassLeft.textContent = '◀';
  const compassRight = el('div', compass, 'hud-compass-right');
  compassRight.textContent = '▶';
  const compassMarker = el('div', compass, 'hud-compass-marker');
  const compassLabel = el('div', compass, 'hud-compass-label');

  const size = opts.touch ? MAP_SIZE_TOUCH : MAP_SIZE_DESKTOP;
  const view = mapViewFor(opts.route, size, MAP_MARGIN);
  const minimap = document.createElementNS(SVG_NS, 'svg');
  minimap.id = 'hud-minimap';
  minimap.setAttribute('width', String(size));
  minimap.setAttribute('height', String(size));
  minimap.setAttribute('viewBox', `0 0 ${size} ${size}`);
  root.append(minimap);
  svg('path', minimap, { d: routePath(view, opts.route) }, 'route');
  const dots = svg('g', minimap);

  const vehiclePanel = el('div', root, 'hud-vehicle', 'panel');
  const bar = (label: string, extra: string) => {
    const row = el('div', vehiclePanel, undefined, 'row');
    el('span', row).textContent = label;
    const track = el('div', row, undefined, `bar ${extra}`);
    return { track, fill: el('i', track) };
  };
  const fuelBar = bar('Fuel', 'fuel');
  const vehicleHealthBar = bar('Hull', 'health');
  const meta = el('div', vehiclePanel, 'hud-meta');
  const timer = el('span', meta);
  const wallet = el('span', meta);

  const health = el('div', root, 'hud-health', 'panel');
  const ownHealth = el('div', health, undefined, 'bar health');
  const ownFill = el('i', ownHealth);

  const slots = el('div', root, 'hud-slots');
  const slotNodes: HTMLElement[] = [];
  if (!opts.touch) for (let i = 0; i < 3; i++) slotNodes.push(el('div', slots, undefined, 'slot'));
  else slots.hidden = true;

  const prompt = el('div', root, 'hud-prompt');
  const promptText = el('div', prompt, 'hud-prompt-text');
  const hold = el('div', prompt, 'hud-prompt-hold', 'bar');
  const holdFill = el('i', hold);
  hold.hidden = true;

  const downed = el('div', root, 'hud-downed');
  downed.hidden = true;

  const markerNodes = new Map<string, HTMLElement>();

  const dotNodes = new Map<string, { node: SVGElement; kind: string }>();
  const setAttr = (node: SVGElement, name: string, value: number | string) => {
    if (changed(node, name, value)) node.setAttribute(name, String(value));
  };
  const renderMap = (entities: HudModel['mapEntities']) => {
    const seen = new Set<string>();
    for (const e of entities) {
      seen.add(e.id);
      const p = clampToMap(view, toMap(view, e.x, e.z));
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

      renderMap(model.mapEntities);

      const v = model.vehicle;
      const fuel = v ? clamp(v.fuel, 0, 1) : 0;
      const hull = v ? clamp(v.health, 0, 1) : 0;
      scale(fuelBar.fill, fuel);
      scale(vehicleHealthBar.fill, hull);
      flag(fuelBar.track, 'low', !!v?.fuelLow);
      flag(vehicleHealthBar.track, 'low', !!v?.healthLow);
      text(timer, model.timer);
      text(wallet, `$${model.wallet}`);

      const own = ownHealthFraction(model.ownHealth);
      scale(ownFill, own);
      flag(ownHealth, 'low', own < LOW_FRACTION);

      model.slots.forEach((slot, i) => {
        const node = slotNodes[i];
        if (!node) return;
        text(node, slot.label ?? '');
        flag(node, 'selected', slot.selected);
      });

      text(promptText, model.prompt ?? '');
      toggle(hold, model.hold === null);
      if (model.hold !== null) scale(holdFill, clamp(model.hold, 0, 1));

      toggle(downed, model.downedSelf === null);
      if (model.downedSelf !== null) text(downed, `DOWNED ${model.downedSelf}s`);

      const seen = new Set<string>();
      for (const marker of markers) {
        seen.add(marker.id);
        let node = markerNodes.get(marker.id);
        if (!node) {
          node = el('div', root, undefined, 'marker');
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
