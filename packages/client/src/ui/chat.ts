import { CHAT_BURST, CHAT_MAX_LENGTH, CHAT_PHRASES, cleanChat, type ChatMessage } from '@lodgy/shared';

export const CHAT_LIMIT = 50;
export const TOAST_SECONDS = 6;
export const TOAST_COUNT = 3;
// A little slower than the server's refill, so latency never makes the server drop a line the client sent.
export const CLIENT_REFILL_SECONDS = 1.6;
// Lines the open in-game panel shows above its input.
const PANEL_LINES = 6;

export interface ChatLine {
  id: number;
  playerId: string;
  name: string;
  text: string;
  // The server's clock, opaque to the client.
  at: number;
  own: boolean;
  // The client's clock, in seconds, when the line arrived; toasts and unread use it.
  receivedAt: number;
}

export interface ChatLog {
  // False when the line was already seen (a history replay after a reconnect).
  // A replayed line (the history sent to a joiner) is stored as seen: no toast, no unread.
  add(message: Pick<ChatMessage, 'id' | 'playerId' | 'name' | 'text' | 'at' | 'replay'>, localId: string, now: number): boolean;
  lines(): readonly ChatLine[];
  unread(): number;
  markRead(): void;
  recent(now: number): ChatLine[];
  // Counts every change to the lines, so a view can redraw only when it must.
  version(): number;
  clear(): void;
}

export function createChatLog(limit = CHAT_LIMIT): ChatLog {
  let held: ChatLine[] = [];
  let lastId = 0;
  let unread = 0;
  let version = 0;
  return {
    add(message, localId, now) {
      if (message.id <= lastId) return false;
      lastId = message.id;
      version += 1;
      const own = message.playerId === localId;
      held.push({ id: message.id, playerId: message.playerId, name: message.name, text: message.text, at: message.at, own, receivedAt: message.replay ? Number.NEGATIVE_INFINITY : now });
      if (held.length > limit) held = held.slice(held.length - limit);
      if (!own && !message.replay) unread = Math.min(unread + 1, limit);
      return true;
    },
    lines: () => held,
    unread: () => unread,
    markRead() {
      unread = 0;
    },
    version: () => version,
    recent: (now) => held.filter((line) => now - line.receivedAt < TOAST_SECONDS).slice(-TOAST_COUNT),
    clear() {
      version += 1;
      held = [];
      lastId = 0;
      unread = 0;
    },
  };
}

export interface ChatSender {
  // True and spends a token, or false when none is left.
  take(now: number): boolean;
  reset(): void;
}

