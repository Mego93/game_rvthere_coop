import {
  SHOP_ERROR_SECONDS,
  SHOP_MENU_TELEPORT,
  SHOP_PRICES,
  inShopRange,
  neutralInput,
  type InputFields,
  type InteractAction,
  type ShopItem,
  type ServiceStop,
  type Vec3,
} from '@lodgy/shared';

export interface ShopMenuState {
  open: boolean;
  // The local feet at the last update, for the teleport check.
  feet: Vec3 | null;
}

export interface ShopMenuInputs {
  feet: Vec3 | null;
  seated: boolean;
  downed: boolean;
  won: boolean;
  stops: readonly ServiceStop[];
  // What the local interact press resolved to this update, or null when there was no press.
  press: InteractAction | null;
  // Esc or the close button.
  dismiss: boolean;
}

export const CLOSED: ShopMenuState = { open: false, feet: null };

// Rule V10 with M2: opens only on a press that resolves to the shop; closes on leaving range, being downed or seated, a teleport, or a dismissal.
export function shopMenuState(prev: ShopMenuState, { feet, seated, downed, won, stops, press, dismiss }: ShopMenuInputs): ShopMenuState {
  if (feet === null || seated || downed || won || dismiss) return { open: false, feet };
  const inRange = stops.some((stop) => inShopRange(feet, stop));
  if (!inRange) return { open: false, feet };
  if (prev.open) {
    const jump = prev.feet === null ? 0 : Math.hypot(feet.x - prev.feet.x, feet.y - prev.feet.y, feet.z - prev.feet.z);
    return { open: jump <= SHOP_MENU_TELEPORT, feet };
  }
  return { open: press?.kind === 'shop', feet };
}

// Rule M9: while the menu is open the player stands still; the aim follows the sample and the slot stays as last sent.
export const menuInput = (open: boolean, sampled: InputFields, last: InputFields): InputFields =>
  open ? { ...neutralInput(last), yaw: sampled.yaw, pitch: sampled.pitch } : sampled;

// One position for every menu check: the drawn (predicted) one when there is one, so a lagging server position cannot close the menu.
export const menuFeet = (drawn: Vec3 | null, server: Vec3 | null): Vec3 | null => drawn ?? server;

// The mouse click gate follows the menu; releasing it on stop keeps a dropped game from blocking the next one.
export function gateControl(gate: { blocked: boolean }): { follow(open: boolean): void; release(): void } {
  return {
    follow: (open) => void (gate.blocked = open),
    release: () => void (gate.blocked = false),
  };
}

const ITEMS: { kind: ShopItem; label: string }[] = [
  { kind: 'jerrycan', label: 'Jerrycan' },
  { kind: 'toolbox', label: 'Toolbox' },
  { kind: 'healthKit', label: 'Health kit' },
];

const STYLE = `
#shop-menu { position: fixed; inset: 0; width: min(300px, calc(100vw - 32px)); height: fit-content; max-height: calc(100vh - 32px); margin: auto; z-index: 20; display: grid; gap: 8px; padding: 14px; overflow-y: auto; pointer-events: auto; touch-action: manipulation; }
#shop-menu[hidden] { display: none; }
#shop-menu h2 { margin: 0; font-size: 22px; color: var(--teal); text-align: center; }
#shop-menu .ui-btn { width: 100%; justify-content: space-between; }
#shop-wallet, #shop-error { margin: 0; }
#shop-wallet { padding: 6px 10px; text-align: center; font-weight: 600; color: var(--ink); background: var(--paper); border-radius: var(--radius-ctl); }
#shop-error { min-height: 1.3em; text-align: center; font-weight: 600; color: var(--danger); }
@media (max-height: 420px) { #shop-menu { gap: 4px; padding: 10px; } #shop-error { min-height: 0; } }
`;

export interface ShopMenu {
  setOpen(open: boolean): void;
  setWallet(wallet: number): void;
  // Shows "Cannot buy" for SHOP_ERROR_SECONDS; ignored while the menu is closed.
  showError(): void;
  dispose(): void;
}

export function createShopMenu(doc: Document, handlers: { onBuy(item: ShopItem): void; onClose(): void }): ShopMenu {
  const root = doc.createElement('div');
  root.id = 'shop-menu';
  root.className = 'ui-panel';
  root.hidden = true;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const title = doc.createElement('h2');
  title.textContent = 'Shop';
  const wallet = doc.createElement('p');
  wallet.id = 'shop-wallet';
  const error = doc.createElement('p');
  error.id = 'shop-error';
  error.setAttribute('role', 'alert');
  root.append(style, title, wallet);
  for (const { kind, label } of ITEMS) {
    const button = doc.createElement('button');
    button.id = `shop-${kind}`;
    button.className = 'ui-btn';
    button.type = 'button';
    button.textContent = `${label}   ${SHOP_PRICES[kind]} coins`;
    button.addEventListener('click', () => handlers.onBuy(kind));
    root.append(button);
  }
  const close = doc.createElement('button');
  close.id = 'shop-close';
  close.className = 'ui-btn';
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => handlers.onClose());
  root.append(error, close);
  doc.body.append(root);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearError = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    error.textContent = '';
  };

  return {
    setOpen(open) {
      root.hidden = !open;
      if (!open) clearError();
    },
    setWallet(value) {
      wallet.textContent = `Wallet   ${value}`;
    },
    showError() {
      if (root.hidden) return;
      clearError();
      error.textContent = 'Cannot buy';
      timer = setTimeout(clearError, SHOP_ERROR_SECONDS * 1000);
    },
    dispose() {
      clearError();
      root.remove();
    },
  };
}
