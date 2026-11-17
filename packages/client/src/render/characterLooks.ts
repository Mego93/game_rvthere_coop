import { deepFreeze, type CharacterId } from '@lodgy/shared';

export const HAIR_STYLES = ['bald', 'short', 'wavy', 'swept', 'long'] as const;
export const FACIAL_STYLES = ['none', 'moustache', 'beard'] as const;
export const OUTFITS = ['halfzip', 'jacket', 'sweater', 'cardigan', 'hoodie', 'tee'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type FacialStyle = (typeof FACIAL_STYLES)[number];
export type Outfit = (typeof OUTFITS)[number];

// Colours are lowercase `#rrggbb`. Facial hair takes the hair colour.
export interface Look {
  // The main garment on torso and arms.
  top: string;
  trousers: string;
  hair: { style: HairStyle; colour: string };
  facial: FacialStyle;
  outfit: Outfit;
  // Accent on the outfit (cardigan edge).
  trim?: string;
  // The garment seen beneath an open outer layer: the collared shirt, the tee under the jacket.
  under?: string;
  // The character's own glasses; the `default` choice resolves to this.
  glasses: 'none' | 'round';
}

const DARK_HAIR = '#2a211c';
const OLIVE = '#6b6f3a';
const BEIGE = '#c8b48f';
const BLACK = '#1b1b1f';

export const CHARACTER_LOOKS: Readonly<Record<CharacterId, Look>> = deepFreeze({
  sounile: { top: BLACK, trousers: '#9db8d8', hair: { style: 'short', colour: DARK_HAIR }, facial: 'moustache', outfit: 'halfzip', glasses: 'none' },
  rafael: { top: '#23262b', trousers: OLIVE, hair: { style: 'bald', colour: DARK_HAIR }, facial: 'beard', outfit: 'jacket', under: '#1c1d20', glasses: 'round' },
  nandan: { top: '#1f2a44', trousers: BEIGE, hair: { style: 'wavy', colour: DARK_HAIR }, facial: 'none', outfit: 'sweater', under: '#e8e6df', glasses: 'none' },
  alexander: { top: '#ece3c8', trousers: OLIVE, hair: { style: 'short', colour: DARK_HAIR }, facial: 'none', outfit: 'cardigan', trim: '#b3262e', glasses: 'none' },
  luiz: { top: BLACK, trousers: BEIGE, hair: { style: 'swept', colour: '#d9bf86' }, facial: 'none', outfit: 'hoodie', glasses: 'none' },
  // The roadmap gives no trousers for huu; dark grey-blue is a placeholder for the owner to confirm.
  huu: { top: BLACK, trousers: '#2b2f3a', hair: { style: 'long', colour: DARK_HAIR }, facial: 'none', outfit: 'tee', glasses: 'round' },
});
