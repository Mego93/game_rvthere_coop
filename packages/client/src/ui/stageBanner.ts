import { getCourseDef, type StageMessage } from '@lodgy/shared';

export const STAGE_BANNER_MS = 3000;

// A stage label without its leading number: "2 Bridge and forest" becomes "Bridge and forest".
export const labelWithoutNumber = (label: string): string => label.replace(/^\d+\s+/, '');

// "Stage 2 of 5: Bridge and forest"; a course with no label shows its id.
export function stageBannerText(message: Pick<StageMessage, 'courseId' | 'index' | 'of'>): string {
  const label = getCourseDef(message.courseId)?.label ?? message.courseId;
  return `Stage ${message.index + 1} of ${message.of}: ${labelWithoutNumber(label)}`;
}

const STYLE = `
#stage-banner { position: fixed; top: max(72px, calc(var(--safe-top) + 56px)); left: 50%; z-index: 15; max-width: calc(100vw - 32px); transform: translateX(-50%); pointer-events: none; }
#stage-banner[hidden] { display: none; }
#stage-banner .ui-toast { display: block; padding: 12px 28px; font: 700 clamp(18px, 3.2vw, 28px)/1.2 var(--font-display); color: var(--on-glass); background: var(--glass-strong); border: 2px solid var(--glass-accent); text-align: center; text-shadow: var(--glass-text-shadow); animation: stage-banner 3s var(--ease) both; }
@keyframes stage-banner { 0% { opacity: 0; transform: translateY(-10px); } 10%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { #stage-banner .ui-toast { animation: none; } }
`;

export interface StageBanner {
  show(text: string): void;
  hide(): void;
}

// A banner over the scene for STAGE_BANNER_MS, styled with the step 35 glass tokens; a new one replaces the one showing.
export function createStageBanner(doc: Document, setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms), clearTimer: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)): StageBanner {
  const root = doc.createElement('div');
  root.id = 'stage-banner';
  root.hidden = true;
  root.setAttribute('role', 'status');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const toast = doc.createElement('div');
  toast.className = 'ui-toast';
  root.append(style, toast);
  doc.body.append(root);
  let timer: unknown = null;
  const hide = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    root.hidden = true;
  };
  return {
    show(text) {
      hide();
      toast.textContent = text;
      // Restarts the CSS animation when one banner follows another.
      root.hidden = false;
      toast.style.animation = 'none';
      void toast.offsetWidth;
      toast.style.animation = '';
      timer = setTimer(hide, STAGE_BANNER_MS);
    },
    hide,
  };
}
