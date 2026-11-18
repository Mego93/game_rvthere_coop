export const CREDITS_URL = '/CREDITS.md';
export const CREDITS_FAILED = 'The credits could not be loaded. They are in the file CREDITS.md next to the game.';

type Fetcher = (url: string) => Promise<Response>;

// Never rejects: a failed request, an error status or an HTML page (a server's fallback page) gives the fallback line.
export async function loadCredits(fetcher: Fetcher = (url) => fetch(url)): Promise<string> {
  try {
    const reply = await fetcher(CREDITS_URL);
    if (!reply.ok || (reply.headers.get('Content-Type') ?? '').includes('text/html')) return CREDITS_FAILED;
    return await reply.text();
  } catch {
    return CREDITS_FAILED;
  }
}

const STYLE = `
#credits { position: fixed; inset: 0; z-index: 40; display: grid; background: var(--scrim); }
#credits[hidden] { display: none; }
#credits-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; width: min(560px, 92vw); max-height: 86vh; margin: auto; padding: 18px; animation: credits-rise 200ms var(--ease) both; }
#credits-panel h2 { margin: 0; font-size: 22px; color: var(--teal); }
#credits-text { margin: 0; padding: 10px 12px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.45 var(--font-mono); color: var(--ink); background: var(--paper); border-radius: var(--radius-ctl); }
@keyframes credits-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { #credits-panel { animation: none; } }
`;

export interface CreditsPanel {
  open(): void;
  close(): void;
}

// A scrollable plain-text panel over the page; the text is fetched on each open and set as textContent.
export function createCredits(doc: Document, fetcher?: Fetcher): CreditsPanel {
  const root = doc.createElement('div');
  root.id = 'credits';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Credits');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const panel = doc.createElement('div');
  panel.id = 'credits-panel';
  panel.className = 'ui-panel';
  const title = doc.createElement('h2');
  title.textContent = 'Credits';
  const text = doc.createElement('pre');
  text.id = 'credits-text';
  const close = doc.createElement('button');
  close.id = 'credits-close';
  close.type = 'button';
  close.className = 'ui-btn ui-btn-primary';
  close.textContent = 'Close';
  panel.append(title, text, close);
  root.append(style, panel);
  doc.body.append(root);

  const hide = () => {
    root.hidden = true;
  };
  close.addEventListener('click', hide);
  root.addEventListener('click', (event) => {
    if (event.target === root) hide();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) hide();
  });

  return {
    open() {
      root.hidden = false;
      text.textContent = 'Loading…';
      void loadCredits(fetcher).then((loaded) => {
        text.textContent = loaded;
      });
      close.focus();
    },
    close: hide,
  };
}
