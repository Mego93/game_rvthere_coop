import { deepFreeze } from './math';

export const CHARACTER_IDS = Object.freeze(['sounile', 'rafael', 'nandan', 'alexander', 'luiz', 'huu'] as const);
export type CharacterId = (typeof CHARACTER_IDS)[number];

// `default` glasses are the character's own (round for rafael and huu, none for the others); `default` top is the character's own outfit.
export const GLASSES_CHOICES = Object.freeze(['default', 'none', 'round'] as const);
export const TOP_CHOICES = Object.freeze(['default', 'sweatshirt', 'suit'] as const);
export const HAT_CHOICES = Object.freeze(['none', 'cap', 'fez'] as const);
export const SKIN_CHOICES = Object.freeze(['default', 'tan', 'brown', 'dark'] as const);
export const EYES_CHOICES = Object.freeze(['default', 'wide', 'sleepy', 'happy'] as const);
export const SMILE_CHOICES = Object.freeze(['default', 'grin', 'neutral'] as const);
export type GlassesChoice = (typeof GLASSES_CHOICES)[number];
export type TopChoice = (typeof TOP_CHOICES)[number];
export type HatChoice = (typeof HAT_CHOICES)[number];

export type SkinChoice = (typeof SKIN_CHOICES)[number];
export type EyesChoice = (typeof EYES_CHOICES)[number];
export type SmileChoice = (typeof SMILE_CHOICES)[number];

export interface Appearance {
  characterId: CharacterId;
  glasses: GlassesChoice;
  top: TopChoice;
  hat: HatChoice;
  skin: SkinChoice;
  eyes: EyesChoice;
  smile: SmileChoice;
}

export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = deepFreeze({
  sounile: 'Sounile',
  rafael: 'Rafael',
  nandan: 'Nandan',
  alexander: 'Alexander',
  luiz: 'Luiz',
  huu: 'Huu',
});

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && list.includes(value as T);

export const isCharacterId = (value: unknown): value is CharacterId => isOneOf(CHARACTER_IDS, value);

export function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return isCharacterId(fields.characterId) && isOneOf(GLASSES_CHOICES, fields.glasses) && isOneOf(TOP_CHOICES, fields.top) && isOneOf(HAT_CHOICES, fields.hat) && isOneOf(SKIN_CHOICES, fields.skin) && isOneOf(EYES_CHOICES, fields.eyes) && isOneOf(SMILE_CHOICES, fields.smile);
}

export const defaultAppearance = (characterId: CharacterId): Appearance => ({ characterId, glasses: 'default', top: 'default', hat: 'none', skin: 'default', eyes: 'default', smile: 'default' });

export const firstFreeCharacter = (taken: readonly CharacterId[]): CharacterId | null => CHARACTER_IDS.find((id) => !taken.includes(id)) ?? null;