// The server's token bucket, on the local clock, so a blocked line is not sent at all.
export function createChatSender(): ChatSender {
  let tokens = CHAT_BURST;
  let at = 0;
  return {
    take(now) {
      tokens = Math.min(CHAT_BURST, tokens + Math.max(0, now - at) / CLIENT_REFILL_SECONDS);
      at = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    reset() {
      tokens = CHAT_BURST;
      at = 0;
    },
  };
}

// 'empty' is blank text; 'invalid' is text the server's rules refuse.
export type SubmitResult = 'sent' | 'slow' | 'empty' | 'invalid';

// Validates with the server's rules first, so a refused line never costs a token and never reaches the server.
export function submitChat(text: string, sender: ChatSender, now: number, send: (text: string) => void): SubmitResult {
  const cleaned = cleanChat(text);
  if (cleaned === null) return text.trim() === '' ? 'empty' : 'invalid';
  if (!sender.take(now)) return 'slow';
  send(cleaned);
  return 'sent';
}

type KeyFacts = { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

// T opens the chat, except while typing in a field or with a shortcut modifier held.
export const isChatKey = (event: KeyFacts, targetTag: string | null): boolean =>
  event.code === 'KeyT' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');

export const CHAT_FORM_STYLE = `
.chat-lines { display: grid; gap: 2px; align-content: start; overflow-y: auto; overflow-wrap: anywhere; font: 14px/1.35 var(--font-text); }
.chat-line .chat-name { font-weight: 600; margin-right: 6px; }
.chat-line.own .chat-name { color: var(--info); }
.chat-form { display: grid; gap: 8px; }
.chat-row { display: flex; gap: 8px; }
.chat-form input { flex: 1; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 8px 12px; font: inherit; font-size: 16px; color: var(--ink); background: var(--paper); border: 2px solid var(--ink-soft); border-radius: var(--radius-ctl); }
.chat-form input:focus { border-color: var(--majorelle); }
.chat-form button { min-height: 44px; padding: 8px 14px; font: inherit; font-size: 14px; font-weight: 600; color: var(--white); background: var(--terracotta-strong); border: 2px solid var(--ink); border-radius: var(--radius-ctl); box-shadow: 0 2px 0 var(--ink); cursor: pointer; transition: transform var(--dur) var(--ease), background-color var(--dur) var(--ease); }
.chat-form button:active { transform: translateY(1px); }
.chat-phrases { display: flex; flex-wrap: wrap; gap: 6px; }
.chat-phrases button { color: var(--ink); background: var(--sand-deep); border-color: var(--ink-soft); box-shadow: none; }
.chat-note { min-height: 1.3em; margin: 0; font-size: 13px; font-weight: 500; color: var(--danger); }
@media (max-height: 500px) {
  .chat-phrases { flex-wrap: nowrap; overflow-x: auto; }
  .chat-phrases button { flex: none; }
}
@media (prefers-reduced-motion: reduce) { .chat-form button { transition: none; } }
`;

export interface ChatForm {
  element: HTMLElement;
  input: HTMLInputElement;
  clear(): void;
}

// The input, the send button and the phrase buttons, shared by the lobby and the in-game panel.
// `onSubmit` returns what happened; `onResult` hears it with whether the line came from the input.
export function createChatForm(doc: Document, onSubmit: (text: string) => SubmitResult, onResult: (result: SubmitResult, fromInput: boolean) => void = () => {}): ChatForm {
  const element = doc.createElement('div');
  element.className = 'chat-form';
  const row = doc.createElement('div');
  row.className = 'chat-row';
  const input = doc.createElement('input');
  input.type = 'text';
  input.maxLength = CHAT_MAX_LENGTH;
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'sentences');
  input.setAttribute('enterkeyhint', 'send');
  input.setAttribute('aria-label', 'Chat message');
  input.placeholder = 'Message';
  const send = doc.createElement('button');
  send.type = 'button';
  send.textContent = 'Send';
  row.append(input, send);
  const note = doc.createElement('p');
  note.className = 'chat-note';
  note.setAttribute('role', 'status');
  const phrases = doc.createElement('div');
  phrases.className = 'chat-phrases';
  element.append(row, phrases, note);

  const finish = (result: SubmitResult, fromInput: boolean) => {
    note.textContent = result === 'slow' ? 'Wait a moment' : result === 'invalid' ? 'Cannot send that' : '';
    if (result === 'sent' && fromInput) input.value = '';
    onResult(result, fromInput);
  };
  input.addEventListener('input', () => (note.textContent = ''));
  const submitInput = () => finish(onSubmit(input.value), true);
  send.addEventListener('click', submitInput);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    submitInput();
  });
  for (const phrase of CHAT_PHRASES) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = phrase;
    button.addEventListener('click', () => finish(onSubmit(phrase), false));
    phrases.append(button);
  }
  return {
    element,
    input,
    clear() {
      input.value = '';
      note.textContent = '';
    },
  };
}

// Names and texts go in with textContent, never as HTML.
export function renderChatLines(doc: Document, container: HTMLElement, lines: readonly ChatLine[]): void {
  const pinned = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
  container.replaceChildren(
    ...lines.map((line) => {
      const item = doc.createElement('div');
      item.className = line.own ? 'chat-line own' : 'chat-line';
      const name = doc.createElement('span');
      name.className = 'chat-name';
      name.textContent = line.name;
      const text = doc.createElement('span');
      text.textContent = line.text;
      item.append(name, text);
      return item;
    }),
  );
  if (pinned) container.scrollTop = container.scrollHeight;
}

