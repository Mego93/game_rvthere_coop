import { cleanName, cleanRoom, hasForbiddenNameCharacter, type ErrorReason } from '@lodgy/shared';

const ERROR_TEXT: Record<ErrorReason, string> = {
  unknown_room: 'There is no room with that name.',
  room_full: 'That room is full.',
  name_taken: 'Someone in that room already has that name.',
  bad_message: 'The server did not understand the request.',
  server_full: 'The server has no space for another room. Try again later.',
  cannot_buy: 'You cannot buy that here.',
  kicked: 'You were removed from the room.',
  not_admin: 'Only the admin can do that.',
  not_ready: 'Not everyone is ready.',
  bad_phase: 'That cannot be done now.',
  replaced: 'This room was opened in another tab.',
  character_taken: 'Another player already has that character.',
};

const STYLE = `
#home { position: fixed; inset: 0; z-index: 10; display: grid; box-sizing: border-box; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  /* With the keyboard open on a phone in landscape the form is taller than the screen, so it must scroll. */
  overflow-x: hidden; overflow-y: auto;
  background: radial-gradient(circle at 80% 20%, var(--sun) 0 44px, transparent 45px), radial-gradient(ellipse 75% 34% at 18% 100%, var(--dune-near) 0 98%, transparent 100%), radial-gradient(ellipse 85% 26% at 88% 100%, var(--dune-far) 0 98%, transparent 100%), linear-gradient(var(--sky-top), var(--sky-bottom)); }
#home[hidden], #home [hidden] { display: none; }
#home-form { display: grid; gap: 12px; width: min(380px, 100%); /* Centres the form, and unlike centring on the container keeps its top reachable when it overflows. */ margin: auto; padding: 24px 22px; animation: home-rise 240ms var(--ease) both; }
#home-form h1 { margin: 0; font-size: 30px; font-weight: 700; line-height: 1.1; color: var(--teal); overflow-wrap: anywhere; }
#home-tagline { margin: -4px 0 4px; font-size: 14px; color: var(--ink-soft); }
#home-form label { display: grid; gap: 4px; min-width: 0; font-size: 14px; font-weight: 600; }
#home-form input { /* iOS Safari zooms the page when a focused field's text is smaller than 16px. */ font-size: 16px; }
#home-form input::placeholder { color: var(--ink-soft); opacity: 1; }
#home-primary { width: 100%; }
#home-room-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
#home-link, #home-credits { justify-self: center; display: inline-flex; align-items: center; min-height: 44px; font-size: 14px; font-weight: 600; color: var(--info); }
#home-error { margin: 0; min-height: 1.4em; color: var(--danger); font-size: 14px; font-weight: 600; }
#home-error:empty { min-height: 0; }
#home-credits { margin-top: 4px; }
@keyframes home-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { #home-form { animation: none; } }
`;

export const errorText = (reason: ErrorReason): string => ERROR_TEXT[reason];

export interface HomeHandlers {
  onCreate(name: string): void;
  onJoin(room: string, name: string): void;
  onCredits(): void;
}

export interface HomeView {
  // Shows the form. With a room it offers to join that room; without, to create one or to join one by name.
  show(options: { room: string | null; name: string; error?: string }): void;
  hide(): void;
  setError(text: string): void;
  // Disables the buttons while a request is with the server.
  // progress, when given, is shown on the main button while busy.
  setBusy(busy: boolean, progress?: string): void;
}

// The home page and the "join this room" page. The markup is in index.html; this wires it up and adds the styles.
export function createHome(root: HTMLElement, handlers: HomeHandlers): HomeView {
  const style = root.ownerDocument.createElement('style');
  style.textContent = STYLE;
  root.append(style);
  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const form = find<HTMLFormElement>('home-form');
  const title = find('home-title');
  const error = find('home-error');
  const nameInput = find<HTMLInputElement>('home-name');
  const roomInput = find<HTMLInputElement>('home-room');
  const roomRow = find('home-room-row');
  // The form's main button: "Create room" on the home page, "Join" on a room's page.
  const primaryButton = find<HTMLButtonElement>('home-primary');
  const joinButton = find<HTMLButtonElement>('home-join');
  const homeLink = find('home-link');
  const creditsLink = find('home-credits');
  // The room named by the address, when the page was opened by a room link.
  let linkedRoom: string | null = null;

  const setError = (text: string) => {
    error.textContent = text;
  };

  const NAME_TEXT = 'Enter a name of 1 to 16 characters.';
  const nameError = (value: string) =>
    hasForbiddenNameCharacter(value.trim()) ? 'Names cannot contain control or invisible characters.' : NAME_TEXT;

  const join = () => {
    const name = cleanName(nameInput.value);
    if (!name) return setError(nameError(nameInput.value));
    const room = linkedRoom ?? cleanRoom(roomInput.value);
    if (!room) return setError('Enter the name of the room, for example camel.');
    setError('');
    handlers.onJoin(room, name);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // Enter joins when the page is for one room or a room has been typed; otherwise it creates.
    if (linkedRoom || roomInput.value.trim() !== '') return join();
    const name = cleanName(nameInput.value);
    if (!name) return setError(nameError(nameInput.value));
    setError('');
    handlers.onCreate(name);
  });
  joinButton.addEventListener('click', join);
  creditsLink.addEventListener('click', (event) => {
    event.preventDefault();
    handlers.onCredits();
  });

  return {
    show({ room, name, error: message = '' }) {
      linkedRoom = room;
      title.textContent = room ? `Join room ${room}` : 'Lodgy Co-op';
      nameInput.value = name;
      roomRow.hidden = room !== null;
      primaryButton.textContent = room ? 'Join' : 'Create room';
      homeLink.hidden = room === null;
      setError(message);
      root.hidden = false;
      nameInput.focus();
    },
    hide() {
      root.hidden = true;
    },
    setError,
    setBusy(busy, progress) {
      primaryButton.disabled = busy;
      joinButton.disabled = busy;
      primaryButton.textContent = busy && progress ? progress : linkedRoom ? 'Join' : 'Create room';
    },
  };
}
