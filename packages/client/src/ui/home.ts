import { cleanName, cleanRoom, type ErrorReason } from '@lodgy/shared';

const ERROR_TEXT: Record<ErrorReason, string> = {
  unknown_room: 'There is no room with that name.',
  room_full: 'That room is full.',
  name_taken: 'Someone in that room already has that name.',
  bad_message: 'The server did not understand the request.',
  server_full: 'The server has no space for another room. Try again later.',
  cannot_buy: 'You cannot buy that here.',
};

export const errorText = (reason: ErrorReason): string => ERROR_TEXT[reason];

export interface HomeHandlers {
  onCreate(name: string): void;
  onJoin(room: string, name: string): void;
}

export interface HomeView {
  // Shows the form. With a room it offers to join that room; without, to create one or to join one by name.
  show(options: { room: string | null; name: string; error?: string }): void;
  hide(): void;
  setError(text: string): void;
  // Disables the buttons while a request is with the server.
  setBusy(busy: boolean): void;
}

// The home page and the "join this room" page. The markup is in index.html; this wires it up.
export function createHome(root: HTMLElement, handlers: HomeHandlers): HomeView {
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
  // The room named by the address, when the page was opened by a room link.
  let linkedRoom: string | null = null;

  const setError = (text: string) => {
    error.textContent = text;
  };

  const join = () => {
    const name = cleanName(nameInput.value);
    if (!name) return setError('Enter a name of 1 to 16 characters.');
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
    if (!name) return setError('Enter a name of 1 to 16 characters.');
    setError('');
    handlers.onCreate(name);
  });
  joinButton.addEventListener('click', join);

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
    setBusy(busy) {
      primaryButton.disabled = busy;
      joinButton.disabled = busy;
    },
  };
}
