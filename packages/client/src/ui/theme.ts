export const TOKENS: Readonly<Record<string, string>> = {
  // Palette
  '--sand': '#f3e3c3',
  '--sand-deep': '#e4cc9b',
  '--paper': '#fff8ea',
  '--terracotta': '#c8553d',
  '--terracotta-strong': '#a8432f',
  '--terracotta-deep': '#8f3827',
  '--saffron': '#f2a541',
  '--majorelle': '#2f4fd8',
  '--teal': '#0f5257',
  '--ink': '#1d1a17',
  '--ink-soft': '#5a4b3d',
  '--white': '#ffffff',
  // Dark glass for panels over the 3D scene
  '--glass': 'rgba(20, 16, 12, 0.62)',
  '--glass-strong': 'rgba(20, 16, 12, 0.8)',
  '--glass-line': 'rgba(255, 255, 255, 0.22)',
  '--on-glass': '#ffffff',
  '--glass-accent': '#f2a541',
  '--glass-good': '#7ee28a',
  '--glass-bad': '#ff8a75',
  '--glass-info': '#8fc4ff',
  '--glass-track': 'rgba(255, 255, 255, 0.2)',
  '--glass-faint': 'rgba(255, 255, 255, 0.12)',
  '--glass-press': 'rgba(255, 255, 255, 0.45)',
  '--glass-line-strong': 'rgba(255, 255, 255, 0.7)',
  '--glass-route': 'rgba(255, 255, 255, 0.55)',
  '--glass-halo': 'rgba(0, 0, 0, 0.6)',
  '--glass-text-shadow': '0 1px 2px rgba(0, 0, 0, 0.55)',
  // Safe-area insets as tokens, so a layout check can stand in for a notched phone.
  '--safe-top': 'env(safe-area-inset-top, 0px)',
  '--safe-right': 'env(safe-area-inset-right, 0px)',
  '--safe-bottom': 'env(safe-area-inset-bottom, 0px)',
  '--safe-left': 'env(safe-area-inset-left, 0px)',
  // Semantic text colours, each at least 4.5:1 on --sand
  '--danger': '#9e2a1f',
  '--ok': '#1d6b35',
  '--warn': '#8a5a00',
  '--info': '#1f4fa3',
  '--focus': '#2f4fd8',
  // Scrims and shadows
  '--scrim': 'rgba(20, 16, 12, 0.6)',
  '--shadow': '0 6px 20px rgba(29, 26, 23, 0.28)',
  '--shadow-soft': '0 2px 8px rgba(29, 26, 23, 0.2)',
  // Scenery behind the home page and the lobby
  '--sky': '#cfe6f5',
  '--sky-top': '#8ec5ea',
  '--sky-bottom': '#f6ead2',
  '--pulse-a': 'rgba(47, 79, 216, 0.55)',
  '--pulse-b': 'rgba(47, 79, 216, 0)',
  '--flash': 'rgba(242, 165, 65, 0.9)',
  '--go-glow': 'rgba(200, 85, 61, 0.6)',
  '--go-glow-off': 'rgba(200, 85, 61, 0)',
  '--sun': '#fad894',
  '--dune-near': '#d9b98a',
  '--dune-far': '#ecd3ad',
  '--silhouette': '#35566e',
  // Minimap data colours
  '--item-jerrycan': '#d9a21b',
  '--item-toolbox': '#4a90d9',
  '--item-health': '#d94a4a',
  '--item-tajine': '#c2662d',
  '--stop-fuel': '#ff8a3d',
  '--stop-garage': '#6ee07a',
  '--finish-a': '#ffffff',
  '--finish-b': '#111111',
  // Character portraits in the lobby picker
  '--portrait-skin': '#f6d1a5',
  '--portrait-white': '#ffffff',
  '--portrait-tie': '#1b1d27',
  '--portrait-eye': '#1a1a1f',
  '--portrait-mouth': '#3a1e1e',
  '--portrait-frame': '#1d1d22',
  '--portrait-cap': '#c0392b',
  '--portrait-fez': '#a8201a',
  // Shape, motion and type
  '--radius-panel': '16px',
  '--radius-ctl': '10px',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--dur': '180ms',
  '--font-display': "'Rubik Variable', Rubik, system-ui, sans-serif",
  '--font-text': "'Inter Variable', Inter, system-ui, sans-serif",
  '--font-mono': 'ui-monospace, Menlo, monospace',
  // A tile of four colours; used as the border of titled panels
  '--zellige': 'repeating-conic-gradient(var(--teal) 0 25%, var(--saffron) 0 50%, var(--majorelle) 0 75%, var(--terracotta) 0 100%)',
};