const STYLE = `${CHAT_FORM_STYLE}
#chat-panel { position: fixed; z-index: 15; top: max(8px, var(--safe-top)); left: max(8px, var(--safe-left)); width: min(440px, calc(100vw - 180px - var(--safe-left) - var(--safe-right))); display: grid; gap: 8px; padding: 10px; animation: chat-rise var(--dur) var(--ease) both; }
#chat-panel[hidden], #chat-toasts[hidden] { display: none; }
#chat-panel .chat-lines { max-height: 9em; padding: 4px 8px; background: var(--paper); border-radius: var(--radius-ctl); }
#chat-head { display: flex; align-items: center; justify-content: space-between; font: 700 18px/1.2 var(--font-display); color: var(--teal); }
#chat-close { padding: 8px 12px; font-size: 14px; }
@media (max-height: 500px) {
  #chat-panel { gap: 4px; }
  #chat-panel .chat-lines { max-height: 3.5em; order: 3; }
}
#chat-panel .chat-lines:empty { display: none; }
#chat-toasts { position: fixed; z-index: 15; left: max(8px, var(--safe-left)); top: 50%; transform: translateY(-50%); width: max-content; max-width: min(360px, 30vw); display: grid; gap: 4px; pointer-events: none; }
.chat-toast { padding: 4px 10px; font: 500 14px/1.35 var(--font-text); color: var(--on-glass); background: var(--glass-strong); border: 1px solid var(--glass-line); border-radius: 10px; text-shadow: var(--glass-text-shadow); overflow-wrap: anywhere; animation: chat-fade ${TOAST_SECONDS}s linear forwards; }
.chat-toast .chat-name { font-weight: 700; margin-right: 6px; color: var(--glass-info); }
.chat-toast.own .chat-name { color: var(--glass-accent); }
@media (pointer: coarse) {
  #chat-toasts { top: calc(150px + var(--safe-top)); transform: none; max-width: 40vw; max-height: 64px; overflow: hidden; gap: 2px; }
  .chat-toast { padding: 1px 8px; font-size: 12px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@keyframes chat-fade { 0%, 75% { opacity: 1; } 100% { opacity: 0; } }
@keyframes chat-rise { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .chat-toast, #chat-panel { animation: none; } }
`;

export interface ChatPanelHandlers {
  onSubmit(text: string): SubmitResult;
  // Whether the panel is open now; the game stands still while it is.
  onOpenChange(open: boolean): void;
}

export interface ChatPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
  // The last lines of the log, shown above the input while the panel is open.
  setLines(lines: readonly ChatLine[]): void;
  // The lines to show as fading toasts; they show only while the panel is closed.
  setToasts(lines: readonly ChatLine[]): void;
  // Toasts also hide in the lobby, where the lobby has its own chat.
  setToastsAllowed(allowed: boolean): void;
}

export function createChatPanel(doc: Document, handlers: ChatPanelHandlers): ChatPanel {
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const root = doc.createElement('div');
  root.id = 'chat-panel';
  root.className = 'ui-panel';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Chat');
  const lines = doc.createElement('div');
  lines.className = 'chat-lines';
  const form = createChatForm(doc, handlers.onSubmit, (result, fromInput) => {
    // A line sent, or Enter on nothing, closes the panel; a blocked line keeps it open.
    if (result === 'sent' || (result === 'empty' && fromInput)) set(false);
  });
  const head = doc.createElement('div');
  head.id = 'chat-head';
  const closeButton = doc.createElement('button');
  closeButton.id = 'chat-close';
  closeButton.type = 'button';
  closeButton.className = 'ui-btn';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => set(false));
  head.append(doc.createTextNode('Chat'), closeButton);
  root.append(head, lines, form.element);
  const toasts = doc.createElement('div');
  toasts.id = 'chat-toasts';
  toasts.setAttribute('aria-live', 'polite');
  doc.body.append(style, root, toasts);

  const shown = new Map<number, HTMLElement>();
  let allowed = true;
  let currentToasts: readonly ChatLine[] = [];
  const syncToasts = () => {
    const wanted = allowed && root.hidden ? currentToasts : [];
    const ids = new Set(wanted.map((line) => line.id));
    for (const [id, item] of shown) {
      if (ids.has(id)) continue;
      item.remove();
      shown.delete(id);
    }
    for (const line of wanted) {
      if (shown.has(line.id)) continue;
      const item = doc.createElement('div');
      item.className = line.own ? 'chat-toast own' : 'chat-toast';
      const name = doc.createElement('span');
      name.className = 'chat-name';
      name.textContent = line.name;
      const text = doc.createElement('span');
      text.textContent = line.text;
      item.append(name, text);
      toasts.append(item);
      shown.set(line.id, item);
    }
  };

  const set = (open: boolean) => {
    if (root.hidden === !open) return;
    root.hidden = !open;
    if (open) {
      // Synchronously, inside the user's gesture, so iOS shows the keyboard.
      form.input.focus();
    } else {
      form.input.blur();
      form.clear();
    }
    syncToasts();
    handlers.onOpenChange(open);
  };
  // Capture on window and registered after the help panel and the tutorial, so those close first and the game's Escape does not open the run menu.
  doc.defaultView?.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || root.hidden) return;
      event.stopImmediatePropagation();
      set(false);
    },
    { capture: true },
  );

  return {
    open: () => set(true),
    close: () => set(false),
    isOpen: () => !root.hidden,
    setLines(next) {
      renderChatLines(doc, lines, next.slice(-PANEL_LINES));
    },
    setToasts(next) {
      currentToasts = next;
      syncToasts();
    },
    setToastsAllowed(value) {
      allowed = value;
      syncToasts();
    },
  };
}
