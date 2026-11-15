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
#credits { position: fixed; inset: 0; z-index: 40; display: grid; background: rgba(0, 0, 0, 0.5); }
#credits[hidden] { display: none; }
#credits-panel { display: grid; grid-template-rows: auto 1fr auto; gap: 12px; width: min(560px, 92vw); max-height: 86vh; margin: auto; padding: 20px; box-sizing: border-box; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3); }
#credits-panel h2 { margin: 0; font-size: 20px; }
#credits-text { margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.45 ui-monospace, Menlo, monospace; color: #222; }
#credits-close { padding: 10px; font: inherit; font-size: 16px; color: #fff; background: #2f6f9f; border: 1px solid #2f6f9f; border-radius: 6px; }
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
  const title = doc.createElement('h2');
  title.textContent = 'Credits';
  const text = doc.createElement('pre');
  text.id = 'credits-text';
  const close = doc.createElement('button');
  close.id = 'credits-close';
  close.type = 'button';
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