export const UI_CLASS = {
  panel: 'ui-panel',
  btn: 'ui-btn',
  btnPrimary: 'ui-btn ui-btn-primary',
  chip: 'ui-chip',
  slot: 'ui-slot',
  toast: 'ui-toast',
  input: 'ui-input',
} as const;

const rootBlock = `:root {\n${Object.entries(TOKENS)
  .map(([name, value]) => `  ${name}: ${value};`)
  .join('\n')}\n}`;

export const THEME_CSS = `${rootBlock}
body { font-family: var(--font-text); color: var(--ink); }
button, input, select { font-family: inherit; }
a, button, input, select, [tabindex] { -webkit-tap-highlight-color: transparent; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
h1, h2, h3 { font-family: var(--font-display); letter-spacing: 0.01em; }
kbd { font-family: var(--font-mono); }
.ui-panel[hidden], .ui-btn[hidden], .ui-chip[hidden], .ui-slot[hidden], .ui-toast[hidden], .ui-input[hidden] { display: none; }
.ui-panel { position: relative; box-sizing: border-box; color: var(--ink); border: 5px solid transparent; border-radius: var(--radius-panel); background: linear-gradient(var(--sand), var(--sand)) padding-box, var(--zellige) border-box 0 0 / 10px 10px; box-shadow: var(--shadow); }
.ui-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; min-width: 44px; min-height: 44px; padding: 8px 16px; font: 600 16px/1.2 var(--font-text); color: var(--ink); background: var(--paper); border: 2px solid var(--ink); border-radius: var(--radius-ctl); box-shadow: 0 3px 0 var(--ink); cursor: pointer; transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), background-color var(--dur) var(--ease), opacity var(--dur) var(--ease); }
.ui-btn:hover:not(:disabled) { background: var(--sand-deep); }
.ui-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--ink); }
.ui-btn:disabled { opacity: 0.55; cursor: default; }
.ui-btn-primary { color: var(--white); background: var(--terracotta-strong); }
.ui-btn-primary:hover:not(:disabled) { background: var(--terracotta-deep); }
.ui-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; font: 500 16px/1.2 var(--font-text); color: var(--ink); background: var(--paper); border: 2px solid var(--ink-soft); border-radius: var(--radius-ctl); transition: border-color var(--dur) var(--ease); }
.ui-input:focus { border-color: var(--majorelle); }
.ui-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; font: 600 12px/1.4 var(--font-text); color: var(--ink); background: var(--paper); border: 1px solid var(--ink-soft); border-radius: 999px; }
.ui-slot { box-sizing: border-box; color: var(--on-glass); background: var(--glass); border: 2px solid var(--glass-line); border-radius: 12px; transition: transform 0.12s var(--ease), border-color var(--dur) var(--ease); }
.ui-slot.selected { border-color: var(--glass-accent); }
.ui-toast { box-sizing: border-box; padding: 6px 16px; color: var(--on-glass); background: var(--glass); border: 1px solid var(--glass-line); border-radius: 999px; animation: ui-toast-in var(--dur) var(--ease) both; }
@keyframes ui-toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
#reconnect { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: var(--scrim); color: var(--ink); font: 600 20px/1.3 var(--font-display); /* Takes pointer input so nothing underneath can be pressed while the connection is down. */ pointer-events: auto; }
#reconnect[hidden] { display: none; }
#reconnect-card { display: flex; align-items: center; gap: 14px; padding: 18px 28px; }
#reconnect-spinner { flex: none; width: 22px; height: 22px; box-sizing: border-box; border: 3px solid var(--ink-soft); border-top-color: var(--terracotta-strong); border-radius: 50%; animation: ui-spin 0.9s linear infinite; }
@keyframes ui-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .ui-btn, .ui-input, .ui-slot { transition: none; }
  .ui-toast { animation: none; }
  #reconnect-spinner { animation: none; border-top-color: var(--terracotta-strong); border-right-color: var(--terracotta-strong); }
}
`;

// The build and the dev server already put the theme in the page; this covers any other page. Called once at start-up; the components never touch document.head.
export function installTheme(doc: Document): void {
  if (doc.getElementById('lodgy-theme')) return;
  const style = doc.createElement('style');
  style.id = 'lodgy-theme';
  style.textContent = THEME_CSS;
  doc.head.append(style);
}
