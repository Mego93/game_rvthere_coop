import { clamp } from '@lodgy/shared';
import { LOW_FRACTION, MAP_MARGIN, MAP_SIZE_DESKTOP, MAP_SIZE_TOUCH } from './constants';
import { ICON_AMMO, ICON_COIN, ICON_FUEL, ICON_GUM, ICON_HEALTHKIT, ICON_HEART, ICON_HULL, ICON_JERRYCAN, ICON_KOKE, ICON_SEAT, ICON_SHIELD, ICON_TAJINE, ICON_TOOLBOX } from './icons';
import { splitPrompt } from './splitPrompt';
import { gaugePercent, ownHealthFraction, ownHealthPoints, type HudModel } from './hudModel';
import { createMapPlan, mapScene } from './mapScene';
import { REDLINE_RPM } from './dashboard';

export interface HudMarker { id: string; name: string; seconds: number; x: number; y: number; behind: boolean }

export interface Hud {
  update(model: HudModel, markers: HudMarker[], seatToast?: string | null): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const SLOT_ICONS: Record<string, string> = { jerrycan: ICON_JERRYCAN, toolbox: ICON_TOOLBOX, healthKit: ICON_HEALTHKIT, tajine: ICON_TAJINE };
const TIMER_ICONS = { treedent: ICON_GUM, shield: ICON_SHIELD, koke: ICON_KOKE } as const;
const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE = `
#hud { position: fixed; inset: 0; z-index: 5; box-sizing: border-box; padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left); pointer-events: none; user-select: none; -webkit-user-select: none; color: var(--on-glass); text-shadow: var(--glass-text-shadow); font: 600 13px/1.3 var(--font-text); font-variant-numeric: tabular-nums; }
#hud[hidden], #hud [hidden] { display: none; }
#hud .glass { background: var(--glass); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid var(--glass-line); border-radius: 12px; }
#hud.touch .glass { backdrop-filter: none; -webkit-backdrop-filter: none; }
#hud .marker.glass { backdrop-filter: none; -webkit-backdrop-filter: none; }
#hud svg.ico { width: 14px; height: 14px; display: block; }
#hud .panel { padding: 6px 10px; }
#hud #hud-compass { position: absolute; top: calc(8px + var(--safe-top)); left: 50%; transform: translateX(-50%); width: min(320px, 40vw); height: 24px; overflow: hidden; border-radius: 12px; }
#hud.touch #hud-compass { width: min(240px, 36vw); }
@media (max-width: 700px) { #hud.touch #hud-compass { width: min(240px, 34vw); } }
#hud-compass-marker { position: absolute; top: 5px; width: 0; height: 0; }
#hud-compass-marker::before { content: ''; position: absolute; left: -5px; top: 0; width: 10px; height: 7px; background: var(--glass-accent); clip-path: polygon(0 0, 50% 100%, 100% 0, 50% 45%); }
#hud-compass-label { position: absolute; top: 4px; white-space: nowrap; font-size: 11px; line-height: 16px; }
#hud-compass-left, #hud-compass-right { position: absolute; top: 4px; color: var(--glass-accent); font-size: 13px; line-height: 1; }
#hud-compass-left { left: 8px; }
#hud-compass-right { right: 8px; }
#hud-compass-centre { display: none; }
#hud #hud-minimap { position: absolute; top: calc(8px + var(--safe-top)); left: calc(8px + var(--safe-left)); border-radius: 50%; overflow: hidden; box-sizing: border-box; }
#hud-minimap .route { fill: none; stroke: var(--glass-route); stroke-width: 2; stroke-linejoin: round; }
#hud-minimap .vehicle { fill: var(--glass-accent); }
#hud-minimap .self { fill: var(--glass-info); }
#hud-minimap .player { fill: var(--on-glass); }
#hud-minimap .stop-fuel { fill: var(--stop-fuel); }
#hud-minimap .stop-garage { fill: var(--stop-garage); }
#hud-minimap .item { stroke: var(--glass-halo); stroke-width: 1; }
#hud-minimap .item.jerrycan { fill: var(--item-jerrycan); }
#hud-minimap .item.toolbox { fill: var(--item-toolbox); }
#hud-minimap .item.healthKit { fill: var(--item-health); }
#hud-minimap .item.tajine { fill: var(--item-tajine); }
#hud-minimap .item.treedent { fill: var(--item-treedent); }
#hud-minimap .item.fromageBlanc { fill: var(--item-fromage); }
#hud-minimap .item.kokeZero { fill: var(--item-koke); }
#hud-minimap .item.ammo, #hud-minimap .item.gun { fill: var(--item-ammo); }
#hud-minimap .finish { fill: var(--finish-a); stroke: var(--finish-b); stroke-width: 1.5; }
#hud-minimap .checkpoint { fill: none; stroke: var(--on-glass); stroke-width: 2; }
#hud-minimap .checkpoint.reached { opacity: 0.3; }
#hud-minimap .tick { stroke: var(--glass-info); stroke-width: 2; }
#hud-vehicle { position: absolute; top: calc(8px + var(--safe-top)); right: calc(8px + var(--safe-right)); display: grid; gap: 5px; min-width: 150px; }
#hud-vehicle .row { display: grid; grid-template-columns: 14px 1fr 34px; gap: 6px; align-items: center; }
#hud-vehicle .num, #hud-health .num { text-align: right; font-size: 12px; }
#hud .bar { height: 6px; background: var(--glass-track); border-radius: 3px; overflow: hidden; }
#hud .bar > i { display: block; height: 100%; width: 100%; background: var(--glass-good); transform-origin: left; }
#hud .bar.fuel > i { background: var(--glass-accent); }
#hud .bar.low > i { background: var(--glass-bad); animation: hud-pulse 1.2s ease-in-out infinite; }
@keyframes hud-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
#hud-vehicle .info { display: contents; }
#hud-vehicle #hud-seat { justify-self: start; gap: 4px; padding: 0 8px; font-size: 12px; text-shadow: none; }
#hud-seat svg.ico { width: 12px; height: 12px; }
#hud-meta { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; }
#hud-meta .wallet { display: inline-flex; align-items: center; gap: 4px; }
#hud-meta .wallet svg.ico { color: var(--glass-accent); width: 10px; height: 10px; }
#hud.touch #hud-vehicle { top: calc(56px + var(--safe-top)); right: auto; left: 50%; transform: translateX(-50%); box-sizing: border-box; width: min(260px, 60vw); min-width: 0; height: 52px; padding: 3px 8px; grid-template-columns: 1fr 1fr; gap: 2px 10px; align-content: center; }
#hud.touch #hud-vehicle .row { grid-template-columns: 14px 1fr 30px; gap: 4px; }
#hud.touch #hud-vehicle .info { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
#hud.touch #hud-vehicle #hud-meta { flex: 1; }
#hud-seat-toast { position: absolute; top: calc(40px + var(--safe-top)); left: 0; right: 0; width: max-content; max-width: 60vw; margin: 0 auto; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hud.touch #hud-seat-toast { top: calc(116px + var(--safe-top)); max-width: min(300px, calc(100vw - 2 * (var(--safe-left) + 160px))); }
#hud #hud-health { position: absolute; left: calc(8px + var(--safe-left)); bottom: calc(8px + var(--safe-bottom)); box-sizing: border-box; width: 150px; height: 28px; padding: 0 10px; display: grid; grid-template-columns: 14px 1fr 30px; gap: 6px; align-items: center; transition: background-color 0.3s, border-color 0.3s; }
#hud #hud-health.full { background: transparent; border-color: transparent; }
#hud-health svg.ico { color: var(--glass-bad); }
#hud #hud-combat { position: absolute; left: calc(8px + var(--safe-left)); bottom: calc(42px + var(--safe-bottom)); display: flex; gap: 3px; }
#hud-combat .chip { display: inline-flex; align-items: center; gap: 3px; height: 22px; box-sizing: border-box; padding: 0 5px; font-size: 11px; border-radius: 11px; }
#hud-combat .chip svg.ico { width: 12px; height: 12px; }
#hud-combat .ammo svg.ico { color: var(--item-ammo); }
#hud-combat .chip.low .num { color: var(--glass-bad); }
#hud-combat .chip.treedent svg.ico { color: var(--item-treedent); }
#hud-combat .chip.shield svg.ico { color: var(--item-fromage); }
#hud-combat .chip.koke svg.ico { color: var(--item-koke); }
#hud-slots { position: absolute; left: 50%; bottom: calc(8px + var(--safe-bottom)); transform: translateX(-50%); display: flex; gap: 6px; }
#hud-slots .slot { position: relative; width: 52px; height: 52px; display: grid; grid-template-rows: 1fr auto; justify-items: center; align-items: center; padding: 6px 2px 4px; }
#hud-slots .slot .icon, #hud-slots .slot .icon svg.ico { width: 22px; height: 22px; }
#hud-slots .slot .label { font-size: 10px; line-height: 1; white-space: nowrap; }
#hud-slots .slot .badge { position: absolute; top: 3px; left: 5px; font-size: 10px; line-height: 1; }
#hud-slots .slot.selected { transform: scale(1.08); }
#hud-slots .slot.empty .icon, #hud-slots .slot.empty .label { display: none; }
#hud-slots .slot.empty { opacity: 0.55; }
#hud-prompt { position: absolute; left: 50%; bottom: calc(72px + var(--safe-bottom)); transform: translateX(-50%); width: max-content; max-width: 70vw; text-align: center; }
#hud.touch #hud-prompt { bottom: calc(76px + var(--safe-bottom)); max-width: 250px; }
#hud-prompt-text { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 14px; padding: 6px 12px; white-space: pre; }
#hud.touch #hud-prompt-text { white-space: normal; }
#hud-prompt-text:empty { display: none; }
#hud-prompt-text .part { display: inline-flex; align-items: center; gap: 6px; }
#hud-prompt-text .keycap { display: inline-grid; place-items: center; min-width: 22px; height: 22px; box-sizing: border-box; border-radius: 6px; background: var(--paper); color: var(--ink); text-shadow: none; font-size: 12px; font-weight: 700; }
#hud-prompt-text .keycap.pill { padding: 0 8px; border-radius: 11px; }
#hud-prompt-text .keycap.hold { box-shadow: 0 0 0 2px var(--glass-line), 0 0 0 3px var(--glass-accent); margin: 3px; }
#hud-prompt-hold { width: 160px; height: 6px; margin: 4px auto 0; }
#hud #hud-downed { position: absolute; left: 0; right: 0; top: 40%; width: max-content; margin: 0 auto; padding: 8px 20px; font: 700 22px/1.2 var(--font-display); border-radius: 999px; border-color: var(--glass-bad); }
#hud.touch #hud-downed { top: 44%; }
#hud .marker { position: absolute; transform: translate(-50%, -100%); display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; font-size: 12px; white-space: nowrap; border-radius: 999px; }
#hud .marker::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--glass-bad); }
#hud #hud-dashboard { position: absolute; right: calc(8px + var(--safe-right)); bottom: calc(8px + var(--safe-bottom)); box-sizing: border-box; width: 150px; padding: 6px 10px; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: baseline; }
#hud-dashboard .speed { font: 700 28px/1 var(--font-display); text-align: right; }
#hud-dashboard .unit { font-size: 11px; }
#hud-dashboard .gear { grid-row: 1; grid-column: 2; justify-self: end; min-width: 22px; text-align: center; font-size: 15px; color: var(--glass-accent); }
#hud-dashboard .rev { grid-column: 1 / -1; height: 6px; margin-top: 4px; }
#hud-dashboard .rev.red > i { background: var(--glass-bad); }
#hud.touch #hud-dashboard { right: auto; bottom: auto; left: calc(8px + var(--safe-left)); top: calc(222px + var(--safe-top)); width: 104px; padding: 4px 8px; }
#hud.touch #hud-dashboard .speed { font-size: 22px; }
@media (prefers-reduced-motion: reduce) { #hud .bar.low > i { animation: none; } #hud #hud-health { transition: none; } }
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

const lastPoint = (route: readonly [number, number][]) => {
  const [x, z] = route[route.length - 1] ?? [0, 0];
  return { x, z };
};

export function createHud(root: HTMLElement, opts: { touch: boolean; route: readonly [number, number][]; finish?: { x: number; z: number } }): Hud {
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
  const plan = createMapPlan(opts.route, opts.finish ?? lastPoint(opts.route), size, MAP_MARGIN + size * (1 - Math.SQRT1_2) / 2);
  const minimap = document.createElementNS(SVG_NS, 'svg');
  minimap.id = 'hud-minimap';
  minimap.setAttribute('width', String(size));
  minimap.setAttribute('height', String(size));
  minimap.setAttribute('class', 'glass');
  minimap.setAttribute('viewBox', `0 0 ${size} ${size}`);
  root.append(minimap);
  const routeNode = svg('path', minimap, { d: plan.staticPath }, 'route');
  const dots = svg('g', minimap);

  const vehiclePanel = el('div', root, 'hud-vehicle', 'panel glass');
  const bar = (iconMarkup: string, extra: string) => {
    const row = el('div', vehiclePanel, undefined, 'row');
    icon(el('span', row), iconMarkup);
    const track = el('div', row, undefined, `bar ${extra}`);
    return { track, fill: el('i', track), num: el('span', row, undefined, 'num') };
  };
  const fuelBar = bar(ICON_FUEL, 'fuel');
  const vehicleHealthBar = bar(ICON_HULL, 'health');
  const info = el('div', vehiclePanel, undefined, 'info');
  const seat = el('div', info, 'hud-seat', 'ui-chip');
  icon(seat, ICON_SEAT);
  const seatText = el('span', seat);
  const meta = el('div', info, 'hud-meta');
  const timer = el('span', meta);
  const wallet = el('span', meta, undefined, 'wallet');
  icon(wallet, ICON_COIN);
  const walletText = el('span', wallet);

  const dash = el('div', root, 'hud-dashboard', 'glass');
  const dashSpeed = el('span', dash, undefined, 'speed');
  const dashGear = el('span', dash, undefined, 'gear');
  const dashUnit = el('span', dash, undefined, 'unit');
  dashUnit.textContent = 'km/h';
  const dashRev = el('div', dash, undefined, 'bar rev');
  const dashRevFill = el('i', dashRev);
  dash.hidden = true;

  const health = el('div', root, 'hud-health', 'glass');
  icon(el('span', health), ICON_HEART);
  const ownHealth = el('div', health, undefined, 'bar health');
  const ownFill = el('i', ownHealth);
  const ownNum = el('span', health, undefined, 'num');

  const combat = el('div', root, 'hud-combat');
  const ammoChip = el('div', combat, undefined, 'chip glass ammo');
  icon(ammoChip, ICON_AMMO);
  ammoChip.title = 'Ammo';
  const ammoNum = el('span', ammoChip, undefined, 'num');
  ammoChip.hidden = true;
  const timerNodes = new Map<string, { chip: HTMLElement; num: HTMLElement }>();
  for (const kind of ['treedent', 'shield', 'koke'] as const) {
    const chip = el('div', combat, undefined, `chip glass ${kind}`);
    icon(chip, TIMER_ICONS[kind]);
    chip.title = kind === 'treedent' ? 'Treedent' : kind === 'shield' ? 'Fromage blanc shield' : 'Koke Zero';
    timerNodes.set(kind, { chip, num: el('span', chip, undefined, 'num') });
    chip.hidden = true;
  }

  const slots = el('div', root, 'hud-slots');
  const slotNodes: { tile: HTMLElement; icon: HTMLElement; label: HTMLElement }[] = [];
  if (!opts.touch) {
    for (let i = 0; i < 3; i++) {
      const tile = el('div', slots, undefined, 'ui-slot slot empty');
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

  const seatToast = el('div', root, 'hud-seat-toast', 'ui-toast');
  seatToast.hidden = true;

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
        const pill = part.key === 'Act' || part.key === 'Use' || part.key === 'Reset';
        const cap = el('span', wrap, undefined, `keycap${pill ? ' pill' : ''}${part.hold ? ' hold' : ''}`);
        cap.textContent = part.key;
      }
      el('span', wrap).textContent = part.text;
    }
  };
  const renderMap = (mapEntities: HudModel['mapEntities']) => {
    const seen = new Set<string>();
    const scene = mapScene(plan, mapEntities);
    setAttr(routeNode, 'd', scene.path);
    for (const { entity: e, x: px, y: py } of scene.items) {
      const p = { x: px, y: py };
      seen.add(e.id);
      const shape = e.kind === 'checkpoint' || e.kind === 'self' || e.kind === 'player' || e.kind === 'item' ? 'circle' : 'rect';
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
      } else if (e.kind === 'item') {
        setAttr(node, 'class', `item ${e.itemKind ?? ''}`.trim());
        setAttr(node, 'r', 2.5);
      } else if (e.kind === 'finish') {
        setAttr(node, 'class', 'finish');
        setAttr(node, 'width', 9);
        setAttr(node, 'height', 9);
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
        const half = e.kind === 'vehicle' ? 5 : e.kind === 'finish' ? 4.5 : 4;
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
    update(model, markers, toast = null) {
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
      text(fuelBar.num, gaugePercent(fuel));
      text(vehicleHealthBar.num, gaugePercent(hull));
      flag(fuelBar.track, 'low', !!v?.fuelLow);
      flag(vehicleHealthBar.track, 'low', !!v?.healthLow);
      toggle(seat, model.ownSeat === null);
      text(seatText, model.ownSeat?.label ?? '');
      toggle(seatToast, toast === null);
      text(seatToast, toast ?? '');
      toggle(dash, model.dashboard === null);
      if (model.dashboard) {
        text(dashSpeed, String(model.dashboard.kmh));
        text(dashGear, model.dashboard.gear === 0 ? 'N' : model.dashboard.gear < 0 ? 'R' : String(model.dashboard.gear));
        scale(dashRevFill, clamp(model.dashboard.rpm / REDLINE_RPM, 0, 1));
        flag(dashRev, 'red', model.dashboard.rpm >= 6500);
      }
      text(timer, model.timer);
      toggle(timer, model.timerHidden === true);
      text(walletText, `$${model.wallet}`);

      const own = ownHealthFraction(model.ownHealth);
      scale(ownFill, own);
      text(ownNum, String(ownHealthPoints(model.ownHealth)));
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

      toggle(ammoChip, model.combat.ammo === null);
      if (model.combat.ammo !== null) {
        text(ammoNum, String(model.combat.ammo));
        flag(ammoChip, 'low', model.combat.ammo <= 3);
      }
      const running = new Set(model.combat.timers.map((timer) => timer.kind));
      for (const [kind, node] of timerNodes) toggle(node.chip, !running.has(kind as 'treedent'));
      for (const timer of model.combat.timers) text(timerNodes.get(timer.kind)!.num, timer.text);

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
